/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/panel-history.js
 * Botão Voltar do Android (MOB-01): cada troca de painel entra no histórico do navegador, e o
 * "voltar" volta ao painel anterior em vez de fechar o app. Na Início, o voltar sai do app como
 * sempre. As decisões são funções puras (testadas em scripts/panel-history.test.mjs); app.js só
 * chama push() quando o membro troca de painel e onPopState() no evento popstate.
 * Não guarda nada além do nome do painel no estado do histórico (sem dados pessoais).
 */
(function () {
  'use strict';

  var HOME = 'panel-home';
  var STATE_MARK = 'panel';
  var PANEL_RE = /^panel-[a-z0-9-]{1,60}$/;

  // ---------- Funções puras ----------

  function stateFor(panelId) { return { laift: STATE_MARK, panel: panelId }; }

  function isPanelState(state) {
    return !!state && typeof state === 'object' && state.laift === STATE_MARK
      && typeof state.panel === 'string' && PANEL_RE.test(state.panel);
  }

  /** O que fazer ao trocar de painel: 'none' (já é o do histórico), 'replace' (primeira tela) ou 'push'. */
  function pushOp(currentState, panelId, isFirst) {
    if (!PANEL_RE.test(String(panelId))) return 'none';
    if (isPanelState(currentState) && currentState.panel === panelId) return 'none';
    return isFirst ? 'replace' : 'push';
  }

  /**
   * O que fazer no popstate. ctx = { loggedIn, current, canOpen(panelId) }.
   * Devolve { type: 'ignore' } ou { type: 'show', panel }.
   */
  function popDecision(state, ctx) {
    if (!ctx || !ctx.loggedIn) return { type: 'ignore' };
    if (isPanelState(state) && ctx.canOpen(state.panel)) {
      return state.panel === ctx.current ? { type: 'ignore' } : { type: 'show', panel: state.panel };
    }
    if (ctx.current === HOME || !ctx.canOpen(HOME)) return { type: 'ignore' };
    return { type: 'show', panel: HOME };
  }

  // ---------- Navegador ----------

  var started = false; // a primeira troca do app (a Início depois do login) só marca o estado, não empilha

  function push(panelId) {
    if (typeof history === 'undefined') return;
    var op = pushOp(history.state, panelId, !started);
    started = true;
    try {
      // A primeira tela só marca o estado e MANTÉM o hash (#atlas=... e #cadastro são lidos pelo app logo depois).
      if (op === 'push') history.pushState(stateFor(panelId), '', window.location.pathname + window.location.search);
      else if (op === 'replace') history.replaceState(stateFor(panelId), '', window.location.pathname + window.location.search + window.location.hash);
    } catch (e) { /* o navegador pode recusar (ex.: iframe); a navegação segue sem histórico */ }
  }

  /** Logout: o próximo login volta a marcar a primeira tela em vez de empilhar. */
  function reset() { started = false; }

  function onPopState(event, ctx, show) {
    var decision = popDecision(event && event.state, ctx);
    if (decision.type === 'show') show(decision.panel);
  }

  var api = { push: push, reset: reset, onPopState: onPopState };
  var pure = { stateFor: stateFor, isPanelState: isPanelState, pushOp: pushOp, popDecision: popDecision };

  // Navegador: window.LaiftPanelHistory. Node: module.exports, para scripts/panel-history.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftPanelHistory = api;
  }
})();
