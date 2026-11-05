/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * quiz-logic.js — regras puras do motor de simulados (sem DOM), para poder testá-las em Node.
 *
 *   optionOrder(seed, questionId, count)   -> permutação determinística das alternativas (QZ-01)
 *   newSeed()                              -> semente aleatória (inteiro de 32 bits sem sinal)
 *   readProgress(raw, bank)                -> { byId, seed, owner } (aceita o formato antigo por posição)
 *   writeProgress(prev, entries, extra)    -> objeto novo para gravar (v2, respostas por id da questão)
 *   scoreAnswers(questions, answers)       -> placar só das respondidas; em branco não é erro (QZ-05)
 *   canAnswer(mode, current)               -> false no modo estudo depois do gabarito (QZ-03)
 *   validateQuestion(q)                    -> lista de problemas do esquema (A1); vazia = válida
 *   pickSession(pool, count, opts)         -> sessão de `count` questões (0 = todas), estável por semente (A1)
 *   INTERNAL_FIELDS                        -> campos só de gestão (dificuldade, fonte, revisor...), nunca exibidos
 *
 * As respostas guardadas são índices na ORDEM ORIGINAL do banco; só a exibição embaralha.
 * Script clássico (global LaiftQuizLogic) e, em Node, module.exports.
 */
(function (global) {
  'use strict';

  var PROGRESS_VERSION = 2;

  function hashString(text) {
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function newSeed() {
    var c = global.crypto;
    if (c && typeof c.getRandomValues === 'function') return c.getRandomValues(new Uint32Array(1))[0];
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  /** Mesma semente + mesma questão => mesma ordem; sementes diferentes espalham a correta pelas posições. */
  function optionOrder(seed, questionId, count) {
    var order = [];
    for (var i = 0; i < count; i++) order.push(i);
    var rand = mulberry32(hashString(String(seed >>> 0) + ':' + String(questionId)));
    for (var k = count - 1; k > 0; k--) {
      var j = Math.floor(rand() * (k + 1));
      var tmp = order[k]; order[k] = order[j]; order[j] = tmp;
    }
    return order;
  }

  function isAnswer(value) { return typeof value === 'number' && value >= 0 && value === Math.floor(value); }

  /** Aceita { v: 2, byId, seed, owner } ou o formato antigo { userAnswers: [por posição no banco] }. */
  function readProgress(raw, bank) {
    var out = { byId: {}, seed: null, owner: '' };
    if (!raw || typeof raw !== 'object') return out;
    if (raw.byId && typeof raw.byId === 'object' && !Array.isArray(raw.byId)) {
      Object.keys(raw.byId).forEach(function (id) { if (isAnswer(raw.byId[id])) out.byId[id] = raw.byId[id]; });
    } else if (Array.isArray(raw.userAnswers)) {
      raw.userAnswers.forEach(function (a, i) {
        if (bank && bank[i] && isAnswer(a)) out.byId[String(bank[i].id)] = a;
      });
    }
    if (typeof raw.seed === 'number' && isFinite(raw.seed)) out.seed = raw.seed >>> 0;
    if (typeof raw.owner === 'string') out.owner = raw.owner;
    return out;
  }

  /**
   * @param {object} prev     resultado de readProgress (o que já estava salvo)
   * @param {Array}  entries  [{ id, answer }] — null/undefined é ignorado (não apaga o que já existe)
   * @param {object} extra    { seed, owner, timestamp }
   */
  function writeProgress(prev, entries, extra) {
    var byId = Object.assign({}, prev && prev.byId);
    (entries || []).forEach(function (e) { if (e && isAnswer(e.answer)) byId[String(e.id)] = e.answer; });
    extra = extra || {};
    return {
      v: PROGRESS_VERSION,
      byId: byId,
      seed: extra.seed === undefined ? (prev && prev.seed) : extra.seed,
      owner: extra.owner === undefined ? (prev && prev.owner) || '' : extra.owner,
      timestamp: extra.timestamp || new Date().toISOString(),
    };
  }

  function withoutIds(progress, ids) {
    var byId = Object.assign({}, progress && progress.byId);
    (ids || []).forEach(function (id) { delete byId[String(id)]; });
    return Object.assign({}, progress, { byId: byId });
  }

  /** Em branco (null/undefined) não conta como erro, nem entra no total nem nos tópicos. */
  function scoreAnswers(questions, answers) {
    var res = { answered: 0, correct: 0, blank: 0, topicCounts: {}, topicScores: {}, topicStats: [] };
    questions.forEach(function (q, i) {
      var a = answers[i];
      if (a === null || a === undefined) { res.blank++; return; }
      res.answered++;
      res.topicCounts[q.topic] = (res.topicCounts[q.topic] || 0) + 1;
      res.topicScores[q.topic] = res.topicScores[q.topic] || 0;
      if (a === q.correct) { res.correct++; res.topicScores[q.topic]++; }
    });
    res.topicStats = Object.keys(res.topicCounts).map(function (t) {
      return { topic: t, correct: res.topicScores[t], total: res.topicCounts[t] };
    });
    return res;
  }

  /** Estudo: o gabarito aparece na primeira resposta, então ela é definitiva. Prova: pode trocar até entregar. */
  function canAnswer(mode, current) {
    if (mode === 'exam') return true;
    return current === null || current === undefined;
  }

  // ---- A1: esquema de questão ---------------------------------------------------------------------------
  // Obrigatórios: id, topic, question, options (>= 2 textos), correct (índice válido). Opcionais, só para a gestão
  // (nunca exibidos ao público): difficulty 1-3, source, reviewedBy, reviewedAt (AAAA-MM-DD), tags.
  var INTERNAL_FIELDS = ['difficulty', 'source', 'reviewedBy', 'reviewedAt', 'tags'];
  var MAX_SOURCE = 300;
  var MAX_REVIEWER = 120;
  var MAX_TAGS = 10;

  function isText(v) { return typeof v === 'string' && v.trim().length > 0; }

  function isIsoDate(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var d = new Date(v + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }

  function validateQuestion(q) {
    var problems = [];
    if (!q || typeof q !== 'object') return ['questão ausente'];
    if (q.id === undefined || q.id === null || q.id === '') problems.push('id ausente');
    if (!isText(q.topic)) problems.push('topic ausente');
    if (!isText(q.question)) problems.push('question ausente');
    if (!Array.isArray(q.options) || q.options.length < 2 || !q.options.every(isText)) problems.push('options inválidas');
    else if (!isAnswer(q.correct) || q.correct >= q.options.length) problems.push('correct fora das alternativas');
    if (q.difficulty !== undefined && !(q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3)) problems.push('difficulty deve ser 1, 2 ou 3');
    if (q.source !== undefined && (!isText(q.source) || q.source.length > MAX_SOURCE)) problems.push('source inválida');
    if (q.reviewedBy !== undefined && (!isText(q.reviewedBy) || q.reviewedBy.length > MAX_REVIEWER)) problems.push('reviewedBy inválido');
    if (q.reviewedAt !== undefined && !isIsoDate(q.reviewedAt)) problems.push('reviewedAt deve ser AAAA-MM-DD');
    if (q.tags !== undefined && (!Array.isArray(q.tags) || q.tags.length > MAX_TAGS || !q.tags.every(isText))) problems.push('tags inválidas');
    return problems;
  }

  // ---- A1: tamanho da sessão -----------------------------------------------------------------------------
  /**
   * @param {Array}  pool   questões elegíveis (já filtradas pelos tópicos)
   * @param {number} count  tamanho desejado; 0 (ou >= pool.length) devolve tudo, na ordem original
   * @param {object} opts   { seed, mode: 'study'|'exam', answered: { [id]: índice } }
   * No estudo, as ainda não respondidas vêm antes; dentro de cada grupo a escolha é aleatória por semente.
   * O resultado mantém a ordem do banco.
   */
  function pickSession(pool, count, opts) {
    var list = (pool || []).slice();
    if (!count || count <= 0 || count >= list.length) return list;
    opts = opts || {};
    var answered = opts.mode === 'exam' ? {} : (opts.answered || {});
    var rand = mulberry32(hashString('session:' + String((opts.seed || 0) >>> 0)));
    function shuffled(items) {
      for (var k = items.length - 1; k > 0; k--) {
        var j = Math.floor(rand() * (k + 1));
        var tmp = items[k]; items[k] = items[j]; items[j] = tmp;
      }
      return items;
    }
    var indexed = list.map(function (q, i) { return { q: q, i: i }; });
    var fresh = shuffled(indexed.filter(function (e) { return answered[String(e.q.id)] === undefined; }));
    var seen = shuffled(indexed.filter(function (e) { return answered[String(e.q.id)] !== undefined; }));
    return fresh.concat(seen).slice(0, count)
      .sort(function (a, b) { return a.i - b.i; })
      .map(function (e) { return e.q; });
  }

  var api = {
    validateQuestion: validateQuestion, pickSession: pickSession, INTERNAL_FIELDS: INTERNAL_FIELDS,
    optionOrder: optionOrder, newSeed: newSeed, readProgress: readProgress, writeProgress: writeProgress,
    withoutIds: withoutIds, scoreAnswers: scoreAnswers, canAnswer: canAnswer, PROGRESS_VERSION: PROGRESS_VERSION,
  };
  global.LaiftQuizLogic = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
