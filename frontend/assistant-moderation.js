/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Moderação da Lia (ADR 0004) na tela: faixa de aviso (nível 1 e 2), suspensão com
// contagem até o retorno, formulário de redenção e consulta ao abrir o painel.
// Quem usa é assistant.js (a cola do chat). O chat injeta por `ctx` o que precisa
// (documento, API, sessão, campo e painel, e os efeitos do chat), então este arquivo
// não conhece o DOM do chat. Nada vai para o armazenamento do navegador; texto
// sempre por textContent. A lógica (formatar, validar, ler respostas) é pura e fica
// exportada para os testes. Expõe window.AssistantModeration (ou module.exports, no Node).
(function (root) {
  'use strict';

  // Limites espelham worker/src/constants.js (MODERATION); o teste confere.
  var REDEEM_MIN = 40;
  var REDEEM_MAX = 600;
  var SUSPEND_LEVEL = 3;
  var WARNING_MAX = 3;
  var TICK_MS = 1000;
  var MAX_TIMEOUT_MS = 2147483647; // limite do setTimeout (~24,8 dias)
  var SERVER_TEXT_MAX = 300;
  var REDEEM_ERROR_TEXT = 'Não consegui registrar seu pedido agora. Tente de novo em instantes.';
  var NETWORK_TEXT = 'Não foi possível enviar agora. Confira a conexão e tente de novo.';
  var BACK_TEXT = 'O chat voltou ao normal. Pode perguntar à vontade.';

  // ---------------------------------------------------------------------------
  // Funções puras: horário de Brasília, contagem, validação da redenção e leitura
  // das respostas do servidor.
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
    return text ? text.slice(0, SERVER_TEXT_MAX) : fallback;
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

  /** Papéis que a Worker modera (member e admin). */
  function isModeratedRole(role) { return role === 'member' || role === 'admin'; }

  // ---------------------------------------------------------------------------
  // Interface (createElement + textContent; texto nunca vira HTML)
  // ---------------------------------------------------------------------------
  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
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

  // ---------------------------------------------------------------------------
  // Estado na tela. Um relógio só, e só com o painel aberto (sem polling).
  // `m` é a moderação de um chat: { ctx, mod, modToken, timer, redeemBusy, redeemOpen, redeem }.
  // ---------------------------------------------------------------------------
  function clearTick(m) {
    if (m.timer !== null) root.clearTimeout(m.timer);
    m.timer = null;
  }

  function scheduleTick(m) {
    clearTick(m);
    var delay = m.ctx.isOpen() ? nextTickDelay(m.mod, Date.now()) : null;
    if (delay !== null) m.timer = root.setTimeout(function () { tick(m); }, delay);
  }

  function tick(m) {
    var now = Date.now();
    m.timer = null;
    if (m.mod.retryAt !== null && m.mod.retryAt <= now) m.mod = Object.assign({}, m.mod, { retryAt: null });
    if (m.mod.suspended && m.mod.until !== null && m.mod.until <= now) return liftSuspension(m);
    renderRedeem(m);
    scheduleTick(m);
  }

  /** Contagem, contador, dica e Enviar: o que muda com o tempo e com a digitação. */
  function renderRedeem(m) {
    var r = m.redeem;
    var waiting = m.mod.retryAt !== null;
    var v = validateRedemption(r.area.value);
    r.timer.textContent = waiting ? 'Você poderá tentar de novo em ' + formatCountdown(secondsLeft(m.mod.retryAt, Date.now())) + '.' : '';
    r.count.textContent = v.counter;
    r.hint.textContent = v.hint;
    r.send.disabled = !v.ok || waiting || m.redeemBusy;
  }

  /** Pinta a suspensão a partir de m.mod (ao abrir o painel, ao suspender e ao liberar). */
  function renderModeration(m) {
    var r = m.redeem;
    r.root.classList.toggle('hidden', !m.mod.suspended);
    r.returnText.textContent = m.mod.suspended ? suspensionText(m.mod.until) : '';
    r.form.classList.toggle('hidden', !m.redeemOpen);
    r.open.classList.toggle('hidden', m.redeemOpen);
    m.ctx.sync();
    renderRedeem(m);
    scheduleTick(m);
  }

  function setRedeemStatus(m, text) { m.redeem.status.textContent = text || ''; }

  function openRedeemForm(m, isOpen) {
    m.redeemOpen = isOpen;
    renderModeration(m);
    if (isOpen) m.redeem.area.focus({ preventScroll: true });
  }

  /** Suspensão vinda do chat ou do estado restaurado. Com o painel fechado, só guarda; ao abrir, pinta. */
  function setSuspended(m, until, retryAfterSeconds) {
    m.mod = { suspended: true, until: until, retryAt: retryAfterSeconds > 0 ? Date.now() + retryAfterSeconds * 1000 : null };
    if (!m.ctx.isOpen()) return;
    // Campo desabilitado com o foco nele (ou fora do painel) perde o foco: o foco vai para "Pedir redenção".
    var active = m.ctx.doc.activeElement;
    var focusLost = active === m.ctx.input || !m.ctx.panel.contains(active);
    renderModeration(m);
    m.ctx.restLia();
    if (focusLost) m.redeem.open.focus({ preventScroll: true });
  }

  /** Fim da suspensão (relógio, redenção aceita ou moderação desligada): o chat volta ao normal. */
  function liftSuspension(m) {
    m.mod = freshMod();
    m.redeemOpen = false;
    setRedeemStatus(m, '');
    renderModeration(m);
    m.ctx.restLia();
    m.ctx.note(BACK_TEXT);
  }

  function acceptRedeem(m) {
    m.redeem.area.value = '';
    liftSuspension(m);
    m.ctx.lia('redeem');
    m.ctx.input.focus({ preventScroll: true }); // o botão de redenção some: o foco vai para a pergunta
  }

  function applyRedeemOutcome(m, out) {
    m.redeemBusy = false;
    if (out.kind === 'accepted') return acceptRedeem(m);
    if (out.kind === 'disabled') return liftSuspension(m);
    setRedeemStatus(m, out.message);
    if (out.kind === 'retry' && out.retryAfterSeconds > 0) {
      m.mod = Object.assign({}, m.mod, { retryAt: Date.now() + out.retryAfterSeconds * 1000 });
      m.redeem.area.focus({ preventScroll: true });
      scheduleTick(m);
    }
    renderRedeem(m);
  }

  /** Envia a redenção. Resposta que chega depois de trocar de conta não vale. */
  function submitRedeem(m) {
    var v = validateRedemption(m.redeem.area.value);
    if (!v.ok || m.redeemBusy || m.mod.retryAt !== null) return;
    var sentWith = m.ctx.token();
    m.redeemBusy = true;
    setRedeemStatus(m, 'Enviando…');
    renderRedeem(m);
    m.ctx.app.callApi('apiAssistantRedeem', sentWith, { message: v.value }).then(function (res) {
      if (sentWith === m.ctx.token()) applyRedeemOutcome(m, redeemOutcome(res));
    });
  }

  /** Papel da conta atual, lido do estado do app. */
  function currentRole(m) {
    var app = m.ctx.app;
    var state = app.getState && app.getState();
    return state && state.profile && state.profile.role;
  }

  /** Abrir o painel consulta a suspensão UMA vez por conta e por página. Falha = o chat segue (falha aberta). */
  function checkModerationOnce(m) {
    var sentWith = m.ctx.token();
    if (!sentWith || m.modToken === sentWith || !isModeratedRole(currentRole(m))) return;
    m.modToken = sentWith;
    m.ctx.app.callApi('apiAssistantModerationState', sentWith).then(function (res) {
      if (sentWith !== m.ctx.token() || m.modToken !== sentWith || m.mod.suspended) return;
      var st = moderationFromState(res);
      if (st.mode === 'suspended') setSuspended(m, st.until, st.retryAfterSeconds);
    });
  }

  /** Saiu ou trocou de conta: zera suspensão, pedido em curso e relógio. */
  function clearModeration(m) {
    clearTick(m);
    m.mod = freshMod();
    m.modToken = null;
    m.redeemBusy = false;
    m.redeemOpen = false;
    m.redeem.area.value = '';
    setRedeemStatus(m, '');
    renderModeration(m);
  }

  function wireRedeem(m) {
    var r = m.redeem;
    r.open.addEventListener('click', function () { openRedeemForm(m, true); });
    r.cancel.addEventListener('click', function () { openRedeemForm(m, false); r.open.focus({ preventScroll: true }); });
    r.area.addEventListener('input', function () { renderRedeem(m); });
    r.form.addEventListener('submit', function (evt) { evt.preventDefault(); submitRedeem(m); });
  }

  /**
   * Moderação de um chat. ctx: { doc, app ({ callApi(nome, ...args), getState() }), input, panel,
   * token() → sessão atual, isOpen() → painel aberto?, sync() → recalcula os campos do chat,
   * restLia() → repouso da Lia, lia(método) → reação da Lia, note(texto) → fala da Lia no log }.
   * Devolve o bloco de redenção (root) para o chat montar e os métodos de estado.
   */
  function createModeration(ctx) {
    var m = {
      ctx: ctx, mod: freshMod(), modToken: null, timer: null, redeemBusy: false, redeemOpen: false,
      redeem: buildRedeem(ctx.doc),
    };
    wireRedeem(m);
    return {
      root: m.redeem.root,
      openButton: m.redeem.open,
      isSuspended: function () { return m.mod.suspended; },
      lapse: function () { m.mod = lapsedSuspension(m.mod, Date.now()); },
      render: function () { renderModeration(m); },
      checkOnOpen: function () { checkModerationOnce(m); },
      suspend: function (until, retryAfterSeconds) { setSuspended(m, until, retryAfterSeconds); },
      stop: function () { clearTick(m); },
      reset: function () { clearModeration(m); },
    };
  }

  var api = {
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
    isModeratedRole: isModeratedRole,
    warningBand: warningBand,
    createModeration: createModeration,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AssistantModeration = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
