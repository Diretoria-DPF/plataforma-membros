/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * home.e2e.js — painel Início em layout editorial (frontend/home.js,
 * dashboardAdapter.js, home-editorial.css) com apiGetHomeSummary,
 * apiGetMyDashboardSeries (pacote de 30 dias e 6 meses) e apiGetMyTimeseries
 * (só para atividade em 90 dias e 12 meses).
 */
const { startApp, check } = require('./harness');

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

// Valor constante por dia (ou mês/semana): 30d de eventos soma 30; horas soma 15.
const VALUE = { activity: 3, events: 1, learning: 2, tasks: 0, study_hours: 0.5 };

function dateList(range) {
  if (range === '6m') {
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCMonth(d.getUTCMonth() - (5 - i));
      return d.toISOString().slice(0, 10);
    });
  }
  const n = range === '12m' ? 52 : Number(range.replace('d', ''));
  return Array.from({ length: n }, (_, i) => inDays(-(n - 1 - i)).slice(0, 10));
}

function timeseriesReply(metric, range) {
  const granularity = range === '6m' ? 'month' : range === '12m' ? 'week' : 'day';
  return { success: true, range, granularity, series: dateList(range).map((date) => ({ date, value: VALUE[metric] })) };
}

// Chaves do pacote de apiGetMyDashboardSeries (espelham DASHBOARD_SERIES da Worker).
const BUNDLE = [
  ['activity30d', 'activity', '30d'], ['events30d', 'events', '30d'], ['learning30d', 'learning', '30d'],
  ['tasks30d', 'tasks', '30d'], ['studyHours30d', 'study_hours', '30d'],
  ['events6m', 'events', '6m'], ['learning6m', 'learning', '6m'], ['tasks6m', 'tasks', '6m'],
];

/** Resposta do pacote. `missing`: chaves que vêm null (falha daquela série); `zero`: todos os valores zerados. */
function dashboardReply(opts) {
  const { missing = [], zero = false } = opts || {};
  const series = {};
  BUNDLE.forEach(([key, metric, range]) => {
    if (missing.includes(key)) {
      series[key] = null;
      return;
    }
    const reply = timeseriesReply(metric, range);
    const values = zero ? reply.series.map((p) => ({ ...p, value: 0 })) : reply.series;
    series[key] = { range: reply.range, granularity: reply.granularity, series: values };
  });
  return { success: true, series };
}

function summary(extra) {
  return Object.assign({
    nextEvents: [
      { id: 'e1', title: 'Aula de Toxicologia', eventDate: inDays(1), location: 'Sala 2', isRegistered: true, spotsLeft: 3 },
      { id: 'e2', title: 'Simpósio', eventDate: inDays(9), location: null, isRegistered: false, spotsLeft: null },
    ],
    tasks: { myPendingCount: 2, availableCount: 1, next: { id: 't1', title: 'Revisar casos', dueDate: inDays(3) } },
    voting: { openCount: 2, pendingCount: 1, nextClosesAt: inDays(2) },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 3, pendingConnectionRequests: 1 },
  }, extra || {});
}

/** Espera um texto aparecer (o count-up leva ~800 ms). */
async function waitText(page, selector, text) {
  await page.waitForFunction(([sel, expected]) => {
    const el = document.querySelector(sel);
    return !!el && el.textContent === expected;
  }, [selector, text], { timeout: 10000 });
}

module.exports = async function home() {
  // ---- Membro: números, gráficos, comparativo, selos, avisos e navegação ----
  let summaryCalls = 0;
  const bundleCalls = [];
  const seriesCalls = [];
  const member = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => { summaryCalls += 1; return { success: true, summary: summary() }; },
      apiGetMyDashboardSeries: () => { bundleCalls.push(1); return dashboardReply(); },
      apiGetMyTimeseries: (args) => {
        seriesCalls.push({ metric: args[1].metric, range: args[1].range });
        return timeseriesReply(args[1].metric, args[1].range);
      },
    },
  });
  try {
    await member.login();
    await member.page.waitForSelector('#home-dashboard.home-editorial');
    await member.page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
    check(bundleCalls.length === 1, 'o Início pede todas as séries de 30 dias e 6 meses numa chamada só (' + bundleCalls.length + ')');
    check(seriesCalls.length === 0, 'carregamento inicial não pede série avulsa (' + seriesCalls.length + ')');
    check((await member.page.locator('#home-dashboard .home-card').count()) === 0, 'Início não usa cartões com borda (sem .home-card)');
    check((await member.page.locator('#home-dashboard .home-kpi').count()) === 4, 'membro vê os quatro números grandes');

    await waitText(member.page, '#home-dashboard .home-kpi:nth-child(1) .home-kpi-value', '30');
    check(true, 'eventos dos últimos 30 dias: soma da série (30)');
    await waitText(member.page, '#home-dashboard .home-kpi:nth-child(2) .home-kpi-value', '2');
    check(true, 'tarefas pendentes vêm do resumo (2)');
    await waitText(member.page, '#home-dashboard .home-kpi:nth-child(3) .home-kpi-value', '15');
    check(true, 'horas de estudo: soma em horas dos últimos 30 dias (15)');
    await waitText(member.page, '#home-dashboard .home-kpi:nth-child(4) .home-kpi-value', '72%');
    check(true, 'acerto em porcentagem (72%)');

    check((await member.page.locator('#home-dashboard .home-chart-main .laift-chart--line').count()) === 1, 'gráfico principal de atividade é linha+área');
    check((await member.page.locator('#home-dashboard .laift-chart [tabindex]').count()) === 0, 'nenhum gráfico do Início recebe foco por tabindex');
    check((await member.page.locator('#home-dashboard .home-chart-main .laift-chart__value:not(.laift-chart__value--hover)').count()) >= 1, 'o último valor da atividade aparece sem hover');
    const pressed = await member.page.$$eval('#home-dashboard .home-range-btn', (n) => n.map((b) => b.getAttribute('aria-pressed')));
    check(pressed.join(',') === 'true,false,false', 'período padrão é 30 dias (' + pressed + ')');
    const sizes = await member.page.$$eval('#home-dashboard .home-range-btn', (n) => n.map((b) => b.getBoundingClientRect().height));
    check(sizes.every((h) => h >= 44), 'botões de período têm pelo menos 44 px de altura (' + sizes.map(Math.round) + ')');

    await member.page.click('#home-dashboard .home-range-btn:nth-child(3)');
    await member.page.waitForFunction(() => document.querySelector('#home-dashboard .home-range-btn:nth-child(3)').getAttribute('aria-pressed') === 'true');
    await member.page.waitForFunction(() => !!document.querySelector('#home-dashboard .home-chart-main .laift-chart--line'));
    check(seriesCalls.length === 1 && seriesCalls[0].metric === 'activity' && seriesCalls[0].range === '12m', 'trocar para 12 meses pede só a série de atividade de 12m');
    check(bundleCalls.length === 1, 'trocar o período não refaz o pacote de 30 dias e 6 meses');

    check((await member.page.locator('#home-dashboard .home-metric-block').count()) === 6, 'membro vê eventos, aprendizagem, tarefas, horas, comparativo e selos');
    check((await member.page.locator('#home-dashboard .home-metric-compare .laift-chart--grouped').count()) === 1, 'comparativo mensal é colunas agrupadas');
    check((await member.page.locator('#home-dashboard .home-metric-badges .laift-chart--donut').count()) === 1, 'selos: rosca de progresso');
    check((await member.page.textContent('#home-dashboard .home-metric-badges')).includes('2 de 5 selos conquistados'), 'legenda dos selos diz 2 de 5');
    check((await member.page.locator('#home-dashboard .home-metric-tasks .home-metric-note').textContent()).includes('Revisar casos'), 'tarefas mostram a próxima a vencer');

    const rows = await member.page.$$eval('#home-dashboard .home-agora .home-row', (n) => n.map((c) => c.className.split(' ').pop()));
    check(rows.join(',') === 'home-row-events,home-row-voting,home-row-inbox', 'Agora: eventos, votações e caixa de entrada, em linhas (' + rows + ')');
    check((await member.page.textContent('#home-dashboard .home-row-events')).includes('Inscrito'), 'evento em que o membro está inscrito traz o selo "Inscrito"');

    await member.page.click('#home-dashboard .home-row-events button');
    await member.page.waitForSelector('#panel-events:not(.hidden)');
    check(true, 'o botão "Ver eventos" abre o painel de eventos');
    await member.page.click('#app-nav [data-panel="panel-home"]');
    await member.page.waitForSelector('#home-dashboard.home-editorial');
    check(summaryCalls === 2, 'voltar ao Início recarrega o resumo (uma chamada por visita: ' + summaryCalls + ')');
  } finally {
    await member.close();
  }

  // ---- Visitante: sem tarefas, votações nem caixa na tela; nenhum bloco deles é desenhado ----
  const visitorSeries = [];
  const visitor = await startApp({
    role: 'visitor',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary({ tasks: null, voting: null, inbox: null }) }),
      apiGetMyDashboardSeries: () => dashboardReply(),
      apiGetMyTimeseries: (args) => {
        visitorSeries.push(args[1].metric);
        return timeseriesReply(args[1].metric, args[1].range);
      },
    },
  });
  try {
    await visitor.login();
    await visitor.page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
    check((await visitor.page.locator('#home-dashboard .home-kpi').count()) === 3, 'visitante vê três números (sem pendentes)');
    check((await visitor.page.locator('#home-dashboard .home-metric-tasks').count()) === 0, 'visitante não vê o bloco de tarefas');
    check((await visitor.page.locator('#home-dashboard .home-agora .home-row').count()) === 1, 'visitante vê só os eventos no Agora');
    check(!visitorSeries.includes('tasks'), 'visitante não pede série avulsa de tarefas');
  } finally {
    await visitor.close();
  }

  // ---- Texto malicioso da API vira texto, não HTML ----
  const evil = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({
        success: true,
        summary: summary({ nextEvents: [{ id: 'x', title: '<img src=x onerror="window.__xss=1">', eventDate: inDays(1), location: '<b>l</b>', isRegistered: false, spotsLeft: 1 }] }),
      }),
      apiGetMyDashboardSeries: () => dashboardReply(),
      apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
    },
  });
  try {
    await evil.login();
    await evil.page.waitForSelector('#home-dashboard .home-row-events');
    check((await evil.page.evaluate(() => window.__xss)) === undefined, 'título malicioso não executa script');
    check((await evil.page.textContent('#home-dashboard .home-row-events')).includes('<img src=x'), 'o título malicioso aparece como texto');
  } finally {
    await evil.close();
  }

  // ---- Falha do resumo: estado de erro com "Tentar de novo" ----
  let attempt = 0;
  const failing = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => {
        attempt += 1;
        return attempt === 1 ? { success: false, message: 'Servidor ocupado.' } : { success: true, summary: summary() };
      },
      apiGetMyDashboardSeries: () => dashboardReply(),
      apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
    },
  });
  try {
    await failing.login();
    await failing.page.waitForSelector('#home-dashboard .state-error');
    check((await failing.page.textContent('#home-dashboard .state-error')).includes('Servidor ocupado.'), 'erro do resumo é mostrado ao membro');
    check((await failing.page.getAttribute('#home-dashboard .state-error', 'role')) === 'alert', 'o erro é anunciado a leitores de tela (role=alert)');
    await failing.page.click('#home-dashboard .state-error button');
    await failing.page.waitForSelector('#home-dashboard.home-editorial .home-kpi');
    check(true, '"Tentar de novo" recarrega o Início');
  } finally {
    await failing.close();
  }

  // ---- Uma série que não veio (null) não derruba as outras: só aquele gráfico fica sem dados ----
  const partial = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary() }),
      apiGetMyDashboardSeries: () => dashboardReply({ missing: ['events30d'] }),
      apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
    },
  });
  try {
    await partial.login();
    await partial.page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
    check((await partial.page.textContent('#home-dashboard .home-metric-events')).includes('Sem dados no período'), 'série que não veio mostra "Sem dados no período" só naquele gráfico');
    check((await partial.page.locator('#home-dashboard .home-metric-events .state-error').count()) === 0, 'série que não veio não mostra erro');
    check((await partial.page.textContent('#home-dashboard .home-metric-events .home-metric-total')) === '—', 'total da série que não veio é um traço');
    check((await partial.page.locator('#home-dashboard .home-metric-learning .laift-chart--spark').count()) === 1, 'os outros gráficos continuam desenhados');
    check((await partial.page.locator('#home-dashboard .home-chart-main .laift-chart--line').count()) === 1, 'o gráfico principal segue desenhado');
  } finally {
    await partial.close();
  }

  // ---- Falha do pacote inteiro: erro em cada gráfico; "Tentar de novo" refaz o pacote uma vez ----
  let bundleAttempt = 0;
  const bundleDown = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary() }),
      apiGetMyDashboardSeries: () => {
        bundleAttempt += 1;
        return bundleAttempt === 1 ? { success: false, message: 'Séries indisponíveis.' } : dashboardReply();
      },
      apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
    },
  });
  try {
    await bundleDown.login();
    await bundleDown.page.waitForSelector('#home-dashboard .home-metric-events .state-error');
    check((await bundleDown.page.textContent('#home-dashboard .home-metric-events .state-error')).includes('Séries indisponíveis.'), 'falha do pacote mostra a mensagem em cada gráfico');
    check((await bundleDown.page.locator('#home-dashboard .home-chart-main .state-error').count()) === 1, 'o gráfico principal também mostra o erro');
    check((await bundleDown.page.locator('#home-dashboard .home-metric-learning .state-error').count()) === 1, 'as sparklines também mostram o erro');
    await bundleDown.page.click('#home-dashboard .home-metric-events .state-error button');
    await bundleDown.page.waitForSelector('#home-dashboard .home-metric-events .laift-chart--spark');
    await bundleDown.page.waitForSelector('#home-dashboard .home-chart-main .laift-chart--line');
    check(bundleAttempt === 2, '"Tentar de novo" refaz o pacote uma única vez (' + bundleAttempt + ')');
    check((await bundleDown.page.locator('#home-dashboard .state-error').count()) === 0, 'depois do retry, nenhum gráfico segue em erro');
  } finally {
    await bundleDown.close();
  }

  // ---- Série sem valores: estado vazio do gráfico ----
  const empty = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary() }),
      apiGetMyDashboardSeries: () => dashboardReply({ zero: true }),
      apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
    },
  });
  try {
    await empty.login();
    await empty.page.waitForSelector('#home-dashboard[aria-busy="false"]', { timeout: 15000 });
    check((await empty.page.textContent('#home-dashboard .home-chart-main')).includes('Sem dados no período'), 'série zerada mostra "Sem dados no período"');
  } finally {
    await empty.close();
  }
};
