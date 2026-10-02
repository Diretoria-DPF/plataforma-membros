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
/**
 * O three.js r186 só desenha com WebGL 2 (o suporte a WebGL 1 saiu na r163).
 * Aparelhos antigos (ex.: iOS < 15, Android com GPU antiga) não têm — sem a
 * checagem, o atlas caía na mensagem genérica de falha.
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function hasWebGL2(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc) return true; // fora do navegador (testes) não há o que checar
  try {
    const canvas = doc.createElement('canvas');
    return !!(canvas.getContext && canvas.getContext('webgl2'));
  } catch (e) {
    return false;
  }
}

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
  let lastFrameTime = null;

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

  // ---- Contexto WebGL perdido (aba em segundo plano no celular, driver
  // reiniciado, memória de GPU esgotada). O WebGLRenderer do three.js já
  // chama preventDefault() e recria o estado quando o contexto volta; aqui
  // só avisamos o usuário e redesenhamos. Se não voltar em 8 s, oferece
  // recarregar (bus: 'renderer:context-lost' / 'renderer:context-restored'
  // / 'renderer:context-failed').
  const CONTEXT_RESTORE_TIMEOUT_MS = 8000;
  let contextLostNotice = null;
  let contextRestoreTimer = null;
  function onContextLost() {
    if (!contextLostNotice && typeof document !== 'undefined') {
      contextLostNotice = document.createElement('div');
      contextLostNotice.className = 'atlas-webgl-lost';
      contextLostNotice.setAttribute('role', 'status');
      contextLostNotice.textContent = 'Recarregando o 3D…';
      container.appendChild(contextLostNotice);
    }
    clearTimeout(contextRestoreTimer);
    contextRestoreTimer = setTimeout(() => {
      if (bus && bus.emit) bus.emit('renderer:context-failed', {});
    }, CONTEXT_RESTORE_TIMEOUT_MS);
    if (bus && bus.emit) bus.emit('renderer:context-lost', {});
  }
  function onContextRestored() {
    clearTimeout(contextRestoreTimer);
    if (contextLostNotice) { contextLostNotice.remove(); contextLostNotice = null; }
    if (bus && bus.emit) bus.emit('renderer:context-restored', {});
    requestRender();
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost, false);
  renderer.domElement.addEventListener('webglcontextrestored', onContextRestored, false);

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

    // Tickers recebem o INTERVALO desde o quadro anterior (ms), como diz o
    // contrato de addTicker — antes recebiam o horário absoluto do rAF, e
    // toda animação (tween de câmera) terminava no 1º quadro. No primeiro
    // quadro de uma rajada, assume ~1 quadro (16 ms); limita a 100 ms para
    // não "pular" a animação depois de a aba voltar do segundo plano.
    const dtMs = lastFrameTime === null ? 16 : Math.min(Math.max(timeMs - lastFrameTime, 0), 100);
    lastFrameTime = timeMs;

    // Roda tickers e coleta se alguém quer continuar renderizando
    let needsAnotherFrame = false;
    for (const ticker of [...tickers]) {
      try {
        if (ticker(dtMs)) {
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
      lastFrameTime = null;
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

    clearTimeout(contextRestoreTimer);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost, false);
    renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored, false);

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
