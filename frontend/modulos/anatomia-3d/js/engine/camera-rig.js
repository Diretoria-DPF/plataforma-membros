/**
 * camera-rig.js — Controlador de câmera 3D com tweens e gerenciamento de viewport
 * Coordena posição/alvo da câmera, anima transições e adapta-se a painéis laterais.
 */

import {
  presetPose,
  easeInOutCubic,
  lerpPose,
  freeRect,
  viewOffsetFor,
  fitDistance,
  clampDistance
} from './camera-math.js';

/**
 * Cria um controlador de câmera que gerencia tweens, eventos do barramento
 * e ajustes de viewport para painéis deslizáveis.
 *
 * @param {Object} opts
 * @param {Object} opts.camera - PerspectiveCamera (three.js)
 * @param {Object} opts.controls - Controles com .target (Vector3) e .update()
 * @param {Function} opts.addTicker - (fn) => unsubscribe; fn(dtMs) => bool (ainda animando)
 * @param {Function} opts.requestRender - Solicita renderização do frame
 * @param {Function} opts.setViewOffset - (offset) => void; offset = {fullWidth, fullHeight, x, y, width, height} ou null
 * @param {Function} opts.getViewport - () => {width, height}
 * @param {Object} opts.bus - Barramento de eventos (on, off, emit, EVENTS)
 * @param {Function} [opts.reducedMotion] - () => bool; padrão: matchMedia('(prefers-reduced-motion: reduce)').matches
 * @param {number} [opts.durationMs] - Duração do tween em ms; padrão: 650
 * @returns {Object} API pública
 */
export function createCameraRig({
  camera,
  controls,
  addTicker,
  requestRender,
  setViewOffset,
  getViewport,
  bus,
  reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  durationMs = 650
}) {
  // Estado interno
  let modelCenter = [0, 0, 0];
  let modelRadius = 1;
  let currentTween = null;
  let lastSheetPayload = null;

  /**
   * Começa um novo tween de câmera. Cancela o anterior se existir.
   * @param {Object} startPose - {position: [x,y,z], target: [x,y,z]}
   * @param {Object} endPose - {position: [x,y,z], target: [x,y,z]}
   */
  function startTween(startPose, endPose) {
    // Cancela tween anterior
    if (currentTween) {
      currentTween();
      currentTween = null;
    }

    let elapsed = 0;
    let unsubscribe = null;
    let finished = false;

    unsubscribe = addTicker((dtMs) => {
      elapsed += dtMs;
      const t = elapsed / durationMs;

      if (t >= 1) {
        // Tween terminado
        camera.position.set(endPose.position[0], endPose.position[1], endPose.position[2]);
        controls.target.set(endPose.target[0], endPose.target[1], endPose.target[2]);
        controls.update();
        requestRender();
        // Sai da lista de tickers: antes o tween terminado ficava
        // registrado e, a cada quadro, puxava a câmera de volta para a pose
        // final — brigava com o giro do usuário e nunca deixava o 3D parar
        // de redesenhar.
        finished = true;
        if (unsubscribe) unsubscribe();
        if (currentTween === unsubscribe) currentTween = null;
        return false; // Não precisa mais de frames
      }

      // Interpola
      const eased = easeInOutCubic(t);
      const pose = lerpPose(startPose, endPose, eased);

      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
      controls.update();
      requestRender();

      return true; // Precisa de mais frames
    });

    // addTicker pode rodar o ticker na hora (ex.: reduced motion/testes) —
    // se já terminou, sai da lista agora.
    if (finished) {
      unsubscribe();
      return;
    }
    currentTween = unsubscribe;
  }

  /**
   * Define os limites do modelo (boundingbox). Calcula centro e raio
   * e informa aos controles se suportarem.
   * @param {Object} bounds - {min: [x,y,z], max: [x,y,z]}
   */
  function setModelBounds(bounds) {
    const min = bounds.min;
    const max = bounds.max;

    modelCenter = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];

    // Raio é metade da diagonal
    const dx = max[0] - min[0];
    const dy = max[1] - min[1];
    const dz = max[2] - min[2];
    const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
    modelRadius = diagonal / 2;

    // Informa aos controles se suportarem
    if (controls.setModelRadius) {
      controls.setModelRadius(modelRadius);
    }
  }

  /**
   * Aplica um preset de câmera (anterior, posterior, esquerda, etc).
   * Anima ou salta conforme animate e reducedMotion.
   * @param {string} name - Nome do preset
   * @param {Object} [opts] - {animate?: bool}
   */
  function viewPreset(name, opts = {}) {
    const animate = opts.animate !== false;

    const endPose = presetPose(name, modelCenter, modelRadius, camera.fov, camera.aspect);

    if (!animate || reducedMotion()) {
      // Salta direto sem tween
      camera.position.set(endPose.position[0], endPose.position[1], endPose.position[2]);
      controls.target.set(endPose.target[0], endPose.target[1], endPose.target[2]);
      controls.update();
      requestRender();
      if (currentTween) {
        currentTween();
        currentTween = null;
      }
    } else {
      // Inicia tween
      const startPose = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z]
      };
      startTween(startPose, endPose);
    }
  }

  /**
   * Reseta para o preset 'default'.
   */
  function reset() {
    // Mesma vista da abertura (main.js): corpo inteiro, de frente.
    viewPreset('anterior');
  }

  /**
   * Foca em uma caixa especificada, mantendo a direção de visualização.
   * @param {Object} bbox - {min: [x,y,z], max: [x,y,z]}
   */
  function focusBox(bbox) {
    const min = bbox.min;
    const max = bbox.max;

    // Centro da caixa
    const boxCenter = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2
    ];

    // Raio da caixa
    const dx = max[0] - min[0];
    const dy = max[1] - min[1];
    const dz = max[2] - min[2];
    const boxDiagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const boxRadius = boxDiagonal / 2;

    // Calcula distância necessária
    // Folga de contexto: enquadrar só a caixa colava a câmera na estrutura
    // (dentro do tórax, atrás do esterno) e o usuário perdia a referência.
    let distance = fitDistance(boxRadius, camera.fov, camera.aspect) * 1.8;
    distance = Math.max(distance, modelRadius * 0.6);

    // Mantém a direção atual (do alvo para câmera)
    const currentDx = camera.position.x - controls.target.x;
    const currentDy = camera.position.y - controls.target.y;
    const currentDz = camera.position.z - controls.target.z;
    const currentDist = Math.sqrt(currentDx * currentDx + currentDy * currentDy + currentDz * currentDz);

    let dirX = currentDx / currentDist;
    let dirY = currentDy / currentDist;
    let dirZ = currentDz / currentDist;

    // Se a distância atual é muito pequena, usa a direção padrão
    if (currentDist < 0.01) {
      dirX = 0;
      dirY = 0;
      dirZ = 1;
    }

    const endPose = {
      position: [
        boxCenter[0] + dirX * distance,
        boxCenter[1] + dirY * distance,
        boxCenter[2] + dirZ * distance
      ],
      target: [boxCenter[0], boxCenter[1], boxCenter[2]]
    };

    const startPose = {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    };

    startTween(startPose, endPose);
  }

  /**
   * Trata SHEET_SNAP: calcula o lado do painel e o offset de viewport.
   * @param {Object} payload - {state, heightPx}
   */
  function handleSheetSnap(payload) {
    lastSheetPayload = payload;
    applySheetOffset(payload);
  }

  /**
   * Aplica o offset de viewport baseado no painel deslizável.
   * @param {Object} payload - {state, heightPx}
   */
  function applySheetOffset(payload) {
    const viewport = getViewport();
    let side = 'none';
    let widthPx = 0;

    // Determina em que lado o painel está
    if (viewport.height < 500) {
      // Painel direito em mobile alto
      side = 'right';
      widthPx = payload.heightPx;
    } else if (viewport.width < 600) {
      // Painel na base em mobile
      side = 'bottom';
    }
    // caso contrário: 'none' (desktop, tablet com painel lateral do próprio navegador)

    // Calcula o retângulo livre
    const rect = freeRect(viewport, {
      state: payload.state,
      heightPx: payload.heightPx,
      side,
      widthPx
    });

    // Calcula e aplica o offset
    const offset = viewOffsetFor(viewport, rect);
    setViewOffset(offset);
  }

  /**
   * Reaplica o offset após um resize de viewport.
   * Chama isto após o canvas ser redimensionado.
   */
  function reapplyViewOffset() {
    if (lastSheetPayload) {
      applySheetOffset(lastSheetPayload);
    } else {
      setViewOffset(null);
    }
  }

  /**
   * Verifica se há uma animação em progresso.
   * @returns {boolean}
   */
  function isAnimating() {
    return currentTween !== null;
  }

  /**
   * Limpa assinaturas do barramento e cancela animações.
   */
  function dispose() {
    unsubscribeViewPreset?.();
    unsubscribeViewReset?.();

    if (currentTween) {
      currentTween();
      currentTween = null;
    }
  }

  // Assinatura de eventos do barramento
  const unsubscribeViewPreset = bus.on?.(bus.EVENTS?.VIEW_PRESET, (p) => {
    viewPreset(p.name);
  });

  const unsubscribeViewReset = bus.on?.(bus.EVENTS?.VIEW_RESET, () => {
    reset();
  });

  const unsubscribeSheetSnap = bus.on?.(bus.EVENTS?.SHEET_SNAP, handleSheetSnap);

  // Estende dispose para incluir unsubscribeSheetSnap
  const originalDispose = dispose;
  dispose = function() {
    originalDispose.call(this);
    unsubscribeSheetSnap?.();
  };

  return {
    setModelBounds,
    viewPreset,
    reset,
    focusBox,
    reapplyViewOffset,
    isAnimating,
    dispose
  };
}
