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

  var MODULE_RE = /^[a-z0-9]{1,30}$/;

  /** Estado do histórico: só o nome do painel e, no Aprender, o módulo aberto (TRA-03). */
  function stateFor(panelId, moduleId) {
    var state = { laift: STATE_MARK, panel: panelId };
    if (typeof moduleId === 'string' && MODULE_RE.test(moduleId)) state.module = moduleId;
    return state;
  }

  function isPanelState(state) {
    return !!state && typeof state === 'object' && state.laift === STATE_MARK
      && typeof state.panel === 'string' && PANEL_RE.test(state.panel)
      && (state.module === undefined || (typeof state.module === 'string' && MODULE_RE.test(state.module)));
  }

  function moduleOf(state) { return isPanelState(state) && state.module ? state.module : ''; }

  /** O que fazer ao trocar de painel: 'none' (já é o do histórico), 'replace' (primeira tela) ou 'push'. */
  function pushOp(currentState, panelId, isFirst, moduleId) {
    if (!PANEL_RE.test(String(panelId))) return 'none';
    if (isPanelState(currentState) && currentState.panel === panelId && moduleOf(currentState) === (moduleId || '')) return 'none';
    return isFirst ? 'replace' : 'push';
  }

  /**
   * O que fazer no popstate. ctx = { loggedIn, current, canOpen(panelId) }.
   * Devolve { type: 'ignore' } ou { type: 'show', panel }.
   */
  function popDecision(state, ctx) {
    if (!ctx || !ctx.loggedIn) return { type: 'ignore' };
    if (isPanelState(state) && ctx.canOpen(state.panel)) {
      var mod = moduleOf(state);
      if (state.panel === ctx.current && mod === (ctx.currentModule || '')) return { type: 'ignore' };
      return { type: 'show', panel: state.panel, module: mod };
    }
    if (ctx.current === HOME || !ctx.canOpen(HOME)) return { type: 'ignore' };
    return { type: 'show', panel: HOME };
  }

  // ---------- Navegador ----------

  var started = false; // a primeira troca do app (a Início depois do login) só marca o estado, não empilha

  function push(panelId, moduleId) {
    if (typeof history === 'undefined') return;
    var op = pushOp(history.state, panelId, !started, moduleId);
    started = true;
    try {
      // A primeira tela só marca o estado e MANTÉM o hash (#atlas=... e #cadastro são lidos pelo app logo depois).
      if (op === 'push') history.pushState(stateFor(panelId, moduleId), '', window.location.pathname + window.location.search);
      else if (op === 'replace') history.replaceState(stateFor(panelId, moduleId), '', window.location.pathname + window.location.search + window.location.hash);
    } catch (e) { /* o navegador pode recusar (ex.: iframe); a navegação segue sem histórico */ }
  }

  /** Logout: o próximo login volta a marcar a primeira tela em vez de empilhar. */
  function reset() { started = false; }

  function onPopState(event, ctx, show) {
    var decision = popDecision(event && event.state, ctx);
    if (decision.type === 'show') show(decision.panel, decision.module || '');
  }

  /** O módulo aberto é o do estado atual do histórico? (então o "Voltar" da tela pode usar history.back()). */
  function currentModule() {
    return typeof history === 'undefined' ? '' : moduleOf(history.state);
  }

  var api = { push: push, reset: reset, onPopState: onPopState, currentModule: currentModule };
  var pure = { moduleOf: moduleOf, stateFor: stateFor, isPanelState: isPanelState, pushOp: pushOp, popDecision: popDecision };

  // Navegador: window.LaiftPanelHistory. Node: module.exports, para scripts/panel-history.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftPanelHistory = api;
  }
})();
