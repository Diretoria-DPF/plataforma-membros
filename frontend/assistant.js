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
  // Moderação (ADR 0004). Os limites espelham worker/src/constants.js (MODERATION); o teste confere.
  var REDEEM_MIN = 40;
  var REDEEM_MAX = 600;
  var SUSPEND_LEVEL = 3;
  var WARNING_MAX = 3;
  var TICK_MS = 1000;
  var MAX_TIMEOUT_MS = 2147483647; // limite do setTimeout (~24,8 dias)
  var REDEEM_ERROR_TEXT = 'Não consegui registrar seu pedido agora. Tente de novo em instantes.';
  var NETWORK_TEXT = 'Não foi possível enviar agora. Confira a conexão e tente de novo.';
  var BACK_TEXT = 'O chat voltou ao normal. Pode perguntar à vontade.';

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
  // Moderação (funções puras): horário em pt-BR no fuso de Brasília, contagem,
  // validação da redenção e leitura dos payloads do servidor.
  // ---------------------------------------------------------------------------
  var BRASILIA_TIME = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function nonNegative(value) {
    var n = Math.ceil(Number(value));
    return n > 0 ? n : 0;
  }

  /** Instante em ms a partir de texto ISO; null se não for uma data. */
  function timeOf(iso) {
    var ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
    return isNaN(ms) ? null : ms;
  }

  /** Horário de retorno, ex.: "08/10 às 14:30" (Brasília). Aceita epoch em ms ou texto ISO; vazio se inválido. */
  function formatReturnTime(value) {
    var date = typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
    if (!date || isNaN(date.getTime())) return '';
    var parts = {};
    BRASILIA_TIME.formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts.day + '/' + parts.month + ' às ' + parts.hour + ':' + parts.minute;
  }

  /** Contagem em texto: "1 h 00 min", "59 min 59 s" ou "42 s". Abaixo de zero vale 0. */
  function formatCountdown(seconds) {
    var total = nonNegative(seconds);
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) return h + ' h ' + pad2(m) + ' min';
    if (m > 0) return m + ' min ' + pad2(s) + ' s';
    return s + ' s';
  }

  /** Segundos que faltam até `deadline` (ms), arredondados para cima; nunca negativo. */
  function secondsLeft(deadline, now) {
    return nonNegative((Number(deadline) - Number(now)) / 1000);
  }

  function warningLabel(level) { return 'Aviso ' + level + ' de ' + WARNING_MAX; }

  /** Texto da suspensão com o horário de retorno, no mesmo tom do servidor. */
  function suspensionText(until) {
    var when = formatReturnTime(until);
    return 'O chat com a Lia está suspenso' + (when ? ' até ' + when + ' (horário de Brasília)' : '')
      + '. Você pode pedir redenção, explicando com sinceridade o que houve.';
  }

  function chars(n) { return n === 1 ? '1 caractere' : n + ' caracteres'; }

  function redemptionHint(length) {
    if (length < REDEEM_MIN) return 'Escreva mais ' + chars(REDEEM_MIN - length) + ' (mínimo ' + REDEEM_MIN + ').';
    if (length > REDEEM_MAX) return 'Remova ' + chars(length - REDEEM_MAX) + ' (máximo ' + REDEEM_MAX + ').';
    return 'Pronto para enviar.';
  }

  /** Explicação da redenção: 40 a 600 caracteres sem as pontas, como o servidor conta. */
  function validateRedemption(raw) {
    var value = typeof raw === 'string' ? raw.trim() : '';
    var length = value.length;
    return {
      ok: length >= REDEEM_MIN && length <= REDEEM_MAX,
      value: value,
      counter: length + '/' + REDEEM_MAX,
      hint: redemptionHint(length),
    };
  }

  function messageOf(res, fallback) {
    var text = res && typeof res.message === 'string' ? res.message.trim() : '';
    return text ? clip(text, 300) : fallback;
  }

  /** Estado da moderação numa resposta do chat: suspensa (com fim), aviso 1 ou 2, ou nada. */
  function moderationFromChat(res) {
    var mod = res && res.moderation;
    if (!mod || typeof mod !== 'object') return { mode: 'none' };
    if (mod.suspended === true || mod.level >= SUSPEND_LEVEL) return { mode: 'suspended', until: timeOf(mod.until) };
    if (mod.level === 1 || mod.level === 2) return { mode: 'warning', level: mod.level };
    return { mode: 'none' };
  }

  /** Estado restaurado ao abrir o painel. Falha ou conta sem moderação não muda nada (falha aberta). */
  function moderationFromState(res) {
    if (!res || res.success !== true || res.moderated !== true || res.suspended !== true) return { mode: 'none' };
    return { mode: 'suspended', until: timeOf(res.until), retryAfterSeconds: nonNegative(res.retryAfterSeconds) };
  }

  /** Resultado de apiAssistantRedeem: accepted, retry (com espera), disabled, network ou error. */
  function redeemOutcome(res) {
    var message = messageOf(res, REDEEM_ERROR_TEXT);
    if (!res) return { kind: 'error', message: message };
    if (res.networkUnavailable === true) return { kind: 'network', message: NETWORK_TEXT };
    if (res.disabled === true) return { kind: 'disabled', message: message };
    if (res.success === true && res.accepted === true) return { kind: 'accepted', message: message };
    var wait = nonNegative(res.retryAfterSeconds);
    if (wait > 0 && (res.success === false || res.accepted === false)) {
      return { kind: 'retry', message: message, retryAfterSeconds: wait };
    }
    return { kind: 'error', message: message };
  }

  /** Próxima hora de olhar o relógio: 1 s durante a contagem, o fim da suspensão, ou nunca (null). */
  function nextTickDelay(mod, now) {
    var delays = [];
    if (mod.retryAt !== null && mod.retryAt > now) delays.push(Math.min(TICK_MS, mod.retryAt - now));
    if (mod.suspended && mod.until !== null && mod.until > now) delays.push(mod.until - now);
    return delays.length ? Math.min(MAX_TIMEOUT_MS, Math.min.apply(null, delays)) : null;
  }

  function freshMod() { return { suspended: false, until: null, retryAt: null }; }

  /** Suspensão cujo horário passou com o painel fechado: ao abrir, vale como liberada. */
  function lapsedSuspension(mod, now) {
    return mod.suspended && mod.until !== null && mod.until <= now ? Object.assign({}, mod, { suspended: false, until: null }) : mod;
  }

  function isModeratedRole() {
    var state = ui.app.getState && ui.app.getState();
    var role = state && state.profile && state.profile.role;
    return role === 'member' || role === 'admin'; // mesmos papéis que a Worker modera
  }

  // ---------------------------------------------------------------------------
  // Interface
  // ---------------------------------------------------------------------------
  var ui = null; // { app, doc, launcher, panel, log, input, send, messages, busy, enabled, open, lastToken, refreshId, mod, modToken, timer, redeem, ... }

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

  /** Repouso da Lia: suspensa enquanto o chat estiver suspenso; senão, reage à tela atual. */
  function restLiaState() {
    if (ui.mod.suspended) reactLia('suspend');
    else reactLia('react', moduleOf(currentPanel()));
  }

  /** Painel aberto: corpo inteiro no cabeçalho, reage à tela atual e acena na primeira abertura da página. */
  function mountPanelLia() {
    if (ui.panelLia) return;
    ui.panelLia = mountLia(ui.headFigure, { size: PANEL_LIA_SIZE });
    if (!ui.panelLia) return;
    restLiaState();
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
      if (res && res.success === true && payload && payload.rating === 'up' && !ui.mod.suspended) reactLia('celebrate');
      return res;
    });
  }

  function appendFeedback(wrap, messageId) {
    var lib = feedbackLib();
    if (!lib || !ui.feedbackOn) return;
    var card = lib.mount(ui.doc, { messageId: messageId, enabled: true, send: sendFeedback });
    if (card) wrap.appendChild(card);
  }

  /** Faixa de aviso (nível 1 ou 2): ícone + texto "Aviso N de 3", com role="status". Nunca só cor. */
  function warningBand(doc, level) {
    var band = el(doc, 'p', 'lia-warning lia-warning-' + level);
    band.setAttribute('role', 'status');
    var icon = el(doc, 'span', 'lia-warning-icon', '!');
    icon.setAttribute('aria-hidden', 'true');
    band.appendChild(icon);
    band.appendChild(el(doc, 'span', '', warningLabel(level)));
    return band;
  }

  function renderMessage(msg) {
    var doc = ui.doc;
    var wrap = el(doc, 'div', 'lia-msg lia-msg-' + (msg.role === 'user' ? 'user' : 'lia') + (msg.error ? ' lia-msg-error' : ''));
    if (msg.warningLevel) wrap.appendChild(warningBand(doc, msg.warningLevel));
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

  /** Campo e envio: presos enquanto a Lia responde (envio) ou quando o chat está suspenso (os dois). */
  function syncInputs() {
    var suspended = ui.mod.suspended;
    ui.input.disabled = suspended;
    ui.input.placeholder = suspended ? 'Chat suspenso: peça redenção abaixo' : 'Pergunte sobre a plataforma';
    ui.send.disabled = ui.busy || suspended;
  }

  function setBusy(busy) {
    ui.busy = busy;
    syncInputs();
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
    if (!message || ui.busy || !ui.enabled || ui.mod.suspended) return;
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
      var mod = moderationFromChat(res);
      addMessage({
        role: 'lia',
        text: clip(res.reply, 2000) || ERROR_TEXT,
        actions: sanitizeActions(res.actions),
        suggestions: sanitizeSuggestions(res.suggestions),
        sources: sanitizeSources(res.sources),
        degraded: res.degraded === true,
        messageId: messageIdOf(res.messageId),
        warningLevel: mod.mode === 'warning' ? mod.level : 0,
      });
      if (mod.mode === 'suspended') {
        setSuspended(mod.until, 0);
      } else if (mod.mode === 'warning') {
        reactLia('setState', mod.level === 2 ? 'warning' : 'alert');
      } else if (res.degraded === true) {
        reactLia('setState', 'confused');
      } else {
        speakThenRest();
      }
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
    ui.mod = lapsedSuspension(ui.mod, Date.now());
    mountPanelLia();
    renderModeration();
    checkModerationOnce();
    greet();
    (ui.mod.suspended ? ui.redeem.open : ui.input).focus({ preventScroll: true });
  }

  function closePanel(returnFocus) {
    ui.panel.classList.add('hidden');
    ui.launcher.setAttribute('aria-expanded', 'false');
    ui.open = false;
    ui.panelLia = destroyLia(ui.panelLia);
    clearTick(); // o relógio da moderação só roda com o painel aberto
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
    clearModeration();
  }

  // Moderação na tela. Um único timer, só com o painel aberto (limpo ao fechar e ao sair da conta). Sem polling.
  function clearTick() {
    if (ui.timer !== null) root.clearTimeout(ui.timer);
    ui.timer = null;
  }

  function scheduleTick() {
    clearTick();
    var delay = ui.open ? nextTickDelay(ui.mod, Date.now()) : null;
    if (delay !== null) ui.timer = root.setTimeout(tick, delay);
  }

  function tick() {
    var now = Date.now();
    ui.timer = null;
    if (ui.mod.retryAt !== null && ui.mod.retryAt <= now) ui.mod = Object.assign({}, ui.mod, { retryAt: null });
    if (ui.mod.suspended && ui.mod.until !== null && ui.mod.until <= now) return liftSuspension();
    renderRedeem();
    scheduleTick();
  }

  /** Contagem, contador, dica e Enviar: o que muda com o tempo e com a digitação. */
  function renderRedeem() {
    var r = ui.redeem;
    var waiting = ui.mod.retryAt !== null;
    var v = validateRedemption(r.area.value);
    r.timer.textContent = waiting ? 'Você poderá tentar de novo em ' + formatCountdown(secondsLeft(ui.mod.retryAt, Date.now())) + '.' : '';
    r.count.textContent = v.counter;
    r.hint.textContent = v.hint;
    r.send.disabled = !v.ok || waiting || ui.redeemBusy;
  }

  /** Pinta a suspensão a partir de ui.mod (ao abrir o painel, ao suspender e ao liberar). */
  function renderModeration() {
    var r = ui.redeem;
    r.root.classList.toggle('hidden', !ui.mod.suspended);
    r.returnText.textContent = ui.mod.suspended ? suspensionText(ui.mod.until) : '';
    r.form.classList.toggle('hidden', !ui.redeemOpen);
    r.open.classList.toggle('hidden', ui.redeemOpen);
    syncInputs();
    renderRedeem();
    scheduleTick();
  }

  function setRedeemStatus(text) { ui.redeem.status.textContent = text || ''; }

  function openRedeemForm(isOpen) {
    ui.redeemOpen = isOpen;
    renderModeration();
    if (isOpen) ui.redeem.area.focus({ preventScroll: true });
  }

  /** Suspensão vinda do chat ou do estado restaurado. Com o painel fechado, só guarda; ao abrir, pinta. */
  function setSuspended(until, retryAfterSeconds) {
    ui.mod = { suspended: true, until: until, retryAt: retryAfterSeconds > 0 ? Date.now() + retryAfterSeconds * 1000 : null };
    if (!ui.open) return;
    // Campo desabilitado com o foco nele (ou fora do painel) perde o foco: o foco vai para "Pedir redenção".
    var focusLost = ui.doc.activeElement === ui.input || !ui.panel.contains(ui.doc.activeElement);
    renderModeration();
    restLiaState();
    if (focusLost) ui.redeem.open.focus({ preventScroll: true });
  }

  /** Fim da suspensão (relógio, redenção aceita ou moderação desligada): o chat volta ao normal. */
  function liftSuspension() {
    ui.mod = freshMod();
    ui.redeemOpen = false;
    setRedeemStatus('');
    renderModeration();
    restLiaState();
    addMessage({ role: 'lia', text: BACK_TEXT });
  }

  function acceptRedeem() {
    ui.redeem.area.value = '';
    liftSuspension();
    reactLia('redeem');
    ui.input.focus({ preventScroll: true }); // o botão de redenção some: o foco vai para a pergunta
  }

  function applyRedeemOutcome(out) {
    ui.redeemBusy = false;
    if (out.kind === 'accepted') return acceptRedeem();
    if (out.kind === 'disabled') return liftSuspension();
    setRedeemStatus(out.message);
    if (out.kind === 'retry' && out.retryAfterSeconds > 0) {
      ui.mod = Object.assign({}, ui.mod, { retryAt: Date.now() + out.retryAfterSeconds * 1000 });
      ui.redeem.area.focus({ preventScroll: true });
      scheduleTick();
    }
    renderRedeem();
  }

  /** Envia a redenção. Resposta que chega depois de trocar de conta não vale. */
  function submitRedeem() {
    var v = validateRedemption(ui.redeem.area.value);
    if (!v.ok || ui.redeemBusy || ui.mod.retryAt !== null) return;
    var sentWith = token();
    ui.redeemBusy = true;
    setRedeemStatus('Enviando…');
    renderRedeem();
    ui.app.callApi('apiAssistantRedeem', sentWith, { message: v.value }).then(function (res) {
      if (sentWith === token()) applyRedeemOutcome(redeemOutcome(res));
    });
  }

  /** Abrir o painel consulta a suspensão UMA vez por conta e por página. Falha = o chat segue (falha aberta). */
  function checkModerationOnce() {
    var sentWith = token();
    if (!sentWith || ui.modToken === sentWith || !isModeratedRole()) return;
    ui.modToken = sentWith;
    ui.app.callApi('apiAssistantModerationState', sentWith).then(function (res) {
      if (sentWith !== token() || ui.modToken !== sentWith || ui.mod.suspended) return;
      var st = moderationFromState(res);
      if (st.mode === 'suspended') setSuspended(st.until, st.retryAfterSeconds);
    });
  }

  /** Saiu ou trocou de conta: zera suspensão, pedido em curso e relógio. */
  function clearModeration() {
    clearTick();
    ui.mod = freshMod();
    ui.modToken = null;
    ui.redeemBusy = false;
    ui.redeemOpen = false;
    ui.redeem.area.value = '';
    setRedeemStatus('');
    renderModeration();
  }

  /** Bloco de suspensão e redenção, entre a conversa e o campo. Nasce escondido; tudo por textContent. */
  function buildRedeem(doc) {
    var section = el(doc, 'section', 'lia-redeem hidden');
    section.id = 'lia-redeem';
    section.setAttribute('aria-label', 'Chat suspenso: pedido de redenção');
    var status = el(doc, 'p', 'lia-redeem-status');
    status.setAttribute('role', 'status');
    var returnText = el(doc, 'p', 'lia-redeem-return');
    var open = el(doc, 'button', 'lia-redeem-open', 'Pedir redenção');
    open.type = 'button';
    var form = el(doc, 'form', 'lia-redeem-form hidden');
    var label = el(doc, 'label', 'lia-redeem-label', 'Conte o que houve e como vai agir daqui em diante');
    label.htmlFor = 'lia-redeem-text';
    var area = el(doc, 'textarea', 'lia-redeem-text');
    area.id = 'lia-redeem-text';
    area.rows = 4;
    area.maxLength = REDEEM_MAX;
    area.setAttribute('aria-describedby', 'lia-redeem-count lia-redeem-hint');
    var count = el(doc, 'p', 'lia-redeem-count');
    count.id = 'lia-redeem-count';
    var hint = el(doc, 'p', 'lia-redeem-hint');
    hint.id = 'lia-redeem-hint';
    var timer = el(doc, 'p', 'lia-redeem-timer'); // sem role: a contagem não é anunciada a cada segundo
    var send = el(doc, 'button', 'lia-redeem-send', 'Enviar');
    send.type = 'submit';
    var cancel = el(doc, 'button', 'lia-redeem-cancel secondary', 'Voltar');
    cancel.type = 'button';
    var actions = el(doc, 'div', 'lia-redeem-actions');
    actions.appendChild(send);
    actions.appendChild(cancel);
    var note = el(doc, 'p', 'lia-redeem-note', 'A Lia confere o que você escrever. Se não for suficiente, você poderá tentar de novo em 1 hora.');
    [note, label, area, count, hint, timer, actions].forEach(function (node) { form.appendChild(node); });
    [status, returnText, open, form].forEach(function (node) { section.appendChild(node); });
    return { root: section, status: status, returnText: returnText, open: open, form: form, area: area, count: count, hint: hint, timer: timer, send: send, cancel: cancel };
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

    var redeem = buildRedeem(doc);
    panel.appendChild(head);
    panel.appendChild(log);
    panel.appendChild(redeem.root);
    panel.appendChild(form);
    panel.appendChild(note);
    doc.body.appendChild(launcher);
    doc.body.appendChild(panel);

    ui = {
      app: app, doc: doc, launcher: launcher, panel: panel, log: log, input: input, send: sendBtn, messages: [], busy: false, enabled: false, feedbackOn: false, open: false, lastToken: null, refreshId: 0, sendId: 0,
      launcherFigure: launcherFigure, headFigure: headFigure, launcherLia: null, panelLia: null, waved: false, restTimer: null,
      mod: freshMod(), modToken: null, timer: null, redeemBusy: false, redeemOpen: false, redeem: redeem,
    };

    launcher.addEventListener('click', function () { if (ui.open) closePanel(); else openPanel(); });
    closeBtn.addEventListener('click', function () { closePanel(); });
    panel.addEventListener('keydown', function (evt) { if (evt.key === 'Escape') { evt.stopPropagation(); closePanel(); } });
    form.addEventListener('submit', function (evt) { evt.preventDefault(); send(input.value); });
    redeem.open.addEventListener('click', function () { openRedeemForm(true); });
    redeem.cancel.addEventListener('click', function () { openRedeemForm(false); redeem.open.focus({ preventScroll: true }); });
    redeem.area.addEventListener('input', function () { renderRedeem(); });
    redeem.form.addEventListener('submit', function (evt) { evt.preventDefault(); submitRedeem(); });
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
    REDEEM_MIN: REDEEM_MIN,
    REDEEM_MAX: REDEEM_MAX,
    SUSPEND_LEVEL: SUSPEND_LEVEL,
    formatReturnTime: formatReturnTime,
    formatCountdown: formatCountdown,
    secondsLeft: secondsLeft,
    warningLabel: warningLabel,
    suspensionText: suspensionText,
    validateRedemption: validateRedemption,
    moderationFromChat: moderationFromChat,
    moderationFromState: moderationFromState,
    redeemOutcome: redeemOutcome,
    nextTickDelay: nextTickDelay,
    lapsedSuspension: lapsedSuspension,
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
