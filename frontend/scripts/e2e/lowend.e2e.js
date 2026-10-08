/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lowend.e2e.js — aparelho de baixo desempenho: celular 375x812 com a CPU 4x
 * mais lenta (CDP Emulation.setCPUThrottlingRate) e o Início com dados simulados
 * (mesmos formatos de home.e2e.js). Mede, desde o login:
 *  - o tempo até o conteúdo útil (aria-busy="false" e os quatro números na tela);
 *  - o tempo até a contagem terminar nos valores finais (30, 2, 15, 72%);
 *  - ausência de erros de página.
 * Os limites são folgados sobre a medição registrada em LIMITES.
 */
const { startApp, check } = require('./harness');

const CPU_SLOWDOWN = 4;
const VIEWPORT = { width: 375, height: 812 };
const FINAL_KPIS = ['30', '2', '15', '72%'];
// Medição real, 3 execuções seguidas (CPU 4x, 375x812, host dividido com outros agentes):
//   conteúdo útil: 2563 / 2747 / 4777 ms; contagem nos valores finais: 2949 / 3119 / 5398 ms.
// Limites ≈ 3x o pior caso medido: folgados o bastante para host lento, apertados o bastante para pegar regressão grande.
const LIMITES = { conteudoMs: 15000, contagemMs: 20000 };

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY_MS).toISOString();
const VALUE = { activity: 3, events: 1, learning: 2, tasks: 0, study_hours: 0.5 };
const BUNDLE = [
  ['activity30d', 'activity', '30d'], ['events30d', 'events', '30d'], ['learning30d', 'learning', '30d'],
  ['tasks30d', 'tasks', '30d'], ['studyHours30d', 'study_hours', '30d'],
  ['events6m', 'events', '6m'], ['learning6m', 'learning', '6m'], ['tasks6m', 'tasks', '6m'],
];

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

function dashboardReply() {
  const series = {};
  BUNDLE.forEach(([key, metric, range]) => {
    const reply = timeseriesReply(metric, range);
    series[key] = { range: reply.range, granularity: reply.granularity, series: reply.series };
  });
  return { success: true, series };
}

function summary() {
  return {
    nextEvents: [
      { id: 'e1', title: 'Aula de Toxicologia', eventDate: inDays(1), location: 'Sala 2', isRegistered: true, spotsLeft: 3 },
      { id: 'e2', title: 'Simpósio', eventDate: inDays(9), location: null, isRegistered: false, spotsLeft: null },
    ],
    tasks: { myPendingCount: 2, availableCount: 1, next: { id: 't1', title: 'Revisar casos', dueDate: inDays(3) } },
    voting: { openCount: 2, pendingCount: 1, nextClosesAt: inDays(2) },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 3, pendingConnectionRequests: 1 },
  };
}

const HANDLERS = {
  apiGetHomeSummary: () => ({ success: true, summary: summary() }),
  apiGetMyDashboardSeries: () => dashboardReply(),
  apiGetMyTimeseries: (args) => timeseriesReply(args[1].metric, args[1].range),
};

/** Espera a condição; devolve false em vez de estourar o tempo (o chamador decide o que reprovar). */
async function waitOrFalse(promise) {
  return promise.then(() => true, () => false);
}

module.exports = async function lowend() {
  const app = await startApp({ role: 'member', viewport: VIEWPORT, workerHandlers: HANDLERS });
  try {
    const cdp = await app.context.newCDPSession(app.page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });

    const start = Date.now();
    await app.login();
    const contentOk = await waitOrFalse(app.page.waitForSelector(
      '#home-dashboard[aria-busy="false"] .home-kpi-value', { timeout: LIMITES.conteudoMs },
    ));
    const conteudoMs = Date.now() - start;

    const countOk = await waitOrFalse(app.page.waitForFunction((finals) => {
      const values = Array.from(document.querySelectorAll('#home-dashboard .home-kpi-value')).map((n) => n.textContent.trim());
      return values.length === finals.length && values.every((v, i) => v === finals[i]);
    }, FINAL_KPIS, { timeout: LIMITES.contagemMs }));
    const contagemMs = Date.now() - start;

    check(contentOk && conteudoMs <= LIMITES.conteudoMs,
      `Início com CPU ${CPU_SLOWDOWN}x: conteúdo útil em ${conteudoMs} ms (limite ${LIMITES.conteudoMs} ms)`);
    check(countOk && contagemMs <= LIMITES.contagemMs,
      `Início com CPU ${CPU_SLOWDOWN}x: a contagem termina nos valores finais em ${contagemMs} ms (limite ${LIMITES.contagemMs} ms)`);
    check(app.errors.length === 0, `Início com CPU ${CPU_SLOWDOWN}x: sem erros de página (${app.errors.join('; ')})`);
  } finally {
    await app.close();
  }
};
