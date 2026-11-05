/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Guia: próximo passo (A3). Na saudação, a Guia lê no aparelho (revisao-espacada.js) quantos erros vencem hoje e sugere
// o módulo onde começar, com um botão que ABRE O MÓDULO (ação open_module da lista branca, não só o painel Aprender).
// Nada é enviado ao servidor: a leitura é local e o texto sai pronto daqui. Sem erros a rever, não diz nada.
// Módulo opcional de assistant.js: sem ele (ou sem revisao-espacada.js), a Guia segue igual. Expõe window.LaiftAssistantNext.
(function (root) {
  'use strict';

  var LABEL_MAX = 40; // igual ao limite de rótulo dos botões da Guia (assistant.js)

  function plural(n, one, many) { return n === 1 ? one : many; }

  /** Próximo passo a partir do resumo de revisao-espacada.js (summarize/read); null quando nada venceu. */
  function step(summary) {
    if (!summary || !(summary.due > 0) || !summary.next || !Array.isArray(summary.modules)) return null;
    var target = summary.modules.filter(function (m) { return m.id === summary.next; })[0];
    if (!target || !(target.due > 0)) return null;
    var label = 'Revisar ' + target.due + ' ' + plural(target.due, 'erro', 'erros') + ' · ' + target.name;
    return {
      text: 'Você tem ' + summary.due + ' ' + plural(summary.due, 'erro', 'erros') + ' para rever hoje. Vale começar por ' + target.name + '.',
      action: { type: 'open_module', target: target.id, label: label.length > LABEL_MAX ? label.slice(0, LABEL_MAX) : label },
    };
  }

  /**
   * Texto e botão para a saudação da Guia. `app` é window.App; `sanitize` é sanitizeActions de assistant.js (confere a
   * lista branca). Devolve { text, actions } ou null.
   */
  function forGreeting(app, sanitize, now) {
    var lib = root.LaiftReview;
    if (!lib || typeof lib.read !== 'function') return null;
    var identity = app && typeof app.getIdentity === 'function' ? app.getIdentity() : null;
    var found = step(lib.read({ email: identity && identity.email, now: now === undefined ? Date.now() : now }));
    if (!found) return null;
    var actions = typeof sanitize === 'function' ? sanitize([found.action]) : [found.action];
    return actions.length ? { text: found.text, actions: actions } : null;
  }

  /** Saudação da Guia com o próximo passo: devolve uma CÓPIA da mensagem com o texto e o botão acrescentados (ou a própria). */
  function decorate(message, app, sanitize, now) {
    var next = forGreeting(app, sanitize, now);
    if (!next) return message;
    return Object.assign({}, message, { text: message.text + ' ' + next.text, actions: next.actions });
  }

  var api = { step: step, forGreeting: forGreeting, decorate: decorate };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftAssistantNext = api;
})(typeof window !== 'undefined' ? window : globalThis);
