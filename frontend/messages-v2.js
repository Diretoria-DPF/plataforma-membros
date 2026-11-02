/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mensagens v2 (flag messages_v2_enabled; docs/mensagens-v2.md): REAPRESENTA a tela Mensagens de sempre sem recriar
// nada. A cifragem (msg-crypto.js), as chamadas e o fluxo de messaging.js não são tocados: os nós de sempre
// (messaging-main-card, lista de conversas, conversa aberta, banner de chave, campo, contador e botões) continuam os
// mesmos, com os mesmos ids. Este script só acrescenta cabeçalho, aviso, o espaço "Escolha uma conversa" e o atalho
// "Ir para a Equipe" (sem conversas), e dá teclado e papel de botão às linhas da lista. O lado a lado no desktop e o
// alternar lista/conversa no celular vêm do CSS (messages-v2.css). Tudo é registrado num diário e DESFEITO por reset().
// Carregado SOB DEMANDA (pacote "mensagens2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement,
// createElementNS e textContent); sem HTML por texto e sem estilo inline.
// Expõe window.LaiftMessagesV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-messages';
  var STYLE_HREF = 'messages-v2.css';
  var STYLE_ATTR = 'data-messages-v2-css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ITEM_SELECTOR = '.chat-list-item';
  var LOCK_ICON = ['M5 11h14v10H5z', 'M8 11V8a4 4 0 0 1 8 0v3'];
  var CHAT_ICON = ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 21 12z'];
  var TEAM_ICON = ['M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M3 20c0-3 2.5-5 6-5', 'M17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', 'M15 15c3 0 6 1.5 6 5'];
  var COPY = {
    kicker: 'Conversas cifradas',
    title: 'Mensagens',
    note: 'Suas mensagens são cifradas de ponta a ponta — nem a liga consegue ler.',
    emptyTitle: 'Escolha uma conversa',
    emptyText: 'Selecione alguém na lista para ver as mensagens.',
    cta: 'Ir para a Equipe',
    threadLabel: 'Mensagens da conversa',
  };

  // ---------- Funções puras ----------

  /** Enter e espaço ativam uma linha da lista (como um botão). */
  function isActivationKey(key) { return key === 'Enter' || key === ' ' || key === 'Spacebar'; }

  /** A lista já carregou e não tem nenhuma conversa (só o aviso de vazio, sem linhas)? */
  function isListEmpty(itemCount, childCount) { return itemCount === 0 && childCount > 0; }

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

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  /** Diário: tudo o que o script muda é desfeito por rollback(). */
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

  function buildHero(ctx) {
    var doc = ctx.doc;
    var hero = el(doc, 'header', 'm2-hero');
    hero.appendChild(el(doc, 'p', 'm2-hero__kicker', COPY.kicker));
    hero.appendChild(el(doc, 'h2', 'm2-hero__title', COPY.title));
    var note = el(doc, 'div', 'm2-note');
    note.setAttribute('role', 'note');
    note.appendChild(svg(doc, LOCK_ICON, 'm2-note__icon'));
    note.appendChild(el(doc, 'p', 'm2-note__text', COPY.note));
    var anchor = ctx.panel.querySelector('#messaging-preparing') || ctx.panel.firstChild;
    ctx.journal.add(hero, ctx.panel, anchor);
    ctx.journal.add(note, ctx.panel, anchor);
  }

  /** Espaço da direita (desktop) enquanto nenhuma conversa está aberta; o CSS decide quando aparece. */
  function buildEmpty(ctx) {
    var doc = ctx.doc;
    var box = el(doc, 'div', 'm2-empty');
    var icon = el(doc, 'span', 'm2-empty__icon');
    icon.appendChild(svg(doc, CHAT_ICON, 'm2-icon'));
    box.appendChild(icon);
    box.appendChild(el(doc, 'h3', 'm2-empty__title', COPY.emptyTitle));
    box.appendChild(el(doc, 'p', 'm2-empty__text', COPY.emptyText));
    ctx.journal.add(box, ctx.card, null);
  }

  /** Atalho para a Equipe quando não há conversas (aciona a navegação de sempre). */
  function buildCta(ctx, app) {
    var doc = ctx.doc;
    var cta = el(doc, 'button', 'm2-cta');
    cta.setAttribute('type', 'button');
    cta.hidden = true;
    cta.appendChild(svg(doc, TEAM_ICON, 'm2-icon'));
    cta.appendChild(el(doc, 'span', 'm2-cta__label', COPY.cta));
    cta.addEventListener('click', function () {
      var api = app || root.App;
      if (api && typeof api.showPanel === 'function') api.showPanel('panel-orgchart');
    });
    ctx.journal.add(cta, ctx.list.parentNode, null);
    return cta;
  }

  /** Cada linha de conversa vira botão para o teclado e para leitores de tela; o clique de sempre segue valendo. */
  function enhanceItems(list, cta) {
    var items = list.querySelectorAll(ITEM_SELECTOR);
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.getAttribute('data-m2-item') === '1') continue;
      item.setAttribute('data-m2-item', '1');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('keydown', function (evt) {
        if (!isActivationKey(evt.key)) return;
        evt.preventDefault();
        evt.currentTarget.click();
      });
    }
    cta.hidden = !isListEmpty(items.length, list.children.length);
  }

  function watchList(ctx, cta) {
    var list = ctx.list;
    function refresh() { enhanceItems(list, cta); }
    refresh();
    if (typeof root.MutationObserver !== 'function') return refresh;
    var observer = new root.MutationObserver(refresh);
    observer.observe(list, { childList: true });
    ctx.journal.undo(function () {
      observer.disconnect();
      var items = list.querySelectorAll('[data-m2-item]');
      for (var i = 0; i < items.length; i++) {
        items[i].removeAttribute('data-m2-item');
        items[i].removeAttribute('role');
        items[i].removeAttribute('tabindex');
      }
    });
    return refresh;
  }

  /** Reapresenta Mensagens (uma vez por tela). Chamado a cada abertura; as próximas só atualizam a lista. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    var card = d.getElementById('messaging-main-card');
    var list = d.getElementById('messaging-conversations-list');
    if (!panel || !card || !list) return null;
    ensureStyles(d);
    if (mounted && mounted.panel === panel) { mounted.refresh(); return panel; }
    var journal = createJournal();
    var ctx = { doc: d, panel: panel, card: card, list: list, journal: journal };
    buildHero(ctx);
    buildEmpty(ctx);
    var cta = buildCta(ctx, app);
    var refresh = watchList(ctx, cta);
    var thread = d.getElementById('messaging-thread-list');
    if (thread) {
      journal.attr(thread, 'role', 'log');
      journal.attr(thread, 'aria-live', 'polite');
      journal.attr(thread, 'aria-label', COPY.threadLabel);
    }
    journal.attr(panel, 'data-m2', '1');
    mounted = { panel: panel, journal: journal, refresh: refresh };
    return panel;
  }

  /** Devolve a tela de sempre (flag desligada depois de montado). */
  function reset() {
    if (!mounted) return;
    mounted.journal.rollback();
    mounted = null;
  }

  var api = {
    COPY: COPY, isActivationKey: isActivationKey, isListEmpty: isListEmpty, ensureStyles: ensureStyles, mount: mount, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftMessagesV2 = api;
})(typeof self !== 'undefined' ? self : this);
