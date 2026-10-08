/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Micro-card "Isso te ajudou?" da Lia, embaixo de cada resposta com messageId.
// Envia ao servidor (apiAssistantFeedback) só o id da resposta, o polegar e, se a
// pessoa quiser, categoria e comentário (até 500 caracteres). Não guarda nada no
// navegador e não mostra dados de outras pessoas. Texto sempre por textContent.
// A lógica (validar, montar payload, estados) é pura e fica exportada para os testes.
// Expõe window.LaiftAssistantFeedback (ou module.exports, no Node).
(function (root) {
  'use strict';

  // Mesmas categorias de worker/src/constants.js (FEEDBACK.CATEGORIES), em ordem.
  var CATEGORIES = [
    { id: 'incorreta', label: 'Está incorreta' },
    { id: 'incompleta', label: 'Está incompleta' },
    { id: 'confusa', label: 'Está confusa' },
    { id: 'ofensiva', label: 'É ofensiva' },
    { id: 'outra', label: 'Outro motivo' },
  ];
  var CATEGORY_IDS = CATEGORIES.map(function (c) { return c.id; });
  var RATINGS = ['up', 'down'];
  var COMMENT_MAX = 500;
  var THANKS_MS = 2500;
  var DEFAULT_ERROR = 'Não foi possível enviar agora. Tente de novo.';
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var seq = 0;

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------
  function isUuid(value) { return typeof value === 'string' && UUID_RE.test(value); }

  function sanitizeMessageId(value) { return isUuid(value) ? value : null; }

  /** Só com feedback_enabled exatamente verdadeiro (flag pública do servidor). */
  function feedbackEnabled(flags) { return !!flags && flags.feedback_enabled === true; }

  /** Conta pontos de código, como o servidor (Array.from), não unidades UTF-16. */
  function commentLength(text) { return Array.from(typeof text === 'string' ? text : '').length; }

  function commentCounter(length) { return length + '/' + COMMENT_MAX; }

  function validateComment(raw) {
    var value = typeof raw === 'string' ? raw.trim() : '';
    if (commentLength(value) > COMMENT_MAX) {
      return { ok: false, error: 'Use no máximo ' + COMMENT_MAX + ' caracteres no comentário.' };
    }
    return { ok: true, value: value };
  }

  /** Monta o corpo que vai ao servidor; nada sai sem passar aqui. */
  function buildPayload(input) {
    var src = input || {};
    if (!isUuid(src.messageId)) return { ok: false, error: 'Resposta da Lia não identificada.' };
    if (RATINGS.indexOf(src.rating) === -1) return { ok: false, error: 'Escolha Útil ou Não útil.' };
    var payload = { messageId: src.messageId, rating: src.rating };
    if (src.category !== undefined && src.category !== null && src.category !== '') {
      if (CATEGORY_IDS.indexOf(src.category) === -1) return { ok: false, error: 'Escolha um motivo da lista.' };
      payload.category = src.category;
    }
    var comment = validateComment(src.comment);
    if (!comment.ok) return { ok: false, error: comment.error };
    if (comment.value) payload.comment = comment.value;
    return { ok: true, payload: payload };
  }

  function makeState(phase, messageId, extra) {
    return Object.assign({
      phase: phase, messageId: messageId || null, rating: null, category: '', comment: '', error: '', payload: null,
    }, extra || {});
  }

  /** Fases: ask (pergunta), detail (campo 👎), sending, thanks, error, hidden. */
  function initialState(options) {
    var opts = options || {};
    var messageId = sanitizeMessageId(opts.messageId);
    return makeState(opts.enabled === true && messageId ? 'ask' : 'hidden', messageId);
  }

  function startSending(state, rating, category, comment) {
    var built = buildPayload({ messageId: state.messageId, rating: rating, category: category, comment: comment });
    if (!built.ok) return Object.assign({}, state, { error: built.error });
    return makeState('sending', state.messageId, { rating: rating, category: category, comment: comment, payload: built.payload });
  }

  function withField(state, field, value) {
    if (field === 'category') {
      return Object.assign({}, state, { category: CATEGORY_IDS.indexOf(value) !== -1 ? value : '', error: '' });
    }
    if (field === 'comment') {
      return Object.assign({}, state, { comment: typeof value === 'string' ? value : '', error: '' });
    }
    return state;
  }

  function failedState(state, error) {
    var text = typeof error === 'string' && error.trim() ? error.slice(0, 200) : DEFAULT_ERROR;
    return makeState('error', state.messageId, { rating: state.rating, payload: state.payload, error: text });
  }

  var TRANSITIONS = {
    ask: function (s, ev) {
      if (ev.type !== 'rate') return s;
      if (ev.rating === 'down') return makeState('detail', s.messageId, { rating: 'down' });
      if (ev.rating === 'up') return startSending(s, 'up', '', '');
      return s;
    },
    detail: function (s, ev) {
      if (ev.type === 'cancel') return makeState('ask', s.messageId);
      if (ev.type === 'set') return withField(s, ev.field, ev.value);
      if (ev.type === 'submit') {
        var next = startSending(s, 'down', s.category, s.comment);
        return next.phase === 'sending' ? next : Object.assign({}, s, { error: next.error });
      }
      return s;
    },
    sending: function (s, ev) {
      if (ev.type === 'sent') return makeState('thanks', s.messageId, { rating: s.rating });
      if (ev.type === 'failed') return failedState(s, ev.error);
      return s; // enquanto envia, novos cliques são ignorados
    },
    error: function (s, ev) {
      if (ev.type === 'retry' && s.payload) return makeState('sending', s.messageId, { rating: s.rating, payload: s.payload });
      if (ev.type === 'cancel') return makeState('ask', s.messageId);
      return s;
    },
    thanks: function (s, ev) { return ev.type === 'expire' ? makeState('hidden', s.messageId) : s; },
    hidden: function (s) { return s; },
  };

  /** Próximo estado para um evento. Nunca altera `state`; devolve o mesmo objeto se nada muda. */
  function reduce(state, event) {
    var ev = event || {};
    if (ev.type === 'off') return makeState('hidden', state.messageId);
    var handler = TRANSITIONS[state.phase];
    return handler ? handler(state, ev) : state;
  }

  // ---------------------------------------------------------------------------
  // Interface (só roda no navegador; createElement + textContent)
  // ---------------------------------------------------------------------------
  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function focusFirst(scope, selector) {
    var node = scope.querySelector(selector);
    if (node) node.focus({ preventScroll: true });
  }

  function choiceButton(doc, rating, icon, label, state, actions) {
    var button = el(doc, 'button', 'lia-fb-choice');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(state.rating === rating && state.phase !== 'ask'));
    button.disabled = state.phase === 'sending';
    var mark = el(doc, 'span', 'lia-fb-icon', icon);
    mark.setAttribute('aria-hidden', 'true');
    button.appendChild(mark);
    button.appendChild(el(doc, 'span', '', label));
    button.addEventListener('click', function () { actions.rate(rating); });
    return button;
  }

  function statusNode(doc, text, role) {
    var p = el(doc, 'p', 'lia-fb-status', text);
    p.setAttribute('role', role);
    return p;
  }

  function errorBlock(doc, state, actions) {
    var wrap = el(doc, 'div', 'lia-fb-error-wrap');
    wrap.appendChild(statusNode(doc, state.error, 'alert'));
    var row = el(doc, 'div', 'lia-fb-actions');
    var retry = el(doc, 'button', 'lia-fb-primary lia-fb-retry', 'Tentar de novo');
    retry.type = 'button';
    retry.addEventListener('click', function () { actions.retry(); });
    var back = el(doc, 'button', 'lia-fb-secondary', 'Voltar');
    back.type = 'button';
    back.addEventListener('click', function () { actions.cancel(); });
    row.appendChild(retry);
    row.appendChild(back);
    wrap.appendChild(row);
    return wrap;
  }

  function optionNode(doc, value, label, selected) {
    var option = el(doc, 'option', '', label);
    option.value = value;
    option.selected = selected;
    return option;
  }

  function detailForm(doc, state, ids, actions) {
    var form = el(doc, 'form', 'lia-fb-detail');
    form.addEventListener('submit', function (evt) { evt.preventDefault(); actions.submit(); });
    form.appendChild(el(doc, 'p', 'lia-fb-question', 'Quer deixar um comentário?'));

    var catLabel = el(doc, 'label', 'lia-fb-label', 'Motivo (opcional)');
    catLabel.htmlFor = ids.select;
    var select = el(doc, 'select', 'lia-fb-select');
    select.id = ids.select;
    select.appendChild(optionNode(doc, '', 'Escolha um motivo', state.category === ''));
    CATEGORIES.forEach(function (c) { select.appendChild(optionNode(doc, c.id, c.label, state.category === c.id)); });
    select.addEventListener('change', function () { actions.setField('category', select.value); });

    var textLabel = el(doc, 'label', 'lia-fb-label', 'Comentário (opcional)');
    textLabel.htmlFor = ids.text;
    var area = el(doc, 'textarea', 'lia-fb-text');
    area.id = ids.text;
    area.rows = 3;
    area.maxLength = COMMENT_MAX;
    area.value = state.comment;
    area.setAttribute('aria-describedby', ids.counter);
    var counter = el(doc, 'p', 'lia-fb-counter', commentCounter(commentLength(state.comment)));
    counter.id = ids.counter;
    area.addEventListener('input', function () {
      actions.setField('comment', area.value);
      counter.textContent = commentCounter(commentLength(area.value));
    });

    form.appendChild(catLabel);
    form.appendChild(select);
    form.appendChild(textLabel);
    form.appendChild(area);
    form.appendChild(counter);
    if (state.error) form.appendChild(statusNode(doc, state.error, 'alert'));

    var row = el(doc, 'div', 'lia-fb-actions');
    var send = el(doc, 'button', 'lia-fb-primary', 'Enviar');
    send.type = 'submit';
    var back = el(doc, 'button', 'lia-fb-secondary', 'Voltar');
    back.type = 'button';
    back.addEventListener('click', function () { actions.cancel(); });
    row.appendChild(send);
    row.appendChild(back);
    form.appendChild(row);
    return form;
  }

  function askBody(doc, state, ids, actions) {
    var nodes = [];
    var question = el(doc, 'p', 'lia-fb-question', 'Isso te ajudou?');
    question.id = ids.question;
    nodes.push(question);
    var group = el(doc, 'div', 'lia-fb-choices');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', ids.question);
    group.appendChild(choiceButton(doc, 'up', '👍', 'Útil', state, actions));
    group.appendChild(choiceButton(doc, 'down', '👎', 'Não útil', state, actions));
    nodes.push(group);
    if (state.phase === 'sending') nodes.push(statusNode(doc, 'Enviando…', 'status'));
    if (state.phase === 'error') nodes.push(errorBlock(doc, state, actions));
    return nodes;
  }

  function bodyNodes(doc, state, ids, actions) {
    if (state.phase === 'detail') return [detailForm(doc, state, ids, actions)];
    if (state.phase === 'thanks') return [statusNode(doc, 'Obrigado pelo seu retorno!', 'status')];
    return askBody(doc, state, ids, actions);
  }

  function renderBody(root, nodes) {
    while (root.firstChild) root.removeChild(root.firstChild);
    nodes.forEach(function (node) { root.appendChild(node); });
  }

  function nextIds() {
    seq += 1;
    var base = 'lia-fb-' + seq;
    return { question: base + '-q', select: base + '-sel', text: base + '-txt', counter: base + '-cnt' };
  }

  /** Chama o envio e devolve sempre uma promessa (erro síncrono vira rejeição). */
  function requestSend(send, payload) {
    try { return Promise.resolve(send(payload)); } catch (err) { return Promise.reject(err); }
  }

  /** Redesenha o card. Depois de trocar de fase, leva o foco para onde ele faz sentido. */
  function paint(doc, root, state, ids, actions, prevPhase) {
    var hadFocus = root.contains(doc.activeElement);
    renderBody(root, bodyNodes(doc, state, ids, actions));
    if (state.phase === 'detail' && prevPhase !== 'detail') focusFirst(root, '.lia-fb-select');
    else if (state.phase === 'error') focusFirst(root, '.lia-fb-retry');
    else if (hadFocus) root.focus({ preventScroll: true });
  }

  /**
   * Monta o card. Devolve o elemento, ou null se não houver o que avaliar.
   * options: { messageId, enabled, send(payload) → Promise<res>, onHidden() }.
   */
  function mount(doc, options) {
    var opts = options || {};
    var state = initialState({ enabled: opts.enabled, messageId: opts.messageId });
    if (state.phase === 'hidden') return null;
    var root = el(doc, 'section', 'lia-feedback');
    root.setAttribute('aria-label', 'Avaliação da resposta da Lia');
    root.tabIndex = -1;
    var ids = nextIds();
    var timer = null;

    function runSend() {
      requestSend(opts.send, state.payload).then(function (res) {
        if (res && res.disabled === true) return dispatch({ type: 'off' });
        if (res && res.success === true) return dispatch({ type: 'sent' });
        return dispatch({ type: 'failed', error: res && res.message });
      }, function () { dispatch({ type: 'failed' }); });
    }

    function dispatch(ev) {
      var prevPhase = state.phase;
      var next = reduce(state, ev);
      if (next === state) return;
      state = next;
      if (state.phase === 'hidden') {
        if (timer) clearTimeout(timer);
        if (root.parentNode) root.parentNode.removeChild(root);
        if (opts.onHidden) opts.onHidden();
        return;
      }
      if (state.phase === 'sending') runSend();
      if (state.phase === 'thanks') timer = setTimeout(function () { dispatch({ type: 'expire' }); }, THANKS_MS);
      paint(doc, root, state, ids, actions, prevPhase);
    }

    var actions = {
      rate: function (rating) { dispatch({ type: 'rate', rating: rating }); },
      cancel: function () { dispatch({ type: 'cancel' }); },
      submit: function () { dispatch({ type: 'submit' }); },
      retry: function () { dispatch({ type: 'retry' }); },
      // Digitar não redesenha o campo (manter o foco); só guarda o valor.
      setField: function (field, value) { state = reduce(state, { type: 'set', field: field, value: value }); },
    };

    renderBody(root, bodyNodes(doc, state, ids, actions));
    return root;
  }

  var api = {
    CATEGORIES: CATEGORIES,
    RATINGS: RATINGS,
    COMMENT_MAX: COMMENT_MAX,
    THANKS_MS: THANKS_MS,
    DEFAULT_ERROR: DEFAULT_ERROR,
    isUuid: isUuid,
    sanitizeMessageId: sanitizeMessageId,
    feedbackEnabled: feedbackEnabled,
    commentLength: commentLength,
    commentCounter: commentCounter,
    validateComment: validateComment,
    buildPayload: buildPayload,
    initialState: initialState,
    reduce: reduce,
    mount: mount,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftAssistantFeedback = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
