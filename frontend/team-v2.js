/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Equipe v2 (flag team_v2_enabled; docs/equipe-v2.md): REAPRESENTA a tela Equipe de sempre sem recriar nada. O
// organograma, o formulário de pedido, os pedidos recebidos e "Meus adicionados" continuam sendo os mesmos nós, com os
// mesmos ids, montados por app.js com as mesmas chamadas e regras de conexão. Este script só acrescenta um cabeçalho e
// quatro atalhos (Organograma, Adicionar, Pedidos, Meus adicionados) que mostram um cartão por vez (atributo hidden).
// A contagem de Pedidos é o número de pedidos já listados na tela. Tudo é registrado num diário e DESFEITO por reset().
// Carregado SOB DEMANDA (pacote "equipe2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro; sem estilo inline.
// Expõe window.LaiftTeamV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-orgchart';
  var STYLE_HREF = 'team-v2.css';
  var STYLE_ATTR = 'data-team-v2-css';
  /** Abas: key, rótulo e o id que identifica o cartão de sempre (sobe até o .card). */
  var TABS = [
    { key: 'org', label: 'Organograma', childId: 'orgchart-tree' },
    { key: 'add', label: 'Adicionar', childId: 'form-connection-request' },
    { key: 'ped', label: 'Pedidos', childId: 'connection-requests-list' },
    { key: 'con', label: 'Meus adicionados', childId: 'my-connections-list' },
  ];
  var COPY = { kicker: 'Liga', title: 'Equipe', groupLabel: 'Seções da equipe' };

  // ---------- Funções puras ----------

  /** Rótulo da aba: "Pedidos (2)" com pedidos listados; sem pedidos, só "Pedidos". */
  function tabLabel(tab, pending) {
    return tab.key === 'ped' && pending > 0 ? tab.label + ' (' + pending + ')' : tab.label;
  }

  /** Quantos itens reais (article.list-item) a lista tem. */
  function countItems(list) { return list ? list.querySelectorAll('article.list-item').length : 0; }

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

  function createJournal() {
    var steps = [];
    return {
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
          if (step.kind === 'add') { if (step.node.parentNode) step.node.parentNode.removeChild(step.node); }
          else if (step.kind === 'attr') { if (step.had) step.node.setAttribute(step.name, step.old); else step.node.removeAttribute(step.name); }
          else step.fn();
        }
        steps = [];
      },
    };
  }

  var mounted = null;

  function select(state, key) {
    state.current = key;
    state.tabs.forEach(function (tab) {
      var on = tab.cfg.key === key;
      tab.button.setAttribute('aria-pressed', on ? 'true' : 'false');
      if (tab.card) {
        if (on) tab.card.removeAttribute('hidden'); else tab.card.setAttribute('hidden', '');
      }
    });
  }

  function refreshCounts(state) {
    state.tabs.forEach(function (tab) {
      if (tab.cfg.key !== 'ped') return;
      tab.button.textContent = tabLabel(tab.cfg, countItems(state.pedList));
    });
  }

  function buildChrome(ctx) {
    var doc = ctx.doc;
    var hero = el(doc, 'header', 'tm2-hero');
    hero.appendChild(el(doc, 'p', 'tm2-hero__kicker', COPY.kicker));
    hero.appendChild(el(doc, 'h2', 'tm2-hero__title', COPY.title));
    var group = el(doc, 'div', 'tm2-tabs');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', COPY.groupLabel);
    var first = ctx.panel.querySelector('.card');
    ctx.journal.add(hero, ctx.panel, first);
    ctx.journal.add(group, ctx.panel, first);
    return group;
  }

  /** Reapresenta a Equipe (uma vez por tela). Chamado a cada abertura; as próximas só atualizam a contagem. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    if (!panel) return null;
    ensureStyles(d);
    if (mounted && mounted.panel === panel) { refreshCounts(mounted); return panel; }
    var journal = createJournal();
    var ctx = { doc: d, panel: panel, journal: journal };
    var cards = TABS.map(function (cfg) {
      var node = d.getElementById(cfg.childId);
      return node ? cardOf(node) : null;
    });
    if (!cards[0]) return null;
    var group = buildChrome(ctx);
    var state = { panel: panel, journal: journal, tabs: [], current: 'org', pedList: d.getElementById('connection-requests-list') };
    TABS.forEach(function (cfg, i) {
      var button = el(d, 'button', 'tm2-tab', tabLabel(cfg, 0));
      button.setAttribute('type', 'button');
      button.setAttribute('data-tm2-tab', cfg.key);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () { select(state, cfg.key); });
      group.appendChild(button);
      var card = cards[i];
      if (card) {
        journal.attr(card, 'data-tm2-card', cfg.key);
        journal.undo(function () { card.removeAttribute('hidden'); });
      }
      state.tabs.push({ cfg: cfg, button: button, card: card });
    });
    if (state.pedList && typeof root.MutationObserver === 'function') {
      var observer = new root.MutationObserver(function () { refreshCounts(state); });
      observer.observe(state.pedList, { childList: true });
      journal.undo(function () { observer.disconnect(); });
    }
    journal.attr(panel, 'data-tm2', '1');
    select(state, 'org');
    refreshCounts(state);
    mounted = state;
    return panel;
  }

  /** Devolve a tela de sempre (flag desligada depois de montado). */
  function reset() {
    if (!mounted) return;
    mounted.journal.rollback();
    mounted = null;
  }

  var api = { TABS: TABS, COPY: COPY, tabLabel: tabLabel, countItems: countItems, ensureStyles: ensureStyles, mount: mount, reset: reset };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftTeamV2 = api;
})(typeof self !== 'undefined' ? self : this);
