/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Perfil v2 (flag profile_v2_enabled; docs/perfil-v2.md): REORGANIZA o Perfil de sempre sem recriar nada. Os formulários e
// módulos que montam em ids fixos (form-profile, avatar, btn-profile-credential, preferências, MFA, privacidade, feedback,
// atualizar o aplicativo) continuam exatamente os mesmos nós: este script só os REPOSICIONA em um cabeçalho (foto, nome,
// "Trocar foto" e crachá), duas colunas e seções recolhíveis (aria-expanded), e acrescenta "Sair" (aciona o botão de sempre).
// Tudo o que o script faz é registrado num diário e DESFEITO por reset(), devolvendo o Perfil de sempre.
// Carregado SOB DEMANDA (pacote "perfil2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement,
// createElementNS e textContent); sem HTML por texto e sem estilo inline. O CSS (profile-v2.css) vale só sob a flag.
// Expõe window.LaiftProfileV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-profile';
  var GRID_ID = 'profile-grid';
  var STYLE_HREF = 'profile-v2.css';
  var STYLE_ATTR = 'data-profile-v2-css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DESEMP_ID = 'profile-desempenho';
  var CHEVRON = 'M6 9l6 6 6-6';
  var EXIT_ICON = ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'];

  /**
   * Seções: childId = elemento que identifica o cartão de sempre (sobe até o .card); col = coluna; open = aberta ao entrar.
   * Quem não existir na tela é ignorado (o Perfil de sempre manda).
   */
  var SECTIONS = [
    { key: 'dados', childId: 'form-profile', title: 'Meus dados', col: 'a', open: true },
    { key: 'metricas', childId: 'profile-metrics', title: 'Minhas métricas', col: 'a', open: false },
    { key: 'preferencias', childId: 'form-preferences', title: 'Preferências', col: 'b', open: true },
    { key: 'feedback', childId: 'form-feedback', title: 'Feedback', col: 'b', open: false },
    { key: 'mfa', childId: 'mfa-card-body', title: 'Verificação em duas etapas', col: 'b', open: false },
    { key: 'privacidade', childId: 'privacy-root', title: 'Meus dados e privacidade', col: 'b', open: false },
    { key: 'atualizar', childId: 'btn-app-update', title: 'Atualizar o aplicativo', col: 'b', open: false },
  ];

  // ---------- Funções puras ----------

  /** Inicial do nome para o espaço da foto (vazio sem nome). */
  function initialOf(name) {
    var text = String(name || '').trim();
    return text ? text.charAt(0).toUpperCase() : '';
  }

  /** "@usuario" (vazio sem usuário). */
  function handleText(username) {
    var text = String(username || '').trim();
    return text ? '@' + text : '';
  }

  /** Nome do cabeçalho: o nome salvo ou, enquanto carrega, "Meu perfil". */
  function heroName(name) {
    var text = String(name || '').trim();
    return text || 'Meu perfil';
  }

  /** Id do corpo recolhível de uma seção. */
  function bodyId(key) { return 'p2-body-' + key; }

  /** Estado seguinte de uma seção: aria-expanded em texto. */
  function expandedValue(open) { return open ? 'true' : 'false'; }

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

  /** Sobe até o .card que contém o nó. */
  function cardOf(node) {
    var cur = node;
    while (cur && !(cur.classList && cur.classList.contains('card'))) cur = cur.parentNode;
    return cur || null;
  }

  /** Estado do que foi montado (um por documento): diário para desfazer e referências. */
  var mounted = null;

  function createJournal() {
    var steps = [];
    return {
      /** Move o nó e lembra de onde veio. */
      move: function (node, parent, before) {
        steps.push({ kind: 'move', node: node, parent: node.parentNode, next: node.nextSibling });
        parent.insertBefore(node, before || null);
      },
      /** Cria o nó em parent e lembra de removê-lo. */
      add: function (node, parent, before) {
        steps.push({ kind: 'add', node: node });
        parent.insertBefore(node, before || null);
      },
      /** Lembra do valor de um atributo para devolver. */
      attr: function (node, name, value) {
        steps.push({ kind: 'attr', node: node, name: name, had: node.hasAttribute(name), old: node.getAttribute ? node.getAttribute(name) : null });
        node.setAttribute(name, value);
      },
      /** Registra uma ação de desfazer qualquer. */
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

  function toggleSection(section, open) {
    section.open = open;
    section.button.setAttribute('aria-expanded', expandedValue(open));
    section.body.hidden = !open;
    section.card.classList.toggle('is-open', open);
  }

  /** Transforma o cartão de sempre numa seção recolhível: título vira botão, o resto vai para o corpo. */
  function makeSection(ctx, card, cfg) {
    var doc = ctx.doc;
    var journal = ctx.journal;
    var heading = null;
    for (var i = 0; i < card.children.length; i++) {
      var tag = String(card.children[i].tagName || card.children[i].tag || '').toLowerCase();
      if (tag === 'h2' || tag === 'h3') { heading = card.children[i]; break; }
    }
    var created = false;
    if (!heading) { heading = el(doc, 'h3'); created = true; }
    var originalNodes = [];
    while (heading.firstChild) { originalNodes.push(heading.firstChild); heading.removeChild(heading.firstChild); }

    var button = el(doc, 'button', 'p2-sec__toggle');
    button.setAttribute('type', 'button');
    button.id = 'p2-toggle-' + cfg.key;
    button.setAttribute('aria-controls', bodyId(cfg.key));
    button.appendChild(el(doc, 'span', 'p2-sec__title', cfg.title));
    button.appendChild(svg(doc, [CHEVRON], 'p2-sec__chevron'));
    heading.appendChild(button);

    var body = el(doc, 'div', 'p2-sec__body');
    body.id = bodyId(cfg.key);
    body.setAttribute('role', 'region');
    body.setAttribute('aria-labelledby', button.id);

    var rest = [];
    for (var j = 0; j < card.children.length; j++) if (card.children[j] !== heading) rest.push(card.children[j]);
    if (created) journal.add(heading, card, card.firstChild);
    journal.add(body, card, null);
    rest.forEach(function (node) { journal.move(node, body, null); });
    journal.undo(function () {
      while (heading.firstChild) heading.removeChild(heading.firstChild);
      originalNodes.forEach(function (node) { heading.appendChild(node); });
    });
    journal.undo(function () { heading.classList.remove('p2-sec__h'); card.classList.remove('p2-sec', 'is-open'); });
    heading.classList.add('p2-sec__h');
    card.classList.add('p2-sec');

    var section = { key: cfg.key, card: card, button: button, body: body, open: false };
    button.addEventListener('click', function () { toggleSection(section, !section.open); });
    toggleSection(section, !!cfg.open);
    return section;
  }

  /** Cabeçalho: foto, nome, usuário e as duas ações (Trocar foto e crachá). Move os nós de sempre. */
  function buildHero(ctx) {
    var doc = ctx.doc;
    var journal = ctx.journal;
    var panel = ctx.panel;
    var pickerRow = panel.querySelector('.avatar-picker-row');
    if (!pickerRow) return null;
    var hero = el(doc, 'section', 'p2-hero');
    hero.setAttribute('aria-label', 'Seu perfil');
    var top = el(doc, 'div', 'p2-hero__top');
    var ident = el(doc, 'div', 'p2-hero__ident');
    var nameEl = el(doc, 'h2', 'p2-hero__name', heroName(''));
    var handleEl = el(doc, 'p', 'p2-hero__handle', '');
    ident.appendChild(nameEl);
    ident.appendChild(handleEl);
    var actions = el(doc, 'div', 'p2-hero__actions');

    journal.add(hero, panel, ctx.grid);
    hero.appendChild(top);
    hero.appendChild(actions);
    var wrap = pickerRow.querySelector('.avatar-preview-wrap');
    var pick = doc.getElementById('btn-profile-avatar-pick');
    var credential = doc.getElementById('btn-profile-credential');
    var avatarMsg = doc.getElementById('msg-profile-avatar');
    if (wrap) journal.move(wrap, top, null);
    top.appendChild(ident);
    if (pick) { journal.move(pick, actions, null); journal.attr(pick, 'data-p2-role', 'photo'); }
    if (credential) { journal.move(credential, actions, null); journal.attr(credential, 'data-p2-role', 'badge'); }
    journal.move(pickerRow, hero, null); // fica só com o <input type="file"> escondido; o botão o aciona como sempre
    pickerRow.classList.add('p2-hero__picker');
    journal.undo(function () { pickerRow.classList.remove('p2-hero__picker'); });
    if (avatarMsg) journal.move(avatarMsg, hero, null);
    return { hero: hero, nameEl: nameEl, handleEl: handleEl };
  }

  /** Acompanha o nome e o usuário carregados pelo app (que só gravam .value): atualiza o cabeçalho. */
  function watchProfile(ctx, hero) {
    var doc = ctx.doc;
    var nameInput = doc.getElementById('profile-name');
    var userInput = doc.getElementById('profile-username');
    function refresh() {
      hero.nameEl.textContent = heroName(nameInput ? nameInput.value : '');
      hero.handleEl.textContent = handleText(userInput ? userInput.value : '');
    }
    function intercept(input) {
      if (!input) return;
      var proto = Object.getPrototypeOf(input);
      var desc = null;
      while (proto && !desc) { desc = Object.getOwnPropertyDescriptor(proto, 'value'); proto = Object.getPrototypeOf(proto); }
      if (!desc || !desc.set || !desc.get) return;
      try {
        Object.defineProperty(input, 'value', {
          configurable: true,
          get: function () { return desc.get.call(input); },
          set: function (v) { desc.set.call(input, v); refresh(); },
        });
        ctx.journal.undo(function () { delete input.value; });
      } catch (e) { /* sem interceptação: o cabeçalho atualiza ao abrir a tela e ao salvar */ }
    }
    intercept(nameInput);
    intercept(userInput);
    var form = doc.getElementById('form-profile');
    if (form) form.addEventListener('submit', function () { setTimeout(refresh, 400); });
    refresh();
    return refresh;
  }

  /** Move "Feedback" (título, formulário e aviso) do cartão de Preferências para um cartão próprio. */
  function splitFeedback(ctx) {
    var doc = ctx.doc;
    var form = doc.getElementById('form-feedback');
    var msg = doc.getElementById('msg-feedback');
    var prefs = cardOf(doc.getElementById('form-preferences'));
    if (!form || !prefs || cardOf(form) !== prefs) return null;
    var title = null;
    for (var i = 0; i < prefs.children.length; i++) {
      var c = prefs.children[i];
      if (String(c.tagName || c.tag || '').toLowerCase() === 'h3' && c.textContent === 'Feedback') { title = c; break; }
    }
    var card = el(doc, 'div', 'card');
    ctx.journal.add(card, ctx.grid, null);
    if (title) ctx.journal.move(title, card, null);
    ctx.journal.move(form, card, null);
    if (msg) ctx.journal.move(msg, card, null);
    return card;
  }

  /** Bloco final: "Ver novidades" (botão de sempre, movido) e "Sair" (aciona o botão Sair do cabeçalho do app). */
  function buildFooter(ctx) {
    var doc = ctx.doc;
    var box = el(doc, 'div', 'p2-list');
    var whats = doc.getElementById('btn-whats-new');
    if (whats) { ctx.journal.move(whats, box, null); ctx.journal.attr(whats, 'data-p2-role', 'row'); }
    var logout = el(doc, 'button', 'p2-exit');
    logout.setAttribute('type', 'button');
    logout.setAttribute('data-p2-role', 'row');
    logout.appendChild(svg(doc, EXIT_ICON, 'p2-exit__icon'));
    logout.appendChild(el(doc, 'span', 'p2-exit__label', 'Sair'));
    logout.addEventListener('click', function () {
      var original = doc.getElementById('btn-logout');
      if (original) original.click();
    });
    box.appendChild(logout);
    ctx.journal.add(box, ctx.colB, null);
    return box;
  }

  /** "Meu desempenho" (home-v3.js) entra na coluna A, logo depois de "Meus dados"; funciona nas duas ordens de carga. */
  function adoptDesempenho(state, doc) {
    var details = doc.getElementById(DESEMP_ID);
    if (!details || details.parentNode === state.colA) return;
    var dados = state.sections.dados ? state.sections.dados.card : null;
    var before = dados ? dados.nextSibling : null;
    state.journal.move(details, state.colA, before);
    details.classList.add('p2-sec', 'p2-desemp');
    var summary = null;
    for (var i = 0; i < details.children.length; i++) {
      if (String(details.children[i].tagName || details.children[i].tag || '').toLowerCase() === 'summary') { summary = details.children[i]; break; }
    }
    if (!summary) return;
    summary.setAttribute('aria-expanded', expandedValue(!!details.open));
    details.addEventListener('toggle', function () { summary.setAttribute('aria-expanded', expandedValue(!!details.open)); });
    state.journal.undo(function () {
      details.classList.remove('p2-sec', 'p2-desemp');
      summary.removeAttribute('aria-expanded');
    });
  }

  function watchDesempenho(state, doc, panel) {
    if (typeof root.MutationObserver !== 'function') return;
    var observer = new root.MutationObserver(function () { adoptDesempenho(state, doc); });
    observer.observe(panel, { childList: true });
    state.journal.undo(function () { observer.disconnect(); });
  }

  /** Reorganiza o Perfil (uma vez por tela). Chamado a cada abertura; as próximas só atualizam o cabeçalho. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    var grid = d.getElementById(GRID_ID);
    if (!panel || !grid) return null;
    ensureStyles(d);
    if (mounted && mounted.panel === panel) {
      adoptDesempenho(mounted, d);
      mounted.refresh();
      return mounted.hero;
    }
    var journal = createJournal();
    var ctx = { doc: d, panel: panel, grid: grid, journal: journal };
    var heroParts = buildHero(ctx);
    if (!heroParts) return null;
    var state = { panel: panel, journal: journal, sections: {}, hero: heroParts.hero, colA: el(d, 'div', 'p2-col'), colB: el(d, 'div', 'p2-col') };
    ctx.colB = state.colB;
    var cards = {};
    SECTIONS.forEach(function (cfg) {
      var node = d.getElementById(cfg.childId);
      cards[cfg.key] = node ? cardOf(node) : null;
    });
    var feedbackCard = splitFeedback(ctx);
    if (feedbackCard) cards.feedback = feedbackCard;
    journal.add(state.colA, grid, null);
    journal.add(state.colB, grid, null);
    SECTIONS.forEach(function (cfg) {
      var card = cards[cfg.key];
      if (!card) return;
      journal.move(card, cfg.col === 'a' ? state.colA : state.colB, null);
      state.sections[cfg.key] = makeSection(ctx, card, cfg);
    });
    buildFooter(ctx);
    state.refresh = watchProfile(ctx, heroParts);
    journal.attr(panel, 'data-p2', '1');
    journal.attr(grid, 'data-p2', '1');
    adoptDesempenho(state, d);
    watchDesempenho(state, d, panel);
    mounted = state;
    return state.hero;
  }

  /** Devolve o Perfil de sempre (flag desligada depois de montado). */
  function reset() {
    if (!mounted) return;
    mounted.journal.rollback();
    mounted = null;
  }

  var api = {
    SECTIONS: SECTIONS, initialOf: initialOf, handleText: handleText, heroName: heroName, bodyId: bodyId,
    expandedValue: expandedValue, ensureStyles: ensureStyles, mount: mount, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftProfileV2 = api;
})(typeof self !== 'undefined' ? self : this);
