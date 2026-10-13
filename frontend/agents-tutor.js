/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tutor clínico (ADR 0007, etapa 5; API alfa agents/v1-alpha): cartão "Falar com o Tutor" na tela Aprender.
//   - O cartão só existe se apiAgentsList devolver o agente `tutor-clinico`. Lista vazia, `unavailable`, AGENT_DISABLED
//     ou falha de rede: nada aparece e nada quebra. A lista é pedida UMA vez por sessão (cache em memória), só quando
//     a tela Aprender abre; falha de rede não entra no cache (a próxima abertura tenta de novo).
//   - A conversa (até 8 turnos) fica só na memória da página: nada vai para o armazenamento do navegador e tudo some
//     ao sair da conta. O servidor recebe só os turnos que deram certo (recusa e erro ficam de fora do histórico).
//   - Tudo que vem do servidor é dado não confiável: a resposta entra por textContent (nunca como HTML); o único href
//     sai da lista fixa de hosts (doi.org e PubMed), reaproveitando a validação de assistant-sources.js.
//   - Recusa de guardrail NÃO é erro (`refused: true`): o texto do servidor aparece como resposta do Tutor e a regra só
//     vai para o atributo data-rule. Os limites (1000 caracteres por pergunta, 500 por turno, 8 turnos) são os da persona
//     em worker/agents/personas/tutor-clinico.md. As ações do agente NÃO entram na ponte dos módulos: o Tutor roda no shell.
// Expõe window.LaiftAgentsTutor (ou module.exports, no Node, para os testes).
(function (root) {
  'use strict';

  var AGENT_ID = 'tutor-clinico';
  var MESSAGE_MAX = 1000; // limits.messageMax da persona (guardrail I1)
  var TURN_MAX = 500; // limits.historyTurnMax
  var HISTORY_TURNS = 8; // context.history
  var SHOWN_REPLY_MAX = 4000;
  var SOURCES_MAX = 3;
  var REF_MAX = 99;
  var RULE_RE = /^[IO][1-9]$/;
  var URL_RE = /^https:\/\/(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)(\/[^\s<>"']{1,260})$/;
  var HOSTS = ['doi.org', 'pubmed.ncbi.nlm.nih.gov'];

  var NOTICE = 'O Tutor explica conceitos de estudo. Não substitui orientação profissional e não analisa casos reais.';
  var TEXT = {
    title: 'Falar com o Tutor',
    intro: 'Tire dúvidas de farmacologia e toxicologia: mecanismo de ação, farmacocinética e toxicidade.',
    label: 'Sua dúvida de estudo',
    placeholder: 'Ex.: Por que o paracetamol é hepatotóxico em superdose?',
    send: 'Perguntar',
    clear: 'Limpar conversa',
    waiting: 'O Tutor está pensando…',
    you: 'Você',
    tutor: 'Tutor',
    sourcesTitle: 'Fontes',
    sourcesLabel: 'Fontes desta resposta',
    memory: 'Usou sua memória de estudo',
    memoryManage: 'Gerenciar memória',
    memoryManageLabel: 'Gerenciar memória de estudo no Perfil',
    degraded: 'Resposta aproximada: a IA está indisponível no momento.',
    refused: 'Não posso ajudar com essa pergunta. O Tutor responde dúvidas de estudo de farmacologia e toxicologia.',
    empty: 'Escreva sua dúvida antes de enviar.',
    tooLong: 'A pergunta passou de ' + MESSAGE_MAX + ' caracteres. Resuma em uma ou duas frases.',
    network: 'Sem conexão com o servidor. Tente de novo em instantes.',
    generic: 'Não foi possível falar com o Tutor agora. Tente de novo em instantes.',
    invalidReply: 'O Tutor não conseguiu montar uma resposta válida. Reformule a pergunta e tente de novo.',
  };
  var ERRORS = {
    RATE_LIMIT: 'Você fez muitas perguntas ao Tutor nesta hora. Tente novamente mais tarde.',
    QUOTA: 'A cota de hoje do Tutor esgotou. Ela volta amanhã.',
    AI_UNAVAILABLE: 'O Tutor está fora do ar neste momento. Tente de novo em instantes.',
    INVALID_OUTPUT: TEXT.invalidReply,
    VALIDATION: 'Confira sua pergunta: escreva uma dúvida de estudo de até ' + MESSAGE_MAX + ' caracteres.',
  };
  var DISABLED = {
    age: 'O Tutor está disponível apenas para maiores de 18 anos.',
    role: 'O Tutor não está disponível para o seu perfil.',
    other: 'O Tutor está indisponível no momento.',
  };

  // Fontes: assistant-sources.js (no navegador vem de window; no Node, dos testes, de require).
  var Sources = root.LaiftAssistantSources || (typeof require === 'function' ? require('./assistant-sources.js') : null);

  // ---------------------------------------------------------------------------
  // Funções puras
  // ---------------------------------------------------------------------------
  function clip(value, max) {
    return typeof value === 'string' ? value.slice(0, max) : '';
  }

  function own(map, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
  }

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  /** O agente `tutor-clinico` da lista, ou null (lista vazia, `unavailable`, erro, qualquer outra forma). */
  function findTutor(res) {
    if (!isObject(res) || res.success !== true || res.unavailable || !Array.isArray(res.agents)) return null;
    var hit = res.agents.filter(function (a) { return isObject(a) && a.id === AGENT_ID; })[0];
    return hit || null;
  }

  /** Resposta definitiva do servidor (vale guardar no cache da sessão)? Falha de rede não vale. */
  function isDefinitive(res) {
    return isObject(res) && res.networkUnavailable !== true;
  }

  /** '' se a pergunta pode seguir; senão 'empty' ou 'too_long'. */
  function validateMessage(message) {
    var text = typeof message === 'string' ? message.trim() : '';
    if (!text) return 'empty';
    return text.length > MESSAGE_MAX ? 'too_long' : '';
  }

  /** Nova lista com o turno no fim, sem passar de 8 (a original não muda). */
  function appendTurns(turns, added) {
    return (turns || []).concat(added || []).slice(-HISTORY_TURNS);
  }

  /** Histórico enviado ao servidor: só turnos que deram certo (kind 'ok'), os 8 últimos, 500 caracteres cada. */
  function historyFor(turns) {
    return (turns || [])
      .filter(function (t) { return t && t.kind === 'ok' && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text; })
      .slice(-HISTORY_TURNS)
      .map(function (t) { return { role: t.role, text: clip(t.text, TURN_MAX) }; });
  }

  /** Fontes citadas: validação de assistant-sources.js (host permitido) + número [n] que a pessoa vê. */
  function citedSources(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.slice(0, SOURCES_MAX).forEach(function (item, index) {
      var clean = Sources.sanitizeReferences([item])[0];
      if (!clean) return;
      var ref = Number(item.ref);
      out.push(Object.assign({}, clean, { ref: Number.isInteger(ref) && ref >= 1 && ref <= REF_MAX ? ref : index + 1 }));
    });
    return out;
  }

  /** href montado com o host da lista fixa; qualquer outra forma de url vira ''. */
  function safeHref(url) {
    var match = typeof url === 'string' ? URL_RE.exec(url) : null;
    return match ? 'https://' + HOSTS[HOSTS.indexOf(match[1])] + match[2] : '';
  }

  function ruleOf(res) {
    return typeof res.rule === 'string' && RULE_RE.test(res.rule) ? res.rule : '';
  }

  function disabledMessage(res) {
    return own(DISABLED, res.reason) || DISABLED.other;
  }

  function failureOutcome(res) {
    if (res.networkUnavailable === true) return { kind: 'error', message: TEXT.network };
    if (res.code === 'AGENT_DISABLED') return { kind: 'disabled', message: disabledMessage(res) };
    return { kind: 'error', message: own(ERRORS, res.code) || TEXT.generic };
  }

  function answerOutcome(res) {
    var text = clip(res.reply, SHOWN_REPLY_MAX).trim();
    if (!text) return { kind: 'error', message: TEXT.invalidReply };
    return {
      kind: 'answer', text: text, sources: citedSources(res.sources),
      memoryUsed: isObject(res.memory) && res.memory.used === true, memoryCount: memoryCountOf(res.memory), degraded: res.degraded === true,
    };
  }

  /** Quantos itens da memória a resposta usou (inteiro positivo), ou 0 quando o servidor não informa. */
  function memoryCountOf(memory) {
    return isObject(memory) && Number.isInteger(memory.count) && memory.count > 0 && memory.count <= 99 ? memory.count : 0;
  }

  /**
   * Resposta de apiAgentsInvoke → o que mostrar:
   *   { kind: 'answer', text, sources, memoryUsed, degraded } | { kind: 'refused', text, rule }
   *   | { kind: 'disabled', message } | { kind: 'error', message }
   * Recusa de guardrail (success true, refused true) NÃO é erro.
   */
  function classify(res) {
    if (!isObject(res)) return { kind: 'error', message: TEXT.generic };
    if (res.success !== true) return failureOutcome(res);
    if (res.refused === true) return { kind: 'refused', text: clip(res.reply, 600).trim() || TEXT.refused, rule: ruleOf(res) };
    return answerOutcome(res);
  }

  // ---------------------------------------------------------------------------
  // Montagem do DOM (textContent e atributos; nenhum HTML dinâmico)
  // ---------------------------------------------------------------------------
  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderSources(doc, cited) {
    var box = el(doc, 'div', 'agents-tutor-sources');
    box.appendChild(el(doc, 'p', 'agents-tutor-sources-title', TEXT.sourcesTitle));
    var list = el(doc, 'ul', 'agents-tutor-sources-list');
    list.setAttribute('aria-label', TEXT.sourcesLabel);
    cited.forEach(function (s) {
      var item = el(doc, 'li', 'agents-tutor-source');
      item.appendChild(el(doc, 'span', 'agents-tutor-ref', '[' + s.ref + ']'));
      var href = safeHref(s.url);
      var label = el(doc, href ? 'a' : 'span', 'agents-tutor-source-link', s.title);
      if (href) {
        label.setAttribute('href', href);
        label.setAttribute('target', '_blank');
        label.setAttribute('rel', 'noopener noreferrer');
      }
      item.appendChild(label);
      var meta = [s.authors, s.journal, s.year ? String(s.year) : ''].filter(Boolean).join(' · ');
      if (meta) item.appendChild(el(doc, 'span', 'agents-tutor-source-meta', meta));
      list.appendChild(item);
    });
    box.appendChild(list);
    return box;
  }

  /** Bolha da pessoa (texto puro). */
  function renderUser(doc, text) {
    var msg = el(doc, 'div', 'agents-tutor-msg agents-tutor-msg-user');
    msg.setAttribute('data-role', 'user');
    msg.appendChild(el(doc, 'p', 'agents-tutor-who', TEXT.you));
    msg.appendChild(el(doc, 'p', 'agents-tutor-text', text));
    return msg;
  }

  /** Leva ao Perfil, onde fica o cartão "Memória de estudo" (navegação de painéis do shell; o foco vai ao cartão). */
  function openMemory() {
    var shell = app();
    if (shell && typeof shell.showPanel === 'function') shell.showPanel('panel-profile');
    if (root.LaiftMemory && typeof root.LaiftMemory.reveal === 'function') root.LaiftMemory.reveal();
  }

  /** Selo "Usou sua memória de estudo" (com a contagem, se vier) e o atalho "Gerenciar memória". */
  function renderMemoryRow(doc, count) {
    var row = el(doc, 'div', 'agents-tutor-memory-row');
    var label = count ? TEXT.memory + ' (' + count + (count === 1 ? ' item)' : ' itens)') : TEXT.memory;
    row.appendChild(el(doc, 'span', 'badge agents-tutor-memory', label));
    var manage = el(doc, 'button', 'secondary agents-tutor-memory-link', TEXT.memoryManage);
    manage.type = 'button';
    manage.setAttribute('aria-label', TEXT.memoryManageLabel);
    manage.addEventListener('click', openMemory);
    row.appendChild(manage);
    return row;
  }

  /** Bolha do Tutor para um desfecho 'answer' ou 'refused' (classify). A regra de recusa só vai para data-rule. */
  function renderTutor(doc, outcome) {
    var refused = outcome.kind === 'refused';
    var msg = el(doc, 'div', 'agents-tutor-msg agents-tutor-msg-bot' + (refused ? ' agents-tutor-msg-refused' : ''));
    msg.setAttribute('data-role', 'tutor');
    if (refused && outcome.rule) msg.setAttribute('data-rule', outcome.rule);
    msg.appendChild(el(doc, 'p', 'agents-tutor-who', TEXT.tutor));
    msg.appendChild(el(doc, 'p', 'agents-tutor-text', outcome.text));
    if (outcome.degraded) msg.appendChild(el(doc, 'p', 'agents-tutor-note', TEXT.degraded));
    if (outcome.memoryUsed) msg.appendChild(renderMemoryRow(doc, outcome.memoryCount));
    if (outcome.sources && outcome.sources.length) msg.appendChild(renderSources(doc, outcome.sources));
    return msg;
  }

  function buildForm(doc) {
    var form = el(doc, 'form', 'agents-tutor-form');
    form.setAttribute('novalidate', '');
    var label = el(doc, 'label', 'agents-tutor-label', TEXT.label);
    label.setAttribute('for', 'agents-tutor-input');
    var input = el(doc, 'textarea', 'agents-tutor-input');
    input.id = 'agents-tutor-input';
    input.setAttribute('rows', '3');
    input.setAttribute('maxlength', String(MESSAGE_MAX));
    input.setAttribute('placeholder', TEXT.placeholder);
    input.setAttribute('aria-describedby', 'agents-tutor-count agents-tutor-notice');
    var count = el(doc, 'span', 'agents-tutor-count muted', '0/' + MESSAGE_MAX);
    count.id = 'agents-tutor-count';
    var send = el(doc, 'button', 'agents-tutor-send', TEXT.send);
    send.type = 'submit';
    var clear = el(doc, 'button', 'secondary agents-tutor-clear', TEXT.clear);
    clear.type = 'button';
    var bar = el(doc, 'div', 'agents-tutor-bar');
    [count, clear, send].forEach(function (node) { bar.appendChild(node); });
    [label, input, bar].forEach(function (node) { form.appendChild(node); });
    return { form: form, input: input, count: count, send: send, clear: clear };
  }

  function buildWait(doc) {
    var wait = el(doc, 'p', 'agents-tutor-wait');
    wait.hidden = true;
    var dots = el(doc, 'span', 'agents-tutor-dots');
    dots.setAttribute('aria-hidden', 'true');
    [1, 2, 3].forEach(function () { dots.appendChild(el(doc, 'i', '')); });
    wait.appendChild(dots);
    wait.appendChild(el(doc, 'span', '', TEXT.waiting));
    return wait;
  }

  /** Cartão completo: título, faixa fixa, conversa (aria-live), formulário e estado. Devolve { root, ...partes }. */
  function buildCard(doc) {
    var card = el(doc, 'section', 'card agents-tutor');
    card.id = 'agents-tutor';
    card.setAttribute('aria-labelledby', 'agents-tutor-title');
    card.setAttribute('data-agent', AGENT_ID);
    var title = el(doc, 'h2', 'agents-tutor-title', TEXT.title);
    title.id = 'agents-tutor-title';
    var notice = el(doc, 'p', 'agents-tutor-notice', NOTICE);
    notice.id = 'agents-tutor-notice';
    var log = el(doc, 'div', 'agents-tutor-log');
    log.id = 'agents-tutor-log';
    log.setAttribute('role', 'log');
    log.setAttribute('aria-live', 'polite');
    log.setAttribute('aria-relevant', 'additions');
    log.setAttribute('aria-label', 'Conversa com o Tutor');
    var form = buildForm(doc);
    var wait = buildWait(doc);
    var status = el(doc, 'div', 'status-msg agents-tutor-status');
    status.id = 'agents-tutor-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    [title, el(doc, 'p', 'muted agents-tutor-intro', TEXT.intro), notice, log, form.form, wait, status]
      .forEach(function (node) { card.appendChild(node); });
    return { root: card, log: log, form: form.form, input: form.input, count: form.count, send: form.send, clear: form.clear, wait: wait, status: status };
  }

  // ---------------------------------------------------------------------------
  // Controle (estado só em memória; cada mudança troca o objeto inteiro)
  // ---------------------------------------------------------------------------
  var generation = 0;
  var started = false;
  var state = freshState('');

  function freshState(token) {
    generation += 1;
    return { token: token, gen: generation, listing: null, listed: false, tutor: null, turns: [], busy: false, ui: null };
  }

  function update(patch) {
    state = Object.assign({}, state, patch);
  }

  function app() { return root.App; }

  function currentToken() {
    var current = app() && app().getState ? app().getState() : null;
    return (current && current.sessionToken) || '';
  }

  function note(message, kind) {
    var status = state.ui && state.ui.status;
    if (!status) return;
    status.textContent = message || '';
    if (kind) status.setAttribute('data-kind', kind);
    else status.removeAttribute('data-kind');
  }

  function updateCount() {
    if (state.ui) state.ui.count.textContent = state.ui.input.value.length + '/' + MESSAGE_MAX;
  }

  function showBusy(busy) {
    update({ busy: busy });
    var ui = state.ui;
    if (!ui) return;
    ui.send.disabled = busy;
    ui.wait.hidden = !busy;
    ui.log.setAttribute('aria-busy', busy ? 'true' : 'false');
    note(busy ? TEXT.waiting : '', busy ? 'info' : '');
  }

  function trimLog(log) {
    while (log.children.length > HISTORY_TURNS) log.removeChild(log.children[0]);
  }

  function restoreFocus(ui) {
    var doc = root.document;
    var active = doc.activeElement;
    if (!active || active === doc.body || active === ui.send || active === ui.clear) ui.input.focus({ preventScroll: true });
  }

  function lockCard(message) {
    var ui = state.ui;
    if (!ui) return;
    ui.input.disabled = true;
    ui.send.disabled = true;
    note(message, 'error');
  }

  /** Resposta chegou: bolha do Tutor + histórico; erro devolve o texto ao campo para tentar de novo. */
  function conclude(message, pending, res) {
    var ui = state.ui;
    var outcome = classify(res);
    showBusy(false);
    if (outcome.kind === 'answer' || outcome.kind === 'refused') {
      var kind = outcome.kind === 'answer' ? 'ok' : 'refused';
      ui.log.appendChild(renderTutor(root.document, outcome));
      trimLog(ui.log);
      ui.log.scrollTop = ui.log.scrollHeight;
      update({ turns: appendTurns(state.turns, [{ role: 'user', text: message, kind: kind }, { role: 'assistant', text: outcome.text, kind: kind }]) });
    } else {
      ui.log.removeChild(pending);
      if (outcome.kind === 'disabled') lockCard(outcome.message);
      else {
        ui.input.value = message;
        updateCount();
        note(outcome.message, 'error');
      }
    }
    restoreFocus(ui);
  }

  function ask(message) {
    var ui = state.ui;
    var gen = state.gen;
    var history = historyFor(state.turns);
    var pending = renderUser(root.document, message);
    ui.log.appendChild(pending);
    ui.log.scrollTop = ui.log.scrollHeight;
    ui.input.value = '';
    updateCount();
    showBusy(true);
    app().callApi('apiAgentsInvoke', state.token, { agentId: AGENT_ID, message: message, history: history }).then(function (res) {
      if (gen === state.gen) conclude(message, pending, res);
    }, function () {
      if (gen === state.gen) conclude(message, pending, { success: false, networkUnavailable: true });
    });
  }

  function onSubmit(evt) {
    if (evt && evt.preventDefault) evt.preventDefault();
    var ui = state.ui;
    if (!ui || state.busy) return;
    var message = ui.input.value.trim();
    var problem = validateMessage(message);
    if (problem) {
      note(problem === 'empty' ? TEXT.empty : TEXT.tooLong, 'error');
      ui.input.focus();
      return;
    }
    ask(message);
  }

  function onClear() {
    var ui = state.ui;
    if (!ui || state.busy) return;
    while (ui.log.children.length) ui.log.removeChild(ui.log.children[0]);
    update({ turns: [] });
    note('', '');
    ui.input.focus();
  }

  function removeCard() {
    var ui = state.ui;
    if (ui && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
  }

  function mountCard() {
    var doc = root.document;
    var host = doc.getElementById('learn-hub');
    if (state.ui || !host) return;
    var ui = buildCard(doc);
    ui.form.addEventListener('submit', onSubmit);
    ui.clear.addEventListener('click', onClear);
    ui.input.addEventListener('input', updateCount);
    ui.input.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter' && (evt.ctrlKey || evt.metaKey)) onSubmit(evt);
    });
    host.insertBefore(ui.root, doc.getElementById('learn-modules'));
    update({ ui: ui });
  }

  function listTutor() {
    var gen = state.gen;
    var request = app().callApi('apiAgentsList', state.token).then(function (res) {
      if (gen !== state.gen) return;
      var tutor = findTutor(res);
      update({ listing: null, listed: isDefinitive(res), tutor: tutor });
      if (tutor) mountCard();
    }, function () {
      if (gen === state.gen) update({ listing: null });
    });
    update({ listing: request });
    return request;
  }

  /** Pede a lista uma vez por sessão (cache em memória, inclusive o "não há Tutor") e monta o cartão se houver. */
  function ensureTutor() {
    if (!state.token || !app() || !app().callApi) return Promise.resolve();
    if (state.listed) {
      if (state.tutor) mountCard();
      return Promise.resolve();
    }
    return state.listing || listTutor();
  }

  /** Sessão nova (login, logout, troca de conta): some o cartão e a conversa da conta anterior. */
  function syncSession() {
    var token = currentToken();
    if (token === state.token) return;
    removeCard();
    state = freshState(token);
  }

  function onPanelChange(evt) {
    syncSession();
    if (evt && evt.detail && evt.detail.panel === 'panel-learn') ensureTutor();
  }

  function start() {
    var doc = root.document;
    if (started || !root.App || !doc || !doc.body) return;
    started = true;
    doc.addEventListener('laift:panelchange', onPanelChange);
    var learn = doc.getElementById('panel-learn');
    if (learn && !learn.classList.contains('hidden')) onPanelChange({ detail: { panel: 'panel-learn' } });
  }

  var api = {
    AGENT_ID: AGENT_ID, MESSAGE_MAX: MESSAGE_MAX, TURN_MAX: TURN_MAX, HISTORY_TURNS: HISTORY_TURNS, NOTICE: NOTICE, TEXT: TEXT, ERRORS: ERRORS,
    findTutor: findTutor, isDefinitive: isDefinitive, validateMessage: validateMessage, appendTurns: appendTurns, historyFor: historyFor,
    citedSources: citedSources, safeHref: safeHref, classify: classify, buildCard: buildCard, renderUser: renderUser, renderTutor: renderTutor,
    ensureTutor: ensureTutor, syncSession: syncSession,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftAgentsTutor = api;
    if (root.document.readyState === 'complete') start();
    else root.document.addEventListener('DOMContentLoaded', start);
  }
})(typeof window !== 'undefined' ? window : globalThis);
