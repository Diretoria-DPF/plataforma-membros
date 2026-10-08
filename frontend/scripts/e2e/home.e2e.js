/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * home.e2e.js — painel Início em layout editorial (frontend/home.js,
 * dashboardAdapter.js, home-editorial.css) com apiGetHomeSummary e
 * apiGetMyTimeseries.
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
  const seriesCalls = [];
  const member = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => { summaryCalls += 1; return { success: true, summary: summary() }; },
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
    const pressed = await member.page.$$eval('#home-dashboard .home-range-btn', (n) => n.map((b) => b.getAttribute('aria-pressed')));
    check(pressed.join(',') === 'true,false,false', 'período padrão é 30 dias (' + pressed + ')');
    const sizes = await member.page.$$eval('#home-dashboard .home-range-btn', (n) => n.map((b) => b.getBoundingClientRect().height));
    check(sizes.every((h) => h >= 44), 'botões de período têm pelo menos 44 px de altura (' + sizes.map(Math.round) + ')');

    await member.page.click('#home-dashboard .home-range-btn:nth-child(3)');
    await member.page.waitForFunction(() => document.querySelector('#home-dashboard .home-range-btn:nth-child(3)').getAttribute('aria-pressed') === 'true');
    await member.page.waitForFunction(() => !!document.querySelector('#home-dashboard .home-chart-main .laift-chart--line'));
    check(seriesCalls.some((c) => c.metric === 'activity' && c.range === '12m'), 'trocar para 12 meses pede a série de atividade de 12m');

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

  // ---- Visitante: sem tarefas, votações nem caixa; nada disso é pedido à API ----
  const visitorSeries = [];
  const visitor = await startApp({
    role: 'visitor',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary({ tasks: null, voting: null, inbox: null }) }),
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
    check(!visitorSeries.includes('tasks'), 'visitante não pede série de tarefas');
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

  // ---- Falha de UM gráfico não derruba os demais ----
  let eventsAttempt = 0;
  const partial = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary() }),
      apiGetMyTimeseries: (args) => {
        if (args[1].metric === 'events') {
          eventsAttempt += 1;
          if (eventsAttempt === 1) return { success: false, message: 'Série indisponível.' };
        }
        return timeseriesReply(args[1].metric, args[1].range);
      },
    },
  });
  try {
    await partial.login();
    await partial.page.waitForSelector('#home-dashboard .home-metric-events .state-error');
    check((await partial.page.textContent('#home-dashboard .home-metric-events .state-error')).includes('Série indisponível.'), 'falha de um gráfico mostra a mensagem só naquele espaço');
    check((await partial.page.locator('#home-dashboard .home-metric-learning .laift-chart--spark').count()) === 1, 'os outros gráficos continuam desenhados');
    check((await partial.page.locator('#home-dashboard .home-chart-main .laift-chart--line').count()) === 1, 'o gráfico principal segue desenhado');
    await partial.page.click('#home-dashboard .home-metric-events .state-error button');
    await partial.page.waitForSelector('#home-dashboard .home-metric-events .laift-chart--spark');
    check(true, '"Tentar de novo" do gráfico recarrega só aquele gráfico');
  } finally {
    await partial.close();
  }

  // ---- Série sem valores: estado vazio do gráfico ----
  const empty = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetHomeSummary: () => ({ success: true, summary: summary() }),
      apiGetMyTimeseries: (args) => ({ ...timeseriesReply(args[1].metric, args[1].range), series: timeseriesReply(args[1].metric, args[1].range).series.map((p) => ({ ...p, value: 0 })) }),
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
