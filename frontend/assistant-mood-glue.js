/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia: cola do humor no chat (L7). Liga o humor de modulos/shared/lia/lia-mood.js às
// reações de assistant.js: a saudação, as frases fixas no tom reflexivo, os eventos
// (👍, moderação, pergunta rápida, pedido de detalhe) e as micro-poses idle.
// Funções puras: cada função devolve uma sessão nova e não altera a que recebeu.
// A sessão vive só na memória da página (nada vai para o armazenamento do navegador);
// assistant.js a descarta ao trocar de conta. Expõe window.AssistantMood (ou module.exports).
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AssistantMood = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var Mood = typeof window !== 'undefined' ? window.LiaMood : require('./modulos/shared/lia/lia-mood.js');
  var host = typeof window !== 'undefined' ? window : globalThis;
  var QUICK_REPLY_MS = 4000;
  var NEGATIVE_MODES = ['warning', 'suspended']; // moderação de nível 1 ou mais
  var ASKS_DETAIL = /\b(detalhe|explique melhor|mais)/;
  var GREETING_REST = 'Eu sou a Lia, a guia da plataforma LAIFT. Posso te explicar cada parte e te levar direto para a tela certa. Sobre o que você quer saber?';

  /** Texto sem acento e em minúsculas, para casar "mais" e "explique melhor" com qualquer grafia. */
  function fold(text) {
    return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  /** Frases de um texto (com a pontuação final), sem espaços nas pontas. */
  function splitSentences(text) {
    return (String(text).match(/[^.!?…]*[.!?…]+|[^.!?…]+$/g) || []).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /** Só a última frase de apoio passa por shortenFor (paciência baixa); as anteriores ficam como estão. */
  function supportLine(mood, text) {
    var sentences = splitSentences(text);
    if (!sentences.length) return text;
    var last = sentences[sentences.length - 1];
    return sentences.slice(0, -1).concat([Mood.shortenFor(mood, last)]).join(' ');
  }

  /** Sessão nova e congelada: humor padrão, sem saudação, sem frase fixa e sem resposta anterior. */
  function newSession(overrides) {
    return Object.freeze({ mood: Mood.createMood(overrides), lastGreeting: null, lastLine: null, lastReplyAt: null });
  }

  function withFields(session, fields) {
    return Object.freeze(Object.assign({}, session, fields));
  }

  /** Aplica os eventos em ordem, cada um pelo reduce do humor (evento desconhecido não muda nada). */
  function applyEvents(session, events) {
    var mood = events.reduce(function (current, evento) { return Mood.reduce(current, evento); }, session.mood);
    return withFields(session, { mood: mood });
  }

  /** Pergunta: quick-reply se veio até 4 s após a resposta anterior; asks-detail se pede mais detalhe. */
  function questionEvents(text, now, lastReplyAt) {
    var events = [];
    if (typeof lastReplyAt === 'number' && now - lastReplyAt >= 0 && now - lastReplyAt < QUICK_REPLY_MS) events.push('quick-reply');
    if (ASKS_DETAIL.test(fold(text))) events.push('asks-detail');
    return events;
  }

  /** Moderação de nível 1 ou mais (aviso ou suspensão) conta como 'negative'; sem moderação, nada. */
  function moderationEvents(mode) {
    return NEGATIVE_MODES.indexOf(mode) >= 0 ? ['negative'] : [];
  }

  /** 👍 aceito é 'positive'; o 👎 não muda o humor. */
  function feedbackEvents(rating) {
    return rating === 'up' ? ['positive'] : [];
  }

  function onQuestion(session, text, now) {
    return applyEvents(session, questionEvents(text, now, session.lastReplyAt));
  }

  /** Resposta da IA chegou com sucesso: aplica a moderação e marca a hora (base do quick-reply). */
  function onReply(session, mode, now) {
    return withFields(applyEvents(session, moderationEvents(mode)), { lastReplyAt: now });
  }

  function onFeedback(session, rating) {
    return applyEvents(session, feedbackEvents(rating));
  }

  /** Saudação da abertura: a variação entra no lugar do "Oi!" fixo; o resto da apresentação continua. */
  function greeting(session, rand) {
    var salutation = Mood.pickVariation('greeting', session.mood, rand, session.lastGreeting);
    return {
      session: withFields(session, { lastGreeting: salutation }),
      text: salutation + ' ' + supportLine(session.mood, GREETING_REST),
    };
  }

  /** Frase fixa da Lia (confirmação ou erro). No tom reflexivo ganha uma variação na frente; fora dele, fica igual. */
  function fixedLine(session, kind, text, rand) {
    if (Mood.toneOf(session.mood) !== 'reflective') return { session: session, text: text };
    var line = Mood.pickVariation(kind, session.mood, rand, session.lastLine);
    return { session: withFields(session, { lastLine: line }), text: line + ' ' + text };
  }

  /**
   * Micro-poses idle com um único timer. arm() agenda a próxima pose só se allowed() e canPose() forem
   * verdadeiros; disarm() cancela o timer pendente. Cada disparo aplica uma pose (apply) e agenda a seguinte.
   * Quem chama traz o que depende da tela: allowed (painel aberto e sem reduced-motion), canPose (repouso:
   * sem pensar, falar, celebrar nem moderação), mood, random e, se quiser, schedule/cancel (padrão: timers do navegador).
   */
  function createIdle(opts) {
    var timer = null;
    var schedule = opts.schedule || function (fn, ms) { return host.setTimeout(fn, ms); };
    var cancel = opts.cancel || function (handle) { host.clearTimeout(handle); };

    function disarm() {
      if (timer !== null) cancel(timer);
      timer = null;
    }

    function ready() {
      return opts.allowed() && opts.canPose();
    }

    function fire() {
      timer = null;
      if (!ready()) return;
      opts.apply(Mood.idleVariation(opts.mood(), opts.random));
      arm();
    }

    function arm() {
      disarm();
      if (!ready()) return;
      timer = schedule(fire, Mood.nextIdleDelay(opts.mood(), opts.random));
    }

    return Object.freeze({ arm: arm, disarm: disarm, isArmed: function () { return timer !== null; } });
  }

  return Object.freeze({
    QUICK_REPLY_MS: QUICK_REPLY_MS,
    GREETING_REST: GREETING_REST,
    newSession: newSession,
    questionEvents: questionEvents,
    moderationEvents: moderationEvents,
    feedbackEvents: feedbackEvents,
    applyEvents: applyEvents,
    onQuestion: onQuestion,
    onReply: onReply,
    onFeedback: onFeedback,
    greeting: greeting,
    fixedLine: fixedLine,
    supportLine: supportLine,
    createIdle: createIdle,
  });
});
