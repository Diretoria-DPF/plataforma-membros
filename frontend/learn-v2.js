/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aprender v2 (flag learn_v2_enabled; docs/aprender-v2.md): topo com a Guia, UM cartão de foco ("Continuar de onde
// parou"), resumo do dia (anel da meta, sete pontos da semana, sequência), "Para hoje" (quiz do dia, simulado, caso
// clínico), faixa de Módulos com aproveitamento e folha de detalhe, aproveitamento geral, desempenho por módulo e
// conquistas. Carregado SOB DEMANDA (pacote "aprender2" de lazy-bundles.js) só com a flag ligada, por learning.js.
// Os dados e as ações são os do hub de sempre: apiLearnGetMyStats, apiLearnGetEngagement (engagement.js), o quiz do
// dia (daily-quiz.js) e LaiftLearning.openModule. Só DOM seguro: createElement, createElementNS e textContent.
// Expõe window.LaiftLearnV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var HOST_ID = 'learn-v2';
  var HUB_ID = 'learn-hub';
  var STYLE_HREF = 'learn-v2.css';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var WEEK_DAYS = 7;

  /** Catálogo único (modulos/shared/catalogo.js; no Node, o próprio arquivo) + arte (viewBox 64) de cada módulo. */
  var CATALOG = typeof module !== 'undefined' && module.exports ? require('./modulos/shared/catalogo.js') : root.LaiftModules;
  var ART_BY_ID = { farmaco: 'pill', toxico: 'flask', clinica: 'heart', lab: 'molecule', anatomia: 'body' };
  var MODULES = CATALOG.MODULES.map(function (m) {
    return { id: m.id, stat: m.stat, name: m.name, sub: m.sub, art: ART_BY_ID[m.id], desc: m.desc };
  });

  var ART = {
    pill: [['rect', { x: 10, y: 22, width: 44, height: 20, rx: 10, transform: 'rotate(-35 32 32)' }], ['path', { d: 'M24 24l16 16' }]],
    flask: [['path', { d: 'M24 8h16M28 8v18L14 50a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 26V8' }], ['path', { d: 'M22 40h20' }]],
    heart: [['path', { d: 'M32 54S10 40 10 25a11 11 0 0 1 22-3 11 11 0 0 1 22 3c0 15-22 29-22 29z' }], ['path', { d: 'M14 32h10l4-8 6 14 4-6h12' }]],
    molecule: [['circle', { cx: 20, cy: 22, r: 7 }], ['circle', { cx: 44, cy: 20, r: 5 }], ['circle', { cx: 34, cy: 44, r: 8 }], ['path', { d: 'M26 25l6 12M39 23l-3 14M25 20l14-1' }]],
    body: [['circle', { cx: 32, cy: 14, r: 7 }], ['path', { d: 'M32 22v18M20 30h24M32 40l-9 16M32 40l9 16' }]],
  };

  var ICONS = {
    chat: ['M21 12a8 8 0 0 1-11.5 7.2L4 20l1-4.2A8 8 0 1 1 21 12z'],
    play: ['M8 5l11 7-11 7z'],
    star: ['M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z'],
    clock: ['M12 5a8 8 0 1 1 0 16 8 8 0 0 1 0-16z', 'M12 9v4l3 2M9 3h6'],
    heart: ['M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z'],
    lock: ['M7 11V8a5 5 0 0 1 10 0v3', 'M5 11h14v10H5z'],
    chevron: ['M9 6l6 6-6 6'],
  };

  // ---------- Funções puras ----------

  function plural(n, one, many) { return n === 1 ? one : many; }

  function engagementLib() {
    if (root.LaiftEngagement) return root.LaiftEngagement;
    return typeof require === 'function' ? require('./engagement.js') : null;
  }

  /** Sete pontos da semana: os acesos são os últimos dias da sequência atual (a API informa só a sequência). */
  function weekDots(streak) {
    var current = streak && streak.current > 0 ? Math.floor(streak.current) : 0;
    var endIndex = streak && streak.activeToday ? WEEK_DAYS - 1 : WEEK_DAYS - 2;
    var dots = [];
    for (var i = 0; i < WEEK_DAYS; i++) dots.push({ on: i <= endIndex && i > endIndex - current, today: i === WEEK_DAYS - 1 });
    return dots;
  }

  function ringPercent(done, target) {
    if (!(target > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round((Math.max(0, done) / target) * 100)));
  }

  function ringLabel(done, target) { return done + ' de ' + target + ' ' + plural(target, 'questão', 'questões') + ' hoje'; }

  function ringHint(done, target) {
    if (done >= target) return 'Meta de hoje cumprida. Parabéns!';
    var left = target - done;
    return 'Faltam ' + left + ' ' + plural(left, 'questão', 'questões');
  }

  function streakLabel(streak) {
    var current = streak && streak.current > 0 ? streak.current : 0;
    return current + ' ' + plural(current, 'dia seguido', 'dias seguidos');
  }

  /** Cartão de foco a partir de `last` (engagement.assemble); sem último módulo, null. */
  function focusModel(last, now) {
    var lib = engagementLib();
    if (!last || !lib || !lib.MODULE_LABELS[last.id]) return null;
    var detail = [lib.ACTIVITY_LABELS[last.activity], lib.whenText(last.at, now)].filter(Boolean);
    return { id: last.id, title: lib.MODULE_LABELS[last.id], detail: detail.join(' · ') || 'Retome de onde parou' };
  }

  /** "Para hoje": quiz do dia (só com dados do servidor), simulado e caso clínico (abrem os módulos de sempre). */
  /** ENG-06: tópicos fracos da API viram linhas "abrir o módulo" (até 3; módulo desconhecido ou tópico vazio some). */
  function weakItems(res) {
    var list = res && res.success && Array.isArray(res.topics) ? res.topics : [];
    var out = [];
    list.forEach(function (t) {
      if (out.length >= 3 || !t || typeof t.topic !== 'string' || !t.topic) return;
      var mod = MODULES.filter(function (m) { return m.stat === t.module; })[0];
      var total = Number(t.total) || 0;
      if (!mod || total < 1) return;
      out.push({ id: mod.id, title: t.topic, sub: mod.name + ' · ' + clampPct(t.pct) + '% de acerto em ' + total + ' ' + plural(total, 'questão', 'questões') });
    });
    return out;
  }

  function paraHojeLib() {
    if (root.LaiftParaHoje) return root.LaiftParaHoje;
    return typeof require === 'function' ? require('./para-hoje.js') : null;
  }

  /** A3: "Para hoje" unificado (para-hoje.js): erros a rever e quiz do dia, mais simulado e caso clínico daqui. */
  function todayItems(eng, review) {
    return paraHojeLib().build(eng, review, [
      { kind: 'simulado', icon: 'clock', title: 'Simulado', sub: 'Pratique em Farmacologia', module: 'farmaco' },
      { kind: 'caso', icon: 'heart', title: 'Caso clínico', sub: 'Casos e plantão na Clínica virtual', module: 'clinica' },
    ]);
  }

  /** Erros a rever no aparelho (revisao-espacada.js); sem o módulo ou sem armazenamento, nada vence. */
  function reviewSummary(app) {
    var review = root.LaiftReview || (typeof require === 'function' ? require('./modulos/shared/revisao-espacada.js') : null);
    if (!review) return null;
    var identity = app && typeof app.getIdentity === 'function' ? app.getIdentity() : null;
    return review.read({ email: identity && identity.email, now: Date.now() });
  }

  function clampPct(value) {
    if (value === null || value === undefined) return null;
    return Math.max(0, Math.min(100, Number(value) || 0));
  }

  /** Um cartão por módulo, com o aproveitamento de byModule; sem dado, sem porcentagem. */
  function moduleCards(byModule) {
    return MODULES.map(function (m) {
      var data = byModule && byModule[m.stat];
      var pct = data ? clampPct(data.accuracyPct) : null;
      var attempts = data ? Number(data.attempts) || 0 : 0;
      var text = pct !== null ? pct + '% de acerto' : (attempts > 0 ? attempts + ' ' + plural(attempts, 'atividade', 'atividades') : 'Comece por aqui');
      return { id: m.id, name: m.name, sub: m.sub, desc: m.desc, art: m.art, pct: pct, attempts: attempts, text: text };
    });
  }

  /** Números gerais; o que a API não trouxe vira null (a tela mostra "—"). */
  function overallChips(stats) {
    if (!stats) return [];
    var num = function (v) { return v === null || v === undefined ? null : (Number(v) || 0); };
    return [
      { id: 'accuracy', label: 'Aproveitamento geral', value: stats.accuracyPct === null || stats.accuracyPct === undefined ? null : clampPct(stats.accuracyPct) + '%' },
      { id: 'answered', label: 'Questões resolvidas', value: num(stats.questionsAnswered) },
      { id: 'sims', label: 'Simulados concluídos', value: num(stats.quizzesCompleted) },
      { id: 'cases', label: 'Casos clínicos', value: num(stats.clinicalCasesCompleted) },
      { id: 'lab', label: 'Formulações', value: num(stats.labFormulations) },
    ];
  }

  function badgeItems(badges) {
    return (Array.isArray(badges) ? badges : []).filter(function (b) { return b && b.label; }).map(function (b) {
      return { id: String(b.id || ''), label: String(b.label), description: String(b.description || ''), unlocked: !!b.unlocked };
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
    var svg = svgRoot(doc, '0 0 24 24', 'l2-ico' + (className ? ' ' + className : ''));
    (ICONS[name] || []).forEach(function (d) { svg.appendChild(svgShape(doc, 'path', { d: d })); });
    return svg;
  }

  function art(doc, name, className) {
    var svg = svgRoot(doc, '0 0 64 64', className || 'l2-art');
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

  function bar(doc, pct, label) {
    var track = el(doc, 'span', 'l2-bar');
    track.setAttribute('role', 'img');
    track.setAttribute('aria-label', label);
    var fill = el(doc, 'i');
    fill.style.setProperty('--p', (pct === null ? 0 : pct) + '%');
    track.appendChild(fill);
    return track;
  }

  function barLabel(pct) { return pct === null ? 'Sem nota registrada' : 'Aproveitamento de ' + pct + '%'; }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[data-learn-v2-css]')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute('data-learn-v2-css', '1');
    doc.head.appendChild(link);
  }

  // ---------- Seções ----------

  function buildTop(ctx) {
    var doc = ctx.doc;
    var top = el(doc, 'header', 'l2-top');
    var hello = el(doc, 'p', 'l2-hello');
    hello.appendChild(el(doc, 'span', 'l2-hello__small', 'Seu estudo'));
    hello.appendChild(el(doc, 'strong', 'l2-hello__name', 'Aprender'));
    var guia = button(doc, 'l2-icon-btn', '', function () { ctx.openGuia(); });
    guia.setAttribute('aria-label', 'Falar com a Guia');
    guia.appendChild(icon(doc, 'chat'));
    top.appendChild(hello);
    top.appendChild(guia);
    return top;
  }

  /** UM cartão de foco: o último módulo; quem nunca estudou vê o convite do primeiro quiz; sem nenhum dos dois, some. */
  function buildFocus(ctx) {
    var doc = ctx.doc;
    var lib = engagementLib();
    var model = focusModel(ctx.data.last, ctx.now);
    var first = !model && lib.isFirstQuizCandidate(ctx.data);
    if (!model && !first) return null;
    var card = el(doc, 'article', 'l2-focus');
    card.setAttribute('aria-labelledby', 'l2-focus-title');
    card.appendChild(el(doc, 'span', 'l2-kicker', model ? 'Continuar de onde parou' : 'Comece por aqui'));
    var title = el(doc, 'h2', 'l2-focus__title', model ? model.title : 'Faça o primeiro quiz');
    title.id = 'l2-focus-title';
    card.appendChild(title);
    card.appendChild(el(doc, 'p', 'l2-focus__detail', model ? model.detail : '5 questões de Farmacologia, com explicação a cada resposta.'));
    var go = button(doc, 'l2-btn', '', function () { if (model) ctx.openModule(model.id); else lib.openFirstQuiz(ctx.app); });
    go.appendChild(icon(doc, 'play'));
    go.appendChild(el(doc, 'span', '', model ? 'Continuar' : 'Fazer o primeiro quiz'));
    go.setAttribute('data-l2-opener', '');
    card.appendChild(go);
    return card;
  }

  function goalChips(ctx) {
    var doc = ctx.doc;
    var group = el(doc, 'div', 'l2-goal-picker hidden');
    group.id = 'l2-goal-picker';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Meta diária de questões');
    engagementLib().GOALS.forEach(function (value) {
      var chip = button(doc, 'l2-chip', String(value), function () { ctx.changeGoal(value); });
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
    var box = el(doc, 'section', 'l2-day');
    box.setAttribute('aria-label', 'Seu dia');

    var ring = el(doc, 'div', 'l2-ring');
    ring.setAttribute('role', 'img');
    ring.setAttribute('aria-label', ringLabel(done, target));
    ring.style.setProperty('--p', String(ringPercent(done, target)));
    ring.appendChild(el(doc, 'b', '', String(done)));
    ring.appendChild(el(doc, 'small', '', 'de ' + target));

    var text = el(doc, 'div', 'l2-day__text');
    text.appendChild(el(doc, 'strong', '', 'Meta de hoje'));
    text.appendChild(el(doc, 'span', 'l2-day__hint', ringHint(done, target)));
    var week = el(doc, 'div', 'l2-week');
    week.setAttribute('role', 'img');
    week.setAttribute('aria-label', 'Sequência: ' + streakLabel(eng.streak));
    weekDots(eng.streak).forEach(function (dot) {
      week.appendChild(el(doc, 'i', 'l2-week__dot' + (dot.on ? ' is-on' : '') + (dot.today ? ' is-today' : '')));
    });
    text.appendChild(week);

    var current = eng.streak && eng.streak.current > 0 ? eng.streak.current : 0;
    var streak = el(doc, 'div', 'l2-streak');
    streak.appendChild(el(doc, 'b', '', String(current)));
    streak.appendChild(el(doc, 'small', '', plural(current, 'dia seguido', 'dias seguidos')));

    var row = el(doc, 'div', 'l2-day__row');
    [ring, text, streak].forEach(function (node) { row.appendChild(node); });
    box.appendChild(row);

    var picker = goalChips(ctx);
    var toggle = button(doc, 'l2-link', 'Mudar a meta', function () {
      var open = picker.classList.toggle('hidden') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'l2-goal-picker');
    box.appendChild(toggle);
    box.appendChild(picker);
    return box;
  }

  function todayAction(ctx, item) {
    if (item.kind === 'review') return function () { ctx.openReview(item.module); };
    if (item.kind === 'quiz') {
      if (!root.LaiftDailyQuiz) return function () { ctx.openModule('farmaco'); };
      return function () {
        root.LaiftDailyQuiz.open({
          app: ctx.app, doc: ctx.doc, token: ctx.token, eng: ctx.data.eng, goal: ctx.data.goal,
          onFinished: function () { ctx.reload(); },
        });
      };
    }
    return function () { ctx.openModule(item.module); };
  }

  function buildToday(ctx) {
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-today-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Para hoje');
    head.id = 'l2-today-title';
    section.appendChild(head);
    var list = el(doc, 'ul', 'l2-today');
    todayItems(ctx.data.eng, ctx.review).forEach(function (item) {
      var li = el(doc, 'li');
      var row = button(doc, 'l2-row l2-row--' + item.kind, '', todayAction(ctx, item));
      row.setAttribute('data-l2-opener', '');
      var badge = el(doc, 'span', 'l2-row__ico');
      badge.appendChild(icon(doc, item.icon));
      var text = el(doc, 'span', 'l2-row__text');
      text.appendChild(el(doc, 'strong', '', item.title));
      text.appendChild(el(doc, 'small', '', item.sub));
      row.appendChild(badge);
      row.appendChild(text);
      row.appendChild(icon(doc, 'chevron', 'l2-row__go'));
      li.appendChild(row);
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  // ---------- Missão da semana e conquistas pessoais (A6; só no aparelho, sem ranking) ----------

  /** Dados da missão e das conquistas deste aparelho; sem o módulo (ou sem armazenamento), null e a seção some. */
  function missionData(app, now) {
    var lib = root.LaiftMissao;
    if (!lib) return null;
    try {
      var who = app && typeof app.getIdentity === 'function' ? app.getIdentity() : null;
      var store = lib.createStore(root.localStorage, function () { return lib.ownerTag(who && who.email); });
      return { status: store.status(now), achievements: store.achievements() };
    } catch (e) { return null; }
  }

  function missionHint(st) {
    if (st.complete) return 'Missão cumprida. Até a próxima semana.';
    return st.daysLeft === 1 ? 'Último dia desta semana. Sem pressão: o que ficar volta como nova missão.' : 'Faltam ' + st.daysLeft + ' dias nesta semana.';
  }

  function buildMission(ctx) {
    var st = ctx.mission && ctx.mission.status;
    if (!st || !st.tasks.length) return null;
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-mission-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Missão da semana');
    head.id = 'l2-mission-title';
    section.appendChild(head);
    var card = el(doc, 'div', 'l2-mission');
    card.appendChild(el(doc, 'p', 'l2-mission__hint', missionHint(st)));
    var list = el(doc, 'ul', 'l2-mission__list');
    st.tasks.forEach(function (task) {
      var li = el(doc, 'li', 'l2-mission__task' + (task.complete ? ' is-done' : ''));
      li.setAttribute('data-l2-task', task.module);
      var line = el(doc, 'span', 'l2-mission__line');
      line.appendChild(el(doc, 'strong', '', task.label));
      line.appendChild(el(doc, 'small', '', task.complete ? 'Feita' : task.done + ' de ' + task.target));
      li.appendChild(line);
      li.appendChild(bar(doc, Math.round(task.done * 100 / task.target), task.done + ' de ' + task.target + ' atividades'));
      list.appendChild(li);
    });
    card.appendChild(list);
    section.appendChild(card);
    return section;
  }

  function buildMyAchievements(ctx) {
    var items = ctx.mission && ctx.mission.achievements;
    if (!items || !items.length) return null;
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-mine-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Minhas conquistas');
    head.id = 'l2-mine-title';
    section.appendChild(head);
    section.appendChild(el(doc, 'p', 'l2-mission__hint', 'Visíveis só para você, neste aparelho.'));
    var list = el(doc, 'ul', 'l2-mine');
    items.slice(0, 12).forEach(function (a) {
      var li = el(doc, 'li', 'l2-mine__item');
      li.setAttribute('data-l2-mine', a.id);
      var medal = el(doc, 'span', 'l2-badge__medal');
      medal.appendChild(icon(doc, 'star'));
      li.appendChild(medal);
      li.appendChild(el(doc, 'strong', '', a.label));
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function buildWeak(ctx) {
    if (!ctx.weak || !ctx.weak.length) return null;
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-weak-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Para reforçar');
    head.id = 'l2-weak-title';
    section.appendChild(head);
    var list = el(doc, 'ul', 'l2-weak');
    ctx.weak.forEach(function (item) {
      var li = el(doc, 'li');
      var row = button(doc, 'l2-row l2-row--simulado', '', function () { ctx.openModule(item.id); });
      row.setAttribute('data-l2-opener', '');
      var badge = el(doc, 'span', 'l2-row__ico');
      badge.appendChild(icon(doc, 'star'));
      var text = el(doc, 'span', 'l2-row__text');
      text.appendChild(el(doc, 'strong', '', item.title));
      text.appendChild(el(doc, 'small', '', item.sub));
      row.appendChild(badge);
      row.appendChild(text);
      row.appendChild(icon(doc, 'chevron', 'l2-row__go'));
      li.appendChild(row);
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function moduleCard(ctx, card) {
    var doc = ctx.doc;
    var node = button(doc, 'l2-module l2-mod--' + card.id, '', function () { ctx.openSheet(card, node); });
    node.setAttribute('data-l2-module', card.id);
    node.setAttribute('aria-haspopup', 'dialog');
    var arte = el(doc, 'span', 'l2-module__art');
    arte.appendChild(art(doc, card.art));
    var text = el(doc, 'span', 'l2-module__text');
    text.appendChild(el(doc, 'strong', '', card.name));
    text.appendChild(el(doc, 'small', '', card.sub));
    text.appendChild(bar(doc, card.pct, barLabel(card.pct)));
    text.appendChild(el(doc, 'small', 'l2-module__pct', card.text));
    node.appendChild(arte);
    node.appendChild(text);
    return node;
  }

  function buildModules(ctx) {
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-modules-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Módulos');
    head.id = 'l2-modules-title';
    section.appendChild(head);
    var strip = el(doc, 'ul', 'l2-strip');
    moduleCards(ctx.byModule).forEach(function (card) {
      var li = el(doc, 'li');
      li.appendChild(moduleCard(ctx, card));
      strip.appendChild(li);
    });
    section.appendChild(strip);
    return section;
  }

  function buildOverall(ctx) {
    var chips = overallChips(ctx.stats);
    if (!chips.length) return null;
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-overall-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Seu aproveitamento');
    head.id = 'l2-overall-title';
    section.appendChild(head);
    var list = el(doc, 'ul', 'l2-stats');
    chips.forEach(function (chip) {
      var li = el(doc, 'li', 'l2-stat');
      li.setAttribute('data-l2-stat', chip.id);
      li.appendChild(el(doc, 'b', '', chip.value === null ? '—' : String(chip.value)));
      li.appendChild(el(doc, 'span', '', chip.label));
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  /** Desempenho por módulo: recolhível, aberto por padrão. */
  function buildPerformance(ctx) {
    var doc = ctx.doc;
    var details = el(doc, 'details', 'l2-perf');
    details.open = true;
    details.appendChild(el(doc, 'summary', 'l2-perf__summary', 'Desempenho por módulo'));
    var body = el(doc, 'div', 'l2-perf__body');
    moduleCards(ctx.byModule).forEach(function (card) {
      var row = el(doc, 'div', 'l2-perf__row l2-mod--' + card.id);
      row.setAttribute('data-l2-perf', card.id);
      row.appendChild(el(doc, 'span', 'l2-perf__name', card.name));
      row.appendChild(el(doc, 'span', 'l2-perf__count', card.attempts + ' ' + plural(card.attempts, 'atividade', 'atividades')));
      row.appendChild(bar(doc, card.pct, barLabel(card.pct)));
      row.appendChild(el(doc, 'strong', 'l2-perf__pct', card.pct === null ? '—' : card.pct + '%'));
      body.appendChild(row);
    });
    body.appendChild(el(doc, 'p', 'l2-note', 'Aproveitamento de cada módulo, calculado pelas suas respostas.'));
    details.appendChild(body);
    return details;
  }

  /** Conquistas calculadas na Worker; sem nenhuma na lista, a seção some. */
  function buildBadges(ctx) {
    var items = badgeItems(ctx.stats && ctx.stats.badges);
    if (!items.length) return null;
    var doc = ctx.doc;
    var section = el(doc, 'section', 'l2-section');
    section.setAttribute('aria-labelledby', 'l2-badges-title');
    var head = el(doc, 'h2', 'l2-section__title', 'Conquistas');
    head.id = 'l2-badges-title';
    section.appendChild(head);
    var list = el(doc, 'ul', 'l2-badges');
    items.forEach(function (b) {
      var li = el(doc, 'li', 'l2-badge' + (b.unlocked ? ' is-on' : ''));
      li.setAttribute('data-l2-badge', b.id);
      var medal = el(doc, 'span', 'l2-badge__medal');
      medal.appendChild(icon(doc, b.unlocked ? 'star' : 'lock'));
      li.appendChild(medal);
      li.appendChild(el(doc, 'strong', '', b.label));
      if (b.description) li.appendChild(el(doc, 'small', '', b.description));
      li.appendChild(el(doc, 'small', 'l2-badge__state', b.unlocked ? 'Desbloqueada' : 'Bloqueada'));
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  // ---------- Folha de detalhe do módulo ----------

  var sheet = null;

  function focusables(node) {
    return Array.prototype.slice.call(node.querySelectorAll('button:not([disabled])'));
  }

  function closeSheet() {
    if (!sheet) return;
    var current = sheet;
    sheet = null;
    current.doc.removeEventListener('keydown', current.onKey, true);
    if (current.veil.parentNode) current.veil.parentNode.removeChild(current.veil);
    if (current.panel.parentNode) current.panel.parentNode.removeChild(current.panel);
    if (current.opener && current.opener.focus && current.opener.isConnected !== false) current.opener.focus({ preventScroll: true });
  }

  function sheetSummary(card) {
    if (card.pct !== null) return card.attempts + ' ' + plural(card.attempts, 'atividade', 'atividades') + ' · ' + card.pct + '% de acerto';
    if (card.attempts > 0) return card.attempts + ' ' + plural(card.attempts, 'atividade', 'atividades') + ' sem nota registrada';
    return 'Nenhuma atividade ainda';
  }

  function openSheet(ctx, card, opener) {
    closeSheet();
    var doc = ctx.doc;
    var veil = el(doc, 'div', 'l2-veil');
    var panel = el(doc, 'div', 'l2-sheet l2-mod--' + card.id);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'l2-sheet-title');
    panel.setAttribute('tabindex', '-1');
    panel.appendChild(el(doc, 'div', 'l2-sheet__handle'));
    var title = el(doc, 'h3', 'l2-sheet__title', card.name);
    title.id = 'l2-sheet-title';
    panel.appendChild(title);
    panel.appendChild(el(doc, 'p', 'l2-sheet__desc', card.desc));
    panel.appendChild(el(doc, 'p', 'l2-sheet__sum', sheetSummary(card)));
    panel.appendChild(bar(doc, card.pct, barLabel(card.pct)));
    var actions = el(doc, 'div', 'l2-sheet__actions');
    actions.appendChild(button(doc, 'l2-btn', card.attempts > 0 ? 'Continuar' : 'Começar', function () {
      closeSheet();
      ctx.openModule(card.id);
    }));
    actions.appendChild(button(doc, 'l2-btn l2-btn--ghost', 'Fechar', closeSheet));
    panel.appendChild(actions);
    veil.addEventListener('click', closeSheet);
    var onKey = function (event) {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); return; }
      if (event.key !== 'Tab') return;
      var items = focusables(panel);
      if (!items.length) return;
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && (doc.activeElement === first || doc.activeElement === panel)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(veil);
    doc.body.appendChild(panel);
    sheet = { doc: doc, veil: veil, panel: panel, onKey: onKey, opener: opener };
    panel.focus({ preventScroll: true });
  }

  // ---------- Carga ----------

  var generation = 0;
  var pendingFocus = '';

  function fetchStats(app) {
    if (!app || typeof app.callLearningApi !== 'function') return Promise.resolve(null);
    return Promise.resolve(app.callLearningApi('apiLearnGetMyStats')).then(function (res) {
      return res && res.success && res.stats ? res.stats : null;
    }, function () { return null; });
  }

  function fetchWeak(app) {
    if (!app || typeof app.callLearningApi !== 'function') return Promise.resolve([]);
    return Promise.resolve(app.callLearningApi('apiLearnGetWeakTopics')).then(weakItems, function () { return []; });
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

  var SLOTS = ['focus', 'day', 'today', 'mission', 'weak', 'modules', 'overall', 'perf', 'badges', 'mine'];

  function layout(doc) {
    var body = el(doc, 'div', 'l2-body');
    var slots = {};
    SLOTS.forEach(function (name) {
      slots[name] = el(doc, 'div', 'l2-slot l2-slot--' + name);
      body.appendChild(slots[name]);
    });
    return { body: body, slots: slots };
  }

  function statsFailure(ctx) {
    var note = el(ctx.doc, 'p', 'l2-error', 'Não foi possível carregar seu desempenho agora. Os módulos continuam disponíveis.');
    note.setAttribute('role', 'status');
    return note;
  }

  function paintBody(ctx) {
    var slots = ctx.slots;
    setSlot(slots.focus, buildFocus(ctx));
    setSlot(slots.day, buildDay(ctx));
    setSlot(slots.today, buildToday(ctx));
    ctx.mission = missionData(ctx.app, ctx.now);
    setSlot(slots.mission, buildMission(ctx));
    setSlot(slots.weak, buildWeak(ctx));
    setSlot(slots.modules, buildModules(ctx));
    setSlot(slots.overall, ctx.stats ? buildOverall(ctx) : null);
    setSlot(slots.perf, ctx.stats ? buildPerformance(ctx) : statsFailure(ctx));
    setSlot(slots.badges, ctx.stats ? buildBadges(ctx) : null);
    setSlot(slots.mine, buildMyAchievements(ctx));
    var hasCard = !slots.focus.classList.contains('hidden') || !slots.day.classList.contains('hidden');
    ctx.host.classList.toggle('has-card', hasCard);
    ctx.host.setAttribute('aria-busy', 'false');
    restoreFocus(ctx);
  }

  /** De volta do módulo: o foco vai para o cartão que o abriu (a tela foi redesenhada). */
  function restoreFocus(ctx) {
    if (!pendingFocus || !ctx.host.getClientRects().length) return;
    var target = ctx.host.querySelector('[data-l2-module="' + pendingFocus + '"]');
    pendingFocus = '';
    if (target) target.focus({ preventScroll: true });
  }

  function failureNode(ctx) {
    var states = root.LaiftStates;
    if (!states) return el(ctx.doc, 'p', 'l2-error', 'Não foi possível carregar o Aprender agora.');
    return states.createStateNode(ctx.doc, 'error', {
      title: 'Não foi possível carregar', message: 'Confira a conexão e tente de novo.', actionLabel: 'Tentar de novo',
      onAction: function () { load(ctx.app, ctx.doc); },
    });
  }

  function loadingNode(doc) {
    var wrap = el(doc, 'div', 'l2-loading');
    var sr = el(doc, 'span', 'laift-sr-only', 'Carregando o Aprender...');
    sr.setAttribute('role', 'status');
    wrap.appendChild(sr);
    if (root.LaiftStates) wrap.appendChild(root.LaiftStates.createSkeleton(doc, 3));
    return wrap;
  }

  /**
   * Monta o Aprender v2 no hub. `app` é window.App. Cada chamada vale só até a próxima: resposta atrasada é descartada.
   * Marca o hub com data-l2 (o CSS esconde o hub de sempre só quando esta tela já está no ar).
   */
  function load(app, doc) {
    var hub = doc.getElementById(HUB_ID);
    if (!hub || !app) return Promise.resolve(false);
    ensureStyles(doc);
    var host = doc.getElementById(HOST_ID);
    if (!host) {
      host = el(doc, 'div');
      host.id = HOST_ID;
      hub.insertBefore(host, hub.firstChild);
    }
    generation += 1;
    var mine = generation;
    var state = app.getState();
    var lib = engagementLib();
    var parts = layout(doc);
    var ctx = {
      app: app, doc: doc, host: host, token: state.sessionToken || '', now: new Date(), stats: null, byModule: null,
      data: { eng: null, goal: 10, last: null }, slots: parts.slots, openGuia: openGuia,
    };
    ctx.openModule = function (id) { lib.openModule(app, id); };
    ctx.openReview = function (id) { lib.openReview(app, id); };
    ctx.openSheet = function (card, opener) { openSheet(ctx, card, opener); };
    ctx.reload = function () { return refresh(ctx, mine); };
    ctx.changeGoal = function (value) {
      lib.saveGoal(app, ctx.token, value).then(function () { return refresh(ctx, mine); });
    };
    closeSheet();
    host.setAttribute('aria-busy', 'true');
    if (!host.querySelector('.l2-body')) { // primeira carga: topo e esqueleto; nas seguintes a tela antiga fica até chegar a nova
      clear(host);
      host.appendChild(buildTop(ctx));
      host.appendChild(loadingNode(doc));
    }
    hub.setAttribute('data-l2', '1');

    return Promise.all([fetchStats(app), lib.fetchEngagement(app, ctx.token), fetchWeak(app)]).then(function (res) {
      if (mine !== generation) return false;
      ctx.stats = res[0];
      ctx.byModule = res[0] ? res[0].byModule || null : null;
      ctx.data = lib.assemble(res[1]);
      ctx.weak = res[2];
      ctx.review = reviewSummary(app);
      clear(host);
      host.appendChild(buildTop(ctx));
      host.appendChild(parts.body);
      if (!res[0] && !res[1]) { setSlot(parts.slots.focus, failureNode(ctx)); host.setAttribute('aria-busy', 'false'); return true; }
      paintBody(ctx);
      return true;
    });
  }

  /** Só o engajamento mudou (meta nova, quiz do dia feito): refaz a tela com dados novos das duas fontes. */
  function refresh(ctx, mine) {
    if (mine !== generation) return Promise.resolve(false);
    return load(ctx.app, ctx.doc);
  }

  /** Flag desligada, logout ou troca de conta: solta respostas em voo e devolve o hub de sempre. */
  function reset(doc) {
    generation += 1;
    pendingFocus = '';
    closeSheet();
    var host = doc && doc.getElementById(HOST_ID);
    var hub = doc && doc.getElementById(HUB_ID);
    if (host) clear(host);
    if (hub) hub.removeAttribute('data-l2');
  }

  if (root.document && root.document.addEventListener) {
    root.document.addEventListener('laift:modulechange', function (event) {
      var id = event && event.detail ? event.detail.module : '';
      if (id) pendingFocus = id;
    });
  }

  var api = {
    MODULES: MODULES, weekDots: weekDots, ringPercent: ringPercent, ringLabel: ringLabel, ringHint: ringHint,
    streakLabel: streakLabel, focusModel: focusModel, todayItems: todayItems, reviewSummary: reviewSummary, weakItems: weakItems, buildWeak: buildWeak, moduleCards: moduleCards,
    overallChips: overallChips, badgeItems: badgeItems, sheetSummary: sheetSummary, ensureStyles: ensureStyles,
    buildTop: buildTop, buildFocus: buildFocus, buildDay: buildDay, buildToday: buildToday, buildModules: buildModules,
    buildOverall: buildOverall, buildPerformance: buildPerformance, buildBadges: buildBadges, buildMission: buildMission, buildMyAchievements: buildMyAchievements, missionData: missionData,
    load: load, reset: reset, closeSheet: closeSheet,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftLearnV2 = api;
})(typeof self !== 'undefined' ? self : this);
