/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tarefas v2 (flag tasks_v2_enabled; docs/tarefas-v2.md): REORGANIZA a tela de Tarefas de sempre sem recriar nada.
// #tasks-status e #tasks-list (escritos por app.js, com Aderir, Marcar como concluída e Comentários) continuam os mesmos
// nós: este script só acrescenta um cabeçalho, um resumo (números lidos dos itens que já estão na tela) e as listas
// "Disponíveis" e "Minhas tarefas" (filtro por esconder itens). Tudo é registrado num diário e DESFEITO por reset().
// Carregado SOB DEMANDA (pacote "tarefas2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement e
// textContent); sem HTML por texto e sem estilo inline. O CSS (tasks-v2.css) vale só sob a flag.
// Expõe window.LaiftTasksV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-tasks';
  var STYLE_HREF = 'tasks-v2.css';
  var STYLE_ATTR = 'data-tasks-v2-css';

  // ---------- Funções puras ----------

  /** Totais a partir do estado de cada tarefa: 'open' (disponível), 'mine' (aderida, em curso) ou 'done' (concluída). */
  function taskCounts(states) {
    var list = states || [];
    function n(s) { return list.filter(function (x) { return x === s; }).length; }
    return { total: list.length, open: n('open'), mine: n('mine'), done: n('done') };
  }

  /** Texto do resumo em destaque. loading: ainda sem itens e carregando; error: falha ao carregar sem itens. */
  function tasksSummary(counts, loading, error, note) {
    if (loading) return { title: 'Carregando tarefas', sub: '' };
    if (error) return { title: 'Não foi possível carregar as tarefas', sub: note || '' };
    if (!counts.total) return { title: 'Nenhuma tarefa publicada', sub: note || 'Novas tarefas aparecem aqui.' };
    var title = counts.mine ? (counts.mine === 1 ? '1 tarefa em curso' : counts.mine + ' tarefas em curso') : 'Nenhuma tarefa em curso';
    var sub = counts.open ? (counts.open === 1 ? '1 disponível para você aderir' : counts.open + ' disponíveis para você aderir') : 'Nenhuma tarefa disponível agora';
    return { title: title, sub: sub };
  }

  /** A tarefa aparece na lista escolhida? tab: 'open' | 'mine'; sub (só em 'mine'): 'all' | 'mine' | 'done'. */
  function isVisible(state, tab, sub) {
    if (tab === 'open') return state === 'open';
    if (state === 'open') return false;
    return sub === 'all' || sub === state;
  }

  /** Mensagem quando há tarefas, mas nenhuma na lista escolhida (vazia quando algo aparece). */
  function emptyMessage(counts, tab, sub) {
    if (tab === 'open') {
      return counts.open ? null : { title: 'Nenhuma tarefa disponível agora', text: counts.total ? 'Você já aderiu a todas as tarefas atuais.' : 'Novas tarefas aparecem aqui.' };
    }
    var shown = sub === 'all' ? counts.mine + counts.done : counts[sub];
    if (shown) return null;
    return sub === 'all'
      ? { title: 'Você ainda não tem tarefas', text: 'Adira a uma tarefa disponível para acompanhar aqui.' }
      : { title: 'Nenhuma tarefa nesta situação', text: 'Troque o filtro para ver as outras.' };
  }

  // ---------- DOM ----------

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
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

  function cardOf(node) {
    var cur = node;
    while (cur && !(cur.classList && cur.classList.contains('card'))) cur = cur.parentNode;
    return cur || null;
  }

  var mounted = null;

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

  function items(doc) {
    var list = doc.getElementById('tasks-list');
    return list ? Array.prototype.slice.call(list.querySelectorAll('.list-item')) : [];
  }

  function stateOf(item) { return item.getAttribute('data-task-state') || 'open'; }

  function chip(doc, label, count, pressed, onClick) {
    var node = el(doc, 'button', 't2-chip');
    node.setAttribute('type', 'button');
    node.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    node.appendChild(el(doc, 'span', null, label));
    node.appendChild(el(doc, 'span', 't2-chip__n', String(count)));
    node.addEventListener('click', onClick);
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /** Atualiza resumo, filtros, itens escondidos e a mensagem de lista vazia a partir do que app.js desenhou. */
  function refresh(state, doc) {
    var all = items(doc);
    var counts = taskCounts(all.map(stateOf));
    var status = doc.getElementById('tasks-status');
    var note = status ? (status.textContent || '').trim() : '';
    var kind = status ? status.getAttribute('data-kind') : null;
    var loading = !counts.total && /^Carregando/.test(note);
    var error = !counts.total && kind === 'error';
    var summary = tasksSummary(counts, loading, error, note);
    var f = state.foco;
    f.title.textContent = summary.title;
    f.sub.textContent = summary.sub;
    f.open.textContent = String(counts.open);
    f.mine.textContent = String(counts.mine);
    f.done.textContent = String(counts.done);
    f.stats.hidden = !counts.total;

    clear(state.tabs);
    state.tabs.hidden = !counts.total;
    state.tabs.appendChild(chip(doc, 'Disponíveis', counts.open, state.tab === 'open', function () { state.tab = 'open'; refresh(state, doc); }));
    state.tabs.appendChild(chip(doc, 'Minhas tarefas', counts.mine + counts.done, state.tab === 'mine', function () { state.tab = 'mine'; state.sub = 'all'; refresh(state, doc); }));
    clear(state.subs);
    state.subs.hidden = !counts.total || state.tab !== 'mine';
    [['all', 'Todas', counts.mine + counts.done], ['mine', 'Em curso', counts.mine], ['done', 'Concluídas', counts.done]].forEach(function (s) {
      state.subs.appendChild(chip(doc, s[1], s[2], state.sub === s[0], function () { state.sub = s[0]; refresh(state, doc); }));
    });

    all.forEach(function (item) { item.hidden = !isVisible(stateOf(item), state.tab, state.sub); });
    var empty = counts.total ? emptyMessage(counts, state.tab, state.sub) : null;
    state.empty.hidden = !empty;
    state.emptyTitle.textContent = empty ? empty.title : '';
    state.emptyText.textContent = empty ? empty.text : '';
  }

  function buildHero(state, ctx) {
    var hero = el(ctx.doc, 'header', 't2-hero');
    ctx.journal.add(hero, ctx.panel, ctx.panel.firstChild);
    hero.appendChild(el(ctx.doc, 'p', 't2-hero__kicker', 'Contribua com a liga'));
    var title = ctx.panel.querySelector('h1');
    if (title) { ctx.journal.attr(title, 'class', 't2-hero__title'); ctx.journal.move(title, hero, null); }
    return hero;
  }

  function buildFoco(ctx, before) {
    var doc = ctx.doc;
    var foco = el(doc, 'section', 't2-foco');
    foco.setAttribute('aria-labelledby', 't2-foco-title');
    foco.appendChild(el(doc, 'p', 't2-foco__label', 'Minhas tarefas'));
    var title = el(doc, 'h2', 't2-foco__title', 'Carregando tarefas');
    title.id = 't2-foco-title';
    foco.appendChild(title);
    var sub = el(doc, 'p', 't2-foco__sub', '');
    foco.appendChild(sub);
    var stats = el(doc, 'div', 't2-stats');
    var refs = {};
    [['mine', 'Em curso'], ['done', 'Concluídas'], ['open', 'Disponíveis']].forEach(function (s) {
      var cell = el(doc, 'div', 't2-stat');
      refs[s[0]] = el(doc, 'b', null, '0');
      cell.appendChild(refs[s[0]]);
      cell.appendChild(el(doc, 'span', null, s[1]));
      stats.appendChild(cell);
    });
    foco.appendChild(stats);
    ctx.journal.add(foco, ctx.panel, before);
    return { title: title, sub: sub, stats: stats, open: refs.open, mine: refs.mine, done: refs.done };
  }

  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    if (!panel) return null;
    ensureStyles(d);
    if (mounted && mounted.panel === panel) { refresh(mounted, d); return mounted.hero; }
    var list = d.getElementById('tasks-list');
    var status = d.getElementById('tasks-status');
    var card = cardOf(list);
    if (!list || !status || !card) return null; // a tela de sempre manda
    var journal = createJournal();
    var ctx = { doc: d, panel: panel, journal: journal };
    var state = { panel: panel, journal: journal, tab: 'open', sub: 'all' };
    state.hero = buildHero(state, ctx);
    state.foco = buildFoco(ctx, card);
    state.tabs = el(d, 'div', 't2-chips');
    state.tabs.setAttribute('role', 'group');
    state.tabs.setAttribute('aria-label', 'Escolher lista');
    state.subs = el(d, 'div', 't2-chips t2-chips--sub');
    state.subs.setAttribute('role', 'group');
    state.subs.setAttribute('aria-label', 'Filtrar por situação');
    state.empty = el(d, 'div', 't2-empty');
    state.empty.setAttribute('role', 'status');
    state.emptyTitle = el(d, 'strong', null, '');
    state.emptyText = el(d, 'span', null, '');
    state.empty.appendChild(state.emptyTitle);
    state.empty.appendChild(state.emptyText);
    journal.add(state.tabs, card, status);
    journal.add(state.subs, card, status);
    journal.add(state.empty, card, list);
    card.classList.add('t2-card');
    journal.undo(function () { card.classList.remove('t2-card'); });
    journal.attr(panel, 'data-t2', '1');
    if (typeof root.MutationObserver === 'function') {
      var observer = new root.MutationObserver(function () { refresh(state, d); });
      observer.observe(list, { childList: true });
      observer.observe(status, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-kind'] });
      journal.undo(function () { observer.disconnect(); });
    }
    refresh(state, d);
    mounted = state;
    return state.hero;
  }

  function reset() {
    if (!mounted) return;
    var all = items(mounted.panel.ownerDocument);
    mounted.journal.rollback();
    all.forEach(function (item) { item.hidden = false; });
    mounted = null;
  }

  var api = {
    taskCounts: taskCounts, tasksSummary: tasksSummary, isVisible: isVisible, emptyMessage: emptyMessage,
    ensureStyles: ensureStyles, mount: mount, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftTasksV2 = api;
})(typeof self !== 'undefined' ? self : this);
