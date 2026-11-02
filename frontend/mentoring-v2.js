/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mentoria v2 (flag mentoring_v2_enabled; docs/mentoria-v2.md): muda só a APRESENTAÇÃO da Mentoria de sempre. Não recria nada:
// os ids, listas, botões e interruptores continuam os mesmos nós que mentoring.js preenche, então dados, ações, confirmações
// e regras (só membros; aceitar cria a conexão no servidor) seguem exatamente como antes. Este script só (1) transforma o
// primeiro cartão em cabeçalho com um resumo de números REAIS, (2) separa os cartões em duas colunas e (3) acrescenta
// avatar com inicial e etiqueta de situação nas linhas. Tudo é registrado num diário e DESFEITO por reset().
// Carregado SOB DEMANDA (pacote "mentoria2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement e
// textContent); sem HTML por texto e sem estilo inline. O CSS (mentoring-v2.css) vale só sob a flag.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-mentoring';
  var BODY_ID = 'mentoring-body';
  var STYLE_HREF = 'mentoring-v2.css';
  var STYLE_ATTR = 'data-mentoring-v2-css';
  var RENDER_EVENT = 'laift:mentoring-render';
  var LISTS = ['mentoring-as-mentee', 'mentoring-as-mentor', 'mentoring-mentors'];
  // Cartões da tela de sempre, achados por um id que mora dentro deles; col = coluna da v2.
  var CARDS = [
    { childId: 'mentoring-as-mentee', col: 'a' },
    { childId: 'mentoring-mentor-card', col: 'a', isCard: true },
    { childId: 'btn-mentoring-available', col: 'b' },
    { childId: 'mentoring-mentors', col: 'b' },
  ];

  // ---------- Funções puras ----------

  /** Inicial do nome para o avatar (vazio sem nome). */
  function initialOf(name) {
    var text = String(name || '').trim();
    return text ? text.charAt(0).toUpperCase() : '';
  }

  function countStatus(list, status) {
    return (Array.isArray(list) ? list : []).filter(function (l) { return l && l.status === status; }).length;
  }

  /**
   * Números do resumo, tirados só do que a API já devolveu (nada inventado). Devolve null enquanto não há dados ou quando
   * a tela de sempre mostra o aviso de indisponível.
   */
  function statsOf(data) {
    var ov = data && data.overview;
    if (!ov || ov.enabled === false || ov.tableMissing === true) return null;
    var mentee = Array.isArray(ov.asMentee) ? ov.asMentee : [];
    var mentor = Array.isArray(ov.asMentor) ? ov.asMentor : [];
    return {
      active: countStatus(mentee, 'active') + countStatus(mentor, 'active'),
      toAnswer: countStatus(mentor, 'pending'),
      sent: countStatus(mentee, 'pending'),
      available: typeof ov.available === 'boolean' ? ov.available : null,
    };
  }

  /** Itens do resumo: { value, label } para números e { text } para a disponibilidade. */
  function statItems(stats) {
    if (!stats) return [];
    var items = [
      { value: String(stats.active), label: stats.active === 1 ? 'mentoria ativa' : 'mentorias ativas' },
      { value: String(stats.toAnswer), label: stats.toAnswer === 1 ? 'pedido para responder' : 'pedidos para responder' },
      { value: String(stats.sent), label: stats.sent === 1 ? 'pedido enviado' : 'pedidos enviados' },
    ];
    if (stats.available !== null) items.push({ text: stats.available ? 'Disponível como mentor' : 'Não disponível como mentor' });
    return items;
  }

  var PILL_TONE = { active: 'ok', pending: 'wait', declined: 'off', ended: 'off' };

  /** Tom visual da etiqueta de situação (a frase vem do mentoring.js; a cor nunca é o único sinal). */
  function pillTone(status) { return Object.prototype.hasOwnProperty.call(PILL_TONE, status) ? PILL_TONE[status] : 'off'; }

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

  /** Um por documento: diário para desfazer e referências. */
  var mounted = null;

  function lookup(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === id) return list[i];
    return null;
  }

  /** Avatar com inicial e etiqueta de situação nas linhas que mentoring.js acabou de desenhar. */
  function decorateRows(state, data) {
    var doc = state.doc;
    var links = data && data.overview ? (data.overview.asMentee || []).concat(data.overview.asMentor || []) : [];
    LISTS.forEach(function (listId) {
      var list = doc.getElementById(listId);
      if (!list) return;
      var rows = list.querySelectorAll('.mt-row');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (row.querySelector('.m2-av')) continue;
        var nameEl = row.querySelector('.mt-row__name');
        var avatar = el(doc, 'span', 'm2-av', initialOf(nameEl ? nameEl.textContent : ''));
        avatar.setAttribute('aria-hidden', 'true');
        row.insertBefore(avatar, row.firstChild);
        var link = lookup(links, row.getAttribute('data-id'));
        var text = row.querySelector('.mt-row__text');
        if (link && text && nameEl) {
          row.setAttribute('data-m2-status', link.status);
          var label = root.LaiftMentoring && root.LaiftMentoring.statusText ? root.LaiftMentoring.statusText(link) : '';
          var pill = el(doc, 'span', 'm2-pill m2-pill--' + pillTone(link.status), label);
          pill.setAttribute('aria-hidden', 'true'); // a mesma frase já está no texto da linha
          text.insertBefore(pill, nameEl.nextSibling);
        }
      }
    });
  }

  function paintStats(state, data) {
    var list = state.stats;
    while (list.firstChild) list.removeChild(list.firstChild);
    var items = statItems(statsOf(data));
    list.hidden = items.length === 0;
    items.forEach(function (item) {
      var li = el(state.doc, 'li', item.text ? 'm2-stat m2-stat--text' : 'm2-stat');
      if (item.text) li.appendChild(el(state.doc, 'span', 'm2-stat__label', item.text));
      else {
        li.appendChild(el(state.doc, 'strong', 'm2-stat__value', item.value));
        li.appendChild(state.doc.createTextNode(' ')); // leitores de tela leem "2 mentorias ativas", não "2mentorias"
        li.appendChild(el(state.doc, 'span', 'm2-stat__label', item.label));
      }
      list.appendChild(li);
    });
  }

  function refresh() {
    if (!mounted) return;
    var data = root.LaiftMentoring && root.LaiftMentoring.snapshot ? root.LaiftMentoring.snapshot() : null;
    paintStats(mounted, data);
    decorateRows(mounted, data);
  }

  function buildHero(state, ctx) {
    var doc = ctx.doc;
    var hero = cardOf(doc.getElementById('mentoring-title'));
    if (!hero) return;
    ctx.journal.undo(function () { hero.classList.remove('m2-hero'); });
    hero.classList.add('m2-hero');
    var stats = el(doc, 'ul', 'm2-stats');
    stats.setAttribute('aria-label', 'Resumo da sua mentoria');
    stats.hidden = true;
    ctx.journal.add(stats, hero, null);
    state.stats = stats;
  }

  function buildColumns(ctx) {
    var doc = ctx.doc;
    var body = doc.getElementById(BODY_ID);
    if (!body) return;
    var cols = { a: el(doc, 'div', 'm2-col'), b: el(doc, 'div', 'm2-col') };
    ctx.journal.add(cols.a, body, null);
    ctx.journal.add(cols.b, body, null);
    CARDS.forEach(function (cfg) {
      var node = doc.getElementById(cfg.childId);
      var card = node ? (cfg.isCard ? node : cardOf(node)) : null;
      if (card) ctx.journal.move(card, cols[cfg.col], null);
    });
  }

  /** Reorganiza a Mentoria (uma vez por tela). Chamado a cada abertura; as próximas só atualizam o resumo e as linhas. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    if (!panel || !d.getElementById(BODY_ID)) return null;
    ensureStyles(d);
    if (mounted && mounted.panel === panel) { refresh(); return panel; }
    var journal = createJournal();
    var ctx = { doc: d, panel: panel, journal: journal };
    var state = { doc: d, panel: panel, journal: journal, stats: null };
    mounted = state;
    buildHero(state, ctx);
    buildColumns(ctx);
    journal.attr(panel, 'data-m2', '1');
    d.addEventListener(RENDER_EVENT, refresh);
    journal.undo(function () { d.removeEventListener(RENDER_EVENT, refresh); });
    journal.undo(function () {
      var extras = panel.querySelectorAll('.m2-av, .m2-pill');
      for (var i = 0; i < extras.length; i++) extras[i].parentNode.removeChild(extras[i]);
      var rows = panel.querySelectorAll('[data-m2-status]');
      for (var j = 0; j < rows.length; j++) rows[j].removeAttribute('data-m2-status');
    });
    refresh();
    return panel;
  }

  /** Devolve a Mentoria de sempre (flag desligada depois de montada). */
  function reset() {
    if (!mounted) return;
    mounted.journal.rollback();
    mounted = null;
  }

  var api = {
    CARDS: CARDS, LISTS: LISTS, RENDER_EVENT: RENDER_EVENT, initialOf: initialOf, statsOf: statsOf, statItems: statItems,
    pillTone: pillTone, ensureStyles: ensureStyles, mount: mount, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftMentoringV2 = api;
})(typeof self !== 'undefined' ? self : this);
