/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-library.js
 * Curadoria da Biblioteca no painel admin (CONTRATO-B2 §6, B2-H7): a subaba "Artigos".
 * Cadastro por DOI ou PMID, fila por estado com contagens, edição com a versão do artigo e
 * mudança de estado só pelos botões que o servidor libera (allowedTransitions). Rejeitar e
 * remover pedem motivo de 3 a 300 caracteres antes da confirmação. Publicar mostra o aviso de
 * que o artigo entra no catálogo público ao vivo (/biblioteca, cache de 60 s na API).
 *
 * As outras subabas (Sugestões, Coleções, Áreas, Equipe) ficam em admin-library-extras.js:
 * esta tela chama window.LaiftAdminLibraryExtras.render(aba, corpo, app) quando existir.
 * O trabalho em lote (importar lista, gerar resumos por IA, aprovar e publicar selecionados)
 * fica em admin-library-lote.js (window.LaiftAdminLibraryLote; ganchos em loteNode/loteCtx).
 *
 * Script clássico: load(window.App) ao abrir o painel e reset() no logout. Sem HTML montado como texto:
 * todo nó nasce de LaiftDom.h e todo texto (inclusive a mensagem de erro da API) entra como nó
 * de texto. Os botões usam data-action="LaiftAdminLibrary.act" com data-args (JSON).
 * Rótulos de tipo e licença vêm de LaiftLibraryCite (library-cite.js), que é o único dono.
 *
 * A autorização real é do servidor; esconder a aba Equipe é só conveniência.
 */
(function () {
  'use strict';

  var ROOT_ID = 'admin-library-root';
  var ACTION = 'LaiftAdminLibrary.act';
  var DEFAULT_STATUS = 'em_triagem';
  var SUMMARY_MAX = 1200;
  var REASON_MIN = 3;
  var REASON_MAX = 300;
  var CLINICAL_CHECK_ID = 'adm-lib-clinico';
  var CLINICAL_REASON_ID = 'adm-lib-motivo-clinico';
  var CLINICAL_REASON_ERR_ID = 'adm-lib-motivo-clinico-erro';
  var CLINICAL_REASON_LABEL = 'Motivo para desmarcar (3 a 300 caracteres)';
  var CLINICAL_REFUSAL = /motivo/i;
  var TITLE_MAX = 500;
  var ERROR_FALLBACK = 'Não foi possível concluir. Tente de novo.';
  var IMPORT_BUSY = 'Consultando Crossref, Europe PMC e OpenAlex…';
  var NOTHING_CHANGED = 'Nada mudou desde o último salvamento.';
  var SAVED_NOTICE = 'Alterações salvas.';
  var STATUS_CHANGED_NOTICE = 'Estado atualizado.';
  var PUBLISHED_NOTICE = 'Publicado. O artigo aparece no catálogo público (/biblioteca) em até 1 minuto.';
  var TITLE_FOCUS_EDIT = 'adm-lib-titulo-edicao';
  var TITLE_FOCUS_QUEUE = 'adm-lib-titulo-fila';

  var TABS = [
    ['revisar', 'Para revisar'],
    ['ar', 'No ar'],
    ['pedidos', 'Pedidos de remoção'],
    ['artigos', 'Editar artigos'],
    ['sugestoes', 'Sugestões'],
    ['colecoes', 'Coleções'],
    ['areas', 'Áreas'],
    ['equipe', 'Equipe'],
  ];
  var ADMIN_ONLY_TABS = ['equipe'];
  var SIMPLE_TABS = ['revisar', 'ar', 'pedidos'];
  var STATUS_FILTERS = [
    ['em_triagem', 'Em triagem'],
    ['aprovado', 'Aprovados'],
    ['publicado', 'Publicados'],
    ['rejeitado', 'Rejeitados'],
    ['removido', 'Removidos'],
  ];
  var STATE_NAMES = {
    em_triagem: 'Em triagem',
    aprovado: 'Aprovado',
    publicado: 'Publicado',
    rejeitado: 'Rejeitado',
    removido: 'Removido',
  };
  var TRANSITION_LABELS = {
    aprovado: 'Aprovar referência',
    publicado: 'Publicar',
    rejeitado: 'Rejeitar',
    removido: 'Remover do catálogo',
    em_triagem: 'Voltar para triagem',
  };
  var CONFIRM_MESSAGES = {
    aprovado: 'Aprovar esta referência?',
    publicado: 'Publicar este artigo no catálogo?',
    rejeitado: 'Rejeitar este artigo?',
    removido: 'Remover este artigo do catálogo?',
    em_triagem: 'Voltar este artigo para a triagem?',
  };
  var REASON_TARGETS = ['rejeitado', 'removido'];
  var REASON_CONFIRM_LABELS = { rejeitado: 'Confirmar rejeição', removido: 'Confirmar remoção' };
  var EDIT_KEYS = [
    'title', 'journal', 'journalAbbrev', 'year', 'volume', 'issue', 'pages', 'language',
    'type', 'topics', 'license', 'oaStatus', 'isClinical', 'summaryText',
  ];
  var OA_OPTIONS = [
    ['diamond', 'Acesso aberto diamante'],
    ['gold', 'Acesso aberto (ouro)'],
    ['green', 'Acesso aberto (verde)'],
    ['hybrid', 'Acesso híbrido'],
    ['bronze', 'Acesso gratuito (bronze)'],
    ['closed', 'Acesso fechado'],
    ['desconhecido', 'Não informado'],
  ];

  var requestId = 0; // descarta respostas de pedidos antigos e de antes do logout
  var wired = false;
  var appRef = null;
  var ui = freshUi();

  // ---------- Funções puras (testadas em scripts/admin-library.test.mjs) ----------

  function freshUi() {
    return {
      tab: 'revisar', view: 'queue', status: DEFAULT_STATUS, counts: {}, topics: [], items: [],
      article: null, articleId: null, base: null, draft: null, allowed: [], warnings: [],
      busy: null, notice: '', error: null, errorReload: false, focusId: '',
      importText: '', importError: null,
      reasonTo: null, reasonText: '', reasonError: '',
      clinicalReason: '', clinicalReasonError: '',
    };
  }

  function list(value) { return Array.isArray(value) ? value : []; }

  function toCount(value) {
    var number = Number(value);
    return isFinite(number) && number > 0 ? Math.floor(number) : 0;
  }

  function errorText(res) {
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    return message || ERROR_FALLBACK;
  }

  /** Motivo de rejeição ou remoção: 3 a 300 caracteres depois de aparar. Vazio = válido. */
  function reasonError(text) {
    var size = typeof text === 'string' ? text.trim().length : 0;
    return size >= REASON_MIN && size <= REASON_MAX ? '' : 'O motivo precisa ter de 3 a 300 caracteres.';
  }

  /** Desmarcar "clínico" (estava marcado ao abrir): o servidor pode exigir motivo. */
  function unmarksClinical(base, draft) {
    return !!base && base.isClinical === true && draft.isClinical === false;
  }

  /** O motivo só vai no envio com o campo visível (desmarcando) e preenchido; aparado. */
  function reasonToSend(base, draft, text) {
    if (!unmarksClinical(base, draft)) return null;
    var value = typeof text === 'string' ? text.trim() : '';
    return value || null;
  }

  /** Recusa do servidor por falta de motivo ao desmarcar (a mensagem cita o motivo). */
  function isReasonRefusal(res) {
    return !!res && res.success !== true && CLINICAL_REFUSAL.test(errorText(res));
  }

  /** Valores de edição no formato de UpdateArticle (year e type, não os nomes de coluna). */
  function draftFromArticle(article) {
    var a = article || {};
    return {
      title: a.title || '',
      journal: a.journal || '',
      journalAbbrev: a.journalAbbrev || '',
      year: typeof a.pubYear === 'number' ? a.pubYear : null,
      volume: a.volume || '',
      issue: a.issue || '',
      pages: a.pages || '',
      language: a.language || '',
      type: a.articleType || 'artigo',
      topics: list(a.topics).slice(),
      license: a.license || 'desconhecida',
      oaStatus: a.oaStatus || 'desconhecido',
      isClinical: a.isClinical === true,
      summaryText: a.summaryText || '',
    };
  }

  function sortedKey(value) { return list(value).slice().sort().join('|'); }

  function sameValue(a, b) {
    if (Array.isArray(a) || Array.isArray(b)) return sortedKey(a) === sortedKey(b);
    var left = a === null || a === undefined ? '' : a;
    var right = b === null || b === undefined ? '' : b;
    return left === right;
  }

  /** Texto vazio vai como null (o servidor decide o que aceita); áreas no que o curador escolheu. */
  function payloadValue(key, value) {
    if (key === 'topics') return list(value).slice();
    if (key === 'isClinical') return value === true;
    if (typeof value === 'string') return value === '' ? null : value;
    return value;
  }

  /** Só os campos que mudaram, para o servidor não mexer em resumo que ficou igual. */
  function changedFields(base, draft) {
    return EDIT_KEYS
      .filter(function (key) { return !sameValue(base[key], draft[key]); })
      .reduce(function (out, key) {
        var next = {};
        next[key] = payloadValue(key, draft[key]);
        return Object.assign({}, out, next);
      }, {});
  }

  /** Resultado do cadastro: ok, duplicata (com articleId para abrir o existente) ou erro comum. */
  function importOutcome(res) {
    if (res && res.success === true) return { kind: 'ok', article: res.article, warnings: list(res.warnings) };
    if (res && res.articleId) return { kind: 'duplicate', articleId: String(res.articleId), message: errorText(res) };
    return { kind: 'error', message: errorText(res) };
  }

  /** Botões de estado com a contagem; contagem ausente vira zero. */
  function statusFilters(counts) {
    var src = counts || {};
    return STATUS_FILTERS.map(function (pair) {
      var count = toCount(src[pair[0]]);
      return { status: pair[0], label: pair[1] + ' (' + count + ')', count: count };
    });
  }

  function cite() { return window.LaiftLibraryCite || null; }

  function labelOptions(table) {
    return Object.keys(table || {}).map(function (key) { return { value: key, label: table[key] }; });
  }

  function typeOptions() {
    var c = cite();
    return c ? labelOptions(c.LABELS.type) : [];
  }

  function licenseOptions() {
    var c = cite();
    return c ? labelOptions(c.LABELS.license) : [];
  }

  function oaOptions() {
    return OA_OPTIONS.map(function (pair) { return { value: pair[0], label: pair[1] }; });
  }

  function transitionLabel(to) { return TRANSITION_LABELS[to] || String(to); }

  function isAdminIdentity(identity) { return !!identity && identity.role === 'admin'; }

  function identifierOf(item) {
    if (item.doi) return 'DOI ' + item.doi;
    return item.pmid ? 'PMID ' + item.pmid : 'Sem DOI ou PMID';
  }

  function countLabel(length) { return length + '/' + SUMMARY_MAX; }

  // ---------- Acesso à API e estado ----------

  function dom() { return window.LaiftDom; }
  function h(tag, attrs, children) { return dom().h(tag, attrs, children); }
  function root() { return document.getElementById(ROOT_ID); }

  function sessionToken(app) {
    var state = app && app.getState ? app.getState() : null;
    return state && state.sessionToken;
  }

  function identity() { return appRef && appRef.getIdentity ? appRef.getIdentity() : null; }

  function setUi(patch) { ui = Object.assign({}, ui, patch); }

  /** Chamada à API com a resposta válida só se for a do pedido mais recente. */
  function ask(name, input, onAnswer) {
    var token = sessionToken(appRef);
    if (!token || !dom()) return;
    var mine = ++requestId;
    appRef.callApi(name, token, input).then(function (res) {
      if (mine === requestId) onAnswer(res);
    });
  }

  function setDraft(key, value) {
    var next = {};
    next[key] = value;
    setUi({ draft: Object.assign({}, ui.draft, next) });
  }

  function toggleTopic(slug, checked) {
    var current = list(ui.draft.topics).filter(function (item) { return item !== slug; });
    setDraft('topics', checked ? current.concat([slug]) : current);
  }

  /** Marcar de novo limpa o motivo; desmarcar de novo mantém o que já foi digitado. */
  function toggleClinical(checked) {
    setUi({
      draft: Object.assign({}, ui.draft, { isClinical: checked }),
      clinicalReason: checked ? '' : ui.clinicalReason,
      clinicalReasonError: '',
      focusId: CLINICAL_CHECK_ID,
    });
    render();
  }

  // ---------- Carregamentos e ações ----------

  function showError(res) {
    setUi({ busy: null, error: errorText(res), errorReload: true });
    render();
  }

  function loadQueue(status) {
    setUi({
      tab: 'artigos', view: 'queue', status: status, article: null, articleId: null,
      warnings: [], notice: '', error: null, errorReload: false, busy: 'list', focusId: TITLE_FOCUS_QUEUE,
    });
    render();
    ask('apiAdminLearnLibraryListQueue', { status: status }, function (res) {
      if (!res || res.success !== true) { showError(res); return; }
      setUi({ busy: null, counts: res.counts || {}, topics: list(res.topics), items: list(res.items), error: null, errorReload: false });
      render();
    });
  }

  function fetchArticle(id, notice) {
    setUi({
      view: 'edit', articleId: id, busy: 'article', notice: notice || '', error: null, errorReload: false,
      article: ui.articleId === id ? ui.article : null, reasonTo: null, reasonText: '', reasonError: '',
      clinicalReason: '', clinicalReasonError: '',
    });
    render();
    ask('apiAdminLearnLibraryGetArticle', { id: id }, function (res) {
      if (!res || res.success !== true) { showError(res); return; }
      var draft = draftFromArticle(res.article);
      setUi({
        article: res.article, base: draft, draft: draft, allowed: list(res.allowedTransitions),
        busy: null, error: null, errorReload: false, focusId: TITLE_FOCUS_EDIT,
      });
      render();
    });
  }

  function openArticle(id) {
    setUi({ warnings: [] });
    fetchArticle(String(id), '');
  }

  function selectTab(tab) {
    if (tab === 'artigos') { loadQueue(ui.status); return; }
    setUi({ tab: tab, view: 'queue', article: null, articleId: null, error: null, errorReload: false, busy: null, notice: '' });
    render();
  }

  function importArticle() {
    var identifier = String(ui.importText || '').trim();
    if (!identifier) {
      setUi({ importError: { message: 'Digite um DOI ou PMID.', articleId: null } });
      render();
      return;
    }
    setUi({ busy: 'cadastrar', importError: null, notice: '' });
    render();
    ask('apiAdminLearnLibraryImport', { identifier: identifier }, function (res) {
      var out = importOutcome(res);
      if (out.kind === 'ok') { openImported(out); return; }
      setUi({ busy: null, importError: { message: out.message, articleId: out.articleId || null } });
      render();
    });
  }

  function openImported(out) {
    var draft = draftFromArticle(out.article);
    setUi({
      importText: '', importError: null, article: out.article, articleId: out.article.id,
      base: draft, draft: draft, allowed: [], warnings: out.warnings, view: 'edit',
    });
    fetchArticle(String(out.article.id), 'Artigo cadastrado. Confira os dados antes de mudar o estado.');
  }

  function saveDraft() {
    var article = ui.article;
    if (!article) return;
    var fields = changedFields(ui.base, ui.draft);
    if (Object.keys(fields).length === 0) {
      setUi({ notice: NOTHING_CHANGED, error: null });
      render();
      return;
    }
    var unmarking = unmarksClinical(ui.base, ui.draft);
    var input = { id: article.id, version: article.version, fields: fields };
    var reason = reasonToSend(ui.base, ui.draft, ui.clinicalReason);
    if (reason) input.reason = reason;
    setUi({ busy: 'save', error: null, notice: '', clinicalReasonError: '' });
    render();
    ask('apiAdminLearnLibraryUpdateArticle', input, function (res) {
      if (res && res.success === true) { fetchArticle(String(article.id), SAVED_NOTICE); return; }
      if (unmarking && isReasonRefusal(res)) { reasonRefused(res); return; }
      showError(res);
    });
  }

  /** A recusa por falta de motivo fica junto ao campo, que ganha o foco. */
  function reasonRefused(res) {
    setUi({ busy: null, error: null, errorReload: false, clinicalReasonError: errorText(res), focusId: CLINICAL_REASON_ID });
    render();
  }

  function runTransition(to, reason) {
    var article = ui.article;
    if (!article) return;
    var input = { id: article.id, version: article.version, to: to };
    if (reason !== null) input.reason = reason;
    setUi({ busy: 'save', error: null, notice: '', reasonTo: null });
    render();
    ask('apiAdminLearnLibrarySetStatus', input, function (res) {
      if (!res || res.success !== true) { showError(res); return; }
      fetchArticle(String(article.id), to === 'publicado' ? PUBLISHED_NOTICE : STATUS_CHANGED_NOTICE);
    });
  }

  function confirmTransition(to, reason) {
    appRef.openConfirm(CONFIRM_MESSAGES[to] || 'Mudar o estado deste artigo?', function () {
      runTransition(to, reason);
    });
  }

  function chooseTransition(to) {
    if (REASON_TARGETS.indexOf(to) !== -1) {
      setUi({ reasonTo: to, reasonText: '', reasonError: '' });
      render();
      return;
    }
    confirmTransition(to, null);
  }

  function confirmReason(to) {
    var error = reasonError(ui.reasonText);
    if (error) {
      setUi({ reasonError: error });
      render();
      return;
    }
    confirmTransition(to, ui.reasonText.trim());
  }

  function cancelReason() {
    setUi({ reasonTo: null, reasonText: '', reasonError: '' });
    render();
  }

  /** "Atualizar" e "Tentar de novo": repete o último pedido da tela. */
  function reload() {
    if (ui.articleId) fetchArticle(ui.articleId, '');
    else loadQueue(ui.status);
  }

  var ACTIONS = {
    tab: selectTab,
    status: loadQueue,
    open: openArticle,
    back: function () { loadQueue(ui.status); },
    cadastrar: importArticle,
    save: saveDraft,
    transition: chooseTransition,
    reasonConfirm: confirmReason,
    reasonCancel: cancelReason,
    reload: reload,
  };

  /** Ponto único das ações: data-args = [nome, valor]; só os nomes de ACTIONS passam. */
  function act(kind, payload) {
    if (!appRef || !Object.prototype.hasOwnProperty.call(ACTIONS, kind)) return;
    ACTIONS[kind](payload);
  }

  // ---------- Desenho (só LaiftDom.h; texto como nó de texto) ----------

  function btn(label, kind, payload, extra) {
    var attrs = { type: 'button', 'data-action': ACTION, 'data-args': JSON.stringify(payload === undefined ? [kind] : [kind, payload]) };
    return h('button', Object.assign(attrs, extra || {}), [label]);
  }

  function hasFocusInside(box) {
    var active = document.activeElement;
    return !!active && typeof box.contains === 'function' && box.contains(active);
  }

  function focusTarget(box) {
    if (!ui.focusId || typeof box.querySelector !== 'function') return;
    var node = box.querySelector('#' + ui.focusId);
    if (node && node.focus) node.focus({ preventScroll: true });
    setUi({ focusId: '' });
  }

  function visibleTabs() {
    var admin = isAdminIdentity(identity());
    return TABS.filter(function (tab) { return admin || ADMIN_ONLY_TABS.indexOf(tab[0]) === -1; });
  }

  function tabsNode() {
    return h('div', { className: 'actions-row', role: 'group', 'aria-label': 'Partes da curadoria' },
      visibleTabs().map(function (tab) {
        var on = tab[0] === ui.tab;
        return btn(tab[1], 'tab', tab[0], { 'aria-pressed': on ? 'true' : 'false' });
      }));
  }

  function setBusy(box) {
    if (ui.busy) box.setAttribute('aria-busy', 'true');
    else box.removeAttribute('aria-busy');
  }

  // Lote (admin-library-lote.js): painel na fila, seleção por item e resumo por IA na edição.
  function lote() { return window.LaiftAdminLibraryLote || null; }

  function loteCtx() {
    return {
      app: appRef, items: ui.items, topics: ui.topics, rerender: render,
      refresh: function () { if (ui.tab === 'artigos' && ui.view === 'queue') loadQueue(ui.status); },
      open: function (id, notice) { fetchArticle(String(id), notice || ''); },
    };
  }

  function loteNode(part, arg) { return lote() ? lote()[part](arg, loteCtx()) : null; }

  function mountExtras(body) {
    var simple = window.LaiftAdminLibraryPublicar;
    if (SIMPLE_TABS.indexOf(ui.tab) !== -1 && simple && typeof simple.render === 'function') {
      simple.render(ui.tab, body, appRef);
      return;
    }
    var extras = window.LaiftAdminLibraryExtras;
    if (extras && typeof extras.render === 'function') {
      extras.render(ui.tab, body, appRef);
      return;
    }
    body.appendChild(h('p', { className: 'empty-state' }, ['Esta parte ainda não está disponível.']));
  }

  function render() {
    var box = root();
    if (!box || !dom()) return;
    var keepFocus = hasFocusInside(box);
    var isExtra = ui.tab !== 'artigos';
    var body = isExtra ? h('div', null) : articlesNode();
    dom().clear(box);
    box.appendChild(tabsNode());
    box.appendChild(body);
    setBusy(box);
    if (isExtra) mountExtras(body);
    if (keepFocus || ui.focusId) focusTarget(box);
  }

  function errorNode() {
    if (!ui.error) return null;
    var children = [h('p', { className: 'state-message' }, [ui.error])];
    if (ui.errorReload) children.push(btn('Recarregar', 'reload'));
    return h('div', { className: 'state state-error', role: 'alert', tabindex: '-1' }, children);
  }

  function articlesNode() {
    var main = ui.view === 'edit' ? editNode() : queueNode();
    return h('div', null, [errorNode(), main]);
  }

  // Fila

  function importNode() {
    var busy = ui.busy === 'cadastrar';
    return h('section', { className: 'card' }, [
      h('h2', null, ['Cadastrar por DOI ou PMID']),
      h('div', null, [
        h('label', { 'for': 'adm-lib-id' }, ['DOI ou PMID']),
        h('input', {
          type: 'text', id: 'adm-lib-id', maxlength: 300, autocomplete: 'off', value: ui.importText,
          onInput: function (e) { setUi({ importText: e.target.value }); },
        }),
      ]),
      btn('Buscar dados', 'cadastrar', undefined, { disabled: busy }),
      busy ? h('p', { role: 'status' }, [IMPORT_BUSY]) : null,
      ui.importError ? importErrorNode() : null,
    ]);
  }

  function importErrorNode() {
    var err = ui.importError;
    var children = [h('p', { className: 'state-message' }, [err.message])];
    if (err.articleId) children.push(btn('Abrir o já cadastrado', 'open', err.articleId));
    return h('div', { role: 'alert' }, children);
  }

  function filtersNode() {
    return h('div', { className: 'actions-row', role: 'group', 'aria-label': 'Filtrar por estado' },
      statusFilters(ui.counts).map(function (filter) {
        var on = filter.status === ui.status;
        return btn(filter.label, 'status', filter.status, { 'aria-pressed': on ? 'true' : 'false' });
      }));
  }

  function countText() {
    var n = ui.items.length;
    return n === 1 ? '1 artigo' : n + ' artigos';
  }

  function itemFlags(item) {
    var flags = [];
    if (item.licenseConflict) flags.push('Conflito de licença');
    if (item.isClinical === true && !item.clinicalReviewedAt) flags.push('Clínico: aguarda revisor');
    return flags;
  }

  function itemNode(item) {
    var c = cite();
    var meta = [identifierOf(item), item.pubYear ? String(item.pubYear) : 'ano não informado'];
    if (c && item.license) meta.push(c.licenseLabel(item.license));
    var flags = itemFlags(item).map(function (flag) { return h('span', { className: 'badge' }, [flag]); });
    return h('li', null, [
      h('div', { className: 'list-item' }, [
        loteNode('itemSelector', item),
        h('h3', null, [btn(item.title || 'Sem título', 'open', item.id)]),
        h('div', { className: 'meta-row' }, meta.map(function (text) { return h('span', null, [text]); })),
        flags.length ? h('div', { className: 'meta-row' }, flags) : null,
      ]),
    ]);
  }

  function queueNode() {
    var rows = ui.items.map(itemNode);
    return h('div', null, [
      importNode(),
      loteNode('queuePanel'),
      h('h2', { id: TITLE_FOCUS_QUEUE, tabindex: '-1' }, ['Fila de curadoria']),
      filtersNode(),
      ui.busy === 'list'
        ? h('p', { role: 'status' }, ['Carregando…'])
        : h('p', { role: 'status' }, [countText()]),
      rows.length
        ? h('ul', null, rows)
        : h('p', { className: 'empty-state' }, ['Nenhum artigo nesta fila.']),
    ]);
  }

  // Edição

  function fieldBox(id, labelText, control) {
    return h('div', null, [h('label', { 'for': id }, [labelText]), control]);
  }

  function textField(id, labelText, key, draft, max) {
    return fieldBox(id, labelText, h('input', {
      type: 'text', id: id, maxlength: max, value: draft[key] || '',
      onInput: function (e) { setDraft(key, e.target.value); },
    }));
  }

  function yearField(draft) {
    return fieldBox('adm-lib-ano', 'Ano', h('input', {
      type: 'number', id: 'adm-lib-ano', min: 1800, max: 2100,
      value: draft.year === null ? '' : String(draft.year),
      onInput: function (e) { setDraft('year', e.target.value === '' ? null : Number(e.target.value)); },
    }));
  }

  function selectField(id, labelText, key, options, current) {
    return fieldBox(id, labelText, h('select', {
      id: id,
      onChange: function (e) { setDraft(key, e.target.value); },
    }, options.map(function (opt) {
      return h('option', { value: opt.value, selected: opt.value === current }, [opt.label]);
    })));
  }

  function topicBox(topic, draft) {
    var id = 'adm-lib-area-' + topic.slug;
    return h('div', null, [
      h('input', {
        type: 'checkbox', id: id, checked: list(draft.topics).indexOf(topic.slug) !== -1,
        onChange: function (e) { toggleTopic(topic.slug, e.target.checked); },
      }),
      h('label', { 'for': id }, [topic.name || topic.slug]),
    ]);
  }

  function topicsGroup(draft) {
    var boxes = ui.topics.map(function (topic) { return topicBox(topic, draft); });
    var body = boxes.length ? boxes : [h('p', { className: 'empty-state' }, ['Nenhuma área cadastrada.'])];
    return h('fieldset', null, [h('legend', null, ['Áreas (pelo menos uma para aprovar)'])].concat(body));
  }

  function clinicalReasonField(draft) {
    if (!unmarksClinical(ui.base, draft)) return null;
    var error = ui.clinicalReasonError;
    return h('div', null, [
      h('label', { 'for': CLINICAL_REASON_ID }, [CLINICAL_REASON_LABEL]),
      h('input', {
        type: 'text', id: CLINICAL_REASON_ID, maxlength: REASON_MAX, value: ui.clinicalReason,
        'aria-describedby': error ? CLINICAL_REASON_ERR_ID : null,
        onInput: function (e) { setUi({ clinicalReason: e.target.value }); },
      }),
      error ? h('p', { role: 'alert', className: 'state-message', id: CLINICAL_REASON_ERR_ID }, [error]) : null,
    ]);
  }

  function clinicalField(draft) {
    return h('div', null, [
      h('input', {
        type: 'checkbox', id: CLINICAL_CHECK_ID, checked: draft.isClinical === true,
        onChange: function (e) { toggleClinical(e.target.checked); },
      }),
      h('label', { 'for': CLINICAL_CHECK_ID }, ['Contém conduta, dose ou interação (exige revisor clínico)']),
      clinicalReasonField(draft),
    ]);
  }

  function summaryField(draft) {
    var counter = h('p', { className: 'muted', id: 'adm-lib-resumo-contador' }, []);
    counter.textContent = countLabel(String(draft.summaryText || '').length);
    var area = h('textarea', {
      id: 'adm-lib-resumo', maxlength: SUMMARY_MAX, rows: 6,
      onInput: function (e) {
        var value = e.target.value;
        setDraft('summaryText', value);
        counter.textContent = countLabel(String(value).length);
      },
    }, [draft.summaryText || '']);
    return h('div', null, [
      h('label', { 'for': 'adm-lib-resumo' }, ['Resumo da LAIFT']),
      area,
      counter,
    ]);
  }

  function sourcesNode(article) {
    var sources = list(article.metadataSources).join(' · ') || 'nenhuma';
    var when = article.metadataFetchedAt && appRef && appRef.formatDate ? ' em ' + appRef.formatDate(article.metadataFetchedAt) : '';
    return h('div', { className: 'muted' }, [
      h('h3', null, ['Resumo original (só para a curadoria)']),
      h('p', null, [article.sourceAbstract || 'Sem resumo do editor.']),
      h('p', null, ['Fontes consultadas: ' + sources + when + '.']),
    ]);
  }

  function editForm(article, draft) {
    var saving = ui.busy === 'save';
    return h('div', null, [
      textField('adm-lib-title', 'Título', 'title', draft, TITLE_MAX),
      textField('adm-lib-revista', 'Revista', 'journal', draft, 300),
      textField('adm-lib-abrev', 'Abreviação da revista', 'journalAbbrev', draft, 120),
      yearField(draft),
      textField('adm-lib-volume', 'Volume', 'volume', draft, 20),
      textField('adm-lib-numero', 'Número', 'issue', draft, 20),
      textField('adm-lib-paginas', 'Páginas', 'pages', draft, 30),
      textField('adm-lib-idioma', 'Idioma (duas letras, ex.: pt)', 'language', draft, 2),
      selectField('adm-lib-tipo', 'Tipo', 'type', typeOptions(), draft.type),
      selectField('adm-lib-licenca', 'Licença', 'license', licenseOptions(), draft.license),
      selectField('adm-lib-acesso', 'Acesso', 'oaStatus', oaOptions(), draft.oaStatus),
      topicsGroup(draft),
      clinicalField(draft),
      summaryField(draft),
      sourcesNode(article),
      btn('Salvar alterações', 'save', undefined, { disabled: saving }),
    ]);
  }

  function reasonBox() {
    var to = ui.reasonTo;
    return h('div', null, [
      h('label', { 'for': 'adm-lib-motivo' }, ['Motivo (3 a 300 caracteres)']),
      h('input', {
        type: 'text', id: 'adm-lib-motivo', maxlength: REASON_MAX, value: ui.reasonText,
        onInput: function (e) { setUi({ reasonText: e.target.value }); },
      }),
      ui.reasonError ? h('p', { role: 'alert', className: 'state-message' }, [ui.reasonError]) : null,
      btn(REASON_CONFIRM_LABELS[to] || 'Confirmar', 'reasonConfirm', to),
      btn('Cancelar', 'reasonCancel'),
    ]);
  }

  function transitionsNode() {
    var saving = ui.busy === 'save';
    var buttons = list(ui.allowed).map(function (to) {
      return btn(transitionLabel(to), 'transition', to, { disabled: saving });
    });
    return h('div', null, [
      h('h3', null, ['Mudar estado']),
      h('div', { className: 'actions-row' }, buttons),
      ui.reasonTo ? reasonBox() : null,
    ]);
  }

  function editNode() {
    var article = ui.article;
    if (!article) return h('p', { className: 'empty-state', role: 'status' }, ['Carregando…']);
    return h('div', null, [
      btn('← Voltar à fila', 'back'),
      h('h2', { id: TITLE_FOCUS_EDIT, tabindex: '-1' }, [article.title || 'Artigo sem título']),
      h('p', { className: 'muted' }, [identifierOf(article) + ' · ' + (STATE_NAMES[article.status] || article.status)]),
      ui.notice ? h('p', { role: 'status' }, [ui.notice]) : null,
      ui.warnings.length ? h('div', null, [h('h3', null, ['Avisos do cadastro']), h('ul', { className: 'muted' }, ui.warnings.map(function (w) { return h('li', null, [w]); }))]) : null,
      editForm(article, ui.draft),
      loteNode('editPanel', article),
      transitionsNode(),
    ]);
  }

  // ---------- Ciclo de vida ----------

  function wire() {
    if (wired) return;
    var box = root();
    if (!box) return;
    wired = true;
    dom().delegateActions(box, [ACTION]);
  }

  /** Abre a aba: entra na fila do estado atual. Sem sessão, não desenha nada. */
  function load(app) {
    if (app) appRef = app;
    if (!sessionToken(appRef) || !dom()) return;
    wire();
    selectTab('revisar');
  }

  /** Logout/expiração: descarta respostas pendentes e tira a curadoria da tela. */
  function reset() {
    requestId++;
    appRef = null;
    ui = freshUi();
    if (lote()) lote().reset();
    if (window.LaiftAdminLibraryPublicar) window.LaiftAdminLibraryPublicar.reset();
    var box = root();
    if (!box || !dom()) return;
    dom().clear(box);
    box.removeAttribute('aria-busy');
  }

  var api = { load: load, reset: reset, act: act };
  var pure = {
    reasonError: reasonError,
    draftFromArticle: draftFromArticle,
    changedFields: changedFields,
    importOutcome: importOutcome,
    statusFilters: statusFilters,
    typeOptions: typeOptions,
    licenseOptions: licenseOptions,
    transitionLabel: transitionLabel,
    isAdminIdentity: isAdminIdentity,
  };

  // Navegador: window.LaiftAdminLibrary. Node: module.exports, para scripts/admin-library.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftAdminLibrary = api;
  }
})();
