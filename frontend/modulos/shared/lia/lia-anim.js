/* Lia - animacoes WAAPI (ADR 0002 e 0003, onda 1). Sem dependencias, sem innerHTML.
   Interface: window.LiaAnim (e module.exports). Cada funcao recebe o host `.lia`,
   que contem o <svg class="lia-svg"> com os grupos do lia.svg. Animacoes so em transform e opacity.
   Tokens espelhados de modulos/shared/laift-tokens.css: manter em sincronia (o teste confere). */
(function () {
  'use strict';

  // Tokens de movimento (laift-tokens.css, ADR 0002).
  const DUR_FAST = 180;                                      // --dur-fast
  const DUR_BASE = 280;                                      // --dur-base
  const DUR_SLOW = 480;                                      // --dur-slow
  const EASE_OUT = 'cubic-bezier(0.22, 1, 0.36, 1)';         // --ease-out
  const EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';      // --ease-in-out
  const EASE_SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';   // --ease-spring
  // Duracoes proprias da feature (nao sao tokens). Piscada ~120 ms, aceno ~700 ms, coracao ~1,2 s.
  const BLINK_MS = 120;
  const BLINK_MIN_MS = 4000;
  const BLINK_MAX_MS = 8000;
  const WAVE_MS = 700;
  const HEART_MS = 1200;
  const EYE_MAX_PX = 3;
  const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
  const COARSE_QUERY = '(pointer: coarse)';
  const EYE_IDS = ['neutral', 'curious', 'happy', 'worried', 'focused', 'sad'].map((e) => `lia-eyes-${e}`);
  const ARM_SIDES = ['right', 'left'];
  const ARM_POSES = ['idle', 'wave', 'point', 'chin', 'heart'];
  const BLINK_FRAMES = [
    { transform: 'scaleY(1)' },
    { transform: 'scaleY(0.1)', offset: 0.5 },
    { transform: 'scaleY(1)' },
  ];
  const DOT_FRAMES = [
    { opacity: 0.25, transform: 'translateY(0px)' },
    { opacity: 1, transform: 'translateY(-2px)', offset: 0.5 },
    { opacity: 0.25, transform: 'translateY(0px)' },
  ];
  const HEART_FRAMES = [
    { opacity: 0, transform: 'translateY(14px) scale(0.6)' },
    { opacity: 1, transform: 'translateY(-6px) scale(1.12)', offset: 0.35 },
    { opacity: 0, transform: 'translateY(-30px) scale(1)' },
  ];
  const SPARKLE_FRAMES = [
    { opacity: 0, transform: 'scale(0.4)' },
    { opacity: 1, transform: 'scale(1.15)', offset: 0.4 },
    { opacity: 0, transform: 'scale(0.9)' },
  ];
  const NO_OP_STOP = () => {};
  const NOOP = () => {};
  const REGISTRY = new WeakMap(); // host -> Set de animacoes pendentes

  // ---------- utilitarios de ambiente ----------
  function winOf(node) {
    return (node && node.ownerDocument && node.ownerDocument.defaultView) || null;
  }
  function matchesQuery(win, query) {
    return !!(win && typeof win.matchMedia === 'function' && win.matchMedia(query).matches);
  }
  function motionOff(win) {
    return matchesQuery(win, REDUCED_QUERY);
  }
  function isShown(el) {
    const win = winOf(el);
    if (!el) return false;
    if (win && typeof win.getComputedStyle === 'function') {
      return win.getComputedStyle(el).display !== 'none';
    }
    return true;
  }
  function byId(host, id) {
    return host && typeof host.querySelector === 'function' ? host.querySelector(`#${id}`) : null;
  }
  // Mostra um grupo que pode estar escondido por CSS; devolve a funcao que restaura o valor anterior.
  function reveal(el) {
    if (!el || !el.style) return NOOP;
    const previous = el.style.display;
    el.style.display = 'inline';
    return () => { el.style.display = previous; };
  }

  // ---------- registro de animacoes ----------
  function registryOf(host) {
    let set = REGISTRY.get(host);
    if (!set) {
      set = new Set();
      REGISTRY.set(host, set);
    }
    return set;
  }
  // Cria a animacao e a registra no dono (loop ou pontual) e no host (para destroy).
  function play(host, el, frames, options, owned) {
    if (!el || typeof el.animate !== 'function') return null;
    const anim = el.animate(frames, options);
    const forget = () => { owned.delete(anim); registryOf(host).delete(anim); };
    owned.add(anim);
    registryOf(host).add(anim);
    if (anim && anim.finished && typeof anim.finished.then === 'function') {
      anim.finished.then(forget, forget);
    }
    return anim;
  }
  function cancelOwned(host, owned) {
    owned.forEach((anim) => {
      if (typeof anim.cancel === 'function') anim.cancel();
      registryOf(host).delete(anim);
    });
    owned.clear();
  }
  // Promise que resolve quando a animacao termina (cancelamento tambem conta como fim).
  function settled(anim) {
    if (!anim || !anim.finished) return Promise.resolve();
    return anim.finished.then(() => undefined, () => undefined);
  }

  // ---------- piscada ----------
  // Intervalo aleatorio entre 4000 e 7999 ms. `rand` devolve um numero em [0, 1).
  function nextBlinkDelay(rand) {
    const raw = typeof rand === 'function' ? Number(rand()) : 0.5;
    const r = Math.min(Math.max(Number.isFinite(raw) ? raw : 0.5, 0), 0.999999);
    return BLINK_MIN_MS + Math.floor(r * (BLINK_MAX_MS - BLINK_MIN_MS));
  }
  function blinkVisibleEyes(host, owned) {
    EYE_IDS.map((id) => byId(host, id))
      .filter((el) => el && isShown(el))
      .forEach((el) => play(host, el, BLINK_FRAMES, { duration: BLINK_MS, easing: EASE_IN_OUT }, owned));
  }
  function startBlinkLoop(host) {
    if (!host || motionOff(winOf(host))) return NO_OP_STOP;
    const owned = new Set();
    let timer = null;
    let active = true;
    const tick = () => {
      if (!active) return;
      blinkVisibleEyes(host, owned);
      timer = setTimeout(tick, nextBlinkDelay(Math.random));
    };
    timer = setTimeout(tick, nextBlinkDelay(Math.random));
    return () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
      cancelOwned(host, owned);
    };
  }

  // ---------- olhar (rastreio do ponteiro) ----------
  // Desloca ate `max` px na direcao do ponteiro. Chega ao maximo a uma diagonal do host.
  function eyeOffset(rect, pointer, max = EYE_MAX_PX) {
    const zero = { x: 0, y: 0 };
    if (!rect || !pointer || !(max > 0)) return zero;
    const dx = pointer.x - (rect.left + rect.width / 2);
    const dy = pointer.y - (rect.top + rect.height / 2);
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist === 0) return zero;
    const reach = Math.hypot(rect.width || 0, rect.height || 0) || 1;
    const amount = max * Math.min(1, dist / reach);
    return { x: (dx / dist) * amount, y: (dy / dist) * amount };
  }
  function setEyeShift(groups, offset) {
    groups.forEach((g) => { g.style.translate = `${offset.x}px ${offset.y}px`; });
  }
  function startEyeTracking(host, doc) {
    const win = doc && doc.defaultView;
    if (!host || !doc || !win || motionOff(win) || matchesQuery(win, COARSE_QUERY)) return NO_OP_STOP;
    const groups = EYE_IDS.map((id) => byId(host, id)).filter(Boolean);
    if (!groups.length || typeof doc.addEventListener !== 'function') return NO_OP_STOP;
    let latest = null;
    let scheduled = false;
    let frameId = null;
    let stopped = false;
    const apply = () => {
      scheduled = false;
      frameId = null;
      if (stopped) return; // frame que escapou do cancelamento não mexe mais nos olhos
      setEyeShift(groups, eyeOffset(host.getBoundingClientRect(), latest));
    };
    const onMove = (ev) => {
      latest = { x: ev.clientX, y: ev.clientY };
      if (scheduled) return;
      if (typeof win.requestAnimationFrame !== 'function') { apply(); return; }
      scheduled = true;
      frameId = win.requestAnimationFrame(apply);
    };
    doc.addEventListener('mousemove', onMove);
    return () => {
      stopped = true;
      doc.removeEventListener('mousemove', onMove);
      if (frameId !== null && typeof win.cancelAnimationFrame === 'function') win.cancelAnimationFrame(frameId);
      scheduled = false;
      setEyeShift(groups, { x: 0, y: 0 });
    };
  }

  // ---------- pontuais ----------
  // Primeiro braco visivel (direito antes do esquerdo): { side, el } ou null.
  function visibleArm(host) {
    for (const side of ARM_SIDES) {
      for (const pose of ARM_POSES) {
        const el = byId(host, `lia-arm-${side}-${pose}`);
        if (el && isShown(el)) return { side, el };
      }
    }
    return null;
  }
  function waveFrames(sign) {
    const turn = (deg) => ({ transform: `rotate(${sign * deg}deg)` });
    return [turn(0), turn(14), turn(4), turn(14), turn(0)];
  }
  function wave(host) {
    if (!host || motionOff(winOf(host))) return Promise.resolve();
    const arm = visibleArm(host);
    if (!arm) return Promise.resolve();
    // Braco direito abre para fora com rotacao negativa; o esquerdo, positiva.
    const sign = arm.side === 'left' ? 1 : -1;
    const anim = play(host, arm.el, waveFrames(sign), { duration: WAVE_MS, easing: EASE_IN_OUT }, new Set());
    return settled(anim);
  }
  function heartBurst(host) {
    if (!host || motionOff(winOf(host))) return Promise.resolve();
    const heart = byId(host, 'lia-scene-heart');
    const sparkles = byId(host, 'lia-scene-sparkles');
    if (!heart && !sparkles) return Promise.resolve();
    const owned = new Set();
    const restores = [reveal(heart), reveal(sparkles)];
    const heartAnim = play(host, heart, HEART_FRAMES, { duration: HEART_MS, easing: EASE_SPRING }, owned);
    const sparkleAnim = play(host, sparkles, SPARKLE_FRAMES,
      { duration: HEART_MS, delay: DUR_BASE, easing: EASE_OUT }, owned);
    return Promise.all([settled(heartAnim), settled(sparkleAnim)]).then(() => {
      restores.forEach((restore) => restore());
      owned.clear();
    });
  }
  // Tres pontinhos do balao (grupo g.f dentro de lia-scene-bubble) pulsando em sequencia.
  function thinkingDots(host) {
    if (!host || motionOff(winOf(host))) return NO_OP_STOP;
    const bubble = byId(host, 'lia-scene-bubble');
    const group = bubble && typeof bubble.querySelector === 'function' ? bubble.querySelector('g.f') : null;
    const dots = group && group.children ? Array.from(group.children).slice(0, 3) : [];
    if (!bubble || dots.length === 0) return NO_OP_STOP;
    const owned = new Set();
    const restore = reveal(bubble);
    dots.forEach((dot, i) => play(host, dot, DOT_FRAMES,
      { duration: DUR_SLOW, delay: i * DUR_FAST, iterations: Infinity, easing: EASE_IN_OUT }, owned));
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      cancelOwned(host, owned);
      restore();
    };
  }

  // Cancela tudo que estiver pendente neste host (uso ao destruir a Lia).
  function destroy(host) {
    if (!host || typeof host !== 'object') return;
    cancelOwned(host, registryOf(host));
  }

  const LiaAnim = {
    startBlinkLoop,
    startEyeTracking,
    wave,
    heartBurst,
    thinkingDots,
    nextBlinkDelay,
    eyeOffset,
    destroy,
    tokens: {
      DUR_FAST, DUR_BASE, DUR_SLOW, EASE_OUT, EASE_IN_OUT, EASE_SPRING,
    },
  };

  if (typeof window !== 'undefined') window.LiaAnim = LiaAnim;
  if (typeof module !== 'undefined' && module.exports) module.exports = LiaAnim;
}());
