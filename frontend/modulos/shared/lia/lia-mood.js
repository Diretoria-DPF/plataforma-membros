/*
 * Lia - humor e variações de fala (L5). Funções puras e imutáveis: sem DOM, sem armazenamento e sem timers.
 * Quem chama: assistant.js (integração pelo orquestrador, via window.LiaMood) e frontend/scripts/lia-mood.test.mjs.
 * Eixos do humor em 0..1. As poses idle são overrides validados contra LiaStates (lia-states.js) no teste.
 * Aleatoriedade sempre injetada: rand() devolve um número em [0, 1). Rand inválida cai no meio do intervalo.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiaMood = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const AXES = Object.freeze(['energy', 'patience', 'curiosity', 'rapport']);
  const DEFAULTS = Object.freeze({ energy: 0.8, patience: 0.9, curiosity: 0.7, rapport: 0.5 });
  const DECAY = 0.05; // fração do caminho até o padrão a cada idle-tick
  const ANIMATED_ABOVE = 0.7; // energia > 0,7
  const REFLECTIVE_BELOW = 0.4; // energia < 0,4
  const WARM_RAPPORT = 0.7; // rapport >= 0,7 libera a saudação calorosa
  const SHORT_PATIENCE = 0.4; // paciência < 0,4 encurta a fala
  const SHORT_MAX_CHARS = 60;
  const IDLE_MIN_MS = 10000;
  const IDLE_MAX_MS = 30000;
  const IDLE_HALF_SPAN_MS = (IDLE_MAX_MS - IDLE_MIN_MS) / 2;
  const UNIT_MAX = 0.999999; // rand nunca chega a 1, então o índice fica dentro da lista
  const ELLIPSIS = '…';
  const TRAILING_MARKS = /[!.?…]+$/u;
  const SENTENCE_END = /[.!?…]+(?=\s|$)/u;
  const WHITESPACE_TAIL = /\s\S*$/;

  const EVENT_DELTAS = Object.freeze({
    positive: Object.freeze({ rapport: 0.1, patience: 0.05 }),
    negative: Object.freeze({ patience: -0.2, rapport: -0.05 }),
    'quick-reply': Object.freeze({ energy: 0.05 }),
    'asks-detail': Object.freeze({ curiosity: 0.05 }),
    'new-module': Object.freeze({ curiosity: 0.1 }),
  });

  const VARIATIONS = Object.freeze({
    greeting: Object.freeze(['Oi!', 'Olá!', 'E aí!', 'Bem-vindo!', 'Chegou!']),
    confirmation: Object.freeze(['Beleza!', 'Certo!', 'Anotado!', 'Ok!']),
    tip: Object.freeze(['Tenta assim…', 'Uma dica…', 'Sabia que…', 'Dá uma olhada em…', 'Já pensou em…', 'O que acha de…']),
    farewell: Object.freeze(['Até mais!', 'Falou!', 'Bons estudos!', 'Volta sempre!']),
    error: Object.freeze(['Hmm, não entendi.', 'Pode reformular?', 'Não peguei essa.']),
  });
  const WARM_GREETING = 'Que bom te ver!';
  const PAUSE_KINDS = Object.freeze(['greeting', 'confirmation']);

  const IDLE_POSES = Object.freeze([
    Object.freeze({ armLeft: 'idle', emotion: 'neutral' }),
    Object.freeze({ emotion: 'curious' }),
    Object.freeze({ armRight: 'chin' }),
    Object.freeze({ armLeft: 'wave' }),
    Object.freeze({ mouth: 'smile' }),
  ]);

  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const round4 = (value) => Math.round(value * 10000) / 10000; // tira ruído de ponto flutuante
  const core = (text) => text.replace(TRAILING_MARKS, '');

  function axisValue(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? round4(clamp01(value)) : fallback;
  }

  /** Humor novo e congelado: eixo ausente ou inválido vira o padrão; número fora de 0..1 é limitado. */
  function snapshot(source) {
    const input = source && typeof source === 'object' ? source : {};
    return Object.freeze(Object.fromEntries(AXES.map((axis) => [axis, axisValue(input[axis], DEFAULTS[axis])])));
  }

  /** Valor de rand em [0, 1). Função ausente ou inválida devolve 0,5. */
  function unitOf(rand) {
    const raw = typeof rand === 'function' ? Number(rand()) : NaN;
    return Number.isFinite(raw) ? Math.min(Math.max(raw, 0), UNIT_MAX) : 0.5;
  }

  function pickIndex(rand, size) {
    return Math.min(size - 1, Math.floor(unitOf(rand) * size));
  }

  function createMood(overrides) {
    return snapshot(overrides);
  }

  function shiftAll(current, deltas) {
    return Object.fromEntries(AXES.map((axis) => [axis, current[axis] + (deltas[axis] || 0)]));
  }

  function decayAll(current) {
    return Object.fromEntries(AXES.map((axis) => [axis, current[axis] + (DEFAULTS[axis] - current[axis]) * DECAY]));
  }

  /** Evento -> novo humor. Evento desconhecido devolve cópia do mesmo estado. Nunca altera o parâmetro. */
  function reduce(mood, evento) {
    const current = snapshot(mood);
    if (evento === 'idle-tick') return snapshot(decayAll(current));
    if (!hasOwn(EVENT_DELTAS, evento)) return snapshot(current);
    return snapshot(shiftAll(current, EVENT_DELTAS[evento]));
  }

  function toneOf(mood) {
    const { energy } = snapshot(mood);
    if (energy > ANIMATED_ABOVE) return 'animated';
    if (energy < REFLECTIVE_BELOW) return 'reflective';
    return 'neutral';
  }

  /** Tom reflexivo prefere variações sem "!" (mais calmas). Se nenhuma existir, mantém a lista inteira. */
  function preferCalm(pool, reflective) {
    if (!reflective) return pool;
    const calm = pool.filter((text) => !text.endsWith('!'));
    return calm.length ? calm : pool;
  }

  /** Saudação com rapport alto acrescenta a forma calorosa. */
  function poolFor(kind, mood) {
    const base = VARIATIONS[kind];
    const warm = kind === 'greeting' && snapshot(mood).rapport >= WARM_RAPPORT;
    return warm ? base.concat([WARM_GREETING]) : base;
  }

  /**
   * Escolhe uma variação. Nunca repete `last`, comparado sem pontuação final (vale o texto cru ou o já renderizado).
   * Tom reflexivo prefere variações calmas e, em saudação e confirmação, troca o "!" final por "…" (pausa).
   * Kind desconhecido devolve null.
   */
  function pickVariation(kind, mood, rand, last) {
    if (!hasOwn(VARIATIONS, kind)) return null;
    const reflective = toneOf(mood) === 'reflective';
    const full = poolFor(kind, mood);
    const lastCore = typeof last === 'string' ? core(last) : null;
    const notLast = (list) => list.filter((text) => core(text) !== lastCore);
    const options = [notLast(preferCalm(full, reflective)), notLast(full), full].find((list) => list.length > 0);
    const text = options[pickIndex(rand, options.length)];
    return reflective && PAUSE_KINDS.includes(kind) ? core(text) + ELLIPSIS : text;
  }

  /** Micro-pose idle (override compatível com LiaStates.resolve). Tom reflexivo não acena. */
  function idleVariation(mood, rand) {
    const reflective = toneOf(mood) === 'reflective';
    const poses = reflective ? IDLE_POSES.filter((pose) => pose.armLeft !== 'wave') : IDLE_POSES;
    return Object.freeze({ ...poses[pickIndex(rand, poses.length)] });
  }

  /** Espera (ms) até a próxima micro-pose, entre 10 000 e 30 000. Energia alta encurta a faixa. */
  function nextIdleDelay(mood, rand) {
    const { energy } = snapshot(mood);
    const low = Math.round(IDLE_MIN_MS + (1 - energy) * IDLE_HALF_SPAN_MS);
    return low + Math.floor(unitOf(rand) * IDLE_HALF_SPAN_MS);
  }

  function firstSentence(text) {
    const end = SENTENCE_END.exec(text);
    return (end ? text.slice(0, end.index + end[0].length) : text).trim();
  }

  /** Corta na última fronteira de palavra antes do limite, com reticências. Palavra única longa fica inteira. */
  function cutAtWord(text, max) {
    if (text.length <= max) return text;
    const tail = text.slice(0, max + 1).search(WHITESPACE_TAIL);
    if (tail > 0) return text.slice(0, tail) + ELLIPSIS;
    const firstSpace = text.search(/\s/);
    return firstSpace > 0 ? text.slice(0, firstSpace) + ELLIPSIS : text;
  }

  /** Paciência abaixo de 0,4: só a primeira frase, em fronteira de palavra. Senão, texto intacto. */
  function shortenFor(mood, texto) {
    if (typeof texto !== 'string') return '';
    if (snapshot(mood).patience >= SHORT_PATIENCE) return texto;
    return cutAtWord(firstSentence(texto), SHORT_MAX_CHARS);
  }

  return Object.freeze({
    AXES,
    DEFAULTS,
    VARIATIONS,
    IDLE_POSES,
    createMood,
    reduce,
    toneOf,
    pickVariation,
    idleVariation,
    nextIdleDelay,
    shortenFor,
  });
});
