/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/library.js
 * Painel "Biblioteca" do membro (CONTRATO-B2 §3): busca com espera, filtros, favoritos,
 * abas Catálogo/Favoritos/Coleções e sugestão (flag library_member_suggest). A ficha é de
 * library-detail.js. Script clássico: loadPanel pelo PANEL_LOADERS, reset no logout. Nós por
 * LaiftDom.h, ações por data-action (LaiftDom.delegateActions), só actions apiLearnLibrary*.
 * A autorização real é do servidor; esconder controles é conveniência.
 */
(function () {
  'use strict';

  var ROOT_ID = 'library-root';
  var PAGE_SIZE = 20;
  var SEARCH_MIN_CHARS = 2;
  var SEARCH_DELAY_MS = 400;
  var QUERY_MAX = 120;
  var SUGGEST_MAX = 300;
  var YEAR_PATTERN = /^\d{4}$/;
  var SUGGEST_FLAG_ATTR = 'data-flag-library-member-suggest';
  var CATALOG_URL = '/biblioteca';
  var DEFAULT_ERROR = 'Tente novamente em instantes.';
  var TYPE_KEYS = ['artigo', 'revisao', 'revisao_sistematica', 'meta_analise', 'ensaio_clinico', 'relato_caso', 'diretriz', 'outro'];
  var LANGUAGE_FILTERS = ['pt', 'outros'];
  var ACTION = {
    open: 'LaiftLibrary.open',
    favorite: 'LaiftLibrary.toggleFavorite',
    reload: 'LaiftLibrary.reload',
    clear: 'LaiftLibrary.clearFilters',
    more: 'LaiftLibrary.loadMore',
    tab: 'LaiftLibrary.setTab',
    search: 'LaiftLibrary.searchInput',
    filter: 'LaiftLibrary.filterChange',
    collection: 'LaiftLibrary.openCollection',
    collections: 'LaiftLibrary.showCollections',
    suggestToggle: 'LaiftLibrary.toggleSuggest',
    suggestNote: 'LaiftLibrary.noteInput',
    suggestSend: 'LaiftLibrary.sendSuggestion',
  };
  var MESSAGE = {
    visitor: 'Resumo, favoritos e coleções são para membros.',
    unavailable: 'A Biblioteca ainda não está disponível.',
    noResults: 'Nenhum artigo encontrado.',
    noFavorites: 'Você ainda não salvou artigos.',
    noCollections: 'Ainda não há coleções.',
    noCollectionItems: 'Esta coleção ainda não tem artigos.',
    errorTitle: 'Não foi possível carregar a Biblioteca.',
    retry: 'Tentar de novo',
    clear: 'Limpar filtros',
    publicCatalog: 'Ver o catálogo público',
    saveFavorite: 'Salvar nos favoritos',
    removeFavorite: 'Remover dos favoritos',
    suggestSent: 'Sugestão enviada. A Diretoria Científica vai avaliar.',
    suggestMissing: 'Informe o DOI, o PMID ou o link do artigo.',
    back: '← Voltar às coleções',
    loadMore: 'Carregar mais',
    suggestButton: 'Sugerir artigo',
    suggestSubmit: 'Enviar sugestão',
    search: 'Buscar',
  };
  var TABS = [
    { id: 'catalogo', label: 'Catálogo', membersOnly: false },
    { id: 'favoritos', label: 'Favoritos', membersOnly: true },
    { id: 'colecoes', label: 'Coleções', membersOnly: true },
  ];
  var ALLOWED_ACTIONS = Object.keys(ACTION).map(function (key) { return ACTION[key]; });

  // ---------- Funções puras (testadas em scripts/library.test.mjs) ----------

  function trimmed(raw, max) {
    return String(raw === undefined || raw === null ? '' : raw).trim().slice(0, max);
  }

  function cleanQuery(raw) {
    return trimmed(String(raw === undefined || raw === null ? '' : raw).replace(/\s+/g, ' '), QUERY_MAX);
  }

  function yearOf(value) {
    var text = trimmed(value, 4);
    return YEAR_PATTERN.test(text) ? text : '';
  }

  function isMemberRole(role) {
    return typeof role === 'string' && role !== '' && role !== 'visitor';
  }

  function canSuggest(role, flagOn) {
    return flagOn === true && isMemberRole(role);
  }

  function statusLabel(total) {
    var count = Math.max(0, Math.floor(Number(total) || 0));
    return count === 1 ? '1 artigo' : count.toLocaleString('pt-BR') + ' artigos';
  }

  function activeFilterCount(query) {
    var q = query || {};
    var filled = [q.topic, q.type, languageOf(q.language), q.yearFrom, q.yearTo].filter(Boolean).length;
    return filled + (q.openAccess ? 1 : 0);
  }

  function languageOf(value) {
    return LANGUAGE_FILTERS.indexOf(value) >= 0 ? value : '';
  }

  function filterSummaryLabel(count) {
    return count > 0 ? 'Filtros (' + count + ')' : 'Filtros';
  }

  function buildSearchInput(query, page) {
    var input = { page: page || 1, pageSize: PAGE_SIZE };
    var q = cleanQuery(query.q);
    if (q) input.q = q;
    if (query.topic) input.topic = query.topic;
    if (query.type) input.type = query.type;
    var language = languageOf(query.language);
    if (language) input.language = language;
    var from = yearOf(query.yearFrom);
    if (from) input.yearFrom = Number(from);
    var to = yearOf(query.yearTo);
    if (to) input.yearTo = Number(to);
    if (query.openAccess) input.openAccess = true;
    return input;
  }

  function initialsOf(given) {
    return String(given || '').split(/[\s-]+/).filter(Boolean)
      .map(function (part) { return part.charAt(0).toUpperCase(); }).join('');
  }

  function authorsLine(item) {
    var list = Array.isArray(item.authors) ? item.authors : [];
    var names = list.map(function (a) {
      return [a.family, initialsOf(a.given)].filter(Boolean).join(' ');
    }).filter(Boolean);
    var line = names.join(', ');
    return item.authorCount > list.length && line ? line + ' et al.' : line;
  }

  function metaLine(item) {
    return [authorsLine(item), item.journal, item.year].filter(Boolean).join(' · ');
  }

  function badgesOf(item, topics) {
    var known = Array.isArray(topics) ? topics : [];
    var areas = (item.topics || []).map(function (slug) {
      var match = known.filter(function (t) { return t.slug === slug; })[0];
      return match ? match.name : '';
    });
    var extra = [];
    if (item.openAccess) extra.push('Acesso aberto');
    if (item.hasSummary) extra.push('Com resumo');
    return [typeLabel(item.type), languageLabel(item.language)].concat(areas, extra).filter(Boolean);
  }

  function favoriteLabel(isFavorite) {
    return isFavorite ? MESSAGE.removeFavorite : MESSAGE.saveFavorite;
  }

  function failureOf(res) {
    if (res && res.disabled) return { kind: 'disabled', message: MESSAGE.unavailable };
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    if (res && res.networkUnavailable) return { kind: 'network', message: DEFAULT_ERROR };
    return { kind: 'error', message: message || DEFAULT_ERROR };
  }

  function hasMore(total, loaded) {
    return loaded < total;
  }

  function suggestionPayload(identifier, note) {
    var id = trimmed(identifier, SUGGEST_MAX);
    if (!id) return null;
    var payload = { identifier: id };
    var text = trimmed(note, SUGGEST_MAX);
    if (text) payload.note = text;
    return payload;
  }

  function typeLabel(key) {
    var cite = window.LaiftLibraryCite;
    return cite && cite.typeLabel ? cite.typeLabel(key) : '';
  }

  function languageLabel(key) {
    var cite = window.LaiftLibraryCite;
    return cite && cite.languageLabel ? cite.languageLabel(key) : '';
  }

  // ---------- Estado (trocado por inteiro a cada mudança) ----------

  var EMPTY_QUERY = { q: '', topic: '', type: '', language: '', yearFrom: '', yearTo: '', openAccess: false };
  var state = initialState();
  var refs = {};
  var timer = null;
  var requestSeq = 0;
  var latestRequest = 0;
  var wiredRoot = null;

  function initialState() {
    return {
      member: false, suggest: false, suggestOpen: false, tab: 'catalogo', query: EMPTY_QUERY,
      page: 1, items: [], total: 0, topics: [], status: 'idle', failure: null,
      collections: [], collection: null,
    };
  }

  function setState(patch) {
    state = Object.assign({}, state, patch);
  }

  function beginRequest() {
    requestSeq += 1;
    latestRequest = requestSeq;
    return latestRequest;
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  // ---------- Acesso ao app (window.App, sem nada próprio) ----------

  function el(tag, attrs, children) {
    return window.LaiftDom.h(tag, attrs, children);
  }

  function box() {
    return document.getElementById(ROOT_ID);
  }

  function identityRole() {
    var app = window.App;
    var identity = app && app.getIdentity ? app.getIdentity() : null;
    return identity ? identity.role : '';
  }

  function call(name, input) {
    var app = window.App;
    if (!app || !app.callApi) return Promise.resolve({ success: false, message: DEFAULT_ERROR });
    var session = app.getState ? app.getState() : null;
    return Promise.resolve(app.callApi(name, session && session.sessionToken, input || {}))
      .catch(function () { return { success: false, networkUnavailable: true }; });
  }

  function setBusy(node, busy) {
    if (busy) node.setAttribute('aria-busy', 'true');
    else node.removeAttribute('aria-busy');
  }

  // ---------- Montagem ----------

  function wire() {
    var root = box();
    if (!root || wiredRoot === root) return;
    window.LaiftDom.delegateActions(root, ALLOWED_ACTIONS);
    wiredRoot = root;
  }

  function clearButton() {
    return el('button', { type: 'button', className: 'secondary', 'data-action': ACTION.clear, text: MESSAGE.clear });
  }

  function suggestNodes() {
    refs.suggestToggle = el('button', {
      type: 'button',
      className: 'secondary',
      'aria-expanded': String(state.suggestOpen),
      'aria-controls': 'library-sugestao',
      'data-action': ACTION.suggestToggle,
      text: MESSAGE.suggestButton,
    });
    refs.suggestId = el('input', { type: 'text', id: 'library-sugerir-id', maxlength: SUGGEST_MAX, autocomplete: 'off' });
    refs.suggestNote = el('textarea', { id: 'library-sugerir-nota', maxlength: SUGGEST_MAX, 'data-action-input': ACTION.suggestNote });
    refs.noteCount = el('p', { className: 'muted', text: '0/' + SUGGEST_MAX });
    refs.suggestSend = el('button', { type: 'button', className: 'secondary', 'data-action': ACTION.suggestSend, text: MESSAGE.suggestSubmit });
    refs.suggestStatus = el('p', { className: 'library-sugestao-status', role: 'status', 'aria-live': 'polite' });
    refs.suggestForm = el('div', { id: 'library-sugestao', className: 'library-sugestao', hidden: !state.suggestOpen }, [
      el('label', { for: 'library-sugerir-id', text: 'DOI, PMID ou link do doi.org ou do PubMed' }),
      refs.suggestId,
      el('label', { for: 'library-sugerir-nota', text: 'Por que este artigo? (opcional)' }),
      refs.suggestNote,
      refs.noteCount,
      refs.suggestSend,
      refs.suggestStatus,
    ]);
    return [refs.suggestToggle, refs.suggestForm];
  }

  function headerNodes() {
    var nodes = [
      el('h2', { text: 'Biblioteca LAIFT' }),
      el('p', { className: 'muted', text: 'Artigos escolhidos pela Diretoria Científica.' }),
    ];
    if (!state.member) nodes.push(el('p', { className: 'library-aviso', text: MESSAGE.visitor }));
    if (state.suggest) nodes = nodes.concat(suggestNodes());
    return nodes;
  }

  function tabsNode() {
    refs.tabs = {};
    var visible = TABS.filter(function (tab) { return !tab.membersOnly || state.member; });
    return el('div', { className: 'library-abas', role: 'group', 'aria-label': 'Seções da Biblioteca' }, visible.map(function (tab) {
      var button = el('button', {
        type: 'button',
        className: 'secondary',
        'aria-pressed': String(state.tab === tab.id),
        'data-action': ACTION.tab,
        'data-arg': tab.id,
        text: tab.label,
      });
      refs.tabs[tab.id] = button;
      return button;
    }));
  }

  function onSearchSubmit(event) {
    if (event && event.preventDefault) event.preventDefault();
    clearTimer();
    applyQuery(cleanQuery(refs.search ? refs.search.value : ''));
  }

  function searchNode() {
    refs.search = el('input', { type: 'search', id: 'library-q', maxlength: QUERY_MAX, autocomplete: 'off', value: state.query.q, 'data-action-input': ACTION.search });
    return el('form', { className: 'library-busca', role: 'search', onSubmit: onSearchSubmit }, [
      el('label', { for: 'library-q', text: 'Buscar artigos' }),
      refs.search,
      el('button', { type: 'submit', className: 'secondary', text: MESSAGE.search }),
    ]);
  }

  function selectField(id, labelText, arg, options, current) {
    return el('div', { className: 'library-campo' }, [
      el('label', { for: id, text: labelText }),
      el('select', { id: id, 'data-action-change': ACTION.filter, 'data-arg': arg }, options.map(function (option) {
        return el('option', { value: option.value, selected: option.value === current, text: option.label });
      })),
    ]);
  }

  function yearField(id, labelText, arg, value) {
    return el('div', { className: 'library-campo' }, [
      el('label', { for: id, text: labelText }),
      el('input', {
        type: 'number',
        id: id,
        min: 1800,
        max: 2100,
        inputmode: 'numeric',
        value: value || '',
        'data-action-change': ACTION.filter,
        'data-arg': arg,
      }),
    ]);
  }

  function topicOptions() {
    var topics = state.topics.map(function (t) { return { value: t.slug, label: t.name }; });
    return [{ value: '', label: 'Todas as áreas' }].concat(topics);
  }

  function typeOptions() {
    var types = TYPE_KEYS.map(function (key) { return { value: key, label: typeLabel(key) }; });
    return [{ value: '', label: 'Todos os tipos' }].concat(types);
  }

  function languageOptions() {
    return [
      { value: '', label: 'Todos' },
      { value: 'pt', label: 'Português' },
      { value: 'outros', label: 'Inglês e outros' },
    ];
  }

  function filtersNode() {
    var count = activeFilterCount(state.query);
    refs.summary = el('summary', { text: filterSummaryLabel(count) });
    return el('details', { className: 'library-filtros', open: count > 0 }, [
      refs.summary,
      el('div', { className: 'library-filtros-campos' }, [
        selectField('library-area', 'Área', 'topic', topicOptions(), state.query.topic),
        selectField('library-tipo', 'Tipo', 'type', typeOptions(), state.query.type),
        selectField('library-idioma', 'Idioma', 'language', languageOptions(), languageOf(state.query.language)),
        yearField('library-ano-de', 'Ano de', 'yearFrom', state.query.yearFrom),
        yearField('library-ano-ate', 'Ano até', 'yearTo', state.query.yearTo),
        el('label', { className: 'library-check', for: 'library-aberto' }, [
          el('input', {
            type: 'checkbox',
            id: 'library-aberto',
            checked: state.query.openAccess,
            'data-action-change': ACTION.filter,
            'data-arg': 'openAccess',
          }),
          ' Só acesso aberto',
        ]),
      ]),
      clearButton(),
    ]);
  }

  function mountShell() {
    var root = box();
    if (!root) return;
    window.LaiftDom.clear(root);
    root.removeAttribute('aria-busy');
    refs = {};
    refs.fav = {};
    var nodes = [el('div', { className: 'card library-cabecalho' }, headerNodes()), tabsNode()];
    if (state.tab === 'catalogo') nodes.push(searchNode(), filtersNode());
    refs.status = el('p', { id: 'library-status', className: 'library-status', role: 'status', 'aria-live': 'polite' });
    refs.notice = el('p', { className: 'library-erro', role: 'alert' });
    refs.results = el('div', { id: 'library-resultados', className: 'library-resultados' });
    nodes.push(refs.status, refs.notice, refs.results);
    nodes.forEach(function (node) { root.appendChild(node); });
  }

  // ---------- Resultados ----------

  function skeleton() {
    var lines = [0, 1, 2].map(function () { return el('div', { className: 'skeleton-line' }); });
    return el('div', { className: 'skeleton', 'aria-hidden': 'true' }, lines);
  }

  function stateBlock(kind, role, title, message, actions) {
    var children = [el('p', { className: 'state-title', text: title })];
    if (message) children.push(el('p', { className: 'state-message', text: message }));
    return el('div', { className: 'state state-' + kind, role: role, tabindex: '-1' }, children.concat(actions || []));
  }

  function errorNode(failure) {
    var actions = [el('button', { type: 'button', className: 'secondary', 'data-action': ACTION.reload, text: MESSAGE.retry })];
    if (failure && failure.kind === 'network') {
      actions.push(el('a', { href: CATALOG_URL, className: 'secondary library-link', text: MESSAGE.publicCatalog }));
    }
    return stateBlock('error', 'alert', MESSAGE.errorTitle, failure ? failure.message : '', actions);
  }

  function emptyListNode() {
    if (state.tab === 'favoritos') return stateBlock('empty', 'status', MESSAGE.noFavorites);
    return stateBlock('empty', 'status', MESSAGE.noResults, '', [clearButton()]);
  }

  function badgeNode(text) {
    return el('span', { className: 'badge', text: text });
  }

  function favoriteNode(item) {
    var icon = el('span', { 'aria-hidden': 'true', text: item.isFavorite ? '★' : '☆' });
    var label = el('span', { text: favoriteLabel(item.isFavorite) });
    var attrs = { type: 'button', className: 'secondary library-favorito', 'aria-pressed': String(item.isFavorite === true) };
    var button = el('button', Object.assign(attrs, { 'data-action': ACTION.favorite, 'data-arg': item.id }), [icon, label]);
    refs.fav[item.id] = { button: button, icon: icon, label: label };
    return button;
  }

  function itemNode(item) {
    var title = el('button', { type: 'button', className: 'library-titulo', 'data-action': ACTION.open, 'data-arg': item.id, 'data-id': item.id, text: item.title });
    var actions = state.member ? el('div', { className: 'actions-row' }, [favoriteNode(item)]) : null;
    return el('li', { className: 'library-item' }, [
      el('div', { className: 'list-item' }, [
        el('h3', null, [title]),
        el('p', { className: 'meta-row library-meta', text: metaLine(item) }),
        el('div', { className: 'library-selos' }, badgesOf(item, state.topics).map(badgeNode)),
        actions,
      ]),
    ]);
  }

  function renderItems(node) {
    if (!state.items.length) {
      node.appendChild(emptyListNode());
      return;
    }
    node.appendChild(el('ul', { className: 'library-lista' }, state.items.map(itemNode)));
    if (state.tab !== 'colecoes' && hasMore(state.total, state.items.length)) {
      node.appendChild(el('button', { type: 'button', className: 'secondary library-mais', 'data-action': ACTION.more, text: MESSAGE.loadMore }));
    }
  }

  function collectionCard(collection) {
    var children = [el('h3', null, [el('button', {
      type: 'button',
      className: 'library-titulo',
      'data-action': ACTION.collection,
      'data-arg': collection.id,
      text: collection.title,
    })])];
    if (collection.description) children.push(el('p', { className: 'muted', text: collection.description }));
    children.push(el('p', { className: 'meta-row', text: statusLabel(collection.count) }));
    return el('li', { className: 'library-colecao' }, [el('div', { className: 'list-item' }, children)]);
  }

  function renderCollections(node) {
    if (!state.collections.length) {
      node.appendChild(stateBlock('empty', 'status', MESSAGE.noCollections));
      return;
    }
    node.appendChild(el('ul', { className: 'library-lista library-colecoes' }, state.collections.map(collectionCard)));
  }

  function renderCollection(node) {
    var collection = state.collection;
    node.appendChild(el('button', { type: 'button', className: 'secondary', 'data-action': ACTION.collections, text: MESSAGE.back }));
    node.appendChild(el('h3', { text: collection.title }));
    if (collection.description) node.appendChild(el('p', { className: 'muted', text: collection.description }));
    if (!collection.items.length) {
      node.appendChild(stateBlock('empty', 'status', MESSAGE.noCollectionItems));
      return;
    }
    node.appendChild(el('ul', { className: 'library-lista' }, collection.items.map(itemNode)));
  }

  function statusText() {
    if (state.status === 'loading' || state.status === 'error' || state.status === 'disabled') return '';
    if (state.collection) return statusLabel(state.collection.items.length);
    if (state.tab === 'colecoes') return '';
    return statusLabel(state.total);
  }

  function renderResults() {
    var node = refs.results;
    if (!node) return;
    window.LaiftDom.clear(node);
    refs.fav = {};
    setBusy(node, state.status === 'loading');
    refs.status.textContent = statusText();
    if (state.status === 'loading') node.appendChild(skeleton());
    else if (state.status === 'error') node.appendChild(errorNode(state.failure));
    else if (state.status === 'disabled') node.appendChild(stateBlock('empty', 'status', MESSAGE.unavailable));
    else if (state.collection) renderCollection(node);
    else if (state.tab === 'colecoes') renderCollections(node);
    else renderItems(node);
  }

  function renderAll() {
    mountShell();
    renderResults();
  }

  // ---------- Carregamento ----------

  function failState(res) {
    var failure = failureOf(res);
    return { status: failure.kind === 'disabled' ? 'disabled' : 'error', failure: failure };
  }

  function applyList(res, append, page) {
    if (!res || !res.success) {
      setState(failState(res));
      renderResults();
      return;
    }
    var fresh = Array.isArray(res.items) ? res.items : [];
    var items = append ? state.items.concat(fresh) : fresh;
    setState({
      status: 'ready',
      failure: null,
      items: items,
      total: Number(res.total) || items.length,
      page: page,
      topics: Array.isArray(res.topics) ? res.topics : state.topics,
    });
    renderResults();
  }

  function loadList(append) {
    var seq = beginRequest();
    var page = append ? state.page + 1 : 1;
    var favorites = state.tab === 'favoritos';
    if (!append) {
      setState({ status: 'loading', items: [], page: 1, failure: null });
      renderResults();
    }
    var request = favorites
      ? call('apiLearnLibraryListFavorites', { page: page })
      : call('apiLearnLibrarySearch', buildSearchInput(state.query, page));
    request.then(function (res) {
      if (seq !== latestRequest) return;
      applyList(res, append, page);
    });
  }

  function loadCollections() {
    var seq = beginRequest();
    setState({ status: 'loading', collection: null, failure: null });
    renderResults();
    call('apiLearnLibraryListCollections', {}).then(function (res) {
      if (seq !== latestRequest) return;
      if (!res || !res.success) {
        setState(failState(res));
      } else {
        setState({ status: 'ready', collections: Array.isArray(res.collections) ? res.collections : [] });
      }
      renderResults();
    });
  }

  function openCollection(id) {
    var seq = beginRequest();
    setState({ status: 'loading', failure: null });
    renderResults();
    call('apiLearnLibraryGetCollection', { id: id }).then(function (res) {
      if (seq !== latestRequest) return;
      if (!res || !res.success) {
        setState(Object.assign({ collection: null }, failState(res)));
      } else {
        var collection = Object.assign({}, res.collection, { items: Array.isArray(res.items) ? res.items : [] });
        setState({ status: 'ready', collection: collection });
      }
      renderResults();
    });
  }

  function loadResults() {
    if (state.tab === 'colecoes') loadCollections();
    else loadList(false);
  }

  // ---------- Ações (data-action) ----------

  function loadPanel() {
    if (!box()) return;
    var role = identityRole();
    var member = isMemberRole(role);
    var flagOn = document.documentElement.hasAttribute(SUGGEST_FLAG_ATTR);
    var tabAllowed = TABS.some(function (tab) { return tab.id === state.tab && (!tab.membersOnly || member); });
    setState({
      member: member,
      suggest: canSuggest(role, flagOn),
      tab: tabAllowed ? state.tab : 'catalogo',
    });
    wire();
    renderAll();
    loadResults();
  }

  function applyQuery(q) {
    if (q.length > 0 && q.length < SEARCH_MIN_CHARS) return;
    if (q === state.query.q) return;
    setState({ query: Object.assign({}, state.query, { q: q }) });
    if (state.tab === 'catalogo') loadList(false);
  }

  function searchInput(value) {
    clearTimer();
    var q = cleanQuery(value);
    timer = setTimeout(function () {
      timer = null;
      applyQuery(q);
    }, SEARCH_DELAY_MS);
  }

  function filterChange(name, value) {
    var patch = {};
    if (name === 'openAccess') patch.openAccess = value === true;
    else if (name === 'yearFrom' || name === 'yearTo') patch[name] = yearOf(value);
    else if (name === 'topic' || name === 'type') patch[name] = trimmed(value, 40);
    else if (name === 'language') patch.language = languageOf(value);
    else return;
    setState({ query: Object.assign({}, state.query, patch) });
    if (refs.summary) refs.summary.textContent = filterSummaryLabel(activeFilterCount(state.query));
    loadList(false);
  }

  function clearFilters() {
    clearTimer();
    setState({ query: EMPTY_QUERY });
    renderAll();
    if (refs.search) refs.search.focus();
    loadList(false);
  }

  function setTab(name) {
    var tab = TABS.filter(function (t) { return t.id === name; })[0];
    if (!tab || (tab.membersOnly && !state.member) || tab.id === state.tab) return;
    clearTimer();
    setState({ tab: name, collection: null, page: 1, items: [], failure: null, status: 'loading' });
    renderAll();
    if (refs.tabs && refs.tabs[name]) refs.tabs[name].focus();
    loadResults();
  }

  function reloadResults() {
    loadResults();
  }

  function loadMore() {
    if (state.status !== 'ready' || state.tab === 'colecoes' || state.collection) return;
    if (hasMore(state.total, state.items.length)) loadList(true);
  }

  function findItem(items, id) {
    return items.filter(function (item) { return item.id === id; })[0] || null;
  }

  function paintFavorite(id, saved) {
    var entry = refs.fav && refs.fav[id];
    if (!entry) return;
    entry.button.setAttribute('aria-pressed', String(saved));
    entry.icon.textContent = saved ? '★' : '☆';
    entry.label.textContent = favoriteLabel(saved);
  }

  function toggleFavorite(id) {
    var item = findItem(state.items, id);
    if (!item) return;
    call('apiLearnLibrarySetFavorite', { id: id, favorite: !item.isFavorite }).then(function (res) {
      if (!res || !res.success) {
        if (refs.notice) refs.notice.textContent = failureOf(res).message;
        return;
      }
      var saved = res.favorite === true;
      setState({
        items: state.items.map(function (i) {
          return i.id === id ? Object.assign({}, i, { isFavorite: saved }) : i;
        }),
      });
      paintFavorite(id, saved);
    });
  }

  function openArticle(id) {
    var detail = window.LaiftLibraryDetail;
    if (!detail || !detail.open) return;
    detail.open(window.App, id, function () { renderAll(); });
  }

  function showCollections() {
    setState({ collection: null });
    loadCollections();
  }

  function toggleSuggest() {
    var open = !state.suggestOpen;
    setState({ suggestOpen: open });
    if (refs.suggestForm) refs.suggestForm.hidden = !open;
    if (refs.suggestToggle) refs.suggestToggle.setAttribute('aria-expanded', String(open));
    if (open && refs.suggestId) refs.suggestId.focus();
  }

  function noteInput(value) {
    if (refs.noteCount) refs.noteCount.textContent = String(value || '').length + '/' + SUGGEST_MAX;
  }

  function sendSuggestion() {
    var payload = suggestionPayload(refs.suggestId ? refs.suggestId.value : '', refs.suggestNote ? refs.suggestNote.value : '');
    var status = refs.suggestStatus;
    var send = refs.suggestSend;
    if (!payload) { if (status) status.textContent = MESSAGE.suggestMissing; return null; }
    if (send) send.disabled = true;
    return call('apiLearnLibrarySuggest', payload).then(function (res) {
      if (send) send.disabled = false;
      if (!res || !res.success) {
        if (status) status.textContent = failureOf(res).message;
        return;
      }
      if (refs.suggestId) refs.suggestId.value = '';
      if (refs.suggestNote) refs.suggestNote.value = '';
      if (refs.noteCount) refs.noteCount.textContent = '0/' + SUGGEST_MAX;
      if (status) status.textContent = MESSAGE.suggestSent;
    });
  }

  function reset() {
    clearTimer();
    beginRequest();
    state = initialState();
    refs = {};
    var root = box();
    if (root) {
      window.LaiftDom.clear(root);
      root.removeAttribute('aria-busy');
    }
  }

  var api = {
    loadPanel: loadPanel,
    reset: reset,
    open: openArticle,
    reload: reloadResults,
    loadMore: loadMore,
    setTab: setTab,
    searchInput: searchInput,
    filterChange: filterChange,
    clearFilters: clearFilters,
    toggleFavorite: toggleFavorite,
    openCollection: openCollection,
    showCollections: showCollections,
    toggleSuggest: toggleSuggest,
    noteInput: noteInput,
    sendSuggestion: sendSuggestion,
  };
  var pure = {
    cleanQuery: cleanQuery,
    isMemberRole: isMemberRole,
    canSuggest: canSuggest,
    statusLabel: statusLabel,
    activeFilterCount: activeFilterCount,
    filterSummaryLabel: filterSummaryLabel,
    buildSearchInput: buildSearchInput,
    authorsLine: authorsLine,
    badgesOf: badgesOf,
    favoriteLabel: favoriteLabel,
    failureOf: failureOf,
    hasMore: hasMore,
    suggestionPayload: suggestionPayload,
  };

  // Navegador: window.LaiftLibrary. Node: module.exports, para scripts/library.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftLibrary = api;
  }
})();
