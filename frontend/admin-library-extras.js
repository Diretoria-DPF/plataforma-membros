/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-library-extras.js
 * Subabas "Sugestões", "Coleções", "Áreas" e "Equipe" do painel admin da Biblioteca
 * (CONTRATO-B2 §6). admin-library.js chama render(aba, caixa, app) e reset() no logout.
 * Só usa as actions de CONTRATO-B1 §4; a autorização real é do servidor (aqui "Equipe"
 * só aparece para admin, por conveniência).
 *
 * Script clássico, carregado antes de admin-library.js. Nada de innerHTML: nós por LaiftDom.h,
 * texto por textContent ou nó de texto, eventos por função em onClick/onChange/onInput (listener).
 */
(function () {
  'use strict';

  var SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var REASON_MIN = 3;
  var REASON_MAX = 300;
  var TITLE_MAX = 200;
  var DESCRIPTION_MAX = 500;
  var NAME_MAX = 120;
  var EMAIL_MAX = 254;
  var QUERY_MAX = 120;
  var ARTICLES_MAX = 200;
  var SHORT_ID_LENGTH = 8;
  var SLUG_HINT = 'Use só letras minúsculas, números e hífens no endereço (ex.: anatomia-basica).';
  var SORT_HINT = 'A ordem deve ser um número inteiro, igual ou maior que zero.';
  var SESSION_MESSAGE = 'Sua sessão expirou. Entre de novo para continuar.';
  var ERROR_FALLBACK = 'Tente novamente em instantes.';
  var ADMIN_ROLE = 'admin';
  var COLLECTION_STATES = ['rascunho', 'publicada'];
  var COLLECTION_STATE_LABELS = { rascunho: 'Rascunho', publicada: 'Publicada' };
  var STAFF_ROLE_LABELS = { curador: 'Curador', revisor_clinico: 'Revisor clínico' };
  var SUGGESTION_LABELS = {
    sugerido: 'Aguardando decisão',
    aceito: 'Aceita',
    recusado: 'Recusada',
    duplicado: 'Já estava na Biblioteca',
  };
  var IDENTIFIER_LABELS = { doi: 'DOI', pmid: 'PMID' };

  var sessionGen = 0; // muda em render() e reset(): descarta respostas de outra aba ou sessão
  var listGen = 0; // muda a cada recarga de lista: só a recarga mais recente é desenhada
  var box = null;
  var appRef = null;
  var editor = null; // estado do editor de coleção; existe só enquanto ele estiver aberto
  var editorSeq = 0;
  var areaTopics = [];

  // ---------- Funções puras (testadas em scripts/admin-library-extras.test.mjs) ----------

  function textOr(value) { return typeof value === 'string' ? value : ''; }

  function labelOf(map, key) {
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
  }

  function plural(count, one, many) {
    var n = Math.floor(Number(count)) || 0;
    return n + ' ' + (n === 1 ? one : many);
  }

  function errorMessage(res) {
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    return message || ERROR_FALLBACK;
  }

  function isValidSlug(value) { return typeof value === 'string' && SLUG_RE.test(value); }

  function isValidReason(value) {
    var text = textOr(value).trim();
    return text.length >= REASON_MIN && text.length <= REASON_MAX;
  }

  function isValidEmail(value) {
    var text = textOr(value).trim();
    return text.length <= EMAIL_MAX && EMAIL_RE.test(text);
  }

  /** Campo vazio vale 0; só inteiro maior ou igual a zero passa; o resto devolve null. */
  function parseSortOrder(text) {
    var raw = textOr(text).trim();
    if (raw === '') return 0;
    var number = Number(raw);
    return Number.isInteger(number) && number >= 0 ? number : null;
  }

  function isStaffRole(role) { return Object.prototype.hasOwnProperty.call(STAFF_ROLE_LABELS, role); }

  function isAdminIdentity(identity) { return !!identity && identity.role === ADMIN_ROLE; }

  /** Sugestão: só os campos do contrato. Quem sugeriu (nome, e-mail) nunca entra. */
  function normalizeSuggestion(item) {
    var s = item || {};
    return {
      id: textOr(s.id),
      identifierKind: labelOf(IDENTIFIER_LABELS, s.identifierKind),
      identifier: textOr(s.identifier),
      note: textOr(s.note),
      status: textOr(s.status),
      createdAt: textOr(s.createdAt),
      articleId: textOr(s.articleId),
    };
  }

  function suggestionStateLabel(status) { return labelOf(SUGGESTION_LABELS, status) || status; }

  function decisionNotice(decision, res) {
    if (decision === 'recusar') return 'Sugestão recusada.';
    var duplicate = !!res && !!res.suggestion && res.suggestion.status === 'duplicado';
    if (duplicate) return 'Este artigo já estava na Biblioteca. A sugestão foi marcada como duplicada.';
    return 'Sugestão aceita. Os dados do artigo foram buscados e ele está na triagem.';
  }

  function normalizeCollection(item) {
    var c = item || {};
    return {
      id: textOr(c.id),
      slug: textOr(c.slug),
      title: textOr(c.title),
      description: textOr(c.description),
      status: textOr(c.status),
      sortOrder: Number(c.sortOrder) || 0,
      version: c.version,
      articleIds: Array.isArray(c.articleIds)
        ? c.articleIds.filter(function (id) { return typeof id === 'string'; })
        : [],
    };
  }

  function collectionStateLabel(status) { return labelOf(COLLECTION_STATE_LABELS, status) || status; }

  function validateCollection(draft) {
    if (!isValidSlug(draft.slug)) return SLUG_HINT;
    if (!draft.title) return 'Informe o título da coleção.';
    if (draft.title.length > TITLE_MAX) return 'O título tem no máximo 200 caracteres.';
    if (draft.description.length > DESCRIPTION_MAX) return 'A descrição tem no máximo 500 caracteres.';
    if (draft.sortOrder === null) return SORT_HINT;
    if (COLLECTION_STATES.indexOf(draft.status) < 0) return 'Escolha se a coleção está em rascunho ou publicada.';
    if (draft.articleIds.length > ARTICLES_MAX) return 'Uma coleção aceita até 200 artigos.';
    return null;
  }

  /** Payload de SaveCollection: id e version só ao editar (version é o controle de concorrência). */
  function collectionPayload(draft, editing) {
    var base = {
      slug: draft.slug,
      title: draft.title,
      description: draft.description,
      status: draft.status,
      sortOrder: draft.sortOrder,
      articleIds: draft.articleIds.slice(),
    };
    return editing ? Object.assign({ id: editing.id, version: editing.version }, base) : base;
  }

  /** Devolve uma lista nova: marcar acrescenta ao fim (ordem de marcação); desmarcar tira. */
  function toggleSelection(ids, id, selected) {
    if (!selected) return ids.filter(function (current) { return current !== id; });
    return ids.indexOf(id) >= 0 ? ids.slice() : ids.concat([id]);
  }

  function foldText(value) {
    return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  }

  function matchesQuery(item, query) {
    var terms = foldText(query).split(/\s+/).filter(Boolean);
    var haystack = foldText([item.title, item.journal, item.year].join(' '));
    return terms.every(function (term) { return haystack.indexOf(term) >= 0; });
  }

  function normalizeCandidate(item) {
    var a = item || {};
    return {
      id: textOr(a.id),
      title: textOr(a.title),
      journal: textOr(a.journal),
      year: a.year === null || a.year === undefined ? '' : String(a.year),
    };
  }

  function candidateText(c) {
    return [c.title, c.journal, c.year].filter(Boolean).join(' · ');
  }

  function normalizeTopic(item) {
    var t = item || {};
    if (typeof t.slug !== 'string') return null;
    return { slug: t.slug, name: textOr(t.name), sortOrder: Number(t.sortOrder) || 0 };
  }

  function validateArea(draft) {
    if (!isValidSlug(draft.slug)) return SLUG_HINT;
    if (!draft.name) return 'Informe o nome da área.';
    if (draft.name.length > NAME_MAX) return 'O nome tem no máximo 120 caracteres.';
    if (draft.sortOrder === null) return SORT_HINT;
    return null;
  }

  function normalizeStaff(item) {
    var s = item || {};
    return {
      profileId: textOr(s.profileId),
      fullName: textOr(s.fullName),
      role: textOr(s.role),
      grantedAt: textOr(s.grantedAt),
    };
  }

  function staffRoleLabel(role) { return labelOf(STAFF_ROLE_LABELS, role) || role; }

  // ---------- Sessão, pedidos e recarga ----------

  function dom() { return window.LaiftDom; }

  function h(tag, attrs, children) { return dom().h(tag, attrs, children); }

  function formatDate(value) {
    if (!value) return '';
    return appRef && appRef.formatDate ? appRef.formatDate(value) : String(value);
  }

  function sessionToken() {
    var state = appRef && appRef.getState ? appRef.getState() : null;
    return state ? state.sessionToken : null;
  }

  function currentIdentity() {
    return appRef && appRef.getIdentity ? appRef.getIdentity() : null;
  }

  /**
   * Pedido à API. A resposta só é usada se a aba e a sessão ainda são as mesmas
   * (render() e reset() mudam sessionGen). Falha de rede vira mensagem, nunca silêncio.
   */
  function answer(name, input, onOk, onFail) {
    var session = sessionGen;
    var token = sessionToken();
    var request = token
      ? appRef.callApi(name, token, input)
      : Promise.resolve({ success: false, message: SESSION_MESSAGE });
    request.catch(function () { return { success: false }; }).then(function (res) {
      if (session !== sessionGen) return;
      if (res && res.success === true) onOk(res);
      else onFail(res || {});
    });
  }

  /** Recarga de lista: além da guarda de sessão, só a recarga mais recente é desenhada. */
  function loadList(name, input, onOk, onFail) {
    var mine = ++listGen;
    answer(name, input, function (res) {
      if (mine === listGen) onOk(res);
    }, function (res) {
      if (mine === listGen) onFail(res);
    });
  }

  function mount(nodes, busy) {
    if (!box) return;
    dom().clear(box);
    nodes.forEach(function (node) { box.appendChild(node); });
    if (busy) box.setAttribute('aria-busy', 'true');
    else box.removeAttribute('aria-busy');
  }

  function loadingNodes(text) { return [h('p', { className: 'muted', role: 'status' }, [text])]; }

  function noticeNode(text) { return h('p', { className: 'muted', role: 'status' }, [text]); }

  function errorNodes(title, res, retry) {
    return [h('div', { className: 'state state-error', role: 'alert', tabindex: '-1' }, [
      h('p', { className: 'state-title' }, [title]),
      h('p', { className: 'state-message' }, [errorMessage(res)]),
      h('button', { type: 'button', className: 'secondary', onClick: function () { retry(); } }, ['Tentar de novo']),
    ])];
  }

  function labeled(text, id, control) {
    return h('div', null, [h('label', { for: id }, [text]), control]);
  }

  function alertNode() { return h('p', { className: 'state-message', role: 'alert' }); }

  // ---------- Sugestões ----------

  function showSuggestions(notice) {
    mount(loadingNodes('Carregando sugestões…'), true);
    loadList('apiAdminLearnLibraryListSuggestions', { status: 'sugerido' }, function (res) {
      mount(suggestionNodes(res.items, notice), false);
    }, function (res) {
      mount(errorNodes('Não foi possível carregar as sugestões.', res, function () { showSuggestions(null); }), false);
    });
  }

  function suggestionNodes(items, notice) {
    var rows = (Array.isArray(items) ? items : []).map(function (item) {
      return suggestionRow(normalizeSuggestion(item));
    });
    var nodes = [h('h2', null, ['Sugestões de artigos'])];
    if (notice) nodes.push(noticeNode(notice));
    if (!rows.length) nodes.push(h('p', { className: 'empty-state' }, ['Nenhuma sugestão aguardando decisão.']));
    return nodes.concat(rows);
  }

  function decideSuggestion(id, decision, reason, button, showError) {
    button.disabled = true;
    var input = decision === 'recusar' ? { id: id, decision: decision, reason: reason } : { id: id, decision: decision };
    answer('apiAdminLearnLibraryDecideSuggestion', input, function (res) {
      showSuggestions(decisionNotice(decision, res));
    }, function (res) {
      button.disabled = false;
      showError(errorMessage(res));
    });
  }

  function refuseSuggestion(id, reasonInput, button, rowError) {
    var reason = reasonInput.value.trim();
    if (!isValidReason(reason)) {
      rowError.textContent = 'Informe o motivo da recusa (de 3 a 300 caracteres).';
      return;
    }
    rowError.textContent = '';
    decideSuggestion(id, 'recusar', reason, button, function (message) { rowError.textContent = message; });
  }

  function suggestionRow(s) {
    var reasonId = 'adm-lib-motivo-' + s.id;
    var reasonInput = h('input', { type: 'text', id: reasonId, maxlength: REASON_MAX, autocomplete: 'off' });
    var rowError = alertNode();
    var refuseButton = h('button', {
      type: 'button',
      className: 'secondary',
      onClick: function () { refuseSuggestion(s.id, reasonInput, refuseButton, rowError); },
    }, ['Confirmar recusa']);
    var reasonForm = h('div', { className: 'library-filtros', hidden: true }, [
      labeled('Motivo da recusa (3 a 300 caracteres)', reasonId, reasonInput),
      refuseButton,
    ]);
    var acceptButton = h('button', {
      type: 'button',
      onClick: function () {
        decideSuggestion(s.id, 'aceitar', '', acceptButton, function (message) { rowError.textContent = message; });
      },
    }, ['Aceitar e buscar dados']);
    var toggleButton = h('button', {
      type: 'button',
      className: 'secondary',
      onClick: function () {
        reasonForm.hidden = !reasonForm.hidden;
        if (!reasonForm.hidden) reasonInput.focus();
      },
    }, ['Recusar']);
    var title = (s.identifierKind ? s.identifierKind + ' ' : '') + (s.identifier || 'sem identificador');
    return h('div', { className: 'list-item' }, [
      h('strong', null, [title]),
      h('div', { className: 'meta-row' }, [
        s.createdAt ? h('span', null, ['Sugerido em ' + formatDate(s.createdAt)]) : null,
        h('span', null, [suggestionStateLabel(s.status)]),
      ]),
      s.note ? h('p', { className: 'muted' }, ['Observação: ' + s.note]) : null,
      h('div', { className: 'actions-row' }, [acceptButton, toggleButton]),
      reasonForm,
      rowError,
    ]);
  }

  // ---------- Coleções ----------

  function showCollections(notice) {
    editor = null;
    mount(loadingNodes('Carregando coleções…'), true);
    loadList('apiAdminLearnLibraryListCollections', {}, function (res) {
      mount(collectionListNodes(res.collections, notice), false);
    }, function (res) {
      mount(errorNodes('Não foi possível carregar as coleções.', res, function () { showCollections(null); }), false);
    });
  }

  function collectionListNodes(collections, notice) {
    var items = (Array.isArray(collections) ? collections : []).map(normalizeCollection);
    var nodes = [
      h('h2', null, ['Coleções']),
      h('div', { className: 'actions-row' }, [
        h('button', { type: 'button', onClick: function () { openEditor(null); } }, ['Nova coleção']),
      ]),
    ];
    if (notice) nodes.push(noticeNode(notice));
    if (!items.length) nodes.push(h('p', { className: 'empty-state' }, ['Ainda não há coleções.']));
    return nodes.concat(items.map(collectionRow));
  }

  function collectionRow(c) {
    return h('div', { className: 'list-item' }, [
      h('strong', null, [c.title || 'Sem título']),
      h('div', { className: 'meta-row' }, [
        h('span', null, [plural(c.articleIds.length, 'artigo', 'artigos')]),
        h('span', null, [collectionStateLabel(c.status)]),
        h('span', null, ['Ordem ' + c.sortOrder]),
      ]),
      h('div', { className: 'actions-row' }, [
        h('button', { type: 'button', className: 'secondary', onClick: function () { openEditor(c); } }, ['Editar']),
      ]),
    ]);
  }

  function openEditor(collection) {
    editorSeq++;
    editor = {
      seq: editorSeq,
      editing: collection || null,
      selected: collection ? collection.articleIds.slice() : [],
      candidates: [],
      query: '',
      refs: null,
    };
    mount(editorNodes(), false);
    loadCandidates(editor.seq);
  }

  function isCurrentEditor(seq) { return !!editor && editor.seq === seq; }

  function loadCandidates(seq) {
    answer('apiAdminLearnLibraryListQueue', { status: 'publicado' }, function (res) {
      if (!isCurrentEditor(seq)) return;
      editor = Object.assign({}, editor, {
        candidates: (Array.isArray(res.items) ? res.items : []).map(normalizeCandidate),
      });
      renderCandidates();
    }, function (res) {
      if (!isCurrentEditor(seq)) return;
      editor.refs.candidateStatus.textContent = errorMessage(res);
    });
  }

  function editorControls(c) {
    var fields = {
      title: h('input', { type: 'text', id: 'adm-col-titulo', maxlength: TITLE_MAX, autocomplete: 'off' }),
      slug: h('input', { type: 'text', id: 'adm-col-slug', maxlength: 80, autocomplete: 'off' }),
      description: h('textarea', { id: 'adm-col-descricao', maxlength: DESCRIPTION_MAX, rows: 3 }),
      status: h('select', { id: 'adm-col-estado' }, COLLECTION_STATES.map(function (state) {
        return h('option', { value: state }, [collectionStateLabel(state)]);
      })),
      sortOrder: h('input', { type: 'number', id: 'adm-col-ordem', min: 0, step: 1 }),
      search: h('input', {
        type: 'search',
        id: 'adm-col-busca',
        maxlength: QUERY_MAX,
        autocomplete: 'off',
        onInput: function (evt) { setQuery(evt.target.value); },
      }),
    };
    fields.title.value = c.title || '';
    fields.slug.value = c.slug || '';
    fields.description.value = c.description || '';
    fields.status.value = c.status || 'rascunho';
    fields.sortOrder.value = String(c.sortOrder || 0);
    return fields;
  }

  function editorNodes() {
    var c = editor.editing || {};
    var fields = editorControls(c);
    var refs = Object.assign(fields, {
      candidateStatus: h('p', { className: 'muted', role: 'status' }, ['Carregando artigos…']),
      candidateBox: h('div', { id: 'adm-col-candidatos' }),
      orderList: h('ol', { id: 'adm-col-ordem-lista' }),
      error: alertNode(),
      saveButton: h('button', { type: 'button', onClick: saveEditor }, ['Salvar coleção']),
    });
    editor = Object.assign({}, editor, { refs: refs });
    renderOrder();
    return [
      h('h2', null, [editor.editing ? 'Editar coleção' : 'Nova coleção']),
      h('div', { className: 'actions-row' }, [
        h('button', { type: 'button', className: 'secondary', onClick: function () { showCollections(null); } }, ['Voltar às coleções']),
      ]),
      labeled('Título', 'adm-col-titulo', fields.title),
      labeled('Endereço (slug)', 'adm-col-slug', fields.slug),
      h('p', { className: 'muted' }, [SLUG_HINT]),
      labeled('Descrição', 'adm-col-descricao', fields.description),
      labeled('Estado', 'adm-col-estado', fields.status),
      labeled('Ordem', 'adm-col-ordem', fields.sortOrder),
      h('h3', null, ['Artigos publicados']),
      labeled('Buscar artigos', 'adm-col-busca', fields.search),
      refs.candidateStatus,
      refs.candidateBox,
      h('h3', null, ['Artigos na coleção, na ordem em que foram marcados']),
      refs.orderList,
      refs.error,
      h('div', { className: 'actions-row' }, [refs.saveButton]),
    ];
  }

  function titleOfArticle(id) {
    var found = editor.candidates.filter(function (c) { return c.id === id; })[0];
    return found ? found.title : 'Artigo ' + id.slice(0, SHORT_ID_LENGTH) + ' (fora da lista carregada)';
  }

  function renderOrder() {
    var list = editor.refs.orderList;
    dom().clear(list);
    if (!editor.selected.length) {
      list.appendChild(h('li', { className: 'muted' }, ['Nenhum artigo escolhido.']));
      return;
    }
    editor.selected.forEach(function (id, index) {
      list.appendChild(h('li', null, [(index + 1) + '. ' + titleOfArticle(id)]));
    });
  }

  function candidateRow(c) {
    var checked = editor.selected.indexOf(c.id) >= 0;
    var input = h('input', {
      type: 'checkbox',
      checked: checked,
      onChange: function () { toggleCandidate(c.id, input.checked); },
    });
    return h('div', { className: 'list-item' }, [h('label', null, [input, ' ' + candidateText(c)])]);
  }

  function renderCandidates() {
    var refs = editor.refs;
    var shown = editor.candidates.filter(function (c) { return matchesQuery(c, editor.query); });
    dom().clear(refs.candidateBox);
    refs.candidateStatus.textContent = shown.length
      ? plural(shown.length, 'artigo encontrado', 'artigos encontrados')
      : 'Nenhum artigo encontrado.';
    shown.forEach(function (c) { refs.candidateBox.appendChild(candidateRow(c)); });
  }

  function toggleCandidate(id, selected) {
    if (!editor) return;
    editor = Object.assign({}, editor, { selected: toggleSelection(editor.selected, id, selected) });
    renderOrder();
  }

  function setQuery(value) {
    if (!editor) return;
    editor = Object.assign({}, editor, { query: textOr(value) });
    renderCandidates();
  }

  function readDraft() {
    var refs = editor.refs;
    return {
      slug: refs.slug.value.trim(),
      title: refs.title.value.trim(),
      description: refs.description.value.trim(),
      status: refs.status.value,
      sortOrder: parseSortOrder(refs.sortOrder.value),
      articleIds: editor.selected.slice(),
    };
  }

  function saveEditor() {
    if (!editor) return;
    var refs = editor.refs;
    var draft = readDraft();
    var problem = validateCollection(draft);
    if (problem) {
      refs.error.textContent = problem;
      return;
    }
    refs.error.textContent = '';
    refs.saveButton.disabled = true;
    answer('apiAdminLearnLibrarySaveCollection', collectionPayload(draft, editor.editing), function () {
      showCollections('Coleção salva.');
    }, function (res) {
      refs.saveButton.disabled = false;
      refs.error.textContent = errorMessage(res);
    });
  }

  // ---------- Áreas ----------

  function showAreas(notice) {
    mount(loadingNodes('Carregando áreas…'), true);
    loadList('apiAdminLearnLibraryListQueue', {}, function (res) {
      areaTopics = (Array.isArray(res.topics) ? res.topics : []).map(normalizeTopic).filter(Boolean);
      renderAreas(null, notice);
    }, function (res) {
      mount(errorNodes('Não foi possível carregar as áreas.', res, function () { showAreas(null); }), false);
    });
  }

  function areaRow(t) {
    return h('div', { className: 'list-item' }, [
      h('strong', null, [t.name || t.slug]),
      h('div', { className: 'meta-row' }, [
        h('span', null, [t.slug]),
        h('span', null, ['Ordem ' + t.sortOrder]),
      ]),
      h('div', { className: 'actions-row' }, [
        h('button', { type: 'button', className: 'secondary', onClick: function () { renderAreas(t, null); } }, ['Editar']),
      ]),
    ]);
  }

  /** Desenha a lista e o formulário; "Editar" reaproveita a lista já carregada (sem nova chamada). */
  function renderAreas(initial, notice) {
    var nodes = [h('h2', null, ['Áreas'])];
    if (notice) nodes.push(noticeNode(notice));
    if (!areaTopics.length) nodes.push(h('p', { className: 'empty-state' }, ['Ainda não há áreas cadastradas.']));
    mount(nodes.concat(areaTopics.map(areaRow), areaForm(initial)), false);
  }

  function saveArea(refs) {
    var draft = {
      slug: refs.slug.value.trim(),
      name: refs.name.value.trim(),
      sortOrder: parseSortOrder(refs.order.value),
    };
    var problem = validateArea(draft);
    if (problem) {
      refs.error.textContent = problem;
      return;
    }
    refs.error.textContent = '';
    refs.button.disabled = true;
    answer('apiAdminLearnLibrarySaveTopic', draft, function () {
      showAreas('Área salva.');
    }, function (res) {
      refs.button.disabled = false;
      refs.error.textContent = errorMessage(res);
    });
  }

  function areaForm(initial) {
    var current = initial || { slug: '', name: '', sortOrder: 0 };
    var refs = {
      slug: h('input', { type: 'text', id: 'adm-area-slug', maxlength: 80, autocomplete: 'off' }),
      name: h('input', { type: 'text', id: 'adm-area-nome', maxlength: NAME_MAX, autocomplete: 'off' }),
      order: h('input', { type: 'number', id: 'adm-area-ordem', min: 0, step: 1 }),
      error: alertNode(),
      button: null,
    };
    refs.slug.value = current.slug;
    refs.name.value = current.name;
    refs.order.value = String(current.sortOrder || 0);
    refs.button = h('button', { type: 'button', onClick: function () { saveArea(refs); } }, ['Salvar área']);
    return [
      h('h3', null, ['Salvar área (pelo endereço)']),
      h('p', { className: 'muted' }, [SLUG_HINT]),
      labeled('Endereço (slug)', 'adm-area-slug', refs.slug),
      labeled('Nome', 'adm-area-nome', refs.name),
      labeled('Ordem', 'adm-area-ordem', refs.order),
      refs.error,
      h('div', { className: 'actions-row' }, [refs.button]),
    ];
  }

  // ---------- Equipe ----------

  function showStaff(notice) {
    if (!isAdminIdentity(currentIdentity())) {
      mount([h('p', { className: 'empty-state' }, ['Só administradores gerenciam a equipe da Biblioteca.'])], false);
      return;
    }
    mount(loadingNodes('Carregando a equipe…'), true);
    loadList('apiAdminLearnLibraryListStaff', {}, function (res) {
      renderStaff(res.staff, notice);
    }, function (res) {
      mount(errorNodes('Não foi possível carregar a equipe.', res, function () { showStaff(null); }), false);
    });
  }

  function staffRow(p) {
    return h('div', { className: 'list-item' }, [
      h('strong', null, [p.fullName || 'Sem nome']),
      h('div', { className: 'meta-row' }, [
        h('span', null, [staffRoleLabel(p.role)]),
        p.grantedAt ? h('span', null, ['Desde ' + formatDate(p.grantedAt)]) : null,
      ]),
    ]);
  }

  function renderStaff(staffList, notice) {
    var rows = (Array.isArray(staffList) ? staffList : []).map(normalizeStaff).map(staffRow);
    var nodes = [h('h2', null, ['Equipe da Biblioteca'])];
    if (notice) nodes.push(noticeNode(notice));
    if (!rows.length) nodes.push(h('p', { className: 'empty-state' }, ['Ainda não há pessoas com papel na Biblioteca.']));
    mount(nodes.concat(rows, staffForm()), false);
  }

  function changeStaff(emailInput, roleSelect, grant, errorNode) {
    var address = emailInput.value.trim();
    var role = roleSelect.value;
    if (!isValidEmail(address)) {
      errorNode.textContent = 'Informe o e-mail da conta da pessoa.';
      return;
    }
    if (!isStaffRole(role)) {
      errorNode.textContent = 'Escolha o papel da pessoa.';
      return;
    }
    errorNode.textContent = '';
    answer('apiAdminLearnLibrarySetStaff', { email: address, role: role, grant: grant }, function (res) {
      renderStaff(res.staff, grant ? 'Acesso dado.' : 'Acesso retirado.');
    }, function (res) {
      errorNode.textContent = errorMessage(res);
    });
  }

  function staffForm() {
    var email = h('input', { type: 'email', id: 'adm-equipe-email', maxlength: EMAIL_MAX, autocomplete: 'off' });
    var role = h('select', { id: 'adm-equipe-papel' }, Object.keys(STAFF_ROLE_LABELS).map(function (key) {
      return h('option', { value: key }, [STAFF_ROLE_LABELS[key]]);
    }));
    var error = alertNode();
    return [
      h('h3', null, ['Dar ou tirar acesso']),
      labeled('E-mail da conta', 'adm-equipe-email', email),
      labeled('Papel', 'adm-equipe-papel', role),
      error,
      h('div', { className: 'actions-row' }, [
        h('button', { type: 'button', onClick: function () { changeStaff(email, role, true, error); } }, ['Dar acesso']),
        h('button', { type: 'button', className: 'secondary', onClick: function () { changeStaff(email, role, false, error); } }, ['Tirar acesso']),
      ]),
    ];
  }

  // ---------- Entrada pública ----------

  var TAB_VIEWS = {
    sugestoes: function () { showSuggestions(null); },
    colecoes: function () { showCollections(null); },
    areas: function () { showAreas(null); },
    equipe: function () { showStaff(null); },
  };

  /** Troca de aba: descarta todas as respostas pendentes e desenha a aba pedida. */
  function render(tab, container, app) {
    if (!dom() || !container) return;
    sessionGen++;
    listGen++;
    editor = null;
    box = container;
    appRef = app || null;
    var view = Object.prototype.hasOwnProperty.call(TAB_VIEWS, tab) ? TAB_VIEWS[tab] : null;
    if (!view) {
      mount([h('p', { className: 'empty-state' }, ['Esta aba não existe.'])], false);
      return;
    }
    view();
  }

  /** Logout ou sessão expirada: descarta respostas pendentes e esvazia a caixa. */
  function reset() {
    sessionGen++;
    listGen++;
    editor = null;
    areaTopics = [];
    appRef = null;
    if (box && dom()) {
      dom().clear(box);
      box.removeAttribute('aria-busy');
    }
    box = null;
  }

  var api = { render: render, reset: reset };
  var pure = {
    isValidSlug: isValidSlug,
    isValidReason: isValidReason,
    isValidEmail: isValidEmail,
    parseSortOrder: parseSortOrder,
    normalizeSuggestion: normalizeSuggestion,
    suggestionStateLabel: suggestionStateLabel,
    decisionNotice: decisionNotice,
    normalizeCollection: normalizeCollection,
    collectionStateLabel: collectionStateLabel,
    validateCollection: validateCollection,
    collectionPayload: collectionPayload,
    toggleSelection: toggleSelection,
    matchesQuery: matchesQuery,
    normalizeCandidate: normalizeCandidate,
    normalizeTopic: normalizeTopic,
    validateArea: validateArea,
    normalizeStaff: normalizeStaff,
    staffRoleLabel: staffRoleLabel,
    isAdminIdentity: isAdminIdentity,
    errorMessage: errorMessage,
    plural: plural,
  };

  // Navegador: window.LaiftAdminLibraryExtras. Node: module.exports, para scripts/admin-library-extras.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftAdminLibraryExtras = api;
  }
})();
