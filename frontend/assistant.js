/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia, a guia da plataforma: botão flutuante + painel de conversa que orienta e
// leva até a tela certa. Ela NÃO altera dados: os botões só navegam (abrir tela,
// abrir módulo de estudo, abrir o crachá) e só existem se o destino estiver na
// lista branca abaixo, que é IGUAL à do servidor (worker/src/assistant/targets.js;
// o teste assistant.test.mjs confere). O texto da resposta entra por textContent.
// A conversa fica só na memória da página (nada vai para o armazenamento do
// navegador) e some ao sair da conta. Só aparece se a flag chatbot_enabled
// estiver ligada (apiGetFeatureFlags). Expõe window.LaiftAssistant.
(function (root) {
  'use strict';

  // Mesma lista de worker/src/assistant/targets.js (tipo:destino), em ordem alfabética.
  var ACTION_KEYS = [
    'navigate:panel-admin-ai', 'navigate:panel-admin-audit', 'navigate:panel-admin-dashboard', 'navigate:panel-admin-events',
    'navigate:panel-admin-feedback', 'navigate:panel-admin-fiscal', 'navigate:panel-admin-proposals', 'navigate:panel-admin-reports',
    'navigate:panel-admin-tasks', 'navigate:panel-admin-users', 'navigate:panel-events', 'navigate:panel-home', 'navigate:panel-learn',
    'navigate:panel-messages', 'navigate:panel-orgchart', 'navigate:panel-profile', 'navigate:panel-proposals', 'navigate:panel-tasks',
    'open_credential:credential', 'open_module:anatomia', 'open_module:clinica', 'open_module:farmaco', 'open_module:lab', 'open_module:toxico',
  ];
  var MAX_ACTIONS = 4;
  var MAX_SUGGESTIONS = 3;
  var HISTORY_TURNS = 5;
  var MESSAGE_MAX = 500;
  var LABEL_MAX = 40;
  var GREETING = 'Oi! Eu sou a Lia, a guia da plataforma LAIFT. Posso te explicar cada parte e te levar direto para a tela certa. Sobre o que você quer saber?';
  var GREETING_SUGGESTIONS = ['Eventos abertos', 'Como funciona o laboratório?', 'Meu crachá', 'Módulos de estudo'];
  var ERROR_TEXT = 'Não consegui responder agora. Tente de novo em instantes.';
  var DEGRADED_TEXT = 'Resposta aproximada: a IA está indisponível no momento.';
  var MAX_SOURCES = 4;
  var PANEL_LIA_SIZE = 72; // px de largura do corpo inteiro no cabeçalho (altura ≈ 108 px, proporção 2:3)
  var SPEAK_MS = 2500; // depois da resposta, a Lia fica falando por este tempo e volta ao repouso
  var MODULE_BY_PANEL = { 'panel-events': 'events', 'panel-proposals': 'proposals', 'panel-learn': 'learn' };

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------
  function clip(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function isAllowedAction(action) {
    return !!action && typeof action === 'object' && typeof action.type === 'string' && typeof action.target === 'string'
      && ACTION_KEYS.indexOf(action.type + ':' + action.target) !== -1;
  }

  /** Só botões da lista branca, sem repetir, no máximo 4; o rótulo é texto curto. */
  function sanitizeActions(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      if (out.length >= MAX_ACTIONS || !isAllowedAction(item)) return;
      var key = item.type + ':' + item.target;
      if (Object.prototype.hasOwnProperty.call(seen, key)) return;
      seen[key] = true;
      var label = clip(item.label, LABEL_MAX).trim();
      if (!label) return; // o servidor sempre manda o rótulo; botão sem texto não é exibido
      out.push({ type: item.type, target: item.target, label: label });
    });
    return out;
  }

  function sanitizeSuggestions(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (s) { return typeof s === 'string' && s.trim(); })
      .slice(0, MAX_SUGGESTIONS).map(function (s) { return clip(s, LABEL_MAX); });
  }

  /** Fontes citadas sob a resposta: só texto curto, no máximo 4. Nunca viram botão nem link. */
  function sanitizeSources(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (s) { return !!s && typeof s.source === 'string' && s.source.trim(); })
      .slice(0, MAX_SOURCES)
      .map(function (s) { return { source: clip(s.source, 80).trim(), section: clip(s.section, 120).trim() }; });
  }

  /** As últimas 5 perguntas DA PESSOA; as respostas da Lia nunca voltam ao servidor. */
  function pickHistory(messages) {
    return (messages || [])
      .filter(function (m) { return m && m.role === 'user' && typeof m.text === 'string' && m.text; })
      .slice(-HISTORY_TURNS)
      .map(function (m) { return { role: 'user', text: clip(m.text, MESSAGE_MAX) }; });
  }

  function shouldShow(flags) {
    return !!flags && flags.chatbot_enabled === true;
  }

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  var ui = null; // { app, doc, launcher, panel, log, input, send, messages, busy, enabled, open, lastToken, refreshId }

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function token() {
    var state = ui.app.getState && ui.app.getState();
    return (state && state.sessionToken) || '';
  }

  function currentPanel() {
    var section = ui.doc.querySelector('.app-main > section:not(.hidden)');
    return section && /^panel-[a-z-]{1,40}$/.test(section.id) ? section.id : '';
  }

  function scrollToEnd() {
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  // ---------------------------------------------------------------------------
  // Lia (personagem, window.Lia). A bolha fechada mostra só a cabeça (crop 'head');
  // o painel mostra o corpo inteiro e só existe com o painel aberto (desmontado ao fechar).
  // ---------------------------------------------------------------------------
  function liaApi() { return root.Lia && typeof root.Lia.mount === 'function' ? root.Lia : null; }

  function isAdmin() {
    var state = ui.app.getState && ui.app.getState();
    return !!(state && state.profile && state.profile.role === 'admin');
  }

  /** Monta a Lia em `parent` (tom laranja para admin). Sem window.Lia, devolve null e a UI segue sem ela. */
  function mountLia(parent, extra) {
    var api = liaApi();
    if (!api) return null;
    return api.mount(parent, Object.assign({ tone: isAdmin() ? 'admin' : undefined }, extra));
  }

  /** Desmonta a Lia: cancela as animações pendentes e tira o elemento do DOM. Devolve null para reatribuir. */
  function destroyLia(inst) {
    if (inst) {
      if (root.LiaAnim && typeof root.LiaAnim.destroy === 'function') root.LiaAnim.destroy(inst.element);
      inst.destroy();
    }
    return null;
  }

  function clearRestTimer() {
    if (ui.restTimer !== null) root.clearTimeout(ui.restTimer);
    ui.restTimer = null;
  }

  /** Aplica um método da Lia nas instâncias montadas (bolha e painel). Toda reação cancela o repouso pendente. */
  function reactLia(method) {
    clearRestTimer();
    var args = Array.prototype.slice.call(arguments, 1);
    [ui.launcherLia, ui.panelLia].forEach(function (inst) {
      if (inst) inst[method].apply(inst, args);
    });
  }

  /** Resposta chegou: a Lia fala e volta ao repouso, se nada mais acontecer antes. */
  function speakThenRest() {
    reactLia('say');
    ui.restTimer = root.setTimeout(function () { reactLia('setState', 'idle'); }, SPEAK_MS);
  }

  function failReply(text) {
    addMessage({ role: 'lia', text: text, error: true });
    reactLia('setState', 'confused');
  }

  function moduleOf(panelId) {
    return Object.prototype.hasOwnProperty.call(MODULE_BY_PANEL, panelId) ? MODULE_BY_PANEL[panelId] : '';
  }

  function ensureLauncherLia() {
    if (!ui.launcherLia) ui.launcherLia = mountLia(ui.launcherFigure, { crop: 'head' });
  }

  /** Painel aberto: corpo inteiro no cabeçalho, reage à tela atual e acena na primeira abertura da página. */
  function mountPanelLia() {
    if (ui.panelLia) return;
    ui.panelLia = mountLia(ui.headFigure, { size: PANEL_LIA_SIZE });
    if (!ui.panelLia) return;
    reactLia('react', moduleOf(currentPanel()));
    if (!ui.waved && root.LiaAnim && typeof root.LiaAnim.wave === 'function') {
      ui.waved = true;
      root.LiaAnim.wave(ui.panelLia.element);
    }
  }

  function runAction(action) {
    var app = ui.app;
    // O botão clicado some junto com o painel: o foco vai para o botão da Lia, que continua
    // na tela, para o crachá (ou o teclado) ter onde voltar depois.
    ui.launcher.focus({ preventScroll: true });
    closePanel(false);
    if (action.type === 'navigate') {
      app.showPanel(action.target);
    } else if (action.type === 'open_module') {
      app.showPanel('panel-learn');
      if (root.LaiftLearning && typeof root.LaiftLearning.openModule === 'function') root.LaiftLearning.openModule(action.target);
    } else if (action.type === 'open_credential') {
      if (root.LaiftCredential) root.LaiftCredential.open(app);
    }
  }

  function clearOldSuggestions() {
    Array.prototype.forEach.call(ui.log.querySelectorAll('.lia-suggestions'), function (node) { node.remove(); });
  }

  /** Lista de fontes sob a resposta (texto; nada clicável). */
  function renderSources(sources) {
    var doc = ui.doc;
    var box = el(doc, 'div', 'lia-sources');
    box.appendChild(el(doc, 'p', 'lia-sources-title', 'Fontes'));
    var list = el(doc, 'ul', 'lia-sources-list');
    list.setAttribute('aria-label', 'Fontes desta resposta');
    sources.forEach(function (s) {
      list.appendChild(el(doc, 'li', '', s.section ? s.source + ' · ' + s.section : s.source));
    });
    box.appendChild(list);
    return box;
  }

  // Micro-card de feedback: módulo opcional (assistant-feedback.js). Sem ele, a Lia funciona igual.
  function feedbackLib() { return root.LaiftAssistantFeedback || null; }

  function feedbackFlag(flags) {
    var lib = feedbackLib();
    return !!lib && lib.feedbackEnabled(flags);
  }

  function messageIdOf(value) {
    var lib = feedbackLib();
    return lib ? lib.sanitizeMessageId(value) : null;
  }

  function removeFeedbackCards() {
    Array.prototype.forEach.call(ui.log.querySelectorAll('.lia-feedback'), function (node) { node.remove(); });
  }

  /** Envia o feedback; se o servidor disser que a função está desligada, some com todos os cards. */
  function sendFeedback(payload) {
    return ui.app.callApi('apiAssistantFeedback', token(), payload).then(function (res) {
      if (res && res.disabled === true) {
        ui.feedbackOn = false;
        removeFeedbackCards();
      }
      // O card não expõe evento: o 👍 aceito chega aqui, pelo próprio envio.
      if (res && res.success === true && payload && payload.rating === 'up') reactLia('celebrate');
      return res;
    });
  }

  function appendFeedback(wrap, messageId) {
    var lib = feedbackLib();
    if (!lib || !ui.feedbackOn) return;
    var card = lib.mount(ui.doc, { messageId: messageId, enabled: true, send: sendFeedback });
    if (card) wrap.appendChild(card);
  }

  function renderMessage(msg) {
    var doc = ui.doc;
    var wrap = el(doc, 'div', 'lia-msg lia-msg-' + (msg.role === 'user' ? 'user' : 'lia') + (msg.error ? ' lia-msg-error' : ''));
    wrap.appendChild(el(doc, 'p', 'lia-bubble', msg.text));
    if (msg.degraded) wrap.appendChild(el(doc, 'p', 'lia-degraded', DEGRADED_TEXT));
    if (msg.sources && msg.sources.length) wrap.appendChild(renderSources(msg.sources));
    if (msg.actions && msg.actions.length) {
      var actions = el(doc, 'div', 'lia-actions');
      msg.actions.forEach(function (a) {
        var b = el(doc, 'button', 'lia-chip lia-chip-action', a.label);
        b.type = 'button';
        b.addEventListener('click', function () { runAction(a); });
        actions.appendChild(b);
      });
      wrap.appendChild(actions);
    }
    if (msg.suggestions && msg.suggestions.length) {
      var row = el(doc, 'div', 'lia-suggestions');
      msg.suggestions.forEach(function (s) {
        var b = el(doc, 'button', 'lia-chip', s);
        b.type = 'button';
        b.addEventListener('click', function () { send(s); });
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    if (msg.role === 'lia' && msg.messageId) appendFeedback(wrap, msg.messageId);
    return wrap;
  }

  function addMessage(msg) {
    if (msg.role === 'lia') clearOldSuggestions();
    ui.messages.push(msg);
    ui.log.appendChild(renderMessage(msg));
    scrollToEnd();
  }

  function setBusy(busy) {
    ui.busy = busy;
    ui.send.disabled = busy;
    ui.log.setAttribute('aria-busy', busy ? 'true' : 'false');
    var typing = ui.log.querySelector('.lia-typing');
    if (busy && !typing) {
      ui.log.appendChild(el(ui.doc, 'p', 'lia-typing', 'Lia está digitando…'));
      scrollToEnd();
    } else if (!busy && typing) {
      typing.remove();
    }
  }

  function send(text) {
    var message = clip(String(text || ''), MESSAGE_MAX).trim();
    if (!message || ui.busy || !ui.enabled) return;
    if (token() !== ui.lastToken) { refresh(); return; } // a conta mudou (ex.: sessão expirou): recomeça limpo
    var history = pickHistory(ui.messages);
    addMessage({ role: 'user', text: message });
    ui.input.value = '';
    ui.input.focus({ preventScroll: true }); // clicar numa sugestão remove o botão: o foco volta ao campo
    setBusy(true);
    reactLia('think');
    var sentWith = token();
    var mine = ++ui.sendId;
    ui.app.callApi('apiAssistantChat', sentWith, { message: message, context: { panel: currentPanel() }, history: history }).then(function (res) {
      if (mine !== ui.sendId) return; // a conta mudou no meio: a conversa foi zerada e esta resposta não vale
      if (res && res.disabled) { hideLauncher(); return; }
      if (!res || !res.success) {
        failReply((res && typeof res.message === 'string' && res.message) ? clip(res.message, 300) : ERROR_TEXT);
        return;
      }
      addMessage({
        role: 'lia',
        text: clip(res.reply, 2000) || ERROR_TEXT,
        actions: sanitizeActions(res.actions),
        suggestions: sanitizeSuggestions(res.suggestions),
        sources: sanitizeSources(res.sources),
        degraded: res.degraded === true,
        messageId: messageIdOf(res.messageId),
      });
      if (res.degraded === true) reactLia('setState', 'confused');
      else speakThenRest();
    }).catch(function () {
      if (mine === ui.sendId) failReply(ERROR_TEXT);
    }).then(function () { if (mine === ui.sendId) setBusy(false); });
  }

  function greet() {
    if (ui.messages.length) return;
    addMessage({ role: 'lia', text: GREETING, suggestions: GREETING_SUGGESTIONS });
  }

  function openPanel() {
    if (!ui.enabled) return;
    if (token() !== ui.lastToken) { refresh(); return; } // conta diferente da última conversa: zera antes de abrir
    ui.panel.classList.remove('hidden');
    ui.launcher.setAttribute('aria-expanded', 'true');
    ui.open = true;
    mountPanelLia();
    greet();
    ui.input.focus({ preventScroll: true });
  }

  function closePanel(returnFocus) {
    ui.panel.classList.add('hidden');
    ui.launcher.setAttribute('aria-expanded', 'false');
    ui.open = false;
    ui.panelLia = destroyLia(ui.panelLia);
    if (returnFocus !== false) ui.launcher.focus({ preventScroll: true });
  }

  function hideLauncher() {
    ui.enabled = false;
    closePanel(false);
    ui.launcher.classList.add('hidden');
    ui.launcherLia = destroyLia(ui.launcherLia);
  }

  function resetConversation() {
    ui.sendId += 1; // invalida qualquer resposta ainda a caminho
    clearRestTimer();
    ui.messages = [];
    while (ui.log.firstChild) ui.log.removeChild(ui.log.firstChild);
    setBusy(false);
  }

  function build(app, doc) {
    var launcher = el(doc, 'button', 'lia-launcher hidden');
    launcher.type = 'button';
    launcher.id = 'lia-launcher';
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.setAttribute('aria-controls', 'lia-panel');
    launcher.setAttribute('aria-label', 'Abrir a Lia');
    var launcherFigure = el(doc, 'span', 'lia-launcher-figure');
    launcherFigure.setAttribute('aria-hidden', 'true'); // o botão já tem nome; a figura é só desenho
    launcher.appendChild(launcherFigure);
    launcher.appendChild(el(doc, 'span', 'lia-launcher-label', 'Lia'));

    var panel = el(doc, 'section', 'lia-panel hidden');
    panel.id = 'lia-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Lia, guia da plataforma');

    var head = el(doc, 'header', 'lia-head');
    var headFigure = el(doc, 'span', 'lia-head-figure');
    head.appendChild(headFigure);
    var title = el(doc, 'div', 'lia-title');
    title.appendChild(el(doc, 'strong', '', 'Lia'));
    title.appendChild(el(doc, 'span', 'lia-sub', 'Guia da plataforma LAIFT'));
    head.appendChild(title);
    var closeBtn = el(doc, 'button', 'lia-close', '×');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Fechar a Lia');
    head.appendChild(closeBtn);

    var log = el(doc, 'div', 'lia-log');
    log.id = 'lia-log';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');

    var form = el(doc, 'form', 'lia-form');
    var label = el(doc, 'label', 'visually-hidden', 'Pergunte à Lia');
    label.setAttribute('for', 'lia-input');
    var input = el(doc, 'input');
    input.id = 'lia-input';
    input.type = 'text';
    input.maxLength = MESSAGE_MAX;
    input.autocomplete = 'off';
    input.placeholder = 'Pergunte sobre a plataforma';
    var sendBtn = el(doc, 'button', 'lia-send', 'Enviar');
    sendBtn.type = 'submit';
    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(sendBtn);

    var note = el(doc, 'p', 'lia-note', 'A Lia orienta e leva às telas; ela não altera seus dados.');

    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(form);
    panel.appendChild(note);
    doc.body.appendChild(launcher);
    doc.body.appendChild(panel);

    ui = {
      app: app, doc: doc, launcher: launcher, panel: panel, log: log, input: input, send: sendBtn, messages: [], busy: false, enabled: false, feedbackOn: false, open: false, lastToken: null, refreshId: 0, sendId: 0,
      launcherFigure: launcherFigure, headFigure: headFigure, launcherLia: null, panelLia: null, waved: false, restTimer: null,
    };

    launcher.addEventListener('click', function () { if (ui.open) closePanel(); else openPanel(); });
    closeBtn.addEventListener('click', function () { closePanel(); });
    panel.addEventListener('keydown', function (evt) { if (evt.key === 'Escape') { evt.stopPropagation(); closePanel(); } });
    form.addEventListener('submit', function (evt) { evt.preventDefault(); send(input.value); });
  }

  /** Relê a flag e zera a conversa se a conta mudou (login, logout, sessão expirada). */
  function refresh() {
    if (!ui) return Promise.resolve();
    var current = token();
    if (current !== ui.lastToken) {
      ui.lastToken = current;
      resetConversation();
      closePanel(false);
      ui.launcherLia = destroyLia(ui.launcherLia); // a Lia da conta anterior não fica montada (tom e listeners)
    }
    var id = ++ui.refreshId;
    var inApp = ui.doc.getElementById('app-root');
    ui.launcher.classList.toggle('lia-in-app', !!inApp && !inApp.classList.contains('hidden'));
    return ui.app.callApi('apiGetFeatureFlags', current).then(function (res) {
      if (id !== ui.refreshId) return;
      var on = !!res && res.success === true && shouldShow(res.flags);
      ui.enabled = on;
      ui.feedbackOn = on && feedbackFlag(res.flags);
      ui.launcher.classList.toggle('hidden', !on);
      if (!on) {
        closePanel(false);
        ui.launcherLia = destroyLia(ui.launcherLia);
      } else {
        ensureLauncherLia();
      }
    }, function () { /* sem rede: mantém o estado atual */ });
  }

  function start() {
    if (ui || !root.App || !root.document || !root.document.body) return;
    build(root.App, root.document);
    refresh();
  }

  var api = {
    ACTION_KEYS: ACTION_KEYS,
    clip: clip,
    isAllowedAction: isAllowedAction,
    sanitizeActions: sanitizeActions,
    sanitizeSuggestions: sanitizeSuggestions,
    sanitizeSources: sanitizeSources,
    pickHistory: pickHistory,
    shouldShow: shouldShow,
    refresh: refresh,
    open: function () { if (ui) openPanel(); },
    close: function () { if (ui) closePanel(); },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftAssistant = api;
    if (root.document.readyState === 'complete') start();
    else root.document.addEventListener('DOMContentLoaded', start);
  }
})(typeof window !== 'undefined' ? window : globalThis);
