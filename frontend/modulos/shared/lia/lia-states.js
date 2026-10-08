/*
 * Lia - matriz de estados (ADR 0003). Funções puras, sem DOM.
 * Quem chama: lia.js (mount e setState) e frontend/scripts/lia.test.mjs.
 * Convenção: null em um campo = omitir o data-* (vale o padrão do CSS do estado).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiaStates = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var ALLOWED = Object.freeze({
    emotion: Object.freeze(['neutral', 'curious', 'happy', 'worried', 'focused', 'sad']),
    mouth: Object.freeze(['neutral', 'smile', 'open', 'flat', 'worried']),
    arm: Object.freeze(['idle', 'wave', 'point', 'chin', 'heart']),
    prop: Object.freeze(['none', 'calendar', 'pencil', 'flask', 'stethoscope', 'thermometer', 'book', 'skeleton', 'bone']),
    scene: Object.freeze(['particles', 'glow', 'heart', 'bubble', 'sparkles']),
  });
  var NONE_SCENE = 'none'; // desliga o cenário padrão do estado (README, "data-scene")
  var MAX_LABEL = 120;

  function ctx(state, emotion, mouth, armLeft, armRight, prop, scene, ariaLabel) {
    return Object.freeze({ state: state, emotion: emotion, mouth: mouth, armLeft: armLeft, armRight: armRight, prop: prop, scene: scene, ariaLabel: ariaLabel });
  }

  var CONTEXTS = Object.freeze({
    idle: ctx('idle', 'neutral', 'neutral', 'idle', 'idle', 'none', null, 'Lia'),
    thinking: ctx('thinking', 'curious', 'flat', 'idle', 'chin', 'none', 'bubble', 'Lia está pensando'),
    speaking: ctx('speaking', null, 'open', 'idle', 'point', 'none', null, 'Lia está respondendo'),
    celebrating: ctx('celebrating', 'happy', 'smile', 'heart', 'heart', 'none', 'glow heart sparkles', 'Lia está celebrando'),
    confused: ctx('idle', 'worried', 'worried', 'idle', 'idle', 'none', null, 'Lia não entendeu'),
    alert: ctx('idle', 'focused', 'flat', 'idle', 'idle', 'none', null, 'Lia está atenta'),
    warning: ctx('idle', 'sad', 'flat', 'idle', 'idle', 'none', null, 'Lia emitiu um alerta'),
    suspended: ctx('suspended', 'sad', 'flat', 'idle', 'idle', 'none', null, 'Lia está suspensa'),
    events: ctx('idle', 'curious', 'neutral', 'idle', 'idle', 'calendar', null, 'Lia, assistente de Eventos'),
    proposals: ctx('idle', 'focused', 'flat', 'idle', 'idle', 'pencil', null, 'Lia, assistente de Propostas'),
    lab: ctx('idle', 'focused', 'flat', 'idle', 'idle', 'flask', null, 'Lia, assistente do Laboratório'),
    clinic: ctx('idle', 'neutral', 'neutral', 'idle', 'idle', 'stethoscope', null, 'Lia, assistente da Clínica'),
    atlas: ctx('idle', 'curious', 'neutral', 'idle', 'idle', 'skeleton', null, 'Lia, assistente do Atlas 3D'),
    learn: ctx('idle', 'neutral', 'neutral', 'idle', 'idle', 'book', null, 'Lia, assistente de Aulas'),
  });
  var MODULES = Object.freeze(['events', 'proposals', 'lab', 'clinic', 'atlas', 'learn']);

  function hasContext(name) {
    return typeof name === 'string' && Object.prototype.hasOwnProperty.call(CONTEXTS, name);
  }

  function isModule(name) {
    return MODULES.indexOf(name) >= 0;
  }

  /** Aceita o valor só se estiver na allowlist; senão, mantém o padrão do contexto. */
  function pickFrom(value, allowed, fallback) {
    return allowed.indexOf(value) >= 0 ? value : fallback;
  }

  /** Cenas: lista (string ou array). Tokens fora da allowlist são descartados; 'none' desliga o padrão. */
  function pickScene(value, fallback) {
    var tokens = typeof value === 'string' ? value.trim().split(/\s+/) : Array.isArray(value) ? value : null;
    if (!tokens) return fallback;
    if (tokens.indexOf(NONE_SCENE) >= 0) return NONE_SCENE;
    var kept = ALLOWED.scene.filter(function (scene) { return tokens.indexOf(scene) >= 0; });
    return kept.length ? kept.join(' ') : fallback;
  }

  /** Rótulo ARIA: texto simples de 1 a 120 caracteres, sem controles. */
  function pickLabel(value, fallback) {
    if (typeof value !== 'string') return fallback;
    var clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
    return clean.length > 0 && clean.length <= MAX_LABEL ? clean : fallback;
  }

  /** Atributos finais de um contexto, com overrides validados. Sempre devolve objeto novo e congelado. */
  function resolve(context, overrides) {
    var name = hasContext(context) ? context : 'idle';
    var base = CONTEXTS[name];
    var over = overrides && typeof overrides === 'object' ? overrides : {};
    return Object.freeze({
      context: name,
      state: base.state,
      emotion: pickFrom(over.emotion, ALLOWED.emotion, base.emotion),
      mouth: pickFrom(over.mouth, ALLOWED.mouth, base.mouth),
      armLeft: pickFrom(over.armLeft, ALLOWED.arm, base.armLeft),
      armRight: pickFrom(over.armRight, ALLOWED.arm, base.armRight),
      prop: pickFrom(over.prop, ALLOWED.prop, base.prop),
      scene: pickScene(over.scene, base.scene),
      ariaLabel: pickLabel(over.ariaLabel, base.ariaLabel),
    });
  }

  /** Rótulo ARIA de um contexto (desconhecido cai em 'Lia'). */
  function ariaLabelFor(context) {
    return hasContext(context) ? CONTEXTS[context].ariaLabel : CONTEXTS.idle.ariaLabel;
  }

  return Object.freeze({
    ALLOWED: ALLOWED,
    CONTEXTS: Object.freeze(Object.keys(CONTEXTS)),
    MODULES: MODULES,
    NONE_SCENE: NONE_SCENE,
    hasContext: hasContext,
    isModule: isModule,
    resolve: resolve,
    ariaLabelFor: ariaLabelFor,
  });
});
