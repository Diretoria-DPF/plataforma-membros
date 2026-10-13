/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Memória de estudo (ADR 0007, etapa 7; API alfa agents/v1-alpha): cartão "Memória de estudo" no Perfil.
//   - O cartão só existe se apiMemoryGet responder com sucesso. MEMORY_DISABLED (flag, papel, idade) e falha de rede
//     escondem o cartão; só a rede NÃO entra no cache (a próxima abertura do Perfil tenta de novo). RATE_LIMIT e
//     MEMORY_UNAVAILABLE mostram o cartão com um aviso e "Tentar de novo". O GET é pedido UMA vez por sessão (cache em
//     memória) e de novo só pelo botão "Atualizar lista" ou depois de ativar.
//   - Quatro telas: (a) sem consentimento (texto da finalidade + "Ativar"), (b) ativa (itens, preferências, baixar,
//     apagar, desligar), (c) texto mudou (needsReconsent: pede novo aceite e não mostra nada guardado) e (d) erro/indisponível.
//   - Nada vai para o armazenamento do navegador: estado só na memória da página, descartado ao trocar de conta ou sair
//     (reset() é chamado por app.js). Resposta atrasada de conta anterior é descartada pela geração da sessão.
//   - Tudo que vem do servidor é dado não confiável: normalizado (slug, id, nível, origem) e inserido por textContent.
//     As preferências só oferecem o vocabulário devolvido pelo servidor (listas fechadas), nunca texto livre.
//   - "Baixar meus dados" monta o JSON no próprio navegador (Blob + URL.createObjectURL, revogada logo depois): o arquivo
//     não é enviado a lugar nenhum. As ações de memória NÃO entram na ponte dos módulos: o cartão roda no shell.
//   - A parte pura (textos, CONSENT_SECTIONS, normalização, exportação) está em memory-core.js, carregado antes. O texto da
//     finalidade é RASCUNHO PARA APROVAÇÃO DO DONO (docs/memoria-consentimento-RASCUNHO.md); a versão (purposeVersion) vem do
//     servidor e é devolvida no aceite.
// Expõe window.LaiftMemory (ou module.exports, no Node, para os testes).
(function (root) {
  'use strict';

  // Parte pura (textos, normalização, exportação): memory-core.js (no navegador vem de window; no Node, dos testes, de require).
  var Core = root.LaiftMemoryCore || (typeof require === 'function' ? require('./memory-core.js') : null);
  var PANEL = Core.PANEL;
  var GRID_ID = Core.GRID_ID;
  var CARD_ID = Core.CARD_ID;
  var NETWORK_FAILURE = Core.NETWORK_FAILURE;
  var LEVELS = Core.LEVELS;
  var LEVEL_LABEL = Core.LEVEL_LABEL;
  var PREF_LABEL = Core.PREF_LABEL;
  var VALUE_LABEL = Core.VALUE_LABEL;
  var GOAL_LABEL = Core.GOAL_LABEL;
  var TEXT = Core.TEXT;
  var isObject = Core.isObject;
  var labelOr = Core.labelOr;
  var normalizeConsent = Core.normalizeConsent;
  var normalizeItem = Core.normalizeItem;
  var normalizeState = Core.normalizeState;
  var errorMessage = Core.errorMessage;
  var classifyLoad = Core.classifyLoad;
  var describeItem = Core.describeItem;
  var exportText = Core.exportText;
  var exportFileName = Core.exportFileName;
  var defaultEnv = Core.defaultEnv;
  var downloadJson = Core.downloadJson;
  var consentSections = Core.consentSections;


  // ---------------------------------------------------------------------------
  // Montagem do DOM (textContent e atributos; nenhum HTML dinâmico)
  // ---------------------------------------------------------------------------
  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function walk(node, visit) {
    visit(node);
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i += 1) walk(kids[i], visit);
  }

  function findByKey(node, key) {
    var hit = null;
    walk(node, function (n) { if (!hit && n.getAttribute && n.getAttribute('data-key') === key) hit = n; });
    return hit;
  }

  function clearNode(node) {
    while (node.children.length) node.removeChild(node.children[0]);
  }

  /** Botão de ação (data-ctl: some do alcance enquanto uma chamada está em voo). */
  function btn(doc, label, className, key, handler) {
    var node = el(doc, 'button', className, label);
    node.type = 'button';
    node.setAttribute('data-ctl', '1');
    if (key) node.setAttribute('data-key', key);
    node.addEventListener('click', handler);
    return node;
  }

  function actionsRow(doc, buttons) {
    var row = el(doc, 'div', 'memory-actions');
    buttons.forEach(function (node) { row.appendChild(node); });
    return row;
  }

  function termsList(doc, limits) {
    var terms = el(doc, 'dl', 'memory-terms');
    terms.setAttribute('aria-label', TEXT.termsLabel);
    consentSections(limits).forEach(function (s) {
      terms.appendChild(el(doc, 'dt', 'memory-term', s.title));
      terms.appendChild(el(doc, 'dd', 'memory-term-text', s.text));
    });
    return terms;
  }

  function selectField(doc, id, labelText, options, current) {
    var label = el(doc, 'label', 'memory-field', labelText);
    label.setAttribute('for', id);
    var select = el(doc, 'select', 'memory-select');
    select.id = id;
    select.setAttribute('data-ctl', '1');
    [{ value: '', label: TEXT.choose }].concat(options).forEach(function (o) {
      var option = el(doc, 'option', '', o.label);
      option.setAttribute('value', o.value);
      select.appendChild(option);
    });
    select.value = current || '';
    label.appendChild(select);
    return { label: label, select: select };
  }

  /** Formulário de listas fechadas: spec { id, title, fields: [{id, label, options, current}], submit, onSubmit(valores) }. */
  function listForm(doc, spec) {
    var form = el(doc, 'form', 'memory-form');
    form.setAttribute('novalidate', '');
    form.setAttribute('aria-labelledby', spec.id + '-title');
    var title = el(doc, 'h4', 'memory-subtitle', spec.title);
    title.id = spec.id + '-title';
    form.appendChild(title);
    var selects = spec.fields.map(function (f) {
      var field = selectField(doc, f.id, f.label, f.options, f.current);
      form.appendChild(field.label);
      return field.select;
    });
    var save = el(doc, 'button', 'secondary memory-save', spec.submit);
    save.type = 'submit';
    save.setAttribute('data-ctl', '1');
    save.setAttribute('data-key', 'save-' + spec.id);
    form.appendChild(save);
    form.addEventListener('submit', function (evt) {
      if (evt && evt.preventDefault) evt.preventDefault();
      spec.onSubmit(selects.map(function (s) { return s.value; }), 'save-' + spec.id);
    });
    return form;
  }

  function itemNode(doc, item, onDelete) {
    var d = describeItem(item);
    var row = el(doc, 'li', 'memory-item');
    row.setAttribute('data-kind', item.kind);
    var main = el(doc, 'div', 'memory-item-main');
    main.appendChild(el(doc, 'strong', 'memory-item-title', d.title));
    main.appendChild(el(doc, 'span', 'memory-item-detail', d.detail));
    if (d.origin) main.appendChild(el(doc, 'span', 'memory-item-origin muted', TEXT.origin + d.origin));
    row.appendChild(main);
    var del = btn(doc, TEXT.deleteItem, 'secondary memory-item-delete', null, function () { onDelete(item.id); });
    del.setAttribute('aria-label', TEXT.deleteItem + ' da memória: ' + d.title + ', ' + d.detail);
    row.appendChild(del);
    return row;
  }

  function itemsSection(doc, items, limits, onDelete) {
    var box = el(doc, 'div', 'memory-items-box');
    var heading = el(doc, 'h4', 'memory-subtitle', TEXT.itemsTitle + ' (' + items.length + ' de ' + limits.maxItems + ')');
    heading.id = 'memory-items-title';
    heading.setAttribute('tabindex', '-1');
    heading.setAttribute('data-key', 'items');
    box.appendChild(heading);
    if (!items.length) {
      box.appendChild(el(doc, 'p', 'memory-empty muted', TEXT.itemsEmpty));
      return box;
    }
    var ul = el(doc, 'ul', 'memory-items');
    ul.setAttribute('aria-labelledby', 'memory-items-title');
    items.forEach(function (item) { ul.appendChild(itemNode(doc, item, onDelete)); });
    box.appendChild(ul);
    return box;
  }

  function buildCard(doc) {
    var card = el(doc, 'section', 'card memory-card');
    card.id = CARD_ID;
    card.setAttribute('aria-labelledby', 'memory-card-title');
    var title = el(doc, 'h3', 'memory-title', TEXT.title);
    title.id = 'memory-card-title';
    title.setAttribute('tabindex', '-1');
    title.setAttribute('data-key', 'title');
    var body = el(doc, 'div', 'memory-body');
    var status = el(doc, 'div', 'status-msg memory-status');
    status.id = 'memory-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    [title, body, status].forEach(function (node) { card.appendChild(node); });
    return { root: card, title: title, body: body, status: status };
  }

  // ---------------------------------------------------------------------------
  // Controle (estado só em memória; cada mudança troca o objeto inteiro)
  // ---------------------------------------------------------------------------
  var generation = 0;
  var started = false;
  var state = freshState('');

  function freshState(token) {
    generation += 1;
    return { token: token, gen: generation, loaded: false, loading: null, hidden: false, data: null, error: '', busy: false, ui: null, revealPending: false };
  }

  function update(patch) {
    state = Object.assign({}, state, patch);
  }

  function app() { return root.App; }

  function currentToken() {
    var current = app() && app().getState ? app().getState() : null;
    return (current && current.sessionToken) || '';
  }

  function invoke(action, payload) {
    var call = payload === undefined ? app().callApi(action, state.token) : app().callApi(action, state.token, payload);
    return Promise.resolve(call).then(null, function () { return NETWORK_FAILURE; });
  }

  function note(message, kind) {
    var status = state.ui && state.ui.status;
    if (!status) return;
    status.textContent = message || '';
    if (kind) status.setAttribute('data-kind', kind);
    else status.removeAttribute('data-kind');
  }

  function setBusy(busy) {
    update({ busy: busy });
    var ui = state.ui;
    if (!ui) return;
    ui.root.setAttribute('aria-busy', busy ? 'true' : 'false');
    walk(ui.body, function (n) { if (n.getAttribute && n.getAttribute('data-ctl') === '1') n.disabled = busy; });
  }

  function patchData(patch) {
    update({ data: Object.assign({}, state.data, patch) });
  }

  function confirmThen(message, action) {
    var shell = app();
    if (shell && typeof shell.openConfirm === 'function') shell.openConfirm(message, action);
  }

  function activeKey(ui) {
    var active = root.document.activeElement;
    var key = active && active.getAttribute ? active.getAttribute('data-key') : '';
    return key && findByKey(ui.root, key) === active ? key : '';
  }

  function focusKey(ui, key) {
    if (!key) return;
    var target = findByKey(ui.root, key) || ui.title;
    if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
  }

  // Telas -------------------------------------------------------------------
  function viewError(doc, message) {
    return [el(doc, 'p', 'memory-lead', message), actionsRow(doc, [btn(doc, TEXT.retry, 'secondary', 'retry', onRefresh)])];
  }

  function viewUnavailable(doc, data) {
    var buttons = [btn(doc, TEXT.retry, 'secondary', 'retry', onRefresh)];
    if (data.consent.current || data.consent.needsReconsent) buttons.push(btn(doc, TEXT.revokeErase, 'danger', 'revoke', onRevoke));
    return [el(doc, 'p', 'memory-lead', TEXT.unavailable), actionsRow(doc, buttons)];
  }

  function viewConsent(doc, data, again) {
    var nodes = [el(doc, 'p', 'memory-lead', again ? TEXT.reconsent : TEXT.lead)];
    nodes.push(termsList(doc, data.limits));
    nodes.push(el(doc, 'p', 'memory-footnote muted', TEXT.termsFooter));
    var buttons = [];
    if (data.consent.purposeVersion) buttons.push(btn(doc, again ? TEXT.reaccept : TEXT.activate, '', 'activate', onActivate));
    else nodes.push(el(doc, 'p', 'memory-footnote', TEXT.unavailable));
    if (again) {
      buttons.push(btn(doc, TEXT.exportData, 'secondary', 'export', onExport));
      buttons.push(btn(doc, TEXT.revokeErase, 'danger', 'revoke', onRevoke));
    }
    if (buttons.length) nodes.push(actionsRow(doc, buttons));
    return nodes;
  }

  function currentValue(items, slug) {
    var hit = items.filter(function (i) { return i.kind === 'study_pref' && i.slug === slug; })[0];
    return hit ? hit.value : '';
  }

  function optionsOf(values, labels) {
    return values.map(function (v) { return { value: v, label: labelOr(labels, v) }; });
  }

  function topicForm(doc, data) {
    var topics = data.vocabulary.topics.map(function (t) { return { value: t.slug, label: t.label }; });
    var levels = LEVELS.map(function (n) { return { value: String(n), label: n + ' – ' + LEVEL_LABEL[n] }; });
    return listForm(doc, {
      id: 'memory-topic', title: TEXT.topicTitle, submit: TEXT.saveLevel, onSubmit: onSaveTopic,
      fields: [{ id: 'memory-topic-slug', label: TEXT.topicLabel, options: topics }, { id: 'memory-topic-level', label: TEXT.levelLabel, options: levels }],
    });
  }

  function styleForm(doc, data) {
    var fields = data.vocabulary.preferences.map(function (p) {
      return { id: 'memory-pref-' + p.slug, slug: p.slug, label: labelOr(PREF_LABEL, p.slug), options: optionsOf(p.values, VALUE_LABEL), current: currentValue(data.items, p.slug) };
    });
    return listForm(doc, { id: 'memory-style', title: TEXT.styleTitle, submit: TEXT.saveStyle, fields: fields, onSubmit: function (values, key) { onSaveStyle(fields, values, key); } });
  }

  function goalForm(doc, data) {
    var current = data.items.filter(function (i) { return i.kind === 'goal'; })[0];
    return listForm(doc, {
      id: 'memory-goal', title: TEXT.goalTitle, submit: TEXT.saveGoal, onSubmit: onSaveGoal,
      fields: [{ id: 'memory-goal-slug', label: TEXT.goalLabel, options: optionsOf(data.vocabulary.goals, GOAL_LABEL), current: current ? current.slug : '' }],
    });
  }

  function viewActive(doc, data) {
    var nodes = [el(doc, 'p', 'memory-lead', TEXT.activeLead), itemsSection(doc, data.items, data.limits, onDeleteItem)];
    if (data.vocabulary.topics.length) nodes.push(topicForm(doc, data));
    if (data.vocabulary.preferences.length) nodes.push(styleForm(doc, data));
    if (data.vocabulary.goals.length) nodes.push(goalForm(doc, data));
    nodes.push(actionsRow(doc, [
      btn(doc, TEXT.refresh, 'secondary', 'refresh', onRefresh),
      btn(doc, TEXT.exportData, 'secondary', 'export', onExport),
      btn(doc, TEXT.deleteAll, 'danger', 'delete-all', onDeleteAll),
      btn(doc, TEXT.revoke, 'danger', 'revoke', onRevoke),
    ]));
    return nodes;
  }

  function nodesFor(doc, st) {
    if (!st.data) return viewError(doc, st.error || TEXT.generic);
    if (!st.data.available) return viewUnavailable(doc, st.data);
    if (st.data.consent.needsReconsent) return viewConsent(doc, st.data, true);
    if (st.data.consent.current) return viewActive(doc, st.data);
    return viewConsent(doc, st.data, false);
  }

  function render(preferKey) {
    var ui = state.ui;
    if (!ui) return;
    var key = preferKey || activeKey(ui);
    clearNode(ui.body);
    nodesFor(root.document, state).forEach(function (node) { ui.body.appendChild(node); });
    setBusy(state.busy);
    focusKey(ui, key);
  }

  // Carga e montagem ----------------------------------------------------------
  function removeCard() {
    var ui = state.ui;
    if (ui && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
  }

  /** true se o cartão acabou de ser criado (false se já existia ou se o Perfil não tem onde recebê-lo). */
  function mountCard() {
    var grid = root.document.getElementById(GRID_ID);
    if (state.ui || !grid) return false;
    var ui = buildCard(root.document);
    grid.appendChild(ui.root);
    update({ ui: ui });
    return true;
  }

  function applyReveal() {
    if (!state.revealPending || !state.ui) return;
    update({ revealPending: false });
    var title = state.ui.title;
    if (typeof title.focus === 'function') title.focus({ preventScroll: true });
    if (typeof title.scrollIntoView === 'function') title.scrollIntoView({ block: 'start' });
  }

  function showLoaded(patch) {
    update(patch);
    mountCard();
    render();
    applyReveal();
  }

  function applyLoad(out) {
    update({ loading: null });
    if (out.kind === 'ok') return showLoaded({ loaded: true, data: out.data, error: '' });
    if (out.kind === 'error') return showLoaded({ loaded: false, data: null, error: out.message });
    removeCard();
    update({ hidden: out.cache, loaded: out.cache, ui: null, revealPending: false });
  }

  function load() {
    var gen = state.gen;
    var request = invoke('apiMemoryGet').then(function (res) {
      if (gen === state.gen) applyLoad(classifyLoad(res));
    });
    update({ loading: request });
    return request;
  }

  /** Pede o estado uma vez por sessão (cache em memória, inclusive o "não aparece") e monta o cartão se houver. */
  function ensureMemory() {
    if (!state.token || !app() || !app().callApi || state.hidden) return Promise.resolve();
    if (state.loaded) {
      if (mountCard()) render();
      applyReveal();
      return Promise.resolve();
    }
    return state.loading || load();
  }

  /** Recarrega sem avisar (depois de ativar): preenche os itens; falha fica em silêncio, a tela segue como está. */
  function quietReload() {
    var gen = state.gen;
    return invoke('apiMemoryGet').then(function (res) {
      var data = gen === state.gen ? normalizeState(res) : null;
      if (!data) return;
      update({ data: data });
      render();
    });
  }

  // Ações ---------------------------------------------------------------------
  function hideCard() {
    removeCard();
    update({ hidden: true, loaded: true, data: null, ui: null, busy: false, revealPending: false });
  }

  function failed(res, handlers) {
    if (isObject(res) && res.code === 'MEMORY_DISABLED') return hideCard();
    if (handlers.fail && handlers.fail(res) === true) return undefined;
    note(errorMessage(res), 'error');
    if (isObject(res) && res.code === 'CONSENT_REQUIRED') return quietReload();
    return undefined;
  }

  /** Uma chamada por vez: liga o "ocupado", chama a API, descarta resposta de outra sessão. Resolve true se deu certo. */
  function act(action, payload, handlers) {
    if (!state.ui || state.busy || !state.token) return Promise.resolve(false);
    var gen = state.gen;
    note('', '');
    setBusy(true);
    return invoke(action, payload).then(function (res) {
      if (gen !== state.gen) return false;
      setBusy(false);
      var ok = isObject(res) && res.success === true;
      if (ok) handlers.ok(res);
      else failed(res, handlers);
      return ok;
    });
  }

  function consentFrom(res, fallback) {
    var next = normalizeConsent(res && res.consent);
    return next.purposeVersion ? next : Object.assign(next, { purposeVersion: fallback });
  }

  function onActivate() {
    confirmThen(TEXT.confirmActivate, function () {
      var version = state.data.consent.purposeVersion;
      act('apiMemorySetConsent', { granted: true, purposeVersion: version }, {
        ok: function (res) {
          patchData({ consent: consentFrom(res, version), items: [] });
          render('title');
          note(TEXT.okActivated, 'success');
          quietReload();
        },
        fail: function (res) {
          if (!isObject(res) || res.code !== 'VALIDATION' || res.reason !== 'version') return false;
          note(TEXT.versionChanged, 'error');
          quietReload();
          return true;
        },
      });
    });
  }

  function onRevoke() {
    confirmThen(TEXT.confirmRevoke, function () {
      var version = state.data.consent.purposeVersion;
      act('apiMemorySetConsent', { granted: false }, {
        ok: function (res) {
          var consent = Object.assign(consentFrom(res, version), { current: false, needsReconsent: false });
          patchData({ consent: consent, items: [] });
          render('title');
          note(res.erased === true ? TEXT.okRevoked : TEXT.okRevokedPending, 'success');
        },
      });
    });
  }

  function removeLocal(id) {
    patchData({ items: state.data.items.filter(function (i) { return i.id !== id; }) });
    render('items');
    note(TEXT.okItemDeleted, 'success');
  }

  function onDeleteItem(id) {
    confirmThen(TEXT.confirmItem, function () {
      act('apiMemoryDeleteItem', { id: id }, {
        ok: function () { removeLocal(id); },
        fail: function (res) {
          if (!isObject(res) || res.code !== 'NOT_FOUND') return false;
          removeLocal(id);
          return true;
        },
      });
    });
  }

  function onDeleteAll() {
    confirmThen(TEXT.confirmAll, function () {
      act('apiMemoryDeleteAll', undefined, {
        ok: function () {
          patchData({ items: [] });
          render('title');
          note(TEXT.okAllDeleted, 'success');
        },
      });
    });
  }

  function onExport() {
    act('apiMemoryExport', undefined, {
      ok: function (res) {
        var text = exportText(res);
        if (!text) return note(TEXT.generic, 'error');
        try {
          downloadJson(defaultEnv(), exportFileName(new Date()), text);
        } catch (err) {
          return note(TEXT.exportFailed, 'error');
        }
        return note(TEXT.okExport, 'success');
      },
    });
  }

  function onRefresh() {
    act('apiMemoryGet', undefined, {
      ok: function (res) {
        var data = normalizeState(res);
        if (!data) return note(TEXT.generic, 'error');
        update({ data: data, error: '' });
        render();
        return note(TEXT.okRefreshed, 'success');
      },
    });
  }

  function upsertItem(raw) {
    var item = normalizeItem(raw);
    if (!item) return;
    var rest = state.data.items.filter(function (i) { return !(i.kind === item.kind && i.slug === item.slug); });
    patchData({ items: rest.concat([item]) });
  }

  /** Salva os itens em sequência (um por chamada); para no primeiro erro. */
  function saveAll(payloads, key, emptyMessage) {
    if (!payloads.length) return note(emptyMessage, 'error');
    var chain = Promise.resolve(true);
    payloads.forEach(function (payload) {
      chain = chain.then(function (previous) {
        return previous ? act('apiMemorySetPreference', payload, { ok: function (res) { upsertItem(res.item); } }) : false;
      });
    });
    return chain.then(function (allOk) {
      if (!allOk) return;
      render(key);
      note(TEXT.okSaved, 'success');
    });
  }

  function onSaveTopic(values, key) {
    var payloads = values[0] && values[1] ? [{ kind: 'topic_level', slug: values[0], level: Number(values[1]) }] : [];
    saveAll(payloads, key, TEXT.pickTopic);
  }

  function onSaveStyle(fields, values, key) {
    var payloads = fields.map(function (f, i) { return values[i] ? { kind: 'study_pref', slug: f.slug, value: values[i] } : null; }).filter(Boolean);
    saveAll(payloads, key, TEXT.pickStyle);
  }

  function onSaveGoal(values, key) {
    saveAll(values[0] ? [{ kind: 'goal', slug: values[0] }] : [], key, TEXT.pickGoal);
  }

  // Sessão e painel -----------------------------------------------------------
  /** Sessão nova (login, logout, troca de conta): some o cartão e tudo da conta anterior. */
  function syncSession() {
    var token = currentToken();
    if (token === state.token) return;
    removeCard();
    state = freshState(token);
  }

  /** Logout e sessão expirada (app.js): descarta o cartão e qualquer resposta ainda em voo. */
  function reset() {
    removeCard();
    state = freshState('');
  }

  /** Leva o foco ao cartão (usado pelo link "Gerenciar memória" do Tutor); se ainda não existe, faz quando montar. */
  function reveal() {
    update({ revealPending: true });
    applyReveal();
  }

  function onPanelChange(evt) {
    syncSession();
    if (evt && evt.detail && evt.detail.panel === PANEL) ensureMemory();
  }

  function start() {
    var doc = root.document;
    if (started || !root.App || !doc || !doc.body) return;
    started = true;
    doc.addEventListener('laift:panelchange', onPanelChange);
    var profile = doc.getElementById(PANEL);
    if (profile && !profile.classList.contains('hidden')) onPanelChange({ detail: { panel: PANEL } });
  }

  var api = {
    CARD_ID: CARD_ID, TEXT: TEXT, ERRORS: Core.ERRORS, CONSENT_SECTIONS: Core.CONSENT_SECTIONS,
    consentSections: consentSections, normalizeState: normalizeState, normalizeItem: normalizeItem, classifyLoad: classifyLoad,
    errorMessage: errorMessage, describeItem: describeItem, exportText: exportText, exportFileName: exportFileName,
    downloadJson: downloadJson, buildCard: buildCard, ensureMemory: ensureMemory, syncSession: syncSession, reset: reset, reveal: reveal,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftMemory = api;
    if (root.document.readyState === 'complete') start();
    else root.document.addEventListener('DOMContentLoaded', start);
  }
})(typeof window !== 'undefined' ? window : globalThis);
