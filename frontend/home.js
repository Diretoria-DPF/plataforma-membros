/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel "Início" em layout editorial, sem cards (estilo em home-editorial.css).
// Uma chamada obrigatória (apiGetHomeSummary) monta os números e os avisos;
// uma chamada (apiGetMyDashboardSeries) traz todas as séries de 30 dias e 6 meses.
// Série que não veio mostra "Sem dados"; falha da chamada inteira mostra erro com
// "Tentar de novo" em cada gráfico.
// Formato da API: window.LaiftDashboardAdapter (dashboardAdapter.js); desenho:
// window.LaiftCharts (charts.js). Texto da API nunca vira HTML: só
// createElement e textContent. Expõe window.LaiftHome.
(function (root) {
  'use strict';

  var ADAPTER = typeof module !== 'undefined' && module.exports
    ? require('./dashboardAdapter.js')
    : root.LaiftDashboardAdapter;

  var DAY_MS = 24 * 60 * 60 * 1000;
  var NEAR_DAYS = 6;
  var WINDOW_RANGE = '30d';
  var DEFAULT_RANGE = '30d';
  var COMPARE_RANGE = '6m';
  var AGORA_IDS = ['events', 'voting', 'inbox'];
  var SPARK_TITLES = { events: 'Eventos', learning: 'Aprendizagem', tasks: 'Tarefas concluídas', study_hours: 'Horas de estudo' };
  /** Unidade do total do sparkline: [singular, plural]. */
  var SPARK_UNIT_FORMS = {
    events: ['evento', 'eventos'],
    learning: ['atividade', 'atividades'],
    tasks: ['concluída', 'concluídas'],
    study_hours: ['hora', 'horas']
  };

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  /** Total do sparkline com a unidade: singular só para exatamente 1 ("1 evento", "1 hora"). */
  function sparkTotalText(metric, total, format) {
    var forms = SPARK_UNIT_FORMS[metric] || [metric, metric];
    var shown = typeof format === 'function' ? format(total) : String(total);
    return shown + ' ' + plural(total, forms[0], forms[1]);
  }

  /** "2 de 5 selos", e "0 de 1 selo" quando o total é 1. */
  function badgeCountText(unlocked, total) {
    return unlocked + ' de ' + total + ' ' + plural(total, 'selo', 'selos');
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function toDate(iso) {
    if (iso === null || iso === undefined || iso === '') return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  /** "Bom dia, Maria" — só o primeiro nome; sem nome, só a saudação. */
  function greeting(fullName, now) {
    var hour = now.getHours();
    var salute = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    var first = String(fullName || '').trim().split(/\s+/)[0];
    return first ? salute + ', ' + first : salute;
  }

  /** hoje, amanhã, em N dias, ontem, há N dias ('' se a data for inválida). */
  function relativeDay(iso, now) {
    var date = toDate(iso);
    if (!date) return '';
    var diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    if (diff === -1) return 'ontem';
    return diff > 1 ? 'em ' + diff + ' dias' : 'há ' + (-diff) + ' dias';
  }

  /** "amanhã · 12:00" para datas próximas; "20 de out. · 12:00" para as distantes. */
  function formatWhen(iso, now) {
    var date = toDate(iso);
    if (!date) return '';
    var diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / DAY_MS);
    var day = diff >= -1 && diff <= NEAR_DAYS
      ? relativeDay(iso, now)
      : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    var time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return day + ' · ' + time;
  }

  function eventsCard(summary) {
    return {
      id: 'events',
      title: 'Próximos eventos',
      kind: 'list',
      items: (summary.nextEvents || []).map(function (e) {
        return { title: e.title, whenIso: e.eventDate, place: e.location || '', badge: e.isRegistered ? 'Inscrito' : null };
      }),
      emptyText: 'Nenhum evento à vista.',
      action: { label: 'Ver eventos', panel: 'panel-events' },
    };
  }

  function tasksCard(t, now) {
    var detail;
    if (t.next) {
      var rel = relativeDay(t.next.dueDate, now);
      detail = 'Próxima: ' + t.next.title + (rel ? ' — ' + rel : '');
    } else if (t.availableCount > 0) {
      detail = t.availableCount + ' ' + plural(t.availableCount, 'tarefa disponível', 'tarefas disponíveis') + ' para assumir.';
    } else {
      detail = 'Nenhuma tarefa por enquanto.';
    }
    return {
      id: 'tasks', title: 'Minhas tarefas', kind: 'metric',
      metric: String(t.myPendingCount), metricLabel: plural(t.myPendingCount, 'pendente', 'pendentes'),
      detail: detail, action: { label: 'Ver tarefas', panel: 'panel-tasks' },
    };
  }

  function votingCard(v, now) {
    var detail;
    if (v.pendingCount > 0) {
      var rel = relativeDay(v.nextClosesAt, now);
      detail = rel ? 'Encerra ' + rel + '.' : 'Votação aberta.';
    } else {
      detail = v.openCount > 0 ? 'Você já votou em tudo.' : 'Nenhuma votação aberta.';
    }
    return {
      id: 'voting', title: 'Votações', kind: 'metric',
      metric: String(v.pendingCount), metricLabel: 'para votar',
      detail: detail, action: { label: 'Votar', panel: 'panel-proposals' },
    };
  }

  function learningCard(l) {
    return {
      id: 'learning', title: 'Aprendizado', kind: 'metric',
      metric: l.accuracyPct === null || l.accuracyPct === undefined ? '—' : l.accuracyPct + '%',
      metricLabel: 'de acerto',
      detail: l.questionsAnswered + ' ' + plural(l.questionsAnswered, 'questão', 'questões') + ' · ' + badgeCountText(l.unlockedBadges, l.totalBadges),
      action: { label: 'Estudar', panel: 'panel-learn' },
    };
  }

  function inboxCard(i) {
    var detail;
    if (i.pendingConnectionRequests > 0) {
      detail = i.pendingConnectionRequests + ' ' + plural(i.pendingConnectionRequests, 'pedido de conexão', 'pedidos de conexão') + '.';
    } else {
      detail = i.unreadMessages > 0 ? 'Sem pedidos de conexão.' : 'Tudo em dia.';
    }
    return {
      id: 'inbox', title: 'Caixa de entrada', kind: 'metric',
      metric: String(i.unreadMessages), metricLabel: plural(i.unreadMessages, 'mensagem nova', 'mensagens novas'),
      detail: detail, action: { label: 'Abrir mensagens', panel: 'panel-messages' },
    };
  }

  /** Seções nulas no resumo (visitante) simplesmente não geram cartão. */
  function buildCards(summary, now) {
    var cards = [eventsCard(summary)];
    if (summary.tasks) cards.push(tasksCard(summary.tasks, now));
    if (summary.voting) cards.push(votingCard(summary.voting, now));
    if (summary.learning) cards.push(learningCard(summary.learning));
    if (summary.inbox) cards.push(inboxCard(summary.inbox));
    return cards;
  }

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function renderList(doc, card, now) {
    if (!card.items.length) return element(doc, 'p', 'muted', card.emptyText);
    var list = element(doc, 'ul', 'home-list');
    card.items.forEach(function (item) {
      var li = element(doc, 'li');
      var head = element(doc, 'div', 'home-list-head');
      head.appendChild(element(doc, 'strong', '', item.title));
      if (item.badge) head.appendChild(element(doc, 'span', 'badge', item.badge));
      li.appendChild(head);
      var when = formatWhen(item.whenIso, now);
      var meta = [when, item.place].filter(Boolean).join(' · ');
      if (meta) li.appendChild(element(doc, 'span', 'muted', meta));
      list.appendChild(li);
    });
    return list;
  }

  function renderMetric(doc, card) {
    var box = element(doc, 'div', 'home-metric');
    box.appendChild(element(doc, 'strong', 'home-metric-value', card.metric));
    box.appendChild(element(doc, 'span', 'home-metric-label', card.metricLabel));
    return box;
  }

  /**
   * Monta os avisos do resumo. Padrão: cartões (com borda). Com { variant: 'rows' }
   * (layout editorial), cada aviso é uma linha separada por filete, sem caixa.
   */
  function renderCards(doc, host, cards, onNavigate, now, opts) {
    var rows = !!(opts && opts.variant === 'rows');
    cards.forEach(function (card) {
      var article = element(doc, 'article', rows ? 'home-row home-row-' + card.id : 'card home-card home-card-' + card.id);
      article.appendChild(element(doc, 'h3', 'home-card-title', card.title));
      article.appendChild(card.kind === 'list' ? renderList(doc, card, now) : renderMetric(doc, card));
      if (card.detail) article.appendChild(element(doc, 'p', 'muted home-card-detail', card.detail));
      var button = element(doc, 'button', 'secondary', card.action.label);
      button.setAttribute('type', 'button');
      button.addEventListener('click', function () { onNavigate(card.action.panel); });
      article.appendChild(button);
      host.appendChild(article);
    });
  }

  function clear(node) {
    node.textContent = '';
  }

  // ---------- Ciclo de vida: cada carregamento é uma "geração" ----------
  // Ao abrir uma entrada, gráficos e contagens da anterior são soltos (destroy/cancel)
  // e respostas de gerações velhas são descartadas: nada antigo desenha por cima.

  var generation = 0;
  var live = [];

  /** Registra o que precisa de destroy() (contêiner de gráfico ou contagem) para soltar na próxima entrada. */
  function track(handle) {
    live.push(handle);
    return handle;
  }

  function releaseLive() {
    var pending = live;
    live = [];
    pending.forEach(function (handle) { handle.destroy(); });
  }

  /** Abre uma nova entrada no Início: solta a anterior e devolve o predicado "ainda é a tela atual?". */
  function openView() {
    releaseLive();
    generation += 1;
    var gen = generation;
    return function isCurrent() { return gen === generation; };
  }

  // ---------- Layout editorial ----------

  /** Contêiner de gráfico que troca de conteúdo sem deixar gráfico antigo vivo. */
  function makeSlot(doc, className) {
    var el = element(doc, 'div', className);
    var slot = { el: el, chart: null };
    slot.destroy = function () {
      if (slot.chart) slot.chart.destroy();
      slot.chart = null;
    };
    slot.reset = function () {
      slot.destroy();
      el.removeAttribute('aria-busy');
      clear(el);
      return el;
    };
    track(slot);
    return slot;
  }

  function showSkeleton(doc, slot) {
    var el = slot.reset();
    el.setAttribute('aria-busy', 'true');
    if (root.LaiftStates) el.appendChild(root.LaiftStates.createSkeleton(doc, 3));
  }

  /** Falha de UM gráfico: mensagem e "Tentar de novo" só nesse espaço. */
  function showFailure(doc, slot, message, retry) {
    var el = slot.reset();
    if (root.LaiftStates) el.appendChild(root.LaiftStates.createStateNode(doc, 'error', {
      title: 'Não foi possível carregar', message: message, actionLabel: 'Tentar de novo', onAction: retry,
    }));
  }

  /** Série sem nenhum valor positivo vira lista vazia: o gráfico mostra "Sem dados no período". */
  function seriesRows(points) {
    return ADAPTER.isEmptySeries(points) ? [] : points;
  }

  /** Desenha um gráfico de LaiftCharts no slot com as linhas já prontas. */
  function drawChart(slot, kind, rows, options) {
    var el = slot.reset();
    var charts = root.LaiftCharts;
    if (charts) slot.chart = charts[kind](el, rows, options);
    return slot;
  }

  function fmt(n) {
    var charts = root.LaiftCharts;
    return charts && charts.formatNumber ? charts.formatNumber(n) : String(n);
  }

  /** Número que conta até o valor (count-up); sem valor mostra traço. */
  function animateValue(el, value, format) {
    if (value === null || value === undefined) {
      el.textContent = '—';
      return;
    }
    var charts = root.LaiftCharts;
    if (!charts || !charts.countUp) {
      el.textContent = format(value);
      return;
    }
    var counter = charts.countUp(el, value, { format: format });
    track({ destroy: function () { counter.cancel(); } });
  }

  function kpiBlock(doc, label) {
    var value = element(doc, 'span', 'home-kpi-value', '—');
    var node = element(doc, 'div', 'home-kpi');
    node.appendChild(value);
    node.appendChild(element(doc, 'span', 'home-kpi-label', label));
    return { node: node, value: value };
  }

  function buildKpis(ctx) {
    var doc = ctx.doc;
    var section = element(doc, 'section', 'home-kpis');
    section.setAttribute('aria-label', 'Resumo');
    var items = { events: kpiBlock(doc, 'eventos nos últimos 30 dias') };
    if (ctx.view.hasTasks) items.tasks = kpiBlock(doc, 'tarefas pendentes');
    items.hours = kpiBlock(doc, 'horas de estudo nos últimos 30 dias');
    items.accuracy = kpiBlock(doc, 'de acerto nas questões');
    Object.keys(items).forEach(function (key) { section.appendChild(items[key].node); });
    return { node: section, items: items };
  }

  function buildMain(ctx) {
    var doc = ctx.doc;
    var section = element(doc, 'section', 'home-main');
    var head = element(doc, 'div', 'home-section-head');
    head.appendChild(element(doc, 'h3', 'home-section-title', 'Atividade'));
    var group = element(doc, 'div', 'home-range');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Período do gráfico de atividade');
    var options = ADAPTER.RANGE_OPTIONS.map(function (opt) {
      var btn = element(doc, 'button', 'home-range-btn', opt.label);
      btn.setAttribute('type', 'button');
      btn.setAttribute('aria-pressed', String(opt.range === DEFAULT_RANGE));
      group.appendChild(btn);
      return { range: opt.range, node: btn };
    });
    head.appendChild(group);
    var slot = makeSlot(doc, 'home-chart home-chart-main');
    section.appendChild(head);
    section.appendChild(slot.el);
    return { node: section, slot: slot, options: options, current: DEFAULT_RANGE };
  }

  function metricBlock(doc, metric) {
    var node = element(doc, 'div', 'home-metric-block home-metric-' + metric);
    node.appendChild(element(doc, 'h3', 'home-section-title', SPARK_TITLES[metric]));
    var total = element(doc, 'p', 'home-metric-total', '—');
    var slot = makeSlot(doc, 'home-chart home-chart-spark');
    var trend = element(doc, 'p', 'muted home-metric-trend');
    var note = element(doc, 'p', 'muted home-metric-note');
    [total, slot.el, trend, note].forEach(function (child) { node.appendChild(child); });
    return { metric: metric, node: node, total: total, slot: slot, trend: trend, note: note };
  }

  function plainBlock(doc, className, title) {
    var node = element(doc, 'div', 'home-metric-block ' + className);
    node.appendChild(element(doc, 'h3', 'home-section-title', title));
    var slot = makeSlot(doc, 'home-chart');
    node.appendChild(slot.el);
    return { node: node, slot: slot };
  }

  /** Próxima tarefa e prazo (texto do cartião de tarefas), sob o sparkline de tarefas. */
  function taskNote(ctx) {
    var card = buildCards(ctx.summary, ctx.now).find(function (c) { return c.id === 'tasks'; });
    return card ? card.detail : '';
  }

  function buildMetrics(ctx) {
    var doc = ctx.doc;
    var section = element(doc, 'section', 'home-metrics');
    section.setAttribute('aria-label', 'Métricas do período');
    var sparks = ADAPTER.secondaryMetrics(ctx.view.hasTasks).map(function (metric) {
      var block = metricBlock(doc, metric);
      if (metric === 'tasks') block.note.textContent = taskNote(ctx);
      return block;
    });
    var compare = plainBlock(doc, 'home-metric-compare', 'Comparativo mensal');
    var badges = plainBlock(doc, 'home-metric-badges', 'Selos');
    badges.caption = element(doc, 'p', 'muted home-metric-trend');
    badges.node.appendChild(badges.caption);
    // Fileira de sparklines (4 em linha, 2x2 no celular) e par de mesma altura embaixo.
    var sparkRow = element(doc, 'div', 'home-sparks');
    sparks.forEach(function (block) { sparkRow.appendChild(block.node); });
    var pair = element(doc, 'div', 'home-metric-pair');
    pair.appendChild(compare.node);
    pair.appendChild(badges.node);
    section.appendChild(sparkRow);
    section.appendChild(pair);
    return { node: section, sparks: sparks, compare: compare, badges: badges };
  }

  function buildAgora(ctx, navigate) {
    var cards = buildCards(ctx.summary, ctx.now).filter(function (card) { return AGORA_IDS.indexOf(card.id) !== -1; });
    if (!cards.length) return null;
    var section = element(ctx.doc, 'section', 'home-agora');
    section.appendChild(element(ctx.doc, 'h3', 'home-section-title', 'Agora'));
    var list = element(ctx.doc, 'div', 'home-agora-list');
    renderCards(ctx.doc, list, cards, navigate, ctx.now, { variant: 'rows' });
    section.appendChild(list);
    return section;
  }

  function buildLayout(ctx, host, navigate) {
    var kpis = buildKpis(ctx);
    var main = buildMain(ctx);
    var metrics = buildMetrics(ctx);
    host.appendChild(kpis.node);
    host.appendChild(main.node);
    host.appendChild(metrics.node);
    var agora = buildAgora(ctx, navigate);
    if (agora) host.appendChild(agora);
    return { kpis: kpis.items, main: main, metrics: metrics };
  }

  // ---------- Dados (cada bloco isolado) ----------

  /**
   * Séries: o pacote (apiGetMyDashboardSeries) é pedido uma vez por carregamento.
   * Atividade em 90 dias e 12 meses fica fora dele: pede-se só quando o membro
   * troca o período (apiGetMyTimeseries, com cache por período).
   */
  function createLoader(app, token) {
    var dashboardPromise = null;
    var single = {};
    function dashboard(force) {
      if (force || !dashboardPromise) {
        dashboardPromise = app.callApi('apiGetMyDashboardSeries', token, {})
          .then(ADAPTER.normalizeDashboard, function () { return ADAPTER.normalizeDashboard(null); });
      }
      return dashboardPromise;
    }
    function oneSeries(metric, range, force) {
      var key = metric + '|' + range;
      if (force || !single[key]) {
        single[key] = app.callApi('apiGetMyTimeseries', token, ADAPTER.seriesInput(metric, range))
          .then(ADAPTER.normalizeSeries, function () { return ADAPTER.normalizeSeries(null); });
      }
      return single[key];
    }
    return {
      dashboard: dashboard,
      series: function (metric, range, force) {
        var key = ADAPTER.bundleKey(metric, range);
        if (!key) return oneSeries(metric, range, force);
        return dashboard(false).then(function (res) { return ADAPTER.pickSeries(res, key); });
      },
    };
  }

  function loadKpis(ctx, kpis) {
    var view = ctx.view;
    animateValue(kpis.accuracy.value, view.accuracyPct, function (n) { return fmt(n) + '%'; });
    if (kpis.tasks) animateValue(kpis.tasks.value, view.pendingTasks, fmt);
    var pairs = [[kpis.events, 'events'], [kpis.hours, 'study_hours']];
    return Promise.all(pairs.map(function (pair) {
      return ctx.loader.series(pair[1], WINDOW_RANGE).then(function (res) {
        if (!ctx.isCurrent()) return;
        animateValue(pair[0].value, res.ok && !res.missing ? ADAPTER.sumValues(res.points) : null, fmt);
      });
    }));
  }

  function drawMain(ctx, main, range, force) {
    showSkeleton(ctx.doc, main.slot);
    return ctx.loader.series('activity', range, force).then(function (res) {
      if (!ctx.isCurrent() || main.current !== range) return;
      if (!res.ok) {
        showFailure(ctx.doc, main.slot, res.message, function () { retryMain(ctx, main, range); });
        return;
      }
      drawChart(main.slot, 'lineArea', seriesRows(res.points), { title: 'Atividade no período', width: 640, height: 220, fluid: true });
    });
  }

  /** "Tentar de novo" do gráfico principal: 30 dias volta ao pacote; outros períodos pedem a série de novo. */
  function retryMain(ctx, main, range) {
    if (ADAPTER.bundleKey('activity', range)) ctx.repaint(true);
    else drawMain(ctx, main, range, true);
  }

  function bindRange(ctx, main) {
    main.options.forEach(function (opt) {
      opt.node.addEventListener('click', function () {
        if (main.current === opt.range) return;
        main.current = opt.range;
        main.options.forEach(function (o) { o.node.setAttribute('aria-pressed', String(o.range === opt.range)); });
        drawMain(ctx, main, opt.range, false);
      });
    });
  }

  /** Total e variação do sparkline; série que não veio mostra traço no total. */
  function sparkTexts(block, res) {
    if (res.missing) return { total: '—', trend: '' };
    return {
      total: sparkTotalText(block.metric, ADAPTER.sumValues(res.points), fmt),
      trend: ADAPTER.formatVariation(ADAPTER.variation(res.points).percent),
    };
  }

  function drawSpark(ctx, block) {
    showSkeleton(ctx.doc, block.slot);
    return ctx.loader.series(block.metric, WINDOW_RANGE).then(function (res) {
      if (!ctx.isCurrent()) return;
      if (!res.ok) {
        block.total.textContent = '—';
        block.trend.textContent = '';
        showFailure(ctx.doc, block.slot, res.message, function () { ctx.repaint(true); });
        return;
      }
      var texts = sparkTexts(block, res);
      block.total.textContent = texts.total;
      block.trend.textContent = texts.trend;
      drawChart(block.slot, 'sparkline', seriesRows(res.points), { title: SPARK_TITLES[block.metric] + ' nos últimos 30 dias', width: 200, height: 48, fluid: true, live: true });
    });
  }

  function loadCompare(ctx, compare) {
    showSkeleton(ctx.doc, compare.slot);
    var metrics = ADAPTER.COMPARISON_METRICS.filter(function (m) { return m !== 'tasks' || ctx.view.hasTasks; });
    return Promise.all(metrics.map(function (metric) {
      return ctx.loader.series(metric, COMPARE_RANGE).then(function (res) { return [metric, res]; });
    })).then(function (pairs) {
      if (!ctx.isCurrent()) return;
      var anyOk = pairs.some(function (p) { return p[1].ok; });
      if (!anyOk) {
        showFailure(ctx.doc, compare.slot, pairs[0][1].message, function () { ctx.repaint(true); });
        return;
      }
      var byMetric = pairs.reduce(function (acc, p) { acc[p[0]] = p[1]; return acc; }, {});
      var cmp = ADAPTER.monthlyComparison(byMetric);
      var hasData = !!cmp && cmp.rows.some(function (row) { return row.values.some(function (v) { return v > 0; }); });
      drawChart(compare.slot, 'groupedBars', hasData ? cmp.rows : [], {
        title: 'Comparativo mensal', series: hasData ? cmp.seriesNames : null, width: 320, height: 232, fluid: true,
      });
    });
  }

  function renderBadges(ctx, badges) {
    var progress = ctx.view.badges;
    if (!progress) {
      badges.caption.textContent = 'Nenhum selo disponível nesta conta.';
      badges.slot.reset();
      return;
    }
    drawChart(badges.slot, 'donut', ADAPTER.badgeRows(progress), { title: 'Selos conquistados', centerLabel: 'selos', size: 160 });
    badges.caption.textContent = badgeCountText(progress.unlocked, progress.total) + ' conquistados';
  }

  /** Falha inesperada de um bloco não derruba os demais. */
  function isolated(promise) {
    return promise.then(null, function (err) {
      if (root.console) root.console.warn('[Início]', err);
    });
  }

  /** Desenha todos os blocos no período atual. `force` refaz o pacote (só o "Tentar de novo" pede). */
  function paintAll(ctx, layout, force) {
    if (force) ctx.loader.dashboard(true);
    return Promise.all([
      isolated(loadKpis(ctx, layout.kpis)),
      isolated(drawMain(ctx, layout.main, layout.main.current, false)),
      isolated(loadCompare(ctx, layout.metrics.compare)),
    ].concat(layout.metrics.sparks.map(function (block) { return isolated(drawSpark(ctx, block)); })));
  }

  /** `isCurrent()` diz se esta entrada ainda é a tela; respostas que chegam depois de trocada são descartadas. */
  function renderEditorial(app, doc, host, summary, now, token, isCurrent) {
    var ctx = {
      doc: doc, summary: summary, now: now, view: ADAPTER.summaryView(summary),
      loader: createLoader(app, token), isCurrent: isCurrent
    };
    var layout = buildLayout(ctx, host, function (panel) { app.showPanel(panel); });
    ctx.repaint = function (force) { return paintAll(ctx, layout, force); };
    bindRange(ctx, layout.main);
    renderBadges(ctx, layout.metrics.badges);
    return ctx.repaint(false).then(function () {
      if (isCurrent()) host.setAttribute('aria-busy', 'false');
    });
  }

  /**
   * Carrega e desenha o Início. `app` é window.App (callApi, getState, showPanel).
   * Cada chamada abre uma geração: a entrada anterior é solta antes da nova, e a
   * resposta de uma chamada já trocada não toca na tela.
   */
  function load(app, doc) {
    var host = doc.getElementById('home-dashboard');
    if (!host) return Promise.resolve();
    var isCurrent = openView();
    var states = root.LaiftStates;
    var state = app.getState();
    var now = new Date();
    var token = state.sessionToken || '';

    var greetingEl = doc.getElementById('home-greeting');
    if (greetingEl) greetingEl.textContent = greeting(state.profile && state.profile.fullName, now);

    host.className = 'home-editorial';
    host.setAttribute('aria-busy', 'true');
    clear(host);
    if (states) host.appendChild(states.createStateNode(doc, 'loading'));

    return app.callApi('apiGetHomeSummary', token).then(function (res) {
      if (!isCurrent()) return undefined;
      clear(host);
      if (!res.success) {
        host.setAttribute('aria-busy', 'false');
        if (states) {
          host.appendChild(states.createStateNode(doc, 'error', {
            message: res.message,
            actionLabel: 'Tentar de novo',
            onAction: function () { load(app, doc); },
          }));
        }
        return undefined;
      }
      return renderEditorial(app, doc, host, res.summary || {}, now, token, isCurrent);
    });
  }

  /** Logout ou painel descartado: solta gráficos e contagens e descarta respostas em voo. */
  function reset() {
    openView();
  }

  var api = {
    greeting: greeting,
    relativeDay: relativeDay,
    buildCards: buildCards,
    renderCards: renderCards,
    sparkTotalText: sparkTotalText,
    badgeCountText: badgeCountText,
    load: load,
    reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftHome = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
