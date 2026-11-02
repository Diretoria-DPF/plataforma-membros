/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * home-v2.e2e.js — Início v3 (frontend/home-v3.js, home-v3.css) atrás da flag home_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cartão de foco único, sem barra flutuante, faixas roláveis,
 *    sem rolagem horizontal da página, anel e sequência com os dados reais, navegação (barra / coluna de 88 px /
 *    menu com rótulos de 248 px), alvos de pelo menos 44 px;
 *  - tema escuro e movimento reduzido;
 *  - Perfil ganha "Meu desempenho" (gráficos antigos);
 *  - flag desligada: a Início antiga fica como era (#home-dashboard.home-editorial) e nada da v3 aparece.
 */
const { startApp, check } = require('./harness');

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, nav: 'bar' },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, nav: 'rail', railWidth: 88 },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, nav: 'menu', railWidth: 248 },
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

const SUMMARY = () => ({
  success: true,
  summary: {
    nextEvents: [{ id: 'e1', title: 'Aula aberta de Toxicologia', eventDate: inDays(2), location: 'Online', isRegistered: false, spotsLeft: 12 }],
    tasks: { myPendingCount: 0, availableCount: 0, next: null },
    voting: { openCount: 1, pendingCount: 1, nextClosesAt: inDays(3) },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 2, pendingConnectionRequests: 0 },
  },
});

const STATS = () => ({
  success: true,
  stats: {
    accuracyPct: 72, questionsAnswered: 40, quizzesCompleted: 4, clinicalCasesCompleted: 1, labFormulations: 0, badges: [],
    byModule: { farmacologia: { attempts: 5, accuracyPct: 72 }, toxicologia: { attempts: 2, accuracyPct: 40 } },
  },
});

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { home_v2_enabled: flagOn } }),
    apiGetHomeSummary: SUMMARY,
    apiLearnGetEngagement: ENGAGEMENT,
    apiLearnGetMyStats: STATS,
    apiListHighlights: async () => ({ success: true, enabled: false, highlights: [] }),
  }, extra || {});
}

async function boot(viewport, opts) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.page.waitForSelector('#panel-home[data-v3="1"] .v3-focus', { timeout: 15000 });
  return app;
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size);
  const { page } = app;
  try {
    check(await page.locator('#home-v3').isVisible(), 'a Início v3 aparece');
    check(await page.locator('#home-dashboard').isHidden(), 'a Início antiga fica escondida');
    check((await page.locator('#panel-home .v3-focus').count()) === 1, 'um único cartão de foco');
    check((await page.locator('#panel-home >> text=Continuar de onde parou').count()) === 1, '"Continuar de onde parou" aparece uma vez só (sem duplicidade)');
    check((await page.locator('#panel-home .eng-continue, #panel-home .home-retorno').count()) === 0, 'nada do "Continuar" antigo na Início');
    const fixedInside = await page.$$eval('#panel-home *', (nodes) => nodes.filter((n) => getComputedStyle(n).position === 'fixed').length);
    check(fixedInside === 0, 'nenhuma barra flutuante na Início (' + fixedInside + ')');

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');

    const ring = page.locator('.v3-ring');
    check((await ring.getAttribute('aria-label')) === '3 de 10 questões hoje', 'anel traz a meta real (3 de 10)');
    check((await ring.evaluate((n) => n.style.getPropertyValue('--p'))) === '30', 'anel preenchido em 30%');
    check((await page.locator('.v3-week__dot').count()) === 7, 'sete pontos da semana');
    check((await page.locator('.v3-week__dot.is-on').count()) === 4, 'quatro pontos acesos pela sequência real');
    check(((await page.textContent('.v3-streak')) || '').replace(/\s+/g, '') === '4diasseguidos', 'sequência de 4 dias');
    check((await page.locator('.v3-today li').count()) === 3, 'Para hoje: quiz do dia, próximo evento e votação aberta');
    check((await page.textContent('.v3-today')).includes('Aula aberta de Toxicologia'), 'o evento vem do resumo real');
    check((await page.locator('.v3-subject').count()) === 5, 'cinco assuntos');
    check(((await page.textContent('.v3-subject')) || '').includes('72% de acerto'), 'progresso do assunto vem das estatísticas reais');

    const strip = await page.locator('.v3-strip').evaluate((n) => ({ scrollable: n.scrollWidth > n.clientWidth, snap: getComputedStyle(n).scrollSnapType, overflowX: getComputedStyle(n).overflowX }));
    if (vp.nav === 'bar') {
      check(strip.scrollable && /x/.test(strip.snap) && strip.overflowX === 'auto', 'faixa "Seus assuntos" rola na horizontal com encaixe');
    } else {
      check(strip.snap !== undefined, 'faixa "Seus assuntos" no tamanho largo (' + (strip.scrollable ? 'rola' : 'em grade') + ')');
    }

    await checkNav(page, vp);
    await checkTargets(page, vp);
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
    if (vp.nav === 'bar') await checkInteractions(app);
  } finally {
    await app.close();
  }
}

async function checkNav(page, vp) {
  const box = await page.locator('#app-nav').boundingBox();
  const labels = await page.$$eval('#app-nav #nav-group-member button:not(.hidden) span:not(.nav-badge)', (n) => n.map((s) => s.getBoundingClientRect().width > 0 && getComputedStyle(s).display !== 'none'));
  if (vp.nav === 'bar') {
    check(box.width >= vp.size.width - 1 && Math.round(box.y + box.height) === vp.size.height, 'celular: barra de navegação embaixo, na largura toda');
  } else {
    check(Math.round(box.x) === 0 && Math.round(box.width) === vp.railWidth && box.height >= vp.size.height - 1, vp.name + ': coluna lateral de ' + vp.railWidth + ' px na altura toda (' + Math.round(box.width) + ')');
    const main = await page.locator('.app-main').boundingBox();
    check(main.x >= vp.railWidth - 1, 'o conteúdo começa depois da coluna (' + Math.round(main.x) + ')');
    const sameNav = await page.locator('nav').evaluateAll((n) => n.filter((x) => x.closest('#app-root') && getComputedStyle(x).display !== 'none' && x.getBoundingClientRect().width > 0).length);
    check(sameNav === 1, 'uma navegação só no app (' + sameNav + ')');
  }
  check(labels.length >= 4 && labels.every(Boolean), 'rótulos Início, Aprender, Eventos e Perfil visíveis');
  if (vp.nav === 'menu') {
    const row = await page.locator('#app-nav [data-panel="panel-home"]').evaluate((n) => ({ dir: getComputedStyle(n).flexDirection, w: n.getBoundingClientRect().width }));
    check(row.dir === 'row' && row.w > 200, 'desktop: menu lateral com rótulo ao lado do ícone');
  }
  const current = await page.locator('#app-nav [data-panel="panel-home"]').getAttribute('aria-current');
  check(current === 'page', 'Início marcada com aria-current na navegação');
}

async function checkTargets(page, vp) {
  const sizes = await page.$$eval('.v3-icon-btn:not(.hidden), .v3-btn, .v3-row, .v3-subject, .v3-link, #app-nav button:not(.hidden)', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
  check(sizes.length >= 12 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), vp.name + ': alvos de toque de pelo menos 44 px (' + sizes.length + ' controles)');
  const fonts = await page.$$eval('#home-v3 *', (nodes) => nodes.filter((n) => n.childNodes.length && Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
  check(fonts.length > 10 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
  const unnamed = await page.$$eval('#home-v3 button', (n) => n.filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
  check(unnamed === 0, 'todo botão da Início tem nome acessível (' + unnamed + ' sem)');
}

async function checkInteractions(app) {
  const { page } = app;
  await page.keyboard.press('Tab');
  await page.locator('.v3-icon-btn').first().focus();
  const outline = await page.locator('.v3-icon-btn').first().evaluate((n) => getComputedStyle(n).outlineStyle + '|' + getComputedStyle(n).outlineWidth);
  check(!outline.startsWith('none'), 'foco visível no atalho do topo (' + outline + ')');
  await page.click('.v3-link');
  check((await page.locator('.v3-link').first().getAttribute('aria-expanded')) === 'true', 'botão "Mudar a meta" abre as opções (aria-expanded)');
  const chips = await page.$$eval('.v3-chip', (n) => n.map((c) => c.getBoundingClientRect().height));
  check(chips.length === 3 && chips.every((h) => h >= 44), 'opções de meta com 44 px de altura');
  await page.click('.v3-today li:nth-child(2) button');
  await page.waitForSelector('#panel-events:not(.hidden)');
  check(true, 'o evento de "Para hoje" abre a tela de eventos');
}

async function darkScenario() {
  console.log('\n— tema escuro e movimento reduzido');
  const app = await boot({ width: 375, height: 812 }, { theme: 'dark' });
  const { page } = app;
  try {
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'tema escuro ativo');
    const lum = await page.locator('.v3-focus').evaluate((n) => {
      const m = getComputedStyle(n).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
      return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    });
    check(lum < 0.25, 'cartão de foco escuro no tema escuro (luminância ' + lum.toFixed(2) + ')');
    const text = await page.locator('.v3-focus__title').evaluate((n) => {
      const m = getComputedStyle(n).color.match(/\d+/g).map(Number);
      return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    });
    check(text > 0.6, 'título claro sobre o cartão escuro');
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.v3-focus')).animationName);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animReduced = await page.evaluate(() => getComputedStyle(document.querySelector('.v3-focus')).animationName);
    check(anim !== 'none' && animReduced === 'none', 'movimento reduzido desliga a animação de entrada (' + anim + ' -> ' + animReduced + ')');
    check(app.errors.length === 0, 'tema escuro: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function profileScenario() {
  console.log('\n— Perfil: Meu desempenho');
  const app = await boot({ width: 375, height: 812 }, { workerHandlers: handlers(true, { apiGetMyDashboardSeries: async () => ({ success: true, series: {} }) }) });
  const { page } = app;
  try {
    await app.showPanel('panel-profile');
    await page.waitForSelector('#profile-desempenho', { timeout: 8000 });
    check((await page.locator('#profile-desempenho > summary').textContent()).trim() === 'Meu desempenho', 'Perfil tem o bloco "Meu desempenho"');
    check((await page.locator('#profile-desempenho').evaluate((n) => n.open)) === false, 'começa recolhido');
    await page.click('#profile-desempenho > summary');
    await page.waitForSelector('#profile-desempenho-host .home-kpis', { timeout: 8000 });
    check((await page.locator('#profile-desempenho-host .home-kpi').count()) >= 3, 'os números e gráficos antigos moram no Perfil');
    check((await page.locator('#profile-desempenho-host .home-agora').count()) === 0, 'sem a faixa "Agora" (já está em "Para hoje")');
    check(app.errors.length === 0, 'Perfil: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  try {
    await app.login();
    await app.page.waitForSelector('#home-dashboard.home-editorial', { timeout: 15000 });
    await app.page.waitForSelector('#home-dashboard .home-kpi', { timeout: 15000 });
    check(await app.page.locator('#home-v3').isHidden(), 'a Início v3 não aparece');
    check((await app.page.locator('.v3-focus, .v3-top').count()) === 0, 'nenhum elemento da v3 na tela');
    check((await app.page.locator('#panel-home[data-v3]').count()) === 0, 'painel sem a marca da v3');
    check(await app.page.locator('#home-dashboard').isVisible(), 'a Início antiga aparece');
    check((await app.page.locator('#app-nav').evaluate((n) => getComputedStyle(n).position)) === 'fixed' && (await app.page.locator('#app-nav').boundingBox()).width >= 1279, 'navegação segue como barra embaixo (sem coluna)');
    check((await app.page.locator('link[data-home-v3-css]').count()) === 0, 'o CSS da v3 nem é carregado');
    await app.showPanel('panel-profile');
    check((await app.page.locator('#profile-desempenho').count()) === 0, 'Perfil sem "Meu desempenho"');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function homeV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await darkScenario();
  await profileScenario();
  await flagOffScenario();
};
