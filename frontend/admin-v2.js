/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Administração v2 (flag admin_v2_enabled; docs/admin-v2.md): REORGANIZA o modo administrador sem recriar nada. Os painéis
// de sempre (panel-admin-*) e os seus módulos seguem os mesmos nós, dados, ações e validações; este script só acrescenta
//   - a faixa "Pendências da gestão" (Painel): números de leituras que a API já tem (inscrições a analisar, exclusões em
//     andamento, propostas em análise) e das flags ainda não salvas;
//   - a barra de seções no topo, com "Voltar" fixo à esquerda e as seções roláveis (cada uma abre o painel de sempre);
//   - a seção "Flags" (leitura e gravação por apiAdminListFeatureFlags/apiAdminSetFeatureFlag, que já existiam).
// A barra de baixo do modo administrador fica escondida só por CSS enquanto isto está montado. reset() desfaz tudo.
// Carregado SOB DEMANDA (pacote "admin2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement,
// createElementNS e textContent); sem HTML por texto e sem estilo inline. O CSS (admin-v2.css) vale só sob a flag.
// Expõe window.LaiftAdminV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var NAV_ID = 'nav-group-admin';
  var DASH_PANEL = 'panel-admin-dashboard';
  var FLAGS_PANEL = 'panel-admin-flags';
  var STYLE_HREF = 'admin-v2.css';
  var STYLE_ATTR = 'data-admin-v2-css';
  var ACTIVE_ATTR = 'data-admin-v2';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BACK_ICON = 'M15 18l-6-6 6-6';
  var RESERVED_FLAGS = ['mfa_required']; // exige reautenticação no servidor: aqui só leitura

  /** Ordem das seções na barra (as que não estão aqui vão para o fim, na ordem de sempre). */
  var TAB_ORDER = [
    DASH_PANEL, 'panel-admin-selection', 'panel-admin-highlights', FLAGS_PANEL, 'panel-admin-ai', 'panel-admin-privacy',
    'panel-admin-roles', 'panel-admin-users', 'panel-admin-events', 'panel-admin-proposals', 'panel-admin-tasks',
    'panel-admin-feedback', 'panel-admin-audit', 'panel-admin-reports', 'panel-admin-fiscal', 'panel-admin-library',
  ];

  /** Números da faixa de pendências: panel = seção que o número abre. */
  var CHIPS = [
    { key: 'selection', panel: 'panel-admin-selection', label: 'Inscrições a analisar' },
    { key: 'deletions', panel: 'panel-admin-privacy', label: 'Exclusões em andamento' },
    { key: 'proposals', panel: 'panel-admin-proposals', label: 'Propostas em análise' },
    { key: 'flags', panel: FLAGS_PANEL, label: 'Flags não salvas' },
  ];

  // ---------- Funções puras ----------

  function num(value) { var n = Number(value); return isFinite(n) && n >= 0 ? Math.floor(n) : 0; }

  /** Ordena as seções: primeiro as da lista TAB_ORDER, depois as demais na ordem recebida. */
  function orderTabs(items) {
    var list = (items || []).map(function (item, index) { return { item: item, index: index, rank: TAB_ORDER.indexOf(item.panel) }; });
    list.sort(function (a, b) {
      var ra = a.rank === -1 ? TAB_ORDER.length : a.rank;
      var rb = b.rank === -1 ? TAB_ORDER.length : b.rank;
      return ra - rb || a.index - b.index;
    });
    return list.map(function (entry) { return entry.item; });
  }

  /** Texto de um número da faixa: "…" enquanto carrega (undefined), "—" quando a leitura falhou (null). */
  function chipValue(value) {
    if (value === undefined) return '…';
    if (value === null) return '—';
    return String(num(value));
  }

  /** Nome falado do número da faixa para leitores de tela. */
  function chipSpoken(label, value) {
    if (value === undefined) return label + ': carregando';
    if (value === null) return label + ': indisponível agora';
    return label + ': ' + num(value);
  }

  /** Inscrições a analisar = enviadas + em análise + em entrevista (os mesmos contadores do painel da comissão). */
  function selectionPending(res) {
    if (!res || res.success !== true) return null;
    var c = res.counts || {};
    return num(c.submitted) + num(c.in_review) + num(c.interview);
  }

  /** Exclusões em andamento: itens da lista de pedidos pedida com status "requested". */
  function deletionsPending(res) {
    if (!res || res.success !== true || !Array.isArray(res.items)) return null;
    return res.items.length;
  }

  /** Propostas em análise vindas dos indicadores do Painel (null = o Painel falhou). */
  function proposalsPending(indicators) {
    if (!indicators || typeof indicators !== 'object') return null;
    return num(indicators.proposals_pending);
  }

  /** Quantidade de flags com valor diferente do salvo. */
  function dirtyKeys(items, edits) {
    var e = edits || {};
    return (items || []).filter(function (f) { return Object.prototype.hasOwnProperty.call(e, f.key) && e[f.key] !== f.enabled; })
      .map(function (f) { return f.key; });
  }

  function dirtyText(count) {
    if (!count) return 'Nenhuma alteração';
    return count === 1 ? '1 alteração não salva' : count + ' alterações não salvas';
  }

  /** Linha de apoio de uma flag: percentual e condições (que esta tela não altera). */
  function flagMeta(flag) {
    var parts = [];
    var pct = Number(flag && flag.rolloutPct);
    if (isFinite(pct) && pct < 100) parts.push('Para ' + pct + '% das pessoas');
    if (flag && flag.conditions && typeof flag.conditions === 'object' && Object.keys(flag.conditions).length) parts.push('Com condições');
    if (flag && RESERVED_FLAGS.indexOf(flag.key) !== -1) parts.push('Exige reautenticação: altere pela API');
    return parts.join(' · ');
  }

  /** Flags que combinam com o texto da busca (chave ou descrição). */
  function filterFlags(items, query) {
    var q = String(query || '').trim().toLowerCase();
    if (!q) return (items || []).slice();
    return (items || []).filter(function (f) { return (f.key + ' ' + (f.description || '')).toLowerCase().indexOf(q) !== -1; });
  }

  // ---------- DOM ----------

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function svg(doc, paths, className) {
    var node = doc.createElementNS(SVG_NS, 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    if (className) node.setAttribute('class', className);
    paths.forEach(function (d) {
      var path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      node.appendChild(path);
    });
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  /** Diário do que foi acrescentado, para desfazer em reset(). */
  function createJournal() {
    var steps = [];
    return {
      add: function (node, parent, before) { steps.push(function () { if (node.parentNode) node.parentNode.removeChild(node); }); parent.insertBefore(node, before || null); },
      undo: function (fn) { steps.push(fn); },
      rollback: function () { for (var i = steps.length - 1; i >= 0; i--) steps[i](); steps = []; },
    };
  }

  /** Estado do que foi montado (um por documento). */
  var mounted = null;
  var lastIndicators; // undefined = ainda não chegou; null = falhou; objeto = indicadores do Painel

  function token(app) { var s = app && app.getState && app.getState(); return (s && s.sessionToken) || ''; }

  function callApi(app, action, payload) {
    var args = payload === undefined ? [action, token(app)] : [action, token(app), payload];
    return app.callApi.apply(app, args).then(function (res) {
      return res || { success: false, message: 'Sem resposta. Tente de novo.' };
    }, function () { return { success: false, message: 'Sem conexão. Tente de novo.' }; });
  }

  function currentPanelId(doc) {
    var sec = doc.querySelector('.app-main > section[id^="panel-"]:not(.hidden)');
    return sec ? sec.id : '';
  }

  function goTo(state, panelId) {
    if (state.app && typeof state.app.showPanel === 'function') state.app.showPanel(panelId);
  }

  // ----- Barra de seções -----

  function readTabs(state) {
    var doc = state.doc;
    var nav = doc.getElementById(NAV_ID);
    var items = [];
    if (nav) {
      nav.querySelectorAll('[data-panel]').forEach(function (btn) {
        if (btn.classList.contains('hidden')) return;
        var span = btn.querySelector('span:not(.nav-badge)');
        items.push({ panel: btn.getAttribute('data-panel'), label: (span ? span.textContent : btn.textContent).trim() });
      });
    }
    if (items.length) items.push({ panel: FLAGS_PANEL, label: 'Flags' });
    return orderTabs(items);
  }

  function renderTabs(state) {
    var doc = state.doc;
    clear(state.tabsEl);
    readTabs(state).forEach(function (tab) {
      var button = el(doc, 'button', 'adm2-tab', tab.label);
      button.setAttribute('type', 'button');
      button.setAttribute('data-panel', tab.panel);
      button.addEventListener('click', function () { goTo(state, tab.panel); });
      state.tabsEl.appendChild(button);
    });
    markActive(state);
  }

  function markActive(state) {
    var current = currentPanelId(state.doc);
    state.tabsEl.querySelectorAll('.adm2-tab').forEach(function (tab) {
      var on = tab.getAttribute('data-panel') === current;
      tab.classList.toggle('is-active', on);
      if (on) {
        tab.setAttribute('aria-current', 'page');
        if (typeof tab.scrollIntoView === 'function') tab.scrollIntoView({ block: 'nearest', inline: 'center' });
      } else tab.removeAttribute('aria-current');
    });
  }

  // ----- Faixa de pendências -----

  function chipData(state, key) {
    if (key === 'flags') {
      var f = state.flags;
      return f.status === 'ready' ? dirtyKeys(f.items, f.edits).length : 0;
    }
    if (key === 'proposals') return lastIndicators === undefined ? undefined : proposalsPending(lastIndicators);
    return state.pending[key];
  }

  function renderStrip(state) {
    var doc = state.doc;
    clear(state.chipsEl);
    CHIPS.forEach(function (def) {
      var value = chipData(state, def.key);
      var button = el(doc, 'button', 'adm2-chip');
      button.setAttribute('type', 'button');
      button.setAttribute('data-chip', def.key);
      button.setAttribute('aria-label', chipSpoken(def.label, value));
      button.appendChild(el(doc, 'b', 'adm2-chip__n', chipValue(value)));
      button.appendChild(el(doc, 'span', 'adm2-chip__l', def.label));
      button.addEventListener('click', function () { goTo(state, def.panel); });
      state.chipsEl.appendChild(button);
    });
  }

  function loadPending(state) {
    var app = state.app;
    if (!app || typeof app.callApi !== 'function') return;
    state.pending.selection = undefined;
    state.pending.deletions = undefined;
    renderStrip(state);
    callApi(app, 'apiSelectionCommitteeOverview', { filter: 'pending' }).then(function (res) {
      if (mounted !== state) return;
      state.pending.selection = selectionPending(res);
      renderStrip(state);
    });
    callApi(app, 'apiAdminListDeletionRequests', { status: 'requested' }).then(function (res) {
      if (mounted !== state) return;
      state.pending.deletions = deletionsPending(res);
      renderStrip(state);
    });
  }

  // ----- Sincronia com o modo administrador -----

  function sync(state) {
    var doc = state.doc;
    var nav = doc.getElementById(NAV_ID);
    var active = !!nav && !nav.classList.contains('hidden');
    if (active) doc.documentElement.setAttribute(ACTIVE_ATTR, '1');
    else doc.documentElement.removeAttribute(ACTIVE_ATTR);
    state.bar.hidden = !active;
    var onDash = active && currentPanelId(doc) === DASH_PANEL;
    var wasShown = !state.strip.hidden;
    state.strip.hidden = !onDash;
    if (onDash && !wasShown) { loadPending(state); renderStrip(state); }
    if (active) markActive(state);
  }

  // ----- Flags -----

  function setStatus(state, message, kind) {
    var live = state.flagsUi.status;
    live.textContent = message || '';
    live.className = 'adm2-status status-msg' + (kind ? ' ' + kind : '');
  }

  function switchButton(state, flag, value) {
    var doc = state.doc;
    var locked = RESERVED_FLAGS.indexOf(flag.key) !== -1;
    var button = el(doc, 'button', 'adm2-switch');
    button.setAttribute('type', 'button');
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', value ? 'true' : 'false');
    button.setAttribute('aria-label', flag.key + (value ? ': ligada' : ': desligada'));
    button.setAttribute('data-flag', flag.key);
    button.appendChild(el(doc, 'span', 'adm2-switch__track'));
    button.appendChild(el(doc, 'span', 'adm2-switch__text', value ? 'Ligada' : 'Desligada'));
    if (locked) button.disabled = true;
    else {
      button.addEventListener('click', function () {
        state.flags.edits[flag.key] = !value;
        renderFlags(state);
        renderStrip(state);
        var again = state.flagsUi.list.querySelector('[data-flag="' + flag.key + '"]');
        if (again) again.focus();
      });
    }
    return button;
  }

  function renderFlagsList(state) {
    var doc = state.doc;
    var f = state.flags;
    var list = state.flagsUi.list;
    clear(list);
    var rows = filterFlags(f.items, f.filter);
    if (!f.items.length) { list.appendChild(el(doc, 'li', 'adm2-empty', 'Nenhuma flag cadastrada.')); return; }
    if (!rows.length) { list.appendChild(el(doc, 'li', 'adm2-empty', 'Nenhuma flag combina com a busca.')); return; }
    rows.forEach(function (flag) {
      var value = Object.prototype.hasOwnProperty.call(f.edits, flag.key) ? f.edits[flag.key] : flag.enabled;
      var changed = value !== flag.enabled;
      var li = el(doc, 'li', 'adm2-flag' + (changed ? ' is-changed' : ''));
      var info = el(doc, 'div', 'adm2-flag__info');
      info.appendChild(el(doc, 'code', 'adm2-flag__key', flag.key));
      if (flag.description) info.appendChild(el(doc, 'p', 'adm2-flag__desc', flag.description));
      var meta = flagMeta(flag);
      if (meta) info.appendChild(el(doc, 'p', 'adm2-flag__meta', meta));
      li.appendChild(info);
      li.appendChild(switchButton(state, flag, value));
      list.appendChild(li);
    });
  }

  function renderFlags(state) {
    var f = state.flags;
    var ui = state.flagsUi;
    var dirty = dirtyKeys(f.items, f.edits).length;
    ui.tools.hidden = f.status !== 'ready';
    ui.list.hidden = f.status !== 'ready';
    ui.retry.hidden = f.status !== 'error';
    ui.bar.hidden = f.status !== 'ready' || dirty === 0;
    ui.count.textContent = dirtyText(dirty);
    if (f.status === 'loading') setStatus(state, 'Carregando…', 'info');
    else if (f.status === 'error') setStatus(state, f.error || 'Não foi possível carregar as flags.', 'error');
    if (f.status === 'ready') renderFlagsList(state);
  }

  function loadFlagsData(state) {
    var f = state.flags;
    f.status = 'loading';
    renderFlags(state);
    return callApi(state.app, 'apiAdminListFeatureFlags').then(function (res) {
      if (mounted !== state) return;
      if (!res.success || !Array.isArray(res.flags)) {
        f.status = 'error';
        f.error = res.message || 'Não foi possível carregar as flags.';
      } else {
        f.status = 'ready';
        f.items = res.flags.map(function (x) { return { key: String(x.key), enabled: x.enabled === true, rolloutPct: x.rolloutPct, conditions: x.conditions, description: x.description || '' }; });
        f.edits = {};
        setStatus(state, '', '');
      }
      renderFlags(state);
      renderStrip(state);
    });
  }

  function runSave(state, keys) {
    var f = state.flags;
    var failed = [];
    var saved = 0;
    setStatus(state, 'Salvando…', 'info');
    var chain = Promise.resolve();
    keys.forEach(function (key) {
      chain = chain.then(function () {
        var value = f.edits[key];
        return callApiWithKey(state, key, value).then(function (res) {
          if (res.success) {
            saved += 1;
            f.items.forEach(function (item) { if (item.key === key) item.enabled = value; });
            delete f.edits[key];
          } else failed.push(key + ': ' + (res.message || 'não foi possível salvar'));
        });
      });
    });
    return chain.then(function () {
      if (mounted !== state) return;
      renderFlags(state);
      renderStrip(state);
      if (failed.length) setStatus(state, (saved ? saved + ' salva(s). ' : '') + 'Não salvou: ' + failed.join('; '), 'error');
      else setStatus(state, saved === 1 ? 'Flag salva.' : saved + ' flags salvas.', 'success');
    });
  }

  function callApiWithKey(state, key, value) {
    var app = state.app;
    return app.callApi.call(app, 'apiAdminSetFeatureFlag', token(app), key, { enabled: value }).then(function (res) {
      return res || { success: false, message: 'Sem resposta. Tente de novo.' };
    }, function () { return { success: false, message: 'Sem conexão. Tente de novo.' }; });
  }

  function askSave(state) {
    var keys = dirtyKeys(state.flags.items, state.flags.edits);
    if (!keys.length) return;
    var message = 'Salvar ' + (keys.length === 1 ? '1 alteração' : keys.length + ' alterações') + ' de flag? Vale para todas as pessoas.';
    if (state.app && typeof state.app.openConfirm === 'function') state.app.openConfirm(message, function () { runSave(state, keys); });
    else runSave(state, keys);
  }

  function buildFlagsPanel(state) {
    var doc = state.doc;
    var section = el(doc, 'section');
    section.id = FLAGS_PANEL;
    section.className = 'hidden adm2-flags';
    section.appendChild(el(doc, 'h1', 'sr-only', 'Admin: flags'));
    var card = el(doc, 'div', 'card');
    card.appendChild(el(doc, 'h2', 'adm2-flags__title', 'Flags'));
    card.appendChild(el(doc, 'p', 'muted', 'Liga e desliga recursos para todas as pessoas. As alterações só valem depois de salvar. As telas refletem a mudança quando cada pessoa abrir a plataforma de novo.'));
    var tools = el(doc, 'div', 'adm2-flags__tools');
    var label = el(doc, 'label', null, 'Buscar flag');
    label.setAttribute('for', 'adm2-flag-filter');
    var input = el(doc, 'input');
    input.type = 'search';
    input.id = 'adm2-flag-filter';
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', function () { state.flags.filter = input.value; renderFlagsList(state); });
    label.appendChild(input);
    tools.appendChild(label);
    card.appendChild(tools);
    var status = el(doc, 'p', 'adm2-status status-msg');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    card.appendChild(status);
    var retry = el(doc, 'button', 'secondary', 'Tentar de novo');
    retry.setAttribute('type', 'button');
    retry.id = 'adm2-flags-retry';
    retry.addEventListener('click', function () { loadFlagsData(state); });
    card.appendChild(retry);
    var list = el(doc, 'ul', 'adm2-flags__list');
    card.appendChild(list);
    var bar = el(doc, 'div', 'adm2-savebar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Salvar alterações das flags');
    var count = el(doc, 'span', 'adm2-savebar__n');
    var discard = el(doc, 'button', 'secondary', 'Descartar');
    discard.setAttribute('type', 'button');
    discard.id = 'adm2-flags-discard';
    discard.addEventListener('click', function () { state.flags.edits = {}; renderFlags(state); renderStrip(state); setStatus(state, '', ''); });
    var save = el(doc, 'button', null, 'Salvar alterações');
    save.setAttribute('type', 'button');
    save.id = 'adm2-flags-save';
    save.addEventListener('click', function () { askSave(state); });
    bar.appendChild(count);
    bar.appendChild(discard);
    bar.appendChild(save);
    card.appendChild(bar);
    section.appendChild(card);
    state.flagsUi = { section: section, tools: tools, status: status, retry: retry, list: list, bar: bar, count: count };
    return section;
  }

  // ----- Montagem -----

  function buildBar(state) {
    var doc = state.doc;
    var bar = el(doc, 'div', 'adm2-bar');
    bar.id = 'adm2-bar';
    var back = el(doc, 'button', 'adm2-back');
    back.setAttribute('type', 'button');
    back.id = 'adm2-back';
    back.setAttribute('aria-label', 'Voltar para a área do membro');
    back.appendChild(svg(doc, [BACK_ICON], 'adm2-back__icon'));
    back.appendChild(el(doc, 'span', null, 'Voltar'));
    back.addEventListener('click', function () {
      var original = doc.getElementById('btn-exit-admin-mode');
      if (original) original.click();
    });
    var tabs = el(doc, 'nav', 'adm2-tabs');
    tabs.setAttribute('aria-label', 'Seções da administração');
    bar.appendChild(back);
    bar.appendChild(tabs);
    state.tabsEl = tabs;
    return bar;
  }

  function buildStrip(state) {
    var doc = state.doc;
    var strip = el(doc, 'section', 'adm2-strip');
    strip.setAttribute('aria-labelledby', 'adm2-strip-title');
    strip.appendChild(el(doc, 'p', 'adm2-strip__eyebrow', 'Para resolver hoje'));
    var title = el(doc, 'h2', 'adm2-strip__title', 'Pendências da gestão');
    title.id = 'adm2-strip-title';
    strip.appendChild(title);
    strip.appendChild(el(doc, 'p', 'adm2-strip__hint', 'Toque num número para abrir a seção correspondente.'));
    var chips = el(doc, 'div', 'adm2-chips');
    strip.appendChild(chips);
    state.chipsEl = chips;
    return strip;
  }

  /** Monta a barra, a faixa e a seção Flags (uma vez por tela). Chamado a cada abertura de painel administrativo. */
  function mount(app, doc) {
    var d = doc || root.document;
    var main = d.querySelector('.app-main');
    var nav = d.getElementById(NAV_ID);
    if (!main || !nav) return null;
    ensureStyles(d);
    if (mounted && mounted.main === main) { sync(mounted); return mounted.bar; }
    var journal = createJournal();
    var state = {
      app: app || root.App, doc: d, main: main, journal: journal, pending: {},
      flags: { status: 'idle', items: [], edits: {}, filter: '', error: '' },
    };
    state.bar = buildBar(state);
    state.strip = buildStrip(state);
    state.bar.hidden = true;
    state.strip.hidden = true;
    var footer = main.querySelector('footer');
    journal.add(buildFlagsPanel(state), main, footer);
    journal.add(state.strip, main, main.firstChild);
    journal.add(state.bar, main, state.strip.nextSibling);

    var observer = null;
    if (typeof root.MutationObserver === 'function') {
      observer = new root.MutationObserver(function () { renderTabs(state); sync(state); });
      observer.observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
      journal.undo(function () { observer.disconnect(); });
    }
    var onPanel = function () { sync(state); };
    d.addEventListener('laift:panelchange', onPanel);
    journal.undo(function () { d.removeEventListener('laift:panelchange', onPanel); });
    journal.undo(function () { d.documentElement.removeAttribute(ACTIVE_ATTR); });

    mounted = state;
    renderTabs(state);
    renderStrip(state);
    renderFlags(state);
    sync(state);
    return state.bar;
  }

  /** Abre a seção Flags: monta se preciso e lê as flags. */
  function loadFlags(app, doc) {
    var d = doc || root.document;
    if (!mounted) mount(app, d);
    if (!mounted) return Promise.resolve();
    return loadFlagsData(mounted);
  }

  /** O Painel de sempre avisa os indicadores que leu (null = falhou); a faixa usa "propostas em análise". */
  function setIndicators(indicators) {
    lastIndicators = indicators && typeof indicators === 'object' ? indicators : null;
    if (mounted) renderStrip(mounted);
  }

  /** Devolve o modo administrador de sempre (flag desligada depois de montado). */
  function reset() {
    lastIndicators = undefined;
    if (!mounted) return;
    mounted.journal.rollback();
    mounted = null;
  }

  var api = {
    TAB_ORDER: TAB_ORDER, CHIPS: CHIPS, RESERVED_FLAGS: RESERVED_FLAGS, FLAGS_PANEL: FLAGS_PANEL,
    orderTabs: orderTabs, chipValue: chipValue, chipSpoken: chipSpoken, selectionPending: selectionPending,
    deletionsPending: deletionsPending, proposalsPending: proposalsPending, dirtyKeys: dirtyKeys, dirtyText: dirtyText,
    flagMeta: flagMeta, filterFlags: filterFlags, ensureStyles: ensureStyles,
    mount: mount, loadFlags: loadFlags, setIndicators: setIndicators, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftAdminV2 = api;
})(typeof self !== 'undefined' ? self : this);
