/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/admin-library-publicar.js
 * As três abas simples da curadoria da Biblioteca:
 *  - "Para revisar": artigos em triagem e aprovados; marca vários, põe a área e publica de uma vez
 *    (apiAdminLearnLibraryPublishMany, SetAreas);
 *  - "No ar": artigos publicados; o administrador tira do ar ou muda o estado (ChangeStatus),
 *    curador e mentor pedem a remoção (RequestRemoval);
 *  - "Pedidos": pedidos de remoção; só o administrador aceita ou recusa (DecideRemoval).
 * admin-library.js chama render(aba, caixa, app) e reset() no logout. A autorização real é do servidor;
 * aqui os botões do administrador só aparecem para ele, por conveniência.
 *
 * Script clássico. Sem HTML montado como texto: nós por LaiftDom.h, texto como nó de texto, eventos por listener.
 */
(function () {
  'use strict';

  var REASON_MIN = 3;
  var REASON_MAX = 300;
  var PUBLISH_CHUNK = 50;
  var ERROR_FALLBACK = 'Não foi possível concluir. Tente de novo.';
  var SESSION_MESSAGE = 'Sua sessão expirou. Entre de novo para continuar.';
  var STATUS_CHIPS = [['em_triagem', 'Para revisar'], ['aprovado', 'Aprovados']];
  var MOVE_OPTIONS = [
    ['removido', 'Tirar do ar (removido)'],
    ['rejeitado', 'Rejeitar'],
    ['em_triagem', 'Voltar para a triagem'],
    ['aprovado', 'Voltar para aprovado'],
  ];
  var REASON_STATES = ['removido', 'rejeitado'];
  var REQUEST_FILTERS = [['pendente', 'Pendentes'], ['todos', 'Todos']];
  var REQUEST_STATE_LABELS = { pendente: 'Pendente', aceito: 'Aceito (tirado do ar)', recusado: 'Recusado' };

  var gen = 0; // muda em render() e reset(): descarta respostas de outra aba ou sessão
  var box = null;
  var appRef = null;
  var view = null; // estado da aba aberta

  // ---------- Funções puras (testadas em scripts/admin-library-publicar.test.mjs) ----------

  function list(value) { return Array.isArray(value) ? value : []; }

  function isValidReason(value) {
    var text = typeof value === 'string' ? value.trim() : '';
    return text.length >= REASON_MIN && text.length <= REASON_MAX;
  }

  function needsReason(state) { return REASON_STATES.indexOf(state) !== -1; }

  function errorMessage(res) {
    var message = res && typeof res.message === 'string' ? res.message.trim() : '';
    return message || ERROR_FALLBACK;
  }

  function chunk(ids, size) {
    var out = [];
    for (var i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
    return out;
  }

  /** Avisos curtos de um artigo da fila: o que ainda o impede de ir ao ar. */
  function flagsOf(item) {
    var flags = [];
    if (!list(item && item.topics).length) flags.push('Sem área');
    if (item && item.isClinical && item.summaryText) flags.push('Resumo clínico');
    else if (item && (item.summaryOrigin === 'ia' || item.summaryOrigin === 'ia_editado')) flags.push('Resumo de IA');
    return flags;
  }

  /** Junta as respostas dos blocos de PublishMany: totais e uma linha por falha. */
  function summarizeResults(parts) {
    var published = 0;
    var failures = [];
    list(parts).forEach(function (part) {
      list(part && part.results).forEach(function (r) {
        if (r.ok) { published += 1; return; }
        failures.push((r.title || 'Artigo') + ': ' + (r.message || ERROR_FALLBACK));
      });
    });
    return { published: published, failed: failures.length, failures: failures };
  }

  function selectedIds(selected) {
    return Object.keys(selected || {}).filter(function (id) { return selected[id]; });
  }

  function publishNotice(summary) {
    if (!summary.failed) return summary.published + ' publicado(s). Aparecem no catálogo público em até 1 minuto.';
    return summary.published + ' publicado(s) e ' + summary.failed + ' não saíram. Veja abaixo o motivo de cada um.';
  }

  // ---------- Base ----------

  function dom() { return window.LaiftDom; }
  function h(tag, attrs, children) { return dom().h(tag, attrs, children); }

  function sessionToken() {
    var state = appRef && appRef.getState ? appRef.getState() : null;
    return state ? state.sessionToken : null;
  }

  function isAdmin() {
    var who = appRef && appRef.getIdentity ? appRef.getIdentity() : null;
    return !!who && who.role === 'admin';
  }

  function call(name, input, onOk, onFail) {
    var mine = gen;
    var token = sessionToken();
    var request = token
      ? appRef.callApi(name, token, input)
      : Promise.resolve({ success: false, message: SESSION_MESSAGE });
    request.catch(function () { return { success: false }; }).then(function (res) {
      if (mine !== gen) return;
      if (res && res.success === true) onOk(res);
      else onFail(res || {});
    });
  }

  function patch(changes) { view = Object.assign({}, view, changes); }

  function mount(nodes) {
    if (!box) return;
    dom().clear(box);
    nodes.forEach(function (node) { if (node) box.appendChild(node); });
    if (view && view.busy) box.setAttribute('aria-busy', 'true');
    else box.removeAttribute('aria-busy');
    if (view && view.focusId) {
      var target = document.getElementById(view.focusId);
      if (target && target.focus) target.focus();
    }
  }

  function button(label, onClick, extra) {
    return h('button', Object.assign({ type: 'button', className: 'secondary', onClick: onClick }, extra || {}), [label]);
  }

  function messages() {
    return [
      view.error ? h('p', { className: 'state-message', role: 'alert' }, [view.error]) : null,
      view.notice ? h('p', { className: 'muted', role: 'status' }, [view.notice]) : null,
    ];
  }

  function failureList() {
    if (!view.failures || !view.failures.length) return null;
    return h('ul', { className: 'muted' }, view.failures.map(function (line) { return h('li', null, [line]); }));
  }

  function chips(options, current, onPick) {
    return h('div', { className: 'actions-row', role: 'group', 'aria-label': 'Filtro' }, options.map(function (opt) {
      return button(opt[1], function () { onPick(opt[0]); }, { 'aria-pressed': opt[0] === current ? 'true' : 'false' });
    }));
  }

  function topicName(slug) {
    var found = list(view.topics).filter(function (t) { return t.slug === slug; })[0];
    return found ? found.name : slug;
  }

  function reasonField(id, onInput) {
    return h('label', { htmlFor: id }, [
      'Motivo (3 a 300 caracteres) ',
      h('input', { type: 'text', id: id, maxLength: REASON_MAX, value: view.reason || '', onInput: function (e) { onInput(e.target.value); } }),
    ]);
  }

  // ---------- Para revisar ----------

  function freshReview() {
    return {
      tab: 'revisar', status: 'em_triagem', items: [], counts: {}, topics: [], page: 1, total: 0,
      selected: {}, approveAi: false, asRef: false, areaSlug: '', busy: false, error: '', notice: '', failures: [], focusId: '',
    };
  }

  function loadReview(status, page, append) {
    patch({ status: status, busy: true, error: '', focusId: '' });
    drawReview();
    call('apiAdminLearnLibraryListQueue', { status: status, page: page }, function (res) {
      var items = append ? view.items.concat(list(res.items)) : list(res.items);
      patch({ busy: false, items: items, counts: res.counts || {}, topics: list(res.topics), page: page, total: res.total || 0 });
      drawReview();
    }, function (res) {
      patch({ busy: false, error: errorMessage(res) });
      drawReview();
    });
  }

  function toggleItem(id, on) {
    var next = Object.assign({}, view.selected);
    next[id] = on;
    patch({ selected: next, focusId: 'adm-pub-sel-' + id });
    drawReview();
  }

  function selectAll(on) {
    var next = {};
    view.items.forEach(function (item) { next[item.id] = on; });
    patch({ selected: next, focusId: 'adm-pub-todos' });
    drawReview();
  }

  function applyArea() {
    var ids = selectedIds(view.selected);
    if (!ids.length || !view.areaSlug) return;
    patch({ busy: true, error: '', notice: '', failures: [], focusId: 'adm-pub-area' });
    drawReview();
    call('apiAdminLearnLibrarySetAreas', { ids: ids.slice(0, PUBLISH_CHUNK), topics: [view.areaSlug] }, function (res) {
      patch({ notice: 'Área "' + topicName(view.areaSlug) + '" aplicada em ' + res.changed + ' artigo(s).' });
      loadReview(view.status, 1, false);
    }, function (res) {
      patch({ busy: false, error: errorMessage(res) });
      drawReview();
    });
  }

  function publishSelected() {
    var ids = selectedIds(view.selected);
    if (!ids.length) return;
    patch({ busy: true, error: '', notice: '', failures: [], focusId: 'adm-pub-publicar' });
    drawReview();
    var parts = [];
    var options = { approveAiSummaries: view.approveAi, clinicalAsReference: view.asRef };
    var blocks = chunk(ids, PUBLISH_CHUNK);
    (function next(index) {
      if (index >= blocks.length) { finishPublish(parts); return; }
      call('apiAdminLearnLibraryPublishMany', Object.assign({ ids: blocks[index] }, options), function (res) {
        parts.push(res);
        next(index + 1);
      }, function (res) {
        parts.push({ results: blocks[index].map(function (id) { return { id: id, ok: false, message: errorMessage(res) }; }) });
        next(index + 1);
      });
    })(0);
  }

  function finishPublish(parts) {
    var summary = summarizeResults(parts);
    patch({ selected: {}, notice: publishNotice(summary), failures: summary.failures });
    loadReview(view.status, 1, false);
  }

  function reviewRow(item) {
    var flags = flagsOf(item);
    return h('li', { className: 'card' }, [
      h('label', { htmlFor: 'adm-pub-sel-' + item.id }, [
        h('input', { type: 'checkbox', id: 'adm-pub-sel-' + item.id, checked: !!view.selected[item.id], onChange: function (e) { toggleItem(item.id, e.target.checked); } }),
        ' ',
        h('strong', null, [item.title || 'Sem título']),
      ]),
      h('p', { className: 'muted' }, [
        [item.journal, item.pubYear].filter(Boolean).join(', '),
        list(item.topics).length ? ' · ' + list(item.topics).map(topicName).join(', ') : '',
      ]),
      flags.length ? h('p', null, flags.map(function (f) { return h('span', { className: 'badge' }, [f]); })) : null,
    ]);
  }

  function reviewControls() {
    var count = selectedIds(view.selected).length;
    return h('div', { className: 'card' }, [
      h('div', { className: 'actions-row' }, [
        h('label', { htmlFor: 'adm-pub-todos' }, [
          h('input', { type: 'checkbox', id: 'adm-pub-todos', checked: count > 0 && count === view.items.length, onChange: function (e) { selectAll(e.target.checked); } }),
          ' Marcar todos desta lista',
        ]),
        h('span', { className: 'muted' }, [count + ' marcado(s)']),
      ]),
      h('label', { htmlFor: 'adm-pub-ia' }, [
        h('input', { type: 'checkbox', id: 'adm-pub-ia', checked: view.approveAi, onChange: function (e) { patch({ approveAi: e.target.checked, focusId: 'adm-pub-ia' }); drawReview(); } }),
        ' Li e aprovo os resumos feitos por IA dos marcados',
      ]),
      h('label', { htmlFor: 'adm-pub-ref' }, [
        h('input', { type: 'checkbox', id: 'adm-pub-ref', checked: view.asRef, onChange: function (e) { patch({ asRef: e.target.checked, focusId: 'adm-pub-ref' }); drawReview(); } }),
        ' Artigo clínico sem revisor: publicar só como referência (sem resumo)',
      ]),
      h('div', { className: 'actions-row' }, [
        h('label', { htmlFor: 'adm-pub-area' }, [
          'Área ',
          h('select', { id: 'adm-pub-area', onChange: function (e) { patch({ areaSlug: e.target.value }); } },
            [h('option', { value: '' }, ['Escolha…'])].concat(list(view.topics).map(function (t) {
              return h('option', { value: t.slug, selected: t.slug === view.areaSlug }, [t.name]);
            }))),
        ]),
        button('Pôr a área nos marcados', applyArea, { disabled: view.busy || !count }),
        button('Publicar os marcados', publishSelected, { id: 'adm-pub-publicar', className: 'primary', disabled: view.busy || !count }),
      ]),
    ]);
  }

  function drawReview() {
    var counts = view.counts || {};
    var chipsNode = chips(STATUS_CHIPS.map(function (c) {
      return [c[0], c[1] + ' (' + (counts[c[0]] || 0) + ')'];
    }), view.status, function (status) { patch({ selected: {} }); loadReview(status, 1, false); });
    var rows = view.items.length
      ? h('ul', { className: 'card-list' }, view.items.map(reviewRow))
      : h('p', { className: 'empty-state' }, [view.busy ? 'Carregando…' : 'Nada para revisar aqui.']);
    var more = view.items.length < view.total
      ? button('Ver mais', function () { loadReview(view.status, view.page + 1, true); }, { disabled: view.busy })
      : null;
    mount([chipsNode].concat(messages(), [failureList(), view.items.length ? reviewControls() : null, rows, more]));
  }

  // ---------- No ar ----------

  function freshLive() {
    return {
      tab: 'ar', items: [], topics: [], page: 1, total: 0, openId: null, move: 'removido', reason: '',
      busy: false, error: '', notice: '', failures: [], focusId: '',
    };
  }

  function loadLive(page, append) {
    patch({ busy: true, error: '', focusId: '' });
    drawLive();
    call('apiAdminLearnLibraryListQueue', { status: 'publicado', page: page }, function (res) {
      var items = append ? view.items.concat(list(res.items)) : list(res.items);
      patch({ busy: false, items: items, topics: list(res.topics), page: page, total: res.total || 0 });
      drawLive();
    }, function (res) {
      patch({ busy: false, error: errorMessage(res) });
      drawLive();
    });
  }

  function openForm(id) {
    patch({ openId: id, move: 'removido', reason: '', error: '', notice: '', focusId: 'adm-pub-motivo' });
    drawLive();
  }

  function confirmLive(item) {
    var admin = isAdmin();
    var target = admin ? view.move : 'removido';
    if ((!admin || needsReason(target)) && !isValidReason(view.reason)) {
      patch({ error: 'Informe o motivo (3 a 300 caracteres).', focusId: 'adm-pub-motivo' });
      drawLive();
      return;
    }
    patch({ busy: true, error: '', focusId: '' });
    drawLive();
    var name = admin ? 'apiAdminLearnLibraryChangeStatus' : 'apiAdminLearnLibraryRequestRemoval';
    var input = admin
      ? { id: item.id, version: item.version, to: target, reason: view.reason.trim() }
      : { id: item.id, reason: view.reason.trim() };
    call(name, input, function () {
      patch({ openId: null, notice: admin ? 'Estado atualizado.' : 'Pedido enviado. O administrador vai decidir.' });
      loadLive(1, false);
    }, function (res) {
      patch({ busy: false, error: errorMessage(res), focusId: 'adm-pub-motivo' });
      drawLive();
    });
  }

  function liveForm(item) {
    var admin = isAdmin();
    var showReason = !admin || needsReason(view.move);
    return h('div', { className: 'card' }, [
      admin
        ? h('label', { htmlFor: 'adm-pub-estado' }, [
          'Mudar para ',
          h('select', { id: 'adm-pub-estado', onChange: function (e) { patch({ move: e.target.value, focusId: 'adm-pub-estado' }); drawLive(); } },
            MOVE_OPTIONS.map(function (o) { return h('option', { value: o[0], selected: o[0] === view.move }, [o[1]]); })),
        ])
        : h('p', { className: 'muted' }, ['Só o administrador tira um artigo do ar. Explique o motivo e ele decide.']),
      showReason ? reasonField('adm-pub-motivo', function (value) { patch({ reason: value }); }) : null,
      h('div', { className: 'actions-row' }, [
        button(admin ? 'Confirmar' : 'Enviar pedido', function () { confirmLive(item); }, { className: 'primary', disabled: view.busy }),
        button('Cancelar', function () { patch({ openId: null, error: '', focusId: '' }); drawLive(); }),
      ]),
    ]);
  }

  function liveRow(item) {
    var open = view.openId === item.id;
    return h('li', { className: 'card' }, [
      h('strong', null, [item.title || 'Sem título']),
      h('p', { className: 'muted' }, [[item.journal, item.pubYear].filter(Boolean).join(', ')]),
      open ? liveForm(item) : button(isAdmin() ? 'Mudar estado ou tirar do ar' : 'Pedir remoção', function () { openForm(item.id); }),
    ]);
  }

  function drawLive() {
    var rows = view.items.length
      ? h('ul', { className: 'card-list' }, view.items.map(liveRow))
      : h('p', { className: 'empty-state' }, [view.busy ? 'Carregando…' : 'Nenhum artigo no ar.']);
    var more = view.items.length < view.total
      ? button('Ver mais', function () { loadLive(view.page + 1, true); }, { disabled: view.busy })
      : null;
    mount(messages().concat([rows, more]));
  }

  // ---------- Pedidos ----------

  function freshRequests() {
    return { tab: 'pedidos', filter: 'pendente', items: [], pending: 0, busy: false, error: '', notice: '', failures: [], focusId: '' };
  }

  function loadRequests(filter) {
    patch({ filter: filter, busy: true, error: '', focusId: '' });
    drawRequests();
    call('apiAdminLearnLibraryListRemovalRequests', { status: filter }, function (res) {
      patch({ busy: false, items: list(res.items), pending: res.pendingCount || 0 });
      drawRequests();
    }, function (res) {
      patch({ busy: false, error: errorMessage(res) });
      drawRequests();
    });
  }

  function decide(item, decision) {
    patch({ busy: true, error: '', notice: '', focusId: '' });
    drawRequests();
    call('apiAdminLearnLibraryDecideRemoval', { id: item.id, decision: decision }, function (res) {
      patch({ notice: res.request && res.request.articleRemoved ? 'Artigo tirado do ar.' : 'Pedido recusado. O artigo continua no ar.' });
      loadRequests(view.filter);
    }, function (res) {
      patch({ busy: false, error: errorMessage(res) });
      drawRequests();
    });
  }

  function requestRow(item) {
    var pending = item.status === 'pendente';
    return h('li', { className: 'card' }, [
      h('strong', null, [item.articleTitle || 'Artigo']),
      h('p', { className: 'muted' }, ['Pedido de ' + (item.requestedByName || 'alguém da equipe') + ': ' + item.reason]),
      h('p', null, [h('span', { className: 'badge' }, [REQUEST_STATE_LABELS[item.status] || item.status])]),
      pending && isAdmin()
        ? h('div', { className: 'actions-row' }, [
          button('Aceitar e tirar do ar', function () { decide(item, 'aceitar'); }, { className: 'primary', disabled: view.busy }),
          button('Recusar', function () { decide(item, 'recusar'); }, { disabled: view.busy }),
        ])
        : null,
    ]);
  }

  function drawRequests() {
    var rows = view.items.length
      ? h('ul', { className: 'card-list' }, view.items.map(requestRow))
      : h('p', { className: 'empty-state' }, [view.busy ? 'Carregando…' : 'Nenhum pedido por aqui.']);
    var filterNode = chips(REQUEST_FILTERS.map(function (c) {
      return [c[0], c[1] + (c[0] === 'pendente' ? ' (' + view.pending + ')' : '')];
    }), view.filter, loadRequests);
    mount([filterNode].concat(messages(), [rows]));
  }

  // ---------- Entrada pública ----------

  var TABS = {
    revisar: function () { view = freshReview(); loadReview('em_triagem', 1, false); },
    ar: function () { view = freshLive(); loadLive(1, false); },
    pedidos: function () { view = freshRequests(); loadRequests('pendente'); },
  };

  function render(tab, container, app) {
    if (!dom() || !container) return;
    gen++;
    box = container;
    appRef = app || null;
    if (!Object.prototype.hasOwnProperty.call(TABS, tab)) return;
    TABS[tab]();
  }

  function reset() {
    gen++;
    appRef = null;
    view = null;
    if (box && dom()) {
      dom().clear(box);
      box.removeAttribute('aria-busy');
    }
    box = null;
  }

  var api = { render: render, reset: reset, tabs: Object.keys(TABS) };
  var pure = {
    isValidReason: isValidReason,
    needsReason: needsReason,
    errorMessage: errorMessage,
    chunk: chunk,
    flagsOf: flagsOf,
    summarizeResults: summarizeResults,
    selectedIds: selectedIds,
    publishNotice: publishNotice,
  };

  // Navegador: window.LaiftAdminLibraryPublicar. Node: module.exports, para scripts/admin-library-publicar.test.mjs.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({}, api, pure);
  } else {
    window.LaiftAdminLibraryPublicar = api;
  }
})();
