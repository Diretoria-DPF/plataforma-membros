/*
 * Lia - cenas de movimento das ondas 2-4 (aprovadas em preview-ondas.js). Cada cena é uma linha do tempo WAAPI:
 * animações em transform e opacity (e as propriedades individuais rotate/translate, desvio aprovado), mais
 * passos que trocam atributos data-* do host e removem peças. Durações e curvas vêm de LiaAnim.tokens
 * (espelho de --dur-* e --ease-* de laift-tokens.css). Sem innerHTML, sem estilo inline (origens por CSSOM).
 * Movimento reduzido = pose final: as animações terminam na hora e os passos valem todos de uma vez.
 * Quem chama: lia.js (play) e frontend/scripts/lia-scenes.test.mjs. Depende de lia-anim.js (tokens).
 */
(function (root, factory) {
  'use strict';
  var node = typeof module === 'object' && module.exports;
  var api = factory(node ? require('./lia-anim.js') : root && root.LiaAnim);
  if (node) module.exports = api;
  if (root) root.LiaScenes = api;
})(typeof window !== 'undefined' ? window : null, function (anim) {
  'use strict';

  var timers = typeof window !== 'undefined' ? window : globalThis;
  var HOST = '@host'; // seletor especial: o próprio <div class="lia">
  var BASE = '50% 100%';
  var CENTER = '50% 50%';
  var LEFT = '0% 50%';
  var BACK_PARTS = Object.freeze(['costas-cabeca', 'costas-costura']);
  var FOCUSED_START = Object.freeze({ 'data-emotion': 'focused', 'data-mouth': 'flat' });

  function item(sel, frames, at, dur, ease) {
    return Object.freeze({ sel: sel, frames: frames, at: at, dur: dur, ease: ease });
  }

  function step(at, attrs, detach) {
    return Object.freeze({ at: at, attrs: attrs || null, detach: detach || null });
  }

  function endOf(parts) {
    return parts.reduce(function (end, part) { return Math.max(end, part.at + (part.dur || 0)); }, 0);
  }

  function scene(name, spec) {
    var animate = spec.anima || [];
    var steps = spec.steps || [];
    return Object.freeze({
      name: name,
      anima: Object.freeze(animate),
      steps: Object.freeze(steps),
      from: Object.freeze(spec.from || {}),
      origins: Object.freeze(spec.origins || []),
      duration: Math.max(endOf(animate), endOf(steps)),
    });
  }

  function bubbleFrames() {
    return [
      { opacity: 0, transform: 'translateY(0px)' },
      { opacity: 1, transform: 'translateY(-6px)', offset: 0.5 },
      { opacity: 0, transform: 'translateY(-12px)' },
    ];
  }

  function shakeX(px) {
    var at = function (x) { return { transform: 'translateX(' + x + 'px)' }; };
    return [at(0), at(-px), at(px), at(-px), at(0)];
  }

  // ---------- Cenas (tempos em ms, como em preview-ondas.js) ----------

  function labScene(t) {
    var mix = 2 * t.DUR_BASE + t.DUR_LAZY;
    var bubbles = [0, 1, 2].map(function (i) {
      return item('#lia-pv-bolha-' + (i + 1), bubbleFrames(), mix + i * t.DUR_BASE, t.DUR_LAZY, t.EASE_OUT);
    });
    return scene('lab', {
      anima: [
        item('#lia-prop-flask > path.a', [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], 2 * t.DUR_BASE, t.DUR_LAZY, t.EASE_OUT),
        item('#lia-prop-flask > path.a', [{ opacity: 1 }, { opacity: 0 }], mix, t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-pv-liquido-b', [{ opacity: 0 }, { opacity: 1 }], mix, t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-prop-flask', shakeX(2), mix, 2 * t.DUR_LAZY, t.EASE_IN_OUT),
      ].concat(bubbles),
      steps: [step(mix + 2 * t.DUR_LAZY, { 'data-emotion': 'happy', 'data-mouth': 'smile', 'data-scene': 'sparkles' })],
      origins: [['#lia-prop-flask > path.a', BASE], ['#lia-pv-liquido-b', BASE]],
    });
  }

  function clinicScene(t) {
    var monitorAt = 2 * t.DUR_LAZY;
    var thermoAt = 4 * t.DUR_LAZY;
    var monitorFrames = [
      { opacity: 0, transform: 'translateY(6px)' },
      { opacity: 1, transform: 'translateY(0px)', offset: 0.15 },
      { opacity: 1, offset: 0.85 },
      { opacity: 0, offset: 1 },
    ];
    var beat = [{ opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }, { opacity: 0.2 }, { opacity: 1 }];
    return scene('clinic', {
      from: FOCUSED_START,
      anima: [
        item('#lia-prop-stethoscope', [{ transform: 'translate(-18px, -26px)', opacity: 0.2 }, { transform: 'translate(0px, 0px)', opacity: 1 }], 0, t.DUR_LAZY, t.EASE_OUT),
        item('#lia-pv-monitor', monitorFrames, monitorAt, thermoAt + t.DUR_BASE - monitorAt, 'linear'),
        item('#lia-pv-ecg', [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], monitorAt + t.DUR_BASE, 1.5 * t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-pv-coracao', beat, monitorAt + t.DUR_BASE, 1.5 * t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-prop-thermometer path.g', [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], thermoAt, 1.5 * t.DUR_LAZY, t.EASE_IN_OUT),
      ],
      steps: [
        step(monitorAt, { 'data-prop': 'none', 'data-arm-right': 'point' }),
        step(thermoAt, { 'data-prop': 'thermometer', 'data-arm-right': 'idle', 'data-emotion': 'worried', 'data-mouth': 'worried' }),
      ],
      origins: [['#lia-pv-ecg', LEFT], ['#lia-prop-thermometer path.g', BASE]],
    });
  }

  function atlasScene(t) {
    var fit = t.DUR_BASE + 2 * t.DUR_LAZY;
    var star = [
      { transform: 'scale(0)', opacity: 0 },
      { transform: 'scale(1.3)', opacity: 1, offset: 0.5 },
      { transform: 'scale(1)', opacity: 0 },
    ];
    return scene('atlas', {
      from: FOCUSED_START,
      anima: [
        item('#lia-prop-skeleton', [{ rotate: '0deg' }, { rotate: '360deg' }], t.DUR_BASE, 2 * t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-pv-osso', [{ transform: 'translate(26px, -18px)', opacity: 0 }, { transform: 'translate(0px, 0px)', opacity: 1 }], fit, t.DUR_LAZY, t.EASE_SPRING),
        item('#lia-pv-estrela', star, fit + t.DUR_LAZY, t.DUR_SLOW, t.EASE_OUT),
      ],
      steps: [step(fit + t.DUR_LAZY, { 'data-emotion': 'happy', 'data-mouth': 'smile' })],
      origins: [['#lia-prop-skeleton', CENTER], ['#lia-pv-estrela', CENTER]],
    });
  }

  function learnScene(t) {
    var turnAt = t.DUR_LAZY;
    var pointAt = 3 * t.DUR_LAZY;
    var read = [0, -1.6, 1.6, -1.6, 1.6, 0].map(function (x) { return { transform: 'translateX(' + x + 'px)' }; });
    return scene('learn', {
      from: FOCUSED_START,
      anima: [
        item('#lia-eyes-focused > *', read, 2 * t.DUR_BASE, 3 * t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-pv-folha', [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)', offset: 0.5 }, { transform: 'scaleX(-1)' }], turnAt, t.DUR_LAZY, t.EASE_IN_OUT),
        item('#lia-pv-interrogacao', [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0px)' }], 2 * t.DUR_LAZY, t.DUR_BASE, t.EASE_OUT),
        item('#lia-pv-tela', [{ opacity: 0 }, { opacity: 1 }], pointAt, t.DUR_BASE, t.EASE_OUT),
      ],
      steps: [step(pointAt, { 'data-arm-right': 'point' }), step(pointAt + t.DUR_SLOW, { 'data-mouth': 'smile' })],
      origins: [['#lia-pv-folha', LEFT]],
    });
  }

  function warningScene(t) {
    var balloonAt = 1.5 * t.DUR_LAZY;
    var pop = [
      { opacity: 0, transform: 'scale(0.4)' },
      { opacity: 1, transform: 'scale(1.08)', offset: 0.6 },
      { opacity: 1, transform: 'scale(1)' },
    ];
    return scene('warning', {
      from: { 'data-emotion': 'neutral', 'data-mouth': 'neutral' },
      anima: [
        item('#lia-pv-veu', [{ opacity: 0 }, { opacity: 0.35 }], 0, t.DUR_LAZY, t.EASE_OUT),
        item('#lia-pv-cruzados', [{ opacity: 0 }, { opacity: 1 }], t.DUR_LAZY, t.DUR_BASE, t.EASE_OUT),
        item('#lia-pv-aviso', pop, balloonAt, t.DUR_SLOW, t.EASE_OUT),
      ],
      steps: [step(2 * t.DUR_LAZY, { 'data-emotion': 'worried', 'data-mouth': 'worried' })],
      origins: [['#lia-pv-aviso', CENTER]],
    });
  }

  /** Suspensa de costas -> gira em escala X -> volta de frente, sorri e ganha corações. Uma animação só no host. */
  function redeemScene(t) {
    var turnAt = 1.5 * t.DUR_LAZY;
    var swapAt = turnAt + t.DUR_SLOW;
    var total = swapAt + t.DUR_SLOW;
    var flip = [
      { transform: 'scaleX(1)', offset: 0 },
      { transform: 'scaleX(1)', offset: turnAt / total, easing: t.EASE_IN_OUT },
      { transform: 'scaleX(0.04)', offset: swapAt / total, easing: t.EASE_SPRING },
      { transform: 'scaleX(1)', offset: 1 },
    ];
    return scene('redeem', {
      from: { 'data-state': 'suspended', 'data-emotion': 'neutral', 'data-mouth': 'neutral', 'data-scene': 'none' },
      anima: [item(HOST, flip, 0, total, 'linear')],
      steps: [
        step(swapAt, { 'data-state': 'idle' }, BACK_PARTS),
        step(total, { 'data-emotion': 'happy', 'data-mouth': 'smile', 'data-scene': 'glow heart' }),
      ],
    });
  }

  /** Confusa: a cabeça balança até 9 graus e os ombros sobem 2,5 unidades (rotate e translate individuais). */
  function confusedScene(t) {
    var shake = 2 * t.DUR_LAZY;
    var head = [
      { rotate: '0deg' }, { rotate: '-9deg', offset: 0.2 }, { rotate: '9deg', offset: 0.45 },
      { rotate: '-6deg', offset: 0.7 }, { rotate: '3deg', offset: 0.88 }, { rotate: '0deg' },
    ];
    var shoulders = [
      { translate: '0px 0px' }, { translate: '0px -2.5px', offset: 0.25 }, { translate: '0px 0px', offset: 0.5 },
      { translate: '0px -2.5px', offset: 0.75 }, { translate: '0px 0px' },
    ];
    return scene('confused', {
      anima: [item('#lia-head', head, 0, shake, t.EASE_IN_OUT), item('#lia-coat, #lia-limbs', shoulders, 0, shake, t.EASE_IN_OUT)],
    });
  }

  function buildScenes(tokens) {
    var list = [labScene, clinicScene, atlasScene, learnScene, warningScene, redeemScene, confusedScene].map(function (make) { return make(tokens); });
    return Object.freeze(list.reduce(function (map, one) { map[one.name] = one; return map; }, {}));
  }

  var SCENES = anim && anim.tokens ? buildScenes(anim.tokens) : Object.freeze({});

  // ---------- Motor ----------

  function targets(env, sel) {
    if (sel === HOST) return [env.host];
    var found = env.svg && typeof env.svg.querySelectorAll === 'function' ? env.svg.querySelectorAll(sel) : [];
    return Array.prototype.slice.call(found);
  }

  function setOrigin(el, origin) {
    if (!el.style || typeof el.style.setProperty !== 'function') return;
    el.style.setProperty('transform-box', 'fill-box');
    el.style.setProperty('transform-origin', origin);
  }

  function applyOrigins(env, def) {
    def.origins.forEach(function (pair) { targets(env, pair[0]).forEach(function (el) { setOrigin(el, pair[1]); }); });
  }

  function applyAttrs(host, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (name) {
      if (attrs[name] === null) host.removeAttribute(name);
      else host.setAttribute(name, attrs[name]);
    });
  }

  function applyStep(env, one) {
    applyAttrs(env.host, one.attrs);
    if (one.detach && typeof env.detach === 'function') env.detach(one.detach);
  }

  function startAnimations(env, def, reduced) {
    var list = [];
    def.anima.forEach(function (part) {
      targets(env, part.sel).forEach(function (el) {
        if (!el || typeof el.animate !== 'function') return;
        var running = el.animate(part.frames, { delay: part.at, duration: part.dur, easing: part.ease, fill: 'both' });
        if (reduced && typeof running.finish === 'function') running.finish();
        list.push(running);
      });
    });
    return list;
  }

  /**
   * Toca a cena. env = { host, svg, reduced, detach(nomes) }. Devolve { stop(), finished } ou null (cena desconhecida).
   * As animações ficam presas no quadro final (fill both) até stop(): a pose final dura até o próximo estado.
   * stop() só cancela animações e relógios; os atributos do host quem reescreve é o próximo estado da Lia.
   */
  function play(name, env) {
    var def = Object.prototype.hasOwnProperty.call(SCENES, name) ? SCENES[name] : null;
    if (!def || !env || !env.host) return null;
    var reduced = env.reduced === true;
    var run = { clocks: [], anims: [], stopped: false, done: null };
    var finished = new Promise(function (resolve) { run.done = resolve; });
    applyOrigins(env, def);
    applyAttrs(env.host, def.from); // reduzido também: o quadro final é o ponto de partida mais todos os passos
    run.anims = startAnimations(env, def, reduced);
    if (reduced) {
      def.steps.forEach(function (one) { applyStep(env, one); });
      run.done();
    } else {
      def.steps.forEach(function (one) {
        run.clocks.push(timers.setTimeout(function () { if (!run.stopped) applyStep(env, one); }, one.at));
      });
      run.clocks.push(timers.setTimeout(function () { run.done(); }, def.duration));
    }
    return {
      finished: finished,
      stop: function () {
        if (run.stopped) return;
        run.stopped = true;
        run.clocks.forEach(function (id) { timers.clearTimeout(id); });
        run.anims.forEach(function (one) { if (typeof one.cancel === 'function') one.cancel(); });
        run.done();
      },
    };
  }

  return Object.freeze({
    HOST: HOST,
    names: Object.freeze(Object.keys(SCENES)),
    scenes: SCENES,
    durationOf: function (name) { return Object.prototype.hasOwnProperty.call(SCENES, name) ? SCENES[name].duration : 0; },
    play: play,
  });
});
