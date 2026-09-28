/**
 * renderer.js — Renderizador 3D adaptativo com render-on-demand
 *
 * Exporta createRenderer({container, bus, env, store}) que retorna um objeto
 * com métodos para controle de câmera, renderização, qualidade adaptativa e
 * estatísticas de desempenho.
 */

import * as THREE from '../../vendor/three/three.module.js';
import { TIERS, detectTier, pixelRatioFor, createFrameMonitor, nextLowerTier } from './quality.js';
import { on, emit, EVENTS } from '../core/bus.js';

/**
 * Cria um renderizador WebGL adaptativo com render-on-demand.
 *
 * @param {Object} opts - opções de configuração
 * @param {HTMLElement} opts.container - elemento pai do canvas
 * @param {Object} opts.bus - barramento de eventos (emit/on)
 * @param {Object} [opts.env] - ambiente do dispositivo {dpr, cores, memoryGB, isTouch}
 * @param {Object} [opts.store] - store para persistência de qualidade
 * @returns {Object} API do renderizador
 */
export function createRenderer({ container, bus, env = {}, store } = {}) {
  // Lê características do dispositivo, com fallbacks para navigator/window
  const dpr = env.dpr ?? window.devicePixelRatio ?? 1;
  const cores = env.cores ?? (navigator.hardwareConcurrency ?? 4);
  const memoryGB = env.memoryGB ?? (navigator.deviceMemory ?? 8);
  const isTouch = env.isTouch ?? matchMedia('(pointer:coarse)').matches;
  const width = container?.clientWidth ?? window.innerWidth;
  const height = container?.clientHeight ?? window.innerHeight;

  // Detecta tier inicial
  const initialTier = detectTier({ dpr, cores, memoryGB, width, height, isTouch });

  // Estado do renderizador
  let currentTier = initialTier;
  let requestAnimationFrameId = null;
  let tickers = [];
  let lastViewOffsetArgs = null;
  let frameCount = 0;

  // Cria o renderer WebGL
  const renderer = new THREE.WebGLRenderer({
    antialias: TIERS[currentTier].antialias,
    alpha: false,
    powerPreference: 'high-performance',
  });

  // Configura propriedades do renderer
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.localClippingEnabled = true;

  // Define pixel ratio
  const pixelRatio = pixelRatioFor(currentTier, dpr, isTouch);
  renderer.setPixelRatio(pixelRatio);

  // Configura tamanho e posiciona no container
  renderer.setSize(width, height);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  // Cria cena e câmera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.01, 50);
  camera.position.set(0, 1.0, 3.2);

  // Rig de iluminação (soft, sem sombras, adequado para anatomia)
  const hemispherLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
  scene.add(hemispherLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.6);
  fillLight.position.set(-3, 2, 1);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
  rimLight.position.set(0, 3, -4);
  scene.add(rimLight);

  // Define cor de fundo a partir de CSS custom property
  function updateBackgroundColor() {
    const cssValue = getComputedStyle(document.documentElement).getPropertyValue('--atlas-canvas-bg');
    const colorValue = cssValue?.trim() || '#0f1720';
    scene.background = new THREE.Color(colorValue);
  }
  updateBackgroundColor();

  // Escuta mudanças de tema
  const offThemeChange = on(EVENTS.THEME_CHANGE, () => {
    updateBackgroundColor();
    requestRender();
  });

  // Monitor de frame para qualidade adaptativa
  const frameMonitor = createFrameMonitor({
    onDowngrade: () => {
      currentTier = nextLowerTier(currentTier);
      const newPixelRatio = pixelRatioFor(currentTier, dpr, isTouch);
      renderer.setPixelRatio(newPixelRatio);

      // Emite evento de mudança de qualidade
      emit(EVENTS.QUALITY_CHANGE, { tier: currentTier });

      // Persiste qualidade se store foi passado
      if (store) {
        store.quality = currentTier;
      }

      requestRender();
    },
  });

  // Estatísticas de renderização
  const stats = {
    renders: 0,
  };

  /**
   * Agenda um single requestAnimationFrame. Múltiplas chamadas no mesmo
   * frame coalescem em uma só.
   */
  function requestRender() {
    if (requestAnimationFrameId === null) {
      requestAnimationFrameId = requestAnimationFrame(frame);
    }
  }

  /**
   * Registra uma função que precisa rodar a cada frame.
   * fn deve retornar true se precisa de outro frame (tweens, damping),
   * false para parar a renderização.
   * Retorna uma função que remove fn da lista.
   */
  function addTicker(fn) {
    tickers.push(fn);
    return () => {
      tickers = tickers.filter((t) => t !== fn);
    };
  }

  /**
   * Loop principal de renderização.
   */
  function frame(timeMs) {
    const frameStartTime = performance.now();

    // Roda tickers e coleta se alguém quer continuar renderizando
    let needsAnotherFrame = false;
    for (const ticker of tickers) {
      try {
        if (ticker(timeMs)) {
          needsAnotherFrame = true;
        }
      } catch (err) {
        console.error('[renderer] ticker error:', err);
      }
    }

    // Renderiza
    renderer.render(scene, camera);
    stats.renders++;

    // Alimenta frame monitor APENAS durante renderização contínua
    // (pelo menos 2 frames consecutivos)
    if (frameCount >= 1) {
      const frameTime = performance.now() - frameStartTime;
      frameMonitor.sample(frameTime);
    }
    frameCount++;

    // Agenda próximo frame apenas se um ticker o solicitar
    if (needsAnotherFrame) {
      requestAnimationFrameId = requestAnimationFrame(frame);
    } else {
      requestAnimationFrameId = null;
      frameCount = 0; // Reset counter ao parar
    }
  }

  /**
   * Configura ou limpa view offset para renderizar só uma porção do canvas.
   * args deve ser null ou {fullWidth, fullHeight, x, y, width, height}.
   */
  function setViewOffset(args) {
    lastViewOffsetArgs = args;
    if (args === null) {
      camera.clearViewOffset();
    } else {
      camera.setViewOffset(args.fullWidth, args.fullHeight, args.x, args.y, args.width, args.height);
    }
    requestRender();
  }

  /**
   * Muda o tier de qualidade manualmente.
   */
  function setTier(tier) {
    if (!TIERS[tier]) {
      console.warn(`[renderer] tier inválido: ${tier}`);
      return;
    }
    currentTier = tier;
    const newPixelRatio = pixelRatioFor(currentTier, dpr, isTouch);
    renderer.setPixelRatio(newPixelRatio);
    emit(EVENTS.QUALITY_CHANGE, { tier: currentTier });
    if (store) {
      store.quality = currentTier;
    }
    requestRender();
  }

  /**
   * Retorna o tier atual.
   */
  function getTier() {
    return currentTier;
  }

  /**
   * Retorna estatísticas de renderização.
   */
  function getStats() {
    return {
      tier: currentTier,
      renders: stats.renders,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      pixelRatio: renderer.getPixelRatio(),
    };
  }

  /**
   * Lógica de redimensionamento: atualiza tamanho do renderer e câmera
   * a partir das dimensões do container (não da janela).
   */
  function handleResize() {
    const newWidth = container.clientWidth;
    const newHeight = container.clientHeight;

    renderer.setSize(newWidth, newHeight);
    camera.aspect = newWidth / newHeight;
    camera.updateProjectionMatrix();

    // Reaplica view offset se havia
    if (lastViewOffsetArgs !== null) {
      setViewOffset(lastViewOffsetArgs);
    }

    requestRender();
  }

  // ResizeObserver para adaptar a câmera e renderer ao redimensionamento do container
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
  } else {
    // Fallback para navegadores sem ResizeObserver: usa window resize
    window.addEventListener('resize', handleResize);
  }

  /**
   * Limpa todos os recursos do renderizador.
   */
  function dispose() {
    if (resizeObserver) {
      resizeObserver.disconnect();
    } else {
      // Se não havia ResizeObserver, remove o listener de window resize
      window.removeEventListener('resize', handleResize);
    }
    offThemeChange();

    // Remove listeners e tickers
    tickers = [];

    // Cancela frame agendado
    if (requestAnimationFrameId !== null) {
      cancelAnimationFrame(requestAnimationFrameId);
      requestAnimationFrameId = null;
    }

    // Limpa THREE resources
    renderer.dispose();

    // Remove canvas
    renderer.domElement.remove();
  }

  return {
    THREE,
    renderer,
    scene,
    camera,
    requestRender,
    addTicker,
    setViewOffset,
    getStats,
    setTier,
    getTier,
    dispose,
  };
}
