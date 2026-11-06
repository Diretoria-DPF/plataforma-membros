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
 * Diálogos e folhas abertos (menu, crachá, quiz do dia, confirmações, Guia) também entram no histórico:
 * o Voltar do Android fecha o diálogo antes de trocar de painel ou sair (QA mobile, 2026-11-05).
 */
(function () {
  'use strict';

  var HOME = 'panel-home';
  var STATE_MARK = 'panel';
  var PANEL_RE = /^panel-[a-z0-9-]{1,60}$/;
  var OVERLAY_MARK = 'laiftOverlay';
  // Diálogos que o Voltar deve fechar: <dialog> aberto, modais da plataforma, folhas e o painel da Guia.
  var OVERLAY_SELECTOR = 'dialog[open], .modal-overlay:not(.hidden), [role="dialog"][aria-modal="true"]:not(.hidden), .lia-panel:not(.hidden), .l2-sheet';
  var CLOSE_SELECTOR = '[data-close], [aria-label^="Fechar"], .modal-close, [id*="close"], [id*="fechar"], [id*="cancel"]';

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

  /** A entrada do histórico foi empilhada por um diálogo aberto? */
  function isOverlayState(state) { return !!state && typeof state === 'object' && state[OVERLAY_MARK] === true; }

  /** Estado do histórico enquanto há diálogo aberto: o mesmo painel/módulo, mais a marca do diálogo. */
  function overlayStateFor(state) {
    var copy = {};
    if (state && typeof state === 'object') {
      if (state.laift === STATE_MARK && PANEL_RE.test(String(state.panel))) copy = stateFor(state.panel, state.module);
    }
    copy[OVERLAY_MARK] = true;
    return copy;
  }

  /** O que fazer ao trocar de painel: 'none' (já é o do histórico), 'replace' (primeira tela) ou 'push'. */
  function pushOp(currentState, panelId, isFirst, moduleId) {
    if (!PANEL_RE.test(String(panelId))) return 'none';
    if (isPanelState(currentState) && currentState.panel === panelId && moduleOf(currentState) === (moduleId || '')) return 'none';
    // Trocou de painel com um diálogo aberto: o estado do diálogo é trocado, em vez de sobrar uma entrada vazia.
    if (isOverlayState(currentState)) return 'replace';
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

  // ---------- Diálogos e o Voltar ----------

  var overlayPushed = false;   // há uma entrada de histórico empilhada por diálogo
  var overlaySwallow = 0;      // popstates provocados por nós (fechar o diálogo pela tela)
  var overlayScheduled = false;

  function visibleEl(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var cs = window.getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function openOverlays() {
    var list = [];
    Array.prototype.forEach.call(document.querySelectorAll(OVERLAY_SELECTOR), function (el) {
      if (list.indexOf(el) === -1 && visibleEl(el)) list.push(el);
    });
    return list;
  }

  /** Fecha o diálogo do topo: <dialog>.close(), senão Esc no elemento com foco e, por fim, o botão de fechar. */
  function closeOverlay(el) {
    if (el.tagName === 'DIALOG' && typeof el.close === 'function') { el.close(); return; }
    var target = document.activeElement && el.contains(document.activeElement) ? document.activeElement : el;
    var evt = typeof KeyboardEvent === 'function' ? new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }) : null;
    if (evt) target.dispatchEvent(evt);
    if (!visibleEl(el)) return;
    var btn = el.querySelector(CLOSE_SELECTOR);
    if (btn) btn.click();
  }

  function syncOverlays() {
    overlayScheduled = false;
    if (typeof history === 'undefined') return;
    var any = openOverlays().length > 0;
    try {
      if (any && !overlayPushed) {
        overlayPushed = true;
        history.pushState(overlayStateFor(history.state), '', window.location.pathname + window.location.search + window.location.hash);
      } else if (!any && overlayPushed) {
        overlayPushed = false;
        // Só desfaz a entrada se ela ainda é a do diálogo (uma troca de painel já a substituiu).
        if (isOverlayState(history.state)) { overlaySwallow += 1; history.back(); }
      }
    } catch (e) { overlayPushed = false; /* o navegador pode recusar (ex.: iframe): o diálogo segue sem histórico */ }
  }

  function scheduleOverlaySync() {
    if (overlayScheduled) return;
    overlayScheduled = true;
    var raf = window.requestAnimationFrame || function (fn) { return window.setTimeout(fn, 16); };
    raf(syncOverlays);
  }

  function onOverlayPop() {
    if (overlaySwallow > 0) { overlaySwallow -= 1; return; }
    if (!overlayPushed) return;
    overlayPushed = false; // o Voltar consumiu a entrada do diálogo
    var list = openOverlays();
    var inside = list.filter(function (el) { return document.activeElement && el.contains(document.activeElement); });
    var top = inside.length ? inside[inside.length - 1] : list[list.length - 1];
    if (top) closeOverlay(top);
    scheduleOverlaySync(); // sobrou outro diálogo (ex.: confirmação sobre o crachá)? empilha de novo
  }

  function startOverlayBack() {
    if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return;
    window.addEventListener('popstate', onOverlayPop);
    new MutationObserver(scheduleOverlaySync).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'],
    });
    scheduleOverlaySync();
  }

  var api = { push: push, reset: reset, onPopState: onPopState, currentModule: currentModule };
  var pure = {
    moduleOf: moduleOf, stateFor: stateFor, isPanelState: isPanelState, pushOp: pushOp, popDecision: popDecision,
    isOverlayState: isOverlayState, overlayStateFor: overlayStateFor,
  };

  // Navegador: window.LaiftPanelHistory. Node: module.exports, para scripts/panel-history.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftPanelHistory = api;
    startOverlayBack();
  }
})();
