/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * learn-v2.e2e.js — Aprender v2 (frontend/learn-v2.js, learn-v2.css) atrás da flag learn_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800, tema claro e escuro: foco único, anel e sequência com dados reais,
 *    Para hoje, faixa de módulos, folha de detalhe (foco preso, Esc), desempenho, conquistas, alvos de 44 px, fontes de 12 px,
 *    sem rolagem horizontal da página, abrir módulo e voltar;
 *  - movimento reduzido e erro das duas fontes (estado de erro com nova tentativa);
 *  - flag desligada, ou pacote que falha: o hub de sempre, idêntico.
 * Com LEARN_V2_SHOTS=<pasta> grava capturas de tela de cada cenário.
 */
const { startApp, check } = require('./harness');

const SHOTS = process.env.LEARN_V2_SHOTS || '';

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, tag: '375' },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, tag: '768' },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, tag: '1280' },
];

const ENGAGEMENT = () => ({
  success: true,
  engagement: {
    today: new Date().toISOString().slice(0, 10),
    streak: { current: 4, best: 6, activeToday: true },
    goal: { target: 10, todayQuestions: 3, reached: false, persisted: true },
    dailyQuizDone: false,
    last: { module: 'farmacologia', activity: 'quiz_estudo', at: new Date().toISOString() },
  },
});

const STATS = () => ({
  success: true,
  stats: {
    accuracyPct: 72, questionsAnswered: 40, quizzesCompleted: 4, clinicalCasesCompleted: 1, labFormulations: 0,
    badges: [
      { id: 'primeira', label: 'Primeira questão', description: 'Responda uma questão', unlocked: true },
      { id: 'sequencia7', label: 'Sequência de 7 dias', description: 'Estude sete dias seguidos', unlocked: false },
    ],
    byModule: { farmacologia: { attempts: 5, accuracyPct: 72 }, toxicologia: { attempts: 2, accuracyPct: 40 } },
  },
});

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { learn_v2_enabled: flagOn } }),
    apiLearnGetEngagement: ENGAGEMENT,
    apiLearnGetMyStats: STATS,
    apiLearnGetWeakTopics: async () => ({ success: true, topics: [{ module: 'toxicologia', topic: 'Antídotos', correct: 2, total: 6, pct: 33 }] }),
  }, extra || {});
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: SHOTS + '/' + name + '.png', fullPage: true });
}

async function boot(viewport, opts) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.showPanel('panel-learn');
  await app.page.waitForSelector('#learn-v2 .l2-focus', { timeout: 15000 });
  return app;
}

async function checkLayout(page, vp) {
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflowX <= 0, vp.name + ': a página não rola na horizontal (' + overflowX + ' px)');
  const sizes = await page.$$eval('#learn-v2 button', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
  check(sizes.length >= 10 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), vp.name + ': alvos de toque de pelo menos 44 px (' + sizes.length + ' controles)');
  const fonts = await page.$$eval('#learn-v2 *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
  check(fonts.length > 20 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
  const unnamed = await page.$$eval('#learn-v2 button', (n) => n.filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
  check(unnamed === 0, 'todo botão tem nome acessível (' + unnamed + ' sem)');
}

async function checkContent(page) {
  check(await page.locator('#learn-modules').isHidden(), 'o hub de sempre fica escondido');
  check((await page.locator('#learn-v2 .l2-focus').count()) === 1, 'um único cartão de foco');
  check((await page.textContent('.l2-focus__title')) === 'Farmacologia', 'o foco traz o último módulo real');
  check((await page.locator('.l2-ring').getAttribute('aria-label')) === '3 de 10 questões hoje', 'anel traz a meta real (3 de 10)');
  check((await page.locator('.l2-week__dot').count()) === 7 && (await page.locator('.l2-week__dot.is-on').count()) === 4, 'sete pontos, quatro acesos pela sequência real');
  check((await page.locator('.l2-today li').count()) === 3, 'Para hoje: quiz do dia, simulado e caso clínico');
  check((await page.locator('.l2-module').count()) === 5, 'cinco módulos');
  check(((await page.textContent('#l2-weak-title')) || '') === 'Para reforçar' && ((await page.textContent('.l2-slot--weak')) || '').includes('Antídotos'), 'Para reforçar traz o tópico fraco real (ENG-06)');
  check(((await page.textContent('.l2-module')) || '').includes('72% de acerto'), 'o aproveitamento do módulo vem das estatísticas reais');
  check(((await page.textContent('[data-l2-stat="accuracy"]')) || '').startsWith('72%'), 'aproveitamento geral real');
  check((await page.locator('[data-l2-perf]').count()) === 5, 'desempenho por módulo: cinco linhas');
  check((await page.locator('.l2-badge').count()) === 2 && (await page.locator('.l2-badge.is-on').count()) === 1, 'conquistas reais (uma desbloqueada)');
  const text = await page.textContent('#learn-v2');
  check(!/\bLia\b/.test(text) && !/gr[aá]tis/i.test(text), 'sem "Lia" nem "grátis" na tela');
}

async function checkSheetAndModule(app) {
  const { page } = app;
  const card = page.locator('.l2-module[data-l2-module="toxico"]');
  await card.focus();
  await card.click();
  await page.waitForSelector('.l2-sheet[role="dialog"]');
  check(((await page.textContent('.l2-sheet__sum')) || '').includes('40% de acerto'), 'folha de detalhe traz o aproveitamento real');
  check(await page.evaluate(() => document.querySelector('.l2-sheet').contains(document.activeElement)), 'foco dentro da folha');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  check(await page.evaluate(() => document.querySelector('.l2-sheet').contains(document.activeElement)), 'Tab não sai da folha');
  await page.keyboard.press('Escape');
  check((await page.locator('.l2-sheet').count()) === 0, 'Esc fecha a folha');
  check(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-l2-module') === 'toxico'), 'o foco volta para o cartão');
  await card.click();
  await page.waitForSelector('.l2-sheet');
  await page.click('.l2-sheet .l2-btn:not(.l2-btn--ghost)');
  await page.waitForSelector('#learn-viewer:not(.hidden)');
  check(await page.locator('#learn-v2').isHidden(), 'abrir o módulo mostra o visualizador de sempre');
  check(((await page.textContent('#learn-viewer-title')) || '').includes('Toxicologia'), 'abriu o módulo certo');
  await page.click('#learn-back');
  await page.waitForSelector('#learn-v2 .l2-focus');
  check(await page.locator('#learn-v2').isVisible(), 'voltar devolve a tela nova');
}

async function checkQuizAndContinue(app) {
  const { page } = app;
  await page.click('.l2-today li:nth-child(2) button');
  await page.waitForSelector('#learn-viewer:not(.hidden)');
  check(((await page.textContent('#learn-viewer-title')) || '').includes('Farmacologia'), 'Simulado abre Farmacologia');
  await page.click('#learn-back');
  await page.waitForSelector('#learn-v2 .l2-focus');
  await page.click('.l2-focus .l2-btn');
  await page.waitForSelector('#learn-viewer:not(.hidden)');
  check(true, 'Continuar abre o último módulo');
  await page.click('#learn-back');
  await page.waitForSelector('#learn-v2 .l2-focus');
}

async function flagOnScenario(vp, theme) {
  console.log('\n— ' + vp.name + ' · ' + theme);
  const app = await boot(vp.size, { theme });
  const { page } = app;
  try {
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === theme, 'tema ' + theme + ' ativo');
    await checkContent(page);
    await checkLayout(page, vp);
    const lum = await page.locator('.l2-focus').evaluate((n) => {
      const m = getComputedStyle(n).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
      return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    });
    check(theme === 'dark' ? lum < 0.25 : lum > 0.6, 'cartão de foco no tema certo (luminância ' + lum.toFixed(2) + ')');
    if (vp.tag !== '1280' || theme === 'light') await shot(page, 'aprender-' + vp.tag + '-' + theme);
    if (theme === 'light') {
      if (vp.tag === '375') await checkQuizAndContinue(app);
      await checkSheetAndModule(app);
    }
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function motionScenario() {
  console.log('\n— movimento reduzido');
  const app = await boot({ width: 375, height: 812 });
  try {
    const anim = await app.page.evaluate(() => getComputedStyle(document.querySelector('.l2-focus')).animationName);
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await app.page.evaluate(() => getComputedStyle(document.querySelector('.l2-focus')).animationName);
    check(anim !== 'none' && reduced === 'none', 'movimento reduzido desliga a animação de entrada (' + anim + ' -> ' + reduced + ')');
  } finally {
    await app.close();
  }
}

async function errorScenario() {
  console.log('\n— erro das duas fontes e dados vazios');
  let fail = true;
  const app = await startApp({
    role: 'member', viewport: { width: 375, height: 812 },
    workerHandlers: handlers(true, {
      apiLearnGetEngagement: async () => (fail ? { success: false, message: 'falha' } : ENGAGEMENT()),
      apiLearnGetMyStats: async () => (fail ? { success: false, message: 'falha' } : STATS()),
    }),
  });
  try {
    await app.login();
    await app.showPanel('panel-learn');
    await app.page.waitForSelector('#learn-v2 .state-error, #learn-v2 .l2-error', { timeout: 15000 });
    check(((await app.page.textContent('#learn-v2')) || '').includes('Não foi possível carregar'), 'estado de erro visível');
    fail = false;
    await app.page.click('#learn-v2 .state-error button');
    await app.page.waitForSelector('#learn-v2 .l2-module', { timeout: 15000 });
    check(true, 'Tentar de novo recarrega a tela');
  } finally {
    await app.close();
  }
  const empty = await startApp({
    role: 'member', viewport: { width: 375, height: 812 },
    workerHandlers: handlers(true, {
      apiLearnGetEngagement: async () => ({ success: true, engagement: { today: '2026-11-04', streak: { current: 0, best: 0, activeToday: false }, goal: { target: 10, todayQuestions: 0, reached: false, persisted: false }, dailyQuizDone: false, last: null } }),
      apiLearnGetMyStats: async () => ({ success: true, stats: { accuracyPct: null, questionsAnswered: 0, quizzesCompleted: 0, clinicalCasesCompleted: 0, labFormulations: 0, badges: [], byModule: {} } }),
    }),
  });
  try {
    await empty.login();
    await empty.showPanel('panel-learn');
    await empty.page.waitForSelector('#learn-v2 .l2-module', { timeout: 15000 });
    check(((await empty.page.textContent('.l2-focus__title')) || '').includes('primeiro quiz'), 'sem histórico: convite do primeiro quiz');
    check((await empty.page.locator('.l2-badge').count()) === 0, 'sem conquistas na lista, a seção não aparece');
    check(((await empty.page.textContent('.l2-module__pct')) || '') === 'Comece por aqui', 'módulo sem dados convida a começar');
    check(empty.errors.length === 0, 'vazio: sem erros de JavaScript');
  } finally {
    await empty.close();
  }
}

async function legacyChecks(app, reason) {
  const { page } = app;
  await page.waitForSelector('#learn-modules .learn-card', { timeout: 15000 });
  check((await page.locator('#learn-modules .learn-card').count()) === 5 && await page.locator('#learn-modules').isVisible(), reason + ': o hub de sempre aparece com os cinco módulos');
  await page.waitForSelector('#learn-progress:not(.hidden)', { timeout: 15000 });
  check(await page.locator('#learn-stat-accuracy').isVisible(), reason + ': números do hub de sempre');
  check((await page.locator('#learn-v2 > *').count()) === 0, reason + ': nada da tela nova no DOM');
  check((await page.locator('#learn-hub[data-l2]').count()) === 0, reason + ': hub sem a marca da v2');
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  try {
    await app.login();
    await app.showPanel('panel-learn');
    await legacyChecks(app, 'flag desligada');
    check((await app.page.locator('link[data-learn-v2-css]').count()) === 0, 'o CSS da v2 nem é carregado');
    await shot(app.page, 'aprender-hub-antigo-1280');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function bundleFailureScenario() {
  console.log('\n— pacote que falha');
  const app = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: handlers(true) });
  try {
    await app.page.route('**/learn-v2.js', (route) => route.abort());
    await app.login();
    await app.showPanel('panel-learn');
    await legacyChecks(app, 'pacote com falha');
  } finally {
    await app.close();
  }
}

module.exports = async function learnV2() {
  for (const vp of VIEWPORTS) {
    await flagOnScenario(vp, 'light');
    await flagOnScenario(vp, 'dark');
  }
  await motionScenario();
  await errorScenario();
  await flagOffScenario();
  await bundleFailureScenario();
};
