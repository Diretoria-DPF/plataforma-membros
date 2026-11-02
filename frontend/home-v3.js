/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Início v3 (flag home_v2_enabled; docs/inicio-v3.md): topo com saudação e atalhos (Guia, crachá, avisos), UM cartão de foco
// ("Continuar de onde parou"), resumo do dia (anel da meta, 7 pontos da semana, sequência), lista "Para hoje" e a faixa
// "Seus assuntos". O bloco "Na Liga" é o de highlights.js, só reposicionado e estilizado por home-v3.css.
// Carregado SOB DEMANDA (pacote "inicio3" de lazy-bundles.js) só com a flag ligada. Os dados são os de sempre:
// apiGetHomeSummary, apiLearnGetEngagement (engagement.js) e apiLearnGetMyStats. Só DOM seguro: createElement,
// createElementNS (ícones SVG) e textContent. O bloco de gráficos antigo vira "Meu desempenho" no Perfil.
// Expõe window.LaiftHomeV3; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var HOST_ID = 'home-v3';
  var PANEL_ID = 'panel-home';
  var STYLE_HREF = 'home-v3.css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var WEEK_DAYS = 7;
  var DESEMP_ID = 'profile-desempenho';
  var DESEMP_HOST_ID = 'profile-desempenho-host';

  /** Assuntos da faixa: chave do servidor (byModule), cores do gradiente e arte (viewBox 64). */
  var SUBJECTS = [
    { id: 'farmaco', stat: 'farmacologia', name: 'Farmacologia', sub: 'Simulador · 240 questões', c1: '#0f6f62', c2: '#1aa38f', art: 'pill' },
    { id: 'toxico', stat: 'toxicologia', name: 'Toxicologia', sub: 'Antídotos · 240 questões', c1: '#7a2e8c', c2: '#b04fc4', art: 'flask' },
    { id: 'clinica', stat: 'clinica', name: 'Clínica virtual', sub: 'Casos e plantão', c1: '#b3262e', c2: '#e0585f', art: 'heart' },
    { id: 'lab', stat: 'laboratorio', name: 'Laboratório virtual', sub: 'Bancada e moléculas 3D', c1: '#1f5fa8', c2: '#4f93dd', art: 'molecule' },
    { id: 'anatomia', stat: 'anatomia', name: 'Anatomia e PK 3D', sub: 'Corpo humano e vias', c1: '#0b6e4f', c2: '#3bbd8b', art: 'body' },
  ];

  /** Arte dos assuntos: [tag, atributos]. */
  var ART = {
    pill: [['rect', { x: 10, y: 22, width: 44, height: 20, rx: 10, transform: 'rotate(-35 32 32)' }], ['path', { d: 'M24 24l16 16' }]],
    flask: [['path', { d: 'M24 8h16M28 8v18L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 26V8' }], ['path', { d: 'M22 40h20' }]],
    heart: [['path', { d: 'M32 54S10 40 10 25a11 11 0 0 1 22-3 11 11 0 0 1 22 3c0 15-22 29-22 29z' }], ['path', { d: 'M14 32h10l4-8 6 14 4-6h12' }]],
    molecule: [['circle', { cx: 20, cy: 22, r: 7 }], ['circle', { cx: 44, cy: 20, r: 5 }], ['circle', { cx: 34, cy: 44, r: 8 }], ['path', { d: 'M26 25l6 12M39 23l-3 14M25 20l14-1' }]],
    body: [['circle', { cx: 32, cy: 14, r: 7 }], ['path', { d: 'M32 22v18M20 30h24M32 40l-9 16M32 40l9 16' }]],
  };

  /** Ícones de interface (viewBox 24): listas de caminhos. */
  var ICONS = {
    chat: ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 21 12z'],
    badge: ['M7 3h10a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z', 'M12 7.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z', 'M8 17c.8-2 2.3-3 4-3s3.2 1 4 3'],
    bell: ['M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7', 'M10 20a2 2 0 0 0 4 0'],
    play: ['M8 5l11 7-11 7z'],
    star: ['M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z'],
    calendar: ['M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z', 'M8 3v4M16 3v4M3 10h18'],
    check: ['M5 12l5 5 9-10'],
    chevron: ['M9 6l6 6-6 6'],
  };

  // ---------- Funções puras ----------

  function plural(n, one, many) { return n === 1 ? one : many; }

  function homeLib() {
    if (root.LaiftHome) return root.LaiftHome;
    return typeof require === 'function' ? require('./home.js') : null;
  }

  function engagementLib() {
    if (root.LaiftEngagement) return root.LaiftEngagement;
    return typeof require === 'function' ? require('./engagement.js') : null;
  }

  /**
   * Sete pontos da semana (do mais antigo a hoje). A API só informa a sequência atual: os dias acesos são os
   * últimos `current` dias da sequência (terminando hoje, ou ontem enquanto hoje ainda não teve atividade).
   */
  function weekDots(streak) {
    var current = streak && streak.current > 0 ? Math.floor(streak.current) : 0;
    var activeToday = !!(streak && streak.activeToday);
    var endIndex = activeToday ? WEEK_DAYS - 1 : WEEK_DAYS - 2;
    var dots = [];
    for (var i = 0; i < WEEK_DAYS; i++) {
      dots.push({ on: i <= endIndex && i > endIndex - current, today: i === WEEK_DAYS - 1 });
    }
    return dots;
  }

  /** Porcentagem do anel (0 a 100). */
  function ringPercent(done, target) {
    if (!(target > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round((Math.max(0, done) / target) * 100)));
  }

  function ringLabel(done, target) {
    return done + ' de ' + target + ' ' + plural(target, 'questão', 'questões') + ' hoje';
  }

  /** Texto curto sob o anel: o que falta, ou parabéns. */
  function ringHint(done, target) {
    if (done >= target) return 'Meta de hoje cumprida. Parabéns!';
    var left = target - done;
    return 'Faltam ' + left + ' ' + plural(left, 'questão', 'questões');
  }

  function streakLabel(streak) {
    var current = streak && streak.current > 0 ? streak.current : 0;
    return current + ' ' + plural(current, 'dia seguido', 'dias seguidos');
  }

  /** Dados do cartão de foco a partir de `last` (engagement.assemble); sem último módulo, null (o cartão some). */
  function focusModel(last, now) {
    var lib = engagementLib();
    if (!last || !lib || !lib.MODULE_LABELS[last.id]) return null;
    var detail = [lib.ACTIVITY_LABELS[last.activity], lib.whenText(last.at, now)].filter(Boolean);
    return { id: last.id, title: lib.MODULE_LABELS[last.id], detail: detail.join(' · ') || 'Retome de onde parou' };
  }

  /** Itens de "Para hoje": quiz do dia, próximo evento e votação aberta. Só entra o que existe. */
  function todayItems(summary, eng, now) {
    var items = [];
    var home = homeLib();
    if (eng) {
      items.push({
        kind: 'quiz', icon: 'star', title: 'Quiz do dia',
        sub: eng.dailyQuizDone ? 'Feito hoje. Toque para rever' : '5 questões · cerca de 3 min',
      });
    }
    var events = summary && Array.isArray(summary.nextEvents) ? summary.nextEvents : [];
    if (events.length && events[0] && events[0].title) {
      var event = events[0];
      var when = home && home.formatWhen ? home.formatWhen(event.eventDate, now) : '';
      var extra = event.isRegistered ? 'Inscrição confirmada' : (event.location || '');
      items.push({ kind: 'event', icon: 'calendar', title: event.title, sub: [when, extra].filter(Boolean).join(' · ') });
    }
    var voting = summary && summary.voting;
    if (voting && voting.pendingCount > 0) {
      var rel = home && home.relativeDay ? home.relativeDay(voting.nextClosesAt, now) : '';
      items.push({
        kind: 'voting', icon: 'check',
        title: voting.pendingCount === 1 ? 'Votação aberta' : voting.pendingCount + ' votações abertas',
        sub: rel ? 'Encerra ' + rel : 'Participe da decisão',
      });
    }
    return items;
  }

  /** Cartões de assuntos com o aproveitamento de apiLearnGetMyStats (byModule); sem dado, sem porcentagem. */
  function subjectCards(byModule) {
    return SUBJECTS.map(function (subject) {
      var data = byModule && byModule[subject.stat];
      var pct = data && data.accuracyPct !== null && data.accuracyPct !== undefined ? Math.max(0, Math.min(100, Number(data.accuracyPct) || 0)) : null;
      var attempts = data ? Number(data.attempts) || 0 : 0;
      var text = pct !== null ? pct + '% de acerto' : (attempts > 0 ? attempts + ' ' + plural(attempts, 'atividade', 'atividades') : 'Comece por aqui');
      return { id: subject.id, name: subject.name, sub: subject.sub, c1: subject.c1, c2: subject.c2, art: subject.art, pct: pct, text: text };
    });
  }

  // ---------- DOM seguro ----------

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null && text !== '') node.textContent = text;
    return node;
  }

  function svgShape(doc, tag, attrs) {
    var node = doc.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (key) { node.setAttribute(key, String(attrs[key])); });
    return node;
  }

  function svgRoot(doc, viewBox, className) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('class', className);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    return svg;
  }

  function icon(doc, name, className) {
    var svg = svgRoot(doc, '0 0 24 24', 'v3-ico' + (className ? ' ' + className : ''));
    (ICONS[name] || []).forEach(function (d) { svg.appendChild(svgShape(doc, 'path', { d: d })); });
    return svg;
  }

  function art(doc, name) {
    var svg = svgRoot(doc, '0 0 64 64', 'v3-art');
    (ART[name] || []).forEach(function (shape) { svg.appendChild(svgShape(doc, shape[0], shape[1])); });
    return svg;
  }

  function button(doc, className, label, onClick) {
    var node = el(doc, 'button', className, label);
    node.setAttribute('type', 'button');
    if (onClick) node.addEventListener('click', onClick);
    return node;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[data-home-v3-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute('data-home-v3-css', '1');
    doc.head.appendChild(link);
  }

  // ---------- Seções ----------

  /** Topo em gradiente: saudação e três atalhos. O ponto de avisos acende com mensagens ou pedidos novos. */
  function buildTop(ctx) {
    var doc = ctx.doc;
    var top = el(doc, 'header', 'v3-top');
    var hello = el(doc, 'p', 'v3-hello');
    var greeting = homeLib().greeting(ctx.name, ctx.now).split(', ');
    hello.appendChild(el(doc, 'span', 'v3-hello__small', greeting[0] + (greeting[1] ? ',' : '')));
    if (greeting[1]) hello.appendChild(el(doc, 'strong', 'v3-hello__name', greeting[1]));
    var actions = el(doc, 'div', 'v3-actions');

    var guia = button(doc, 'v3-icon-btn', '', function () { ctx.openGuia(); });
    guia.setAttribute('aria-label', 'Falar com a Guia');
    guia.appendChild(icon(doc, 'chat'));

    var badge = button(doc, 'v3-icon-btn', '');
    badge.setAttribute('aria-label', 'Abrir meu crachá virtual');
    badge.setAttribute('data-open-credential', '');
    badge.appendChild(icon(doc, 'badge'));

    ctx.avisos = button(doc, 'v3-icon-btn', '', function () { ctx.app.showPanel('panel-messages'); });
    ctx.avisos.setAttribute('aria-label', 'Mensagens e avisos');
    ctx.avisos.appendChild(icon(doc, 'bell'));
    ctx.avisosDot = el(doc, 'span', 'v3-dot hidden');
    ctx.avisosDot.setAttribute('aria-hidden', 'true');
    ctx.avisos.appendChild(ctx.avisosDot);

    [guia, badge, ctx.avisos].forEach(function (node) { actions.appendChild(node); });
    top.appendChild(hello);
    top.appendChild(actions);
    return top;
  }

  /** Atualiza o ponto e o texto acessível dos avisos; visitante (sem caixa de entrada) não vê o botão. */
  function paintAvisos(ctx) {
    var inbox = ctx.summary && ctx.summary.inbox;
    if (!inbox) { ctx.avisos.classList.add('hidden'); return; }
    ctx.avisos.classList.remove('hidden');
    var total = (Number(inbox.unreadMessages) || 0) + (Number(inbox.pendingConnectionRequests) || 0);
    ctx.avisosDot.classList.toggle('hidden', total === 0);
    ctx.avisos.setAttribute('aria-label', total > 0 ? 'Mensagens e avisos, ' + total + ' ' + plural(total, 'novo', 'novos') : 'Mensagens e avisos');
  }

  /** UM cartão de foco. Sem último módulo, a seção inteira some. */
  function buildFocus(ctx) {
    var model = focusModel(ctx.data.last, ctx.now);
    if (!model) return null;
    var doc = ctx.doc;
    var card = el(doc, 'article', 'v3-focus');
    card.setAttribute('aria-labelledby', 'v3-focus-title');
    card.appendChild(el(doc, 'span', 'v3-kicker', 'Continuar de onde parou'));
    var title = el(doc, 'h2', 'v3-focus__title', model.title);
    title.id = 'v3-focus-title';
    card.appendChild(title);
    card.appendChild(el(doc, 'p', 'v3-focus__detail', model.detail));
    var go = button(doc, 'v3-btn', '', function () { engagementLib().openModule(ctx.app, model.id); });
    go.appendChild(icon(doc, 'play'));
    go.appendChild(el(doc, 'span', '', 'Continuar'));
    card.appendChild(go);
    return card;
  }

  function goalChips(ctx) {
    var doc = ctx.doc;
    var group = el(doc, 'div', 'v3-goal-picker');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Meta diária de questões');
    engagementLib().GOALS.forEach(function (value) {
      var chip = button(doc, 'v3-chip', String(value), function () { ctx.changeGoal(value); });
      chip.setAttribute('aria-pressed', String(value === ctx.data.goal));
      chip.setAttribute('aria-label', value + ' questões por dia');
      group.appendChild(chip);
    });
    return group;
  }

  /** Resumo do dia: anel da meta, sete pontos da semana e sequência. Sem dados do servidor, some. */
  function buildDay(ctx) {
    var eng = ctx.data.eng;
    if (!eng || !eng.goal) return null;
    var doc = ctx.doc;
    var target = ctx.data.goal;
    var done = Number(eng.goal.todayQuestions) || 0;
    var box = el(doc, 'section', 'v3-day');
    box.setAttribute('aria-label', 'Seu dia');

    var ring = el(doc, 'div', 'v3-ring');
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', ringLabel(done, target));
    ring.style.setProperty('--p', String(ringPercent(done, target)));
    ring.appendChild(el(doc, 'b', '', String(done)));
    ring.appendChild(el(doc, 'small', '', 'de ' + target));

    var text = el(doc, 'div', 'v3-day__text');
    text.appendChild(el(doc, 'strong', '', 'Meta de hoje'));
    text.appendChild(el(doc, 'span', 'v3-day__hint', ringHint(done, target)));
    var week = el(doc, 'div', 'v3-week');
    week.setAttribute('role', 'img');
    week.setAttribute('aria-label', 'Sequência: ' + streakLabel(eng.streak));
    weekDots(eng.streak).forEach(function (dot) {
      week.appendChild(el(doc, 'i', 'v3-week__dot' + (dot.on ? ' is-on' : '') + (dot.today ? ' is-today' : '')));
    });
    text.appendChild(week);

    var streak = el(doc, 'div', 'v3-streak');
    streak.appendChild(el(doc, 'b', '', String(eng.streak && eng.streak.current > 0 ? eng.streak.current : 0)));
    streak.appendChild(el(doc, 'small', '', plural(eng.streak && eng.streak.current, 'dia seguido', 'dias seguidos')));

    var row = el(doc, 'div', 'v3-day__row');
    [ring, text, streak].forEach(function (node) { row.appendChild(node); });
    box.appendChild(row);

    var picker = goalChips(ctx);
    picker.classList.add('hidden');
    picker.id = 'v3-goal-picker';
    var toggle = button(doc, 'v3-link', 'Mudar a meta', function () {
      var open = picker.classList.toggle('hidden') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'v3-goal-picker');
    box.appendChild(toggle);
    box.appendChild(picker);
    return box;
  }

  function todayAction(ctx, item) {
    if (item.kind === 'quiz') {
      if (!root.LaiftDailyQuiz) return function () { ctx.app.showPanel('panel-learn'); };
      return function () {
        root.LaiftDailyQuiz.open({
          app: ctx.app, doc: ctx.doc, token: ctx.token, eng: ctx.data.eng, goal: ctx.data.goal,
          onFinished: function () { ctx.refreshEngagement(); },
        });
      };
    }
    var panel = item.kind === 'event' ? 'panel-events' : 'panel-proposals';
    return function () { ctx.app.showPanel(panel); };
  }

  /** "Para hoje": lista curta. Sem nenhum item, a seção some. */
  function buildToday(ctx) {
    var items = todayItems(ctx.summary, ctx.data.eng, ctx.now);
    if (!items.length) return null;
    var doc = ctx.doc;
    var section = el(doc, 'section', 'v3-section');
    section.setAttribute('aria-labelledby', 'v3-today-title');
    var head = el(doc, 'h2', 'v3-section__title', 'Para hoje');
    head.id = 'v3-today-title';
    section.appendChild(head);
    var list = el(doc, 'ul', 'v3-today');
    items.forEach(function (item) {
      var li = el(doc, 'li');
      var row = button(doc, 'v3-row v3-row--' + item.kind, '', todayAction(ctx, item));
      var badge = el(doc, 'span', 'v3-row__ico');
      badge.appendChild(icon(doc, item.icon));
      var text = el(doc, 'span', 'v3-row__text');
      text.appendChild(el(doc, 'strong', '', item.title));
      if (item.sub) text.appendChild(el(doc, 'small', '', item.sub));
      row.appendChild(badge);
      row.appendChild(text);
      row.appendChild(icon(doc, 'chevron', 'v3-row__go'));
      li.appendChild(row);
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function subjectCard(ctx, card) {
    var doc = ctx.doc;
    var node = button(doc, 'v3-subject', '', function () { engagementLib().openModule(ctx.app, card.id); });
    node.style.setProperty('--c1', card.c1);
    node.style.setProperty('--c2', card.c2);
    var arte = el(doc, 'span', 'v3-subject__art');
    arte.appendChild(art(doc, card.art));
    var text = el(doc, 'span', 'v3-subject__text');
    text.appendChild(el(doc, 'strong', '', card.name));
    text.appendChild(el(doc, 'small', '', card.sub));
    var bar = el(doc, 'span', 'v3-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', card.pct === null ? 'Sem nota registrada' : 'Aproveitamento de ' + card.pct + '%');
    var fill = el(doc, 'i');
    fill.style.setProperty('--p', (card.pct === null ? 0 : card.pct) + '%');
    bar.appendChild(fill);
    text.appendChild(bar);
    text.appendChild(el(doc, 'small', 'v3-subject__pct', card.text));
    node.appendChild(arte);
    node.appendChild(text);
    return node;
  }

  /** Faixa "Seus assuntos" com rolagem horizontal e encaixe (scroll-snap). */
  function buildSubjects(ctx) {
    var doc = ctx.doc;
    var section = el(doc, 'section', 'v3-section');
    section.setAttribute('aria-labelledby', 'v3-subjects-title');
    var head = el(doc, 'div', 'v3-section__head');
    var title = el(doc, 'h2', 'v3-section__title', 'Seus assuntos');
    title.id = 'v3-subjects-title';
    head.appendChild(title);
    head.appendChild(button(doc, 'v3-link', 'Ver tudo', function () { ctx.app.showPanel('panel-learn'); }));
    section.appendChild(head);
    var strip = el(doc, 'ul', 'v3-strip');
    subjectCards(ctx.stats).forEach(function (card) {
      var li = el(doc, 'li');
      li.appendChild(subjectCard(ctx, card));
      strip.appendChild(li);
    });
    section.appendChild(strip);
    return section;
  }

  // ---------- Carga ----------

  var generation = 0;

  function fetchStats(app) {
    if (!app || typeof app.callLearningApi !== 'function') return Promise.resolve(null);
    return Promise.resolve(app.callLearningApi('apiLearnGetMyStats')).then(function (res) {
      return res && res.success && res.stats ? res.stats.byModule || null : null;
    }, function () { return null; });
  }

  function fetchSummary(app, token) {
    return Promise.resolve(app.callApi('apiGetHomeSummary', token)).then(function (res) {
      return res && res.success ? res.summary || {} : null;
    }, function () { return null; });
  }

  function openGuia() {
    var open = function () { if (root.LaiftAssistant && root.LaiftAssistant.open) root.LaiftAssistant.open(); };
    if (root.LaiftAssistant) { open(); return; }
    if (root.LaiftLazy) root.LaiftLazy.load('lia').then(open, open);
  }

  function setSlot(slot, node) {
    clear(slot);
    slot.classList.toggle('hidden', !node);
    if (node) slot.appendChild(node);
  }

  function layout(doc) {
    var body = el(doc, 'div', 'v3-body');
    var slots = {};
    ['focus', 'day', 'today', 'subjects'].forEach(function (name) {
      slots[name] = el(doc, 'div', 'v3-slot v3-slot--' + name);
      body.appendChild(slots[name]);
    });
    return { body: body, slots: slots };
  }

  function paintBody(ctx) {
    var slots = ctx.slots;
    setSlot(slots.focus, buildFocus(ctx));
    setSlot(slots.day, buildDay(ctx));
    setSlot(slots.today, buildToday(ctx));
    setSlot(slots.subjects, buildSubjects(ctx));
    ctx.host.classList.toggle('has-card', !slots.focus.classList.contains('hidden') || !slots.day.classList.contains('hidden'));
    ctx.host.setAttribute('aria-busy', 'false');
  }

  function refreshEngagement(ctx, mine) {
    var lib = engagementLib();
    return lib.fetchEngagement(ctx.app, ctx.token).then(function (eng) {
      if (mine !== generation) return;
      ctx.data = lib.assemble(eng || ctx.data.eng);
      paintBody(ctx);
    });
  }

  function failureNode(ctx) {
    var states = root.LaiftStates;
    if (!states) return el(ctx.doc, 'p', 'v3-error', 'Não foi possível carregar a Início agora.');
    return states.createStateNode(ctx.doc, 'error', {
      title: 'Não foi possível carregar', message: 'Confira a conexão e tente de novo.', actionLabel: 'Tentar de novo',
      onAction: function () { load(ctx.app, ctx.doc); },
    });
  }

  /**
   * Monta a Início v3. `app` é window.App. Cada chamada vale só até a próxima: resposta atrasada é descartada.
   * Marca o painel com data-v3 (o CSS esconde a Início antiga só quando esta já está no ar).
   */
  function load(app, doc) {
    var host = doc.getElementById(HOST_ID);
    var panel = doc.getElementById(PANEL_ID);
    if (!host || !panel || !app) return Promise.resolve();
    ensureStyles(doc);
    generation += 1;
    var mine = generation;
    var state = app.getState();
    var parts = layout(doc);
    var ctx = {
      app: app, doc: doc, host: host, token: state.sessionToken || '', name: state.profile && state.profile.fullName,
      now: new Date(), summary: null, stats: null, data: { eng: null, goal: 10, last: null }, slots: parts.slots,
      openGuia: openGuia,
    };
    ctx.refreshEngagement = function () { return refreshEngagement(ctx, mine); };
    ctx.changeGoal = function (value) {
      engagementLib().saveGoal(app, ctx.token, value).then(function () { return refreshEngagement(ctx, mine); });
    };
    clear(host);
    host.setAttribute('aria-busy', 'true');
    host.appendChild(buildTop(ctx));
    host.appendChild(parts.body);
    host.classList.remove('hidden');
    panel.setAttribute('data-v3', '1');

    var lib = engagementLib();
    return Promise.all([fetchSummary(app, ctx.token), lib.fetchEngagement(app, ctx.token), fetchStats(app)]).then(function (res) {
      if (mine !== generation) return;
      ctx.summary = res[0];
      ctx.stats = res[2];
      ctx.data = lib.assemble(res[1]);
      paintAvisos(ctx);
      if (!res[0] && !res[1]) { setSlot(parts.slots.focus, failureNode(ctx)); host.setAttribute('aria-busy', 'false'); return; }
      paintBody(ctx);
    });
  }

  /** Flag desligada, logout ou troca de conta: solta respostas em voo e devolve a Início antiga. */
  function reset(doc) {
    generation += 1;
    var host = doc && doc.getElementById(HOST_ID);
    var panel = doc && doc.getElementById(PANEL_ID);
    if (host) { clear(host); host.classList.add('hidden'); }
    if (panel) panel.removeAttribute('data-v3');
  }

  // ---------- Perfil: "Meu desempenho" ----------

  /** Cria (uma vez) o bloco recolhível "Meu desempenho" no Perfil; abrir carrega os gráficos antigos da Início. */
  function mountProfile(app, doc) {
    var grid = doc.getElementById('profile-grid');
    if (!grid || !grid.parentNode) return null;
    ensureStyles(doc);
    var details = doc.getElementById(DESEMP_ID);
    if (!details) {
      details = el(doc, 'details', 'card profile-desempenho');
      details.id = DESEMP_ID;
      details.appendChild(el(doc, 'summary', 'profile-desempenho__summary', 'Meu desempenho'));
      var host = el(doc, 'div', 'profile-desempenho__host');
      host.id = DESEMP_HOST_ID;
      details.appendChild(host);
      details.addEventListener('toggle', function () {
        if (details.open && root.LaiftHome) root.LaiftHome.load(app, doc, { hostId: DESEMP_HOST_ID, embedded: true });
      });
      grid.parentNode.insertBefore(details, grid.nextSibling);
    }
    if (details.open && root.LaiftHome) root.LaiftHome.load(app, doc, { hostId: DESEMP_HOST_ID, embedded: true });
    return details;
  }

  var api = {
    SUBJECTS: SUBJECTS, weekDots: weekDots, ringPercent: ringPercent, ringLabel: ringLabel, ringHint: ringHint,
    streakLabel: streakLabel, focusModel: focusModel, todayItems: todayItems, subjectCards: subjectCards,
    ensureStyles: ensureStyles, buildTop: buildTop, buildFocus: buildFocus, buildDay: buildDay, buildToday: buildToday,
    buildSubjects: buildSubjects, load: load, reset: reset, mountProfile: mountProfile,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftHomeV3 = api;
})(typeof self !== 'undefined' ? self : this);
