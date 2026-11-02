/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Propostas v2 (flag proposals_v2_enabled; docs/propostas-v2.md): REORGANIZA a tela de Propostas de sempre sem recriar nada.
// Os ids (form-proposal, proposal-title, proposal-description, msg-proposal, my-proposals-list, voting-status, voting-list)
// e as listas escritas por app.js continuam os mesmos nós: este script só os REPOSICIONA em um cabeçalho, um resumo da
// votação (números lidos dos itens que já estão na tela), a votação em primeiro lugar, "Minhas propostas" com filtro por
// situação e o formulário numa seção recolhível. Tudo o que faz é registrado num diário e DESFEITO por reset().
// Carregado SOB DEMANDA (pacote "propostas2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement,
// createElementNS e textContent); sem HTML por texto e sem estilo inline. O CSS (proposals-v2.css) vale só sob a flag.
// Expõe window.LaiftProposalsV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-proposals';
  var STYLE_HREF = 'proposals-v2.css';
  var STYLE_ATTR = 'data-proposals-v2-css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var CHEVRON = 'M6 9l6 6 6-6';
  var PLUS_ICON = 'M12 5v14M5 12h14';
  var CHECK_ICON = 'M5 12l5 5 9-10';
  var FORM_BODY_ID = 'pr2-body-form';

  /** Situações de uma proposta (as mesmas de app.js) na ordem em que os filtros aparecem. */
  var STATUS_LABELS = {
    submitted: 'Em análise', approved: 'Aprovada', rejected: 'Rejeitada',
    voting_open: 'Votação aberta', voting_closed: 'Votação encerrada',
  };
  var STATUS_ORDER = ['submitted', 'approved', 'rejected', 'voting_open', 'voting_closed'];

  // ---------- Funções puras ----------

  /** Totais da votação: quantas estão abertas, em quantas a pessoa já votou e quantas aguardam o voto. */
  function voteCounts(votedFlags) {
    var list = votedFlags || [];
    var voted = list.filter(function (v) { return v === true; }).length;
    return { total: list.length, voted: voted, pending: list.length - voted };
  }

  /** Texto do resumo em destaque. state: 'loading' | 'error' | 'ready'; note = aviso da tela (ex.: só membros votam). */
  function votingSummary(counts, state, note) {
    if (state === 'loading') return { title: 'Carregando votações', sub: '', canVote: false };
    if (state === 'error') return { title: 'Não foi possível carregar as votações', sub: 'Use "Tentar de novo" na lista abaixo.', canVote: false };
    if (!counts.total) return { title: 'Nenhuma votação aberta', sub: note || 'Quando houver uma, ela aparece aqui.', canVote: false };
    var title = counts.total === 1 ? '1 votação aberta' : counts.total + ' votações abertas';
    if (!counts.pending) return { title: title, sub: 'Você já votou em ' + (counts.total === 1 ? 'ela.' : 'todas.'), canVote: false };
    var sub = counts.pending === 1 ? '1 aguarda o seu voto' : counts.pending + ' aguardam o seu voto';
    return { title: title, sub: sub, canVote: true };
  }

  /** Filtros de "Minhas propostas": Todas e só as situações que existem, com a quantidade. */
  function proposalFilters(statuses) {
    var list = statuses || [];
    var filters = [{ key: 'all', label: 'Todas', count: list.length }];
    STATUS_ORDER.forEach(function (key) {
      var count = list.filter(function (s) { return s === key; }).length;
      if (count) filters.push({ key: key, label: STATUS_LABELS[key], count: count });
    });
    return filters;
  }

  /** A proposta aparece no filtro escolhido? */
  function matchesFilter(status, key) { return key === 'all' || status === key; }

  /** Estado seguinte de uma seção: aria-expanded em texto. */
  function expandedValue(open) { return open ? 'true' : 'false'; }

  // ---------- DOM ----------

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function svg(doc, d, className) {
    var node = doc.createElementNS(SVG_NS, 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('focusable', 'false');
    if (className) node.setAttribute('class', className);
    var path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    node.appendChild(path);
    return node;
  }

  function button(doc, className, label, iconPath) {
    var node = el(doc, 'button', className);
    node.setAttribute('type', 'button');
    if (iconPath) node.appendChild(svg(doc, iconPath, 'pr2-ico'));
    node.appendChild(el(doc, 'span', null, label));
    return node;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  /** Sobe até o .card que contém o nó. */
  function cardOf(node) {
    var cur = node;
    while (cur && !(cur.classList && cur.classList.contains('card'))) cur = cur.parentNode;
    return cur || null;
  }

  function prefersReducedMotion(win) {
    return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /** Estado do que foi montado (um por documento). */
  var mounted = null;

  /** Diário: cada mudança registra como desfazer; rollback() devolve a tela de sempre. */
  function createJournal() {
    var steps = [];
    return {
      move: function (node, parent, before) {
        steps.push({ kind: 'move', node: node, parent: node.parentNode, next: node.nextSibling });
        parent.insertBefore(node, before || null);
      },
      add: function (node, parent, before) {
        steps.push({ kind: 'add', node: node });
        parent.insertBefore(node, before || null);
      },
      attr: function (node, name, value) {
        steps.push({ kind: 'attr', node: node, name: name, had: node.hasAttribute(name), old: node.getAttribute(name) });
        node.setAttribute(name, value);
      },
      undo: function (fn) { steps.push({ kind: 'fn', fn: fn }); },
      rollback: function () {
        for (var i = steps.length - 1; i >= 0; i--) {
          var step = steps[i];
          if (step.kind === 'move') step.parent.insertBefore(step.node, step.next);
          else if (step.kind === 'add') { if (step.node.parentNode) step.node.parentNode.removeChild(step.node); }
          else if (step.kind === 'attr') { if (step.had) step.node.setAttribute(step.name, step.old); else step.node.removeAttribute(step.name); }
          else step.fn();
        }
        steps = [];
      },
    };
  }

  // ---------- Leitura do que app.js já desenhou ----------

  function votingItems(doc) {
    var list = doc.getElementById('voting-list');
    return list ? Array.prototype.slice.call(list.querySelectorAll('.list-item')) : [];
  }

  /** 'loading' | 'error' | 'ready', pelo que está na lista de votações e no aviso. */
  function votingState(doc) {
    var list = doc.getElementById('voting-list');
    var status = doc.getElementById('voting-status');
    if (list && list.querySelector('.state-error')) return 'error';
    var busy = list && (list.getAttribute('aria-busy') === 'true' || list.querySelector('.skeleton'));
    var loadingText = status && /^Carregando/.test(status.textContent || '');
    return busy || loadingText ? 'loading' : 'ready';
  }

  // ---------- Montagem ----------

  function toggleForm(state, open) {
    state.form.open = open;
    state.form.button.setAttribute('aria-expanded', expandedValue(open));
    state.form.body.hidden = !open;
    state.form.card.classList.toggle('is-open', open);
  }

  /** O cartão do formulário vira seção recolhível: o título vira botão e o resto vai para o corpo. */
  function buildFormSection(state, ctx) {
    var doc = ctx.doc;
    var journal = ctx.journal;
    var card = state.formCard;
    var heading = card.querySelector('h2');
    if (!heading) return;
    var originalNodes = [];
    while (heading.firstChild) { originalNodes.push(heading.firstChild); heading.removeChild(heading.firstChild); }
    var toggle = el(doc, 'button', 'pr2-sec__toggle');
    toggle.setAttribute('type', 'button');
    toggle.id = 'pr2-toggle-form';
    toggle.setAttribute('aria-controls', FORM_BODY_ID);
    toggle.appendChild(el(doc, 'span', 'pr2-sec__title', 'Enviar proposta'));
    toggle.appendChild(svg(doc, CHEVRON, 'pr2-sec__chevron'));
    heading.appendChild(toggle);
    var body = el(doc, 'div', 'pr2-sec__body');
    body.id = FORM_BODY_ID;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', toggle.id);
    var rest = [];
    for (var i = 0; i < card.children.length; i++) if (card.children[i] !== heading) rest.push(card.children[i]);
    journal.add(body, card, null);
    rest.forEach(function (node) { journal.move(node, body, null); });
    journal.undo(function () {
      while (heading.firstChild) heading.removeChild(heading.firstChild);
      originalNodes.forEach(function (node) { heading.appendChild(node); });
      card.classList.remove('pr2-sec', 'is-open');
    });
    card.classList.add('pr2-sec');
    state.form = { card: card, button: toggle, body: body, open: false };
    toggle.addEventListener('click', function () { toggleForm(state, !state.form.open); });
    toggleForm(state, false);
  }

  /** Cabeçalho: "Participe das decisões", o título de sempre (o h1, movido) e o atalho para enviar uma proposta. */
  function buildHero(state, ctx) {
    var doc = ctx.doc;
    var journal = ctx.journal;
    var hero = el(doc, 'header', 'pr2-hero');
    journal.add(hero, ctx.panel, ctx.panel.firstChild);
    hero.appendChild(el(doc, 'p', 'pr2-hero__kicker', 'Participe das decisões'));
    var title = ctx.panel.querySelector('h1');
    if (title) { journal.attr(title, 'class', 'pr2-hero__title'); journal.move(title, hero, null); }
    var send = button(doc, 'pr2-hero__send', 'Enviar proposta', PLUS_ICON);
    send.id = 'pr2-send';
    send.addEventListener('click', function () {
      toggleForm(state, true);
      var field = doc.getElementById('proposal-title');
      if (field) {
        field.scrollIntoView({ behavior: prefersReducedMotion(root) ? 'auto' : 'smooth', block: 'center' });
        field.focus({ preventScroll: true });
      }
    });
    hero.appendChild(send);
  }

  /** Resumo em destaque da votação: números lidos dos itens que já estão na tela. */
  function buildFoco(state, ctx) {
    var doc = ctx.doc;
    var foco = el(doc, 'section', 'pr2-foco');
    foco.setAttribute('aria-labelledby', 'pr2-foco-title');
    foco.appendChild(el(doc, 'p', 'pr2-foco__label', 'Votação aberta'));
    var title = el(doc, 'h2', 'pr2-foco__title', 'Carregando votações');
    title.id = 'pr2-foco-title';
    foco.appendChild(title);
    var sub = el(doc, 'p', 'pr2-foco__sub', '');
    foco.appendChild(sub);
    var bar = el(doc, 'progress', 'pr2-foco__bar');
    bar.setAttribute('aria-label', 'Votações em que você já votou');
    bar.max = 1;
    bar.value = 0;
    foco.appendChild(bar);
    var go = button(doc, 'pr2-foco__go', 'Votar agora', CHECK_ICON);
    go.addEventListener('click', function () {
      var target = null;
      votingItems(doc).some(function (item) { if (item.getAttribute('data-voted') === 'false') { target = item; return true; } return false; });
      var card = state.voteCard;
      (target || card).scrollIntoView({ behavior: prefersReducedMotion(root) ? 'auto' : 'smooth', block: 'start' });
      var firstButton = target ? target.querySelector('.actions-row button') : null;
      if (firstButton) firstButton.focus({ preventScroll: true });
    });
    foco.appendChild(go);
    ctx.journal.add(foco, ctx.panel, state.voteCard);
    return { title: title, sub: sub, bar: bar, go: go };
  }

  function refreshFoco(state, doc) {
    var items = votingItems(doc);
    var counts = voteCounts(items.map(function (item) { return item.getAttribute('data-voted') === 'true'; }));
    var status = doc.getElementById('voting-status');
    var summary = votingSummary(counts, votingState(doc), status ? (status.textContent || '').trim() : '');
    var parts = state.foco;
    parts.title.textContent = summary.title;
    parts.sub.textContent = summary.sub;
    parts.bar.max = counts.total || 1;
    parts.bar.value = counts.voted;
    parts.bar.hidden = !counts.total;
    parts.go.hidden = !summary.canVote;
  }

  /** Filtro de "Minhas propostas": botões por situação, refeitos quando a lista é recarregada. */
  function refreshMine(state, doc) {
    var list = doc.getElementById('my-proposals-list');
    if (!list) return;
    var items = Array.prototype.slice.call(list.querySelectorAll('.list-item'));
    var filters = proposalFilters(items.map(function (item) { return item.getAttribute('data-status'); }));
    if (!filters.some(function (f) { return f.key === state.filter; })) state.filter = 'all';
    var box = state.chips;
    while (box.firstChild) box.removeChild(box.firstChild);
    box.hidden = filters.length < 3; // com uma só situação o filtro não ajuda
    filters.forEach(function (f) {
      var chip = el(doc, 'button', 'pr2-chip');
      chip.setAttribute('type', 'button');
      chip.setAttribute('aria-pressed', f.key === state.filter ? 'true' : 'false');
      chip.appendChild(el(doc, 'span', null, f.label));
      chip.appendChild(el(doc, 'span', 'pr2-chip__n', String(f.count)));
      chip.addEventListener('click', function () { state.filter = f.key; refreshMine(state, doc); });
      box.appendChild(chip);
    });
    items.forEach(function (item) { item.hidden = !matchesFilter(item.getAttribute('data-status'), state.filter); });
  }

  /** Observa o que app.js reescreve (listas e aviso) e atualiza o resumo e o filtro; desligado por reset(). */
  function watch(state, ctx) {
    if (typeof root.MutationObserver !== 'function') return;
    var doc = ctx.doc;
    var voting = new root.MutationObserver(function () { refreshFoco(state, doc); });
    ['voting-list', 'voting-status'].forEach(function (id) {
      var node = doc.getElementById(id);
      if (node) voting.observe(node, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['aria-busy'] });
    });
    var mine = new root.MutationObserver(function () { refreshMine(state, doc); });
    var list = doc.getElementById('my-proposals-list');
    if (list) mine.observe(list, { childList: true });
    ctx.journal.undo(function () { voting.disconnect(); mine.disconnect(); });
  }

  /** Reorganiza Propostas (uma vez por tela). Chamado a cada abertura; as próximas só atualizam o resumo. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    if (!panel) return null;
    ensureStyles(d);
    if (mounted && mounted.panel === panel) {
      refreshFoco(mounted, d);
      refreshMine(mounted, d);
      return mounted.hero;
    }
    var grid = panel.querySelector('.grid-2');
    var formCard = cardOf(d.getElementById('form-proposal'));
    var mineCard = cardOf(d.getElementById('my-proposals-list'));
    var voteCard = cardOf(d.getElementById('voting-list'));
    if (!grid || !formCard || !mineCard || !voteCard) return null; // a tela de sempre manda
    var journal = createJournal();
    var ctx = { doc: d, panel: panel, journal: journal };
    var state = { panel: panel, journal: journal, formCard: formCard, mineCard: mineCard, voteCard: voteCard, filter: 'all', form: null, hero: null, foco: null, chips: null };
    buildHero(state, ctx);
    state.hero = panel.firstChild;
    state.foco = buildFoco(state, ctx);
    journal.move(voteCard, panel, grid);
    journal.move(mineCard, grid, formCard);
    buildFormSection(state, ctx);
    [voteCard, mineCard, formCard].forEach(function (card) {
      card.classList.add('pr2-card');
      journal.undo(function () { card.classList.remove('pr2-card'); });
    });
    state.chips = el(d, 'div', 'pr2-chips');
    state.chips.setAttribute('role', 'group');
    state.chips.setAttribute('aria-label', 'Filtrar minhas propostas');
    journal.add(state.chips, mineCard, d.getElementById('my-proposals-list'));
    journal.attr(panel, 'data-pr2', '1');
    watch(state, ctx);
    refreshFoco(state, d);
    refreshMine(state, d);
    mounted = state;
    return state.hero;
  }

  /** Devolve a tela de sempre (flag desligada depois de montado). */
  function reset() {
    if (!mounted) return;
    var shown = Array.prototype.slice.call(mounted.panel.querySelectorAll('#my-proposals-list .list-item'));
    mounted.journal.rollback();
    shown.forEach(function (item) { item.hidden = false; });
    mounted = null;
  }

  var api = {
    STATUS_LABELS: STATUS_LABELS, STATUS_ORDER: STATUS_ORDER, voteCounts: voteCounts, votingSummary: votingSummary,
    proposalFilters: proposalFilters, matchesFilter: matchesFilter, expandedValue: expandedValue,
    ensureStyles: ensureStyles, mount: mount, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftProposalsV2 = api;
})(typeof self !== 'undefined' ? self : this);
