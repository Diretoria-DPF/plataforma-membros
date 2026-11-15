/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * learn-metricas.e2e.js — "Conquistas e métricas" em Aprender (flag learn_v2_enabled): bloco recolhido, código baixado só ao abrir,
 * gráfico com texto alternativo e tabela equivalente, alvos de 44 px, sem rolagem horizontal em 375 e 320, axe sem violação,
 * e o estado vazio que orienta o primeiro passo.
 */
const { startApp, check } = require('./harness');
const { axeGate } = require('./axe-gate');

const NOW = () => new Date().toISOString();

function handlers(opts) {
  const empty = !!(opts && opts.empty);
  return {
    apiGetFeatureFlags: async () => ({ success: true, flags: { learn_v2_enabled: true } }),
    apiLearnGetEngagement: async () => ({
      success: true,
      engagement: {
        today: NOW().slice(0, 10),
        streak: empty ? { current: 0, best: 0, activeToday: false } : { current: 4, best: 6, activeToday: true },
        goal: { target: 10, todayQuestions: 0, reached: false, persisted: true },
        dailyQuizDone: false,
        last: empty ? null : { module: 'farmacologia', activity: 'quiz_estudo', at: NOW() },
      },
    }),
    apiLearnGetMyStats: async () => ({
      success: true,
      stats: empty
        ? { accuracyPct: null, questionsAnswered: 0, quizzesCompleted: 0, clinicalCasesCompleted: 0, labFormulations: 0, badges: [], byModule: {} }
        : {
          accuracyPct: 72, questionsAnswered: 40, quizzesCompleted: 4, clinicalCasesCompleted: 1, labFormulations: 0,
          badges: [{ id: 'centena', label: 'Centena', description: 'Responda 100 questões', unlocked: false }],
          byModule: { farmacologia: { attempts: 5, accuracyPct: 72 }, toxicologia: { attempts: 2, accuracyPct: 40 } },
        },
    }),
    apiLearnGetWeakTopics: async () => ({ success: true, topics: empty ? [] : [{ module: 'toxicologia', topic: 'Antídotos', correct: 2, total: 6, pct: 33 }] }),
  };
}

async function boot(size, opts) {
  const app = await startApp({ role: 'member', viewport: size, workerHandlers: handlers(opts) });
  await app.login();
  await app.showPanel('panel-learn');
  await app.page.waitForSelector('#learn-v2 [data-l2-metrics]', { timeout: 15000, state: 'attached' });
  return app;
}

async function openBlock(page) {
  await page.locator('[data-l2-metrics] > summary').scrollIntoViewIfNeeded();
  await page.locator('[data-l2-metrics] > summary').click();
  await page.waitForSelector('[data-l2-metrics] .l2-met__stats, [data-l2-metrics] .l2-met__empty', { timeout: 10000 });
}

async function dataScenario(size, tag) {
  console.log('\n— métricas com dados · ' + tag);
  const app = await boot(size);
  const { page } = app;
  try {
    let scripts = 0;
    page.on('request', (r) => { if (/learn-metricas\.js/.test(r.url())) scripts += 1; });
    check(await page.evaluate(() => !document.querySelector('[data-l2-metrics]').open), 'o bloco começa recolhido');
    check(await page.evaluate(() => !window.LaiftLearnMetricas), 'o código das métricas não foi baixado antes de abrir');
    await openBlock(page);
    check(scripts === 1, 'o código baixa uma vez, ao abrir (' + scripts + ')');
    const stats = await page.locator('.l2-met__stat').allTextContents();
    check(stats.length === 4 && /4/.test(stats[0]) && /6/.test(stats[1]) && /40/.test(stats[2]) && /72%/.test(stats[3]), 'quatro números reais: ' + stats.join(' | '));
    const label = await page.locator('.l2-met__chart').getAttribute('aria-label');
    check(/^4 dias de estudo nos últimos 7 dias/.test(label || ''), 'gráfico com texto alternativo: ' + label);
    await page.locator('.l2-met__table > summary').click();
    check((await page.locator('.l2-met__table tbody tr, .l2-met__table tr').count()) === 8, 'tabela equivalente: cabeçalho e sete dias');
    check((await page.locator('.l2-met__list').first().locator('li').count()) === 2, 'acerto por módulo: dois módulos com dados');
    check(((await page.textContent('[data-l2-metrics]')) || '').includes('Antídotos'), 'tema para reforçar vem do que já foi buscado');
    check(((await page.textContent('.l2-met__next')) || '').includes('40 de 100'), 'próxima conquista com progresso');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, 'sem rolagem horizontal (' + overflow + ' px)');
    const small = await page.$$eval('[data-l2-metrics] button, [data-l2-metrics] summary', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0 && (s[0] < 44 || s[1] < 44)));
    check(small.length === 0, 'alvos de pelo menos 44 px (' + small.length + ' menores)');
    await axeGate(page, 'Aprender, métricas abertas (' + tag + ')');
    await page.locator('.l2-met__row .l2-met__btn').first().click();
    await page.waitForSelector('#learn-viewer:not(.hidden)');
    check(true, 'Treinar abre o módulo');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function emptyScenario() {
  console.log('\n— métricas sem dados · 375');
  const app = await boot({ width: 375, height: 812 }, { empty: true });
  const { page } = app;
  try {
    await openBlock(page);
    const text = (await page.textContent('[data-l2-metrics] .l2-met__empty')) || '';
    check(/primeiro quiz/i.test(text), 'estado vazio orienta o primeiro passo');
    await axeGate(page, 'Aprender, métricas vazias');
    await page.click('[data-l2-metrics] .l2-met__btn');
    await page.waitForSelector('#learn-viewer:not(.hidden)');
    check(((await page.textContent('#learn-viewer-title')) || '').includes('Farmacologia'), 'o botão abre o primeiro quiz');
  } finally {
    await app.close();
  }
}

module.exports = async function learnMetricas() {
  await dataScenario({ width: 375, height: 812 }, '375');
  await dataScenario({ width: 320, height: 640 }, '320');
  await emptyScenario();
};
