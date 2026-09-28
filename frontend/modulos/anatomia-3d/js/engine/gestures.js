/**
 * gestures.js — reconhecimento de gestos de ponteiro para canvas 3D
 * ---------------------------------------------------------------------------
 * Máquina de estado pura, alimentada com eventos normalizados. Nenhum acesso
 * ao DOM dentro do núcleo — apenas a função attachGestures() wira os eventos.
 */

/**
 * Cria um reconhecedor de gestos de ponteiro.
 *
 * @param {Object} opts - opções
 * @param {Function} opts.onTap - chamado com {x, y} em um tap rápido
 * @param {Function} opts.onDoubleTap - chamado com {x, y} em double-tap
 * @param {Function} opts.onLongPress - chamado com {x, y} em long-press
 * @param {number} [opts.tapMaxMove=8] - distância máxima de movimento para um tap
 * @param {number} [opts.tapMaxMs=250] - duração máxima para um tap
 * @param {number} [opts.doubleTapMs=300] - tempo entre taps para double-tap
 * @param {number} [opts.longPressMs=500] - tempo para long-press disparar
 * @param {Function} [opts.setTimer=setTimeout] - função para agendar temporizadores
 * @param {Function} [opts.clearTimer=clearTimeout] - função para cancelar temporizadores
 *
 * @returns {Object} reconhecedor com {down(e), move(e), up(e), cancel(e), dispose()}
 */
export function createGestureRecognizer(opts) {
  const {
    onTap = () => {},
    onDoubleTap = () => {},
    onLongPress = () => {},
    tapMaxMove = 8,
    tapMaxMs = 250,
    doubleTapMs = 300,
    longPressMs = 500,
    setTimer = typeof setTimeout !== 'undefined' ? setTimeout : () => {},
    clearTimer = typeof clearTimeout !== 'undefined' ? clearTimeout : () => {},
  } = opts || {};

  // Estado interno
  const pointers = new Map(); // id -> {x, y, t, moved}
  let longPressTimer = null;
  let lastTapPos = null;
  let lastTapTime = null;
  let suppressTapOnUp = false;

  /**
   * Registra um ponteiro pressionado.
   * @param {Object} e - {id, x, y, t}
   */
  function down(e) {
    const { id, x, y, t } = e;

    // Se já há ponteiros, é multi-toque — nada a fazer por enquanto
    if (pointers.size > 0) {
      pointers.set(id, { x, y, t, moved: false });
      return;
    }

    // Primeiro ponteiro: inicializa o gesto
    pointers.set(id, { x, y, t, moved: false });

    // Agenda long-press
    longPressTimer = setTimer(() => {
      if (pointers.has(id)) {
        const ptr = pointers.get(id);
        if (!ptr.moved && pointers.size === 1) {
          // Disparar long-press
          onLongPress({ x: ptr.x, y: ptr.y });
          suppressTapOnUp = true;
        }
      }
      longPressTimer = null;
    }, longPressMs);
  }

  /**
   * Registra movimento de um ponteiro.
   * @param {Object} e - {id, x, y, t}
   */
  function move(e) {
    const { id, x, y } = e;
    if (!pointers.has(id)) return;

    const ptr = pointers.get(id);
    const dx = x - ptr.x;
    const dy = y - ptr.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > tapMaxMove) {
      ptr.moved = true;
      // Cancelar long-press
      if (longPressTimer !== null) {
        clearTimer(longPressTimer);
        longPressTimer = null;
      }
    }
  }

  /**
   * Registra liberação de um ponteiro.
   * @param {Object} e - {id, x, y, t}
   */
  function up(e) {
    const { id, x, y, t } = e;
    if (!pointers.has(id)) return;

    const ptr = pointers.get(id);

    // Se apenas um ponteiro e não foi drag e não foi long-press
    if (pointers.size === 1 && !ptr.moved && !suppressTapOnUp) {
      const duration = t - ptr.t;
      if (duration <= tapMaxMs) {
        // É um tap
        // Verificar se é double-tap
        if (
          lastTapPos &&
          lastTapTime &&
          t - lastTapTime <= doubleTapMs &&
          Math.sqrt(Math.pow(x - lastTapPos.x, 2) + Math.pow(x - lastTapPos.y, 2)) <= 30
        ) {
          // Double-tap
          onDoubleTap({ x, y });
          // Não chamar onTap para o segundo tap
          lastTapPos = null;
          lastTapTime = null;
        } else {
          // Primeiro tap ou tap isolado
          onTap({ x, y });
          lastTapPos = { x, y };
          lastTapTime = t;
        }
      }
    }

    pointers.delete(id);

    // Se foi o último ponteiro, reseta o estado de suppress
    if (pointers.size === 0) {
      suppressTapOnUp = false;
      if (longPressTimer !== null) {
        clearTimer(longPressTimer);
        longPressTimer = null;
      }
    }
  }

  /**
   * Cancela todos os gestos em progresso.
   */
  function cancel() {
    pointers.clear();
    suppressTapOnUp = false;
    if (longPressTimer !== null) {
      clearTimer(longPressTimer);
      longPressTimer = null;
    }
  }

  /**
   * Libera todos os recursos (eventualmente).
   */
  function dispose() {
    cancel();
  }

  return { down, move, up, cancel, dispose };
}

/**
 * Wira um reconhecedor de gestos aos eventos de ponteiro de um elemento.
 *
 * @param {HTMLElement} element - elemento para monitorar
 * @param {Object} recognizer - reconhecedor retornado por createGestureRecognizer
 *
 * @returns {Function} função para desconectar
 */
export function attachGestures(element, recognizer) {
  function handlePointerDown(domEvent) {
    recognizer.down({
      id: domEvent.pointerId,
      x: domEvent.clientX,
      y: domEvent.clientY,
      t: performance.now(),
    });
    // Não prevenir padrão: OrbitControls também escuta
  }

  function handlePointerMove(domEvent) {
    recognizer.move({
      id: domEvent.pointerId,
      x: domEvent.clientX,
      y: domEvent.clientY,
      t: performance.now(),
    });
  }

  function handlePointerUp(domEvent) {
    recognizer.up({
      id: domEvent.pointerId,
      x: domEvent.clientX,
      y: domEvent.clientY,
      t: performance.now(),
    });
  }

  function handlePointerCancel(domEvent) {
    recognizer.cancel();
  }

  function handlePointerLeave(domEvent) {
    recognizer.cancel();
  }

  element.addEventListener('pointerdown', handlePointerDown);
  element.addEventListener('pointermove', handlePointerMove);
  element.addEventListener('pointerup', handlePointerUp);
  element.addEventListener('pointercancel', handlePointerCancel);
  element.addEventListener('pointerleave', handlePointerLeave);

  // Retornar função de desconexão
  return () => {
    element.removeEventListener('pointerdown', handlePointerDown);
    element.removeEventListener('pointermove', handlePointerMove);
    element.removeEventListener('pointerup', handlePointerUp);
    element.removeEventListener('pointercancel', handlePointerCancel);
    element.removeEventListener('pointerleave', handlePointerLeave);
  };
}
