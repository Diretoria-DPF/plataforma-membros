/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * casca-robusta.e2e.js — F-009 e F-032 da revisão de 2026-11-13:
 *  - visitante com as flags da Início ligadas não chama apiListHighlights, apiGetHomeSummary nem apiLearnGetEngagement
 *    (eram as 3 respostas 401 por visita);
 *  - script da Início que falha ao carregar (home-v3.js e home.js, ou só engagement.js) mostra estado de erro com
 *    mensagem em pt-BR e "Tentar de novo"; com a rede de volta, o botão monta a Início; sem tela em branco, sem
 *    rolagem lateral em 320 px, alvo de toque de pelo menos 44 px.
 */
const { startApp, check } = require('./harness');

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
const SUMMARY = () => ({
  success: true,
  summary: { nextEvents: [], tasks: { myPendingCount: 0, availableCount: 0, next: null }, voting: { openCount: 0, pendingCount: 0, nextClosesAt: null }, learning: null, inbox: { unreadMessages: 0, pendingConnectionRequests: 0 } },
});
const handlers = () => ({
  apiGetFeatureFlags: async () => ({ success: true, flags: { home_v2_enabled: true, highlights_enabled: true } }),
  apiGetHomeSummary: SUMMARY,
  apiLearnGetEngagement: ENGAGEMENT,
  apiLearnGetMyStats: async () => ({ success: true, stats: { byModule: {} } }),
  apiListHighlights: async () => ({ success: true, enabled: false, highlights: [] }),
});
const SESSION_ONLY = ['apiListHighlights', 'apiGetHomeSummary', 'apiLearnGetEngagement'];

async function visitorScenario() {
  console.log('\n— visitante: nenhuma chamada que exige sessão');
  const app = await startApp({ role: 'visitor', viewport: { width: 375, height: 812 }, workerHandlers: handlers() });
  try {
    await app.page.goto(app.baseUrl);
    await app.page.waitForTimeout(2500);
    const actions = app.calls.worker.map((c) => c.action);
    const comSessao = app.calls.worker.filter((c) => SESSION_ONLY.includes(c.action));
    check(actions.includes('apiGetFeatureFlags'), 'as flags públicas são pedidas (' + actions.join(', ') + ')');
    check(comSessao.length === 0, 'visitante não chama ' + SESSION_ONLY.join(', ') + ' (' + comSessao.length + ' chamadas)');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function overflowX(page) { return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); }

async function checkErrorState(page, label) {
  const alert = page.locator('#home-v3 [role=alert]');
  await alert.waitFor({ timeout: 15000 });
  const texto = (await alert.textContent()) || '';
  check(/Não foi possível carregar/.test(texto), label + ': mensagem de erro em pt-BR (' + texto.trim().slice(0, 60) + ')');
  const botao = alert.locator('button', { hasText: 'Tentar de novo' });
  check((await botao.count()) === 1, label + ': botão "Tentar de novo"');
  const box = await botao.boundingBox();
  check(box && box.width >= 44 && box.height >= 44, label + ': alvo de toque de pelo menos 44 px (' + Math.round(box.width) + 'x' + Math.round(box.height) + ')');
  check((await overflowX(page)) <= 0, label + ': sem rolagem horizontal em 320 px (' + (await overflowX(page)) + ' px)');
  return botao;
}

async function pacoteFalhaScenario(theme) {
  console.log('\n— membro, home-v3.js e home.js não carregam (' + theme + ')');
  const app = await startApp({ role: 'member', theme, viewport: { width: 320, height: 640 }, workerHandlers: handlers() });
  try {
    await app.page.route(/\/(home-v3|home)\.js(\?.*)?$/, (route) => route.abort('connectionfailed'));
    await app.login();
    const botao = await checkErrorState(app.page, 'sem home-v3.js e home.js');
    check((await app.page.locator('#home-v3').isVisible()), 'o estado de erro ocupa o lugar da Início (nada em branco)');
    await app.page.unroute(/\/(home-v3|home)\.js(\?.*)?$/);
    await botao.click();
    await app.page.waitForSelector('#panel-home[data-v3="1"] .v3-focus', { timeout: 15000 });
    check((await app.page.locator('#home-v3 [role=alert]').count()) === 0, 'com a rede de volta, "Tentar de novo" monta a Início e o erro some');
    check((await overflowX(app.page)) <= 0, 'depois de recuperar, sem rolagem horizontal');
  } finally {
    await app.close();
  }
}

async function engagementFalhaScenario() {
  console.log('\n— membro, engagement.js não carrega');
  const app = await startApp({ role: 'member', viewport: { width: 320, height: 640 }, workerHandlers: handlers() });
  try {
    await app.page.route(/\/engagement\.js(\?.*)?$/, (route) => route.abort('connectionfailed'));
    await app.login();
    const botao = await checkErrorState(app.page, 'sem engagement.js');
    await app.page.unroute(/\/engagement\.js(\?.*)?$/);
    await botao.click();
    await app.page.waitForSelector('#panel-home[data-v3="1"] .v3-focus', { timeout: 15000 });
    check((await app.page.locator('#home-v3 [role=alert]').count()) === 0, 'engagement.js baixado de novo: a Início aparece e o erro some');
  } finally {
    await app.close();
  }
}

module.exports = async function () {
  await visitorScenario();
  await pacoteFalhaScenario('light');
  await pacoteFalhaScenario('dark');
  await engagementFalhaScenario();
};
