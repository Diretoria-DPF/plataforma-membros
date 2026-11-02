/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * events-v2.e2e.js — Eventos v2 (frontend/events-v2.js, events-v2.css) atrás da flag events_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: destaque do próximo evento, filtros, cartões, histórico,
 *    sem rolagem horizontal, alvos de pelo menos 44 px, fontes de pelo menos 12 px;
 *  - inscrever e cancelar com aviso para leitor de tela (região role=status), foco mantido, "Sem vagas" desativado;
 *  - tema escuro e movimento reduzido;
 *  - flag desligada (ou pacote com falha): a tela de sempre, sem nada da v2.
 */
const { startApp, check } = require('./harness');

const DAY = 24 * 60 * 60 * 1000;
const inDays = (n) => new Date(Date.now() + n * DAY).toISOString();

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 } },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 } },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 } },
];

function makeEvents() {
  return [
    { id: 'e1', title: 'Aula aberta de Toxicologia', description: 'Casos reais de intoxicação.', eventDate: inDays(3), location: 'Auditório B', capacity: 12, spotsLeft: 12, isRegistered: false, status: 'open', imageUrl: null },
    { id: 'e2', title: 'Oficina de Laboratório Virtual', description: 'Moléculas em 3D.', eventDate: inDays(9), location: 'Online', capacity: 8, spotsLeft: 5, isRegistered: true, status: 'open', imageUrl: null },
    { id: 'e3', title: 'Encontro de integração', description: 'Conversa aberta.', eventDate: inDays(15), location: 'Sala 3', capacity: 10, spotsLeft: 0, isRegistered: false, status: 'open', imageUrl: null },
  ];
}

const HISTORY = [{ id: 'h1', title: 'Aula de Farmacocinética', description: 'Concluída.', eventDate: inDays(-10), location: 'Auditório B', imageUrl: null }];

function handlers(flagOn, store) {
  return {
    apiGetFeatureFlags: async () => ({ success: true, flags: { events_v2_enabled: flagOn } }),
    apiListEvents: async () => ({ success: true, events: store.events }),
    apiListRecentCompletedEvents: async () => ({ success: true, events: HISTORY }),
    apiRegisterForEvent: async (args) => {
      store.calls.push(['register', args[1]]);
      store.events = store.events.map((e) => (e.id === args[1] ? Object.assign({}, e, { isRegistered: true, spotsLeft: e.spotsLeft - 1 }) : e));
      return { success: true, message: 'Inscrição realizada com sucesso.' };
    },
    apiCancelEventRegistration: async (args) => {
      store.calls.push(['cancel', args[1]]);
      store.events = store.events.map((e) => (e.id === args[1] ? Object.assign({}, e, { isRegistered: false, spotsLeft: e.spotsLeft + 1 }) : e));
      return { success: true, message: 'Inscrição cancelada.' };
    },
  };
}

async function boot(viewport, flagOn, opts) {
  const store = { events: makeEvents(), calls: [] };
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(flagOn, store) }, opts || {}));
  await app.login();
  await app.showPanel('panel-events');
  return { app, store };
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const { app, store } = await boot(vp.size, true);
  const { page } = app;
  try {
    await page.waitForSelector('#panel-events[data-v2="1"] .ev2-card', { timeout: 15000 });
    await page.waitForSelector('#events-v2 .is-past', { timeout: 15000 });
    check(await page.locator('#events-v2').isVisible(), 'a tela Eventos v2 aparece');
    check((await page.locator('#panel-events > .card:visible').count()) === 0, 'a tela de sempre fica escondida');
    check(((await page.textContent('.ev2-next__title')) || '').includes('Aula aberta de Toxicologia'), 'o destaque é o próximo evento com vaga');
    check((await page.locator('.ev2-card:not(.is-past)').count()) === 3, 'três cartões de evento');
    check((await page.locator('.ev2-card.is-past').count()) === 1, 'o histórico traz o concluído');
    check((await page.locator('.ev2-chip').count()) === 3, 'três filtros');
    check((await page.locator('.ev2-btn[disabled]').count()) === 1, '"Sem vagas" aparece desativado');
    check((await page.locator('.ev2-card:not(.is-past) >> text=Inscrição confirmada').count()) === 1, 'estado "Inscrição confirmada" no evento inscrito');
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');

    // Filtros
    await page.click('.ev2-chip[data-filter="mine"]');
    check((await page.locator('.ev2-card:not(.is-past)').count()) === 1, 'Minhas inscrições: um cartão');
    check((await page.locator('.ev2-chip[data-filter="mine"]').getAttribute('aria-pressed')) === 'true', 'filtro marcado com aria-pressed');
    await page.click('.ev2-chip[data-filter="open"]');
    check((await page.locator('.ev2-card:not(.is-past)').count()) === 2, 'Com vagas: esconde o lotado');
    await page.click('.ev2-chip[data-filter="all"]');

    // Inscrever (botão do destaque), aviso e foco
    await page.click('.ev2-next__card .ev2-btn');
    await page.waitForFunction(() => /Inscrição realizada/.test((document.getElementById('events-status') || {}).textContent || ''), null, { timeout: 8000 });
    const live = await page.locator('#events-status').evaluate((n) => [n.getAttribute('role'), n.getAttribute('aria-live')].join('|'));
    check(live === 'status|polite', 'aviso para leitor de tela em região role=status (' + live + ')');
    check(store.calls.some((c) => c[0] === 'register' && c[1] === 'e1'), 'chamou a inscrição real (apiRegisterForEvent)');
    const focusLabel = await page.evaluate(() => (document.activeElement && document.activeElement.getAttribute('aria-label')) || '');
    check(/Cancelar inscrição: Aula aberta/.test(focusLabel), 'foco segue para o botão do mesmo evento (' + focusLabel + ')');

    // Cancelar pede confirmação
    await page.click('.ev2-card:not(.is-past) .ev2-btn[aria-label^="Cancelar inscrição: Aula aberta"]');
    await page.waitForSelector('#modal-confirm:not(.hidden)', { timeout: 5000 });
    await page.click('#modal-confirm-ok');
    await page.waitForFunction(() => /Inscrição cancelada/.test((document.getElementById('events-status') || {}).textContent || ''), null, { timeout: 8000 });
    check(store.calls.some((c) => c[0] === 'cancel' && c[1] === 'e1'), 'chamou o cancelamento real (apiCancelEventRegistration)');

    const sizes = await page.$$eval('#events-v2 button:not([disabled])', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 6 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), vp.name + ': alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#events-v2 *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 10 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
    const unnamed = await page.$$eval('#events-v2 button', (n) => n.filter((b) => !(b.textContent || '').trim() && !b.getAttribute('aria-label')).length);
    check(unnamed === 0, 'todo botão tem nome acessível');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function darkScenario() {
  console.log('\n— tema escuro e movimento reduzido');
  const { app } = await boot({ width: 375, height: 812 }, true, { theme: 'dark' });
  const { page } = app;
  try {
    await page.waitForSelector('#panel-events[data-v2="1"] .ev2-card', { timeout: 15000 });
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'tema escuro ativo');
    const lum = await page.locator('.ev2-card').first().evaluate((n) => {
      const m = getComputedStyle(n).backgroundColor.match(/\d+(\.\d+)?/g).map(Number);
      return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
    });
    check(lum < 0.25, 'cartão escuro no tema escuro (luminância ' + lum.toFixed(2) + ')');
    const anim = await page.evaluate(() => getComputedStyle(document.querySelector('.ev2-card')).animationName);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const animReduced = await page.evaluate(() => getComputedStyle(document.querySelector('.ev2-card')).animationName);
    check(anim !== 'none' && animReduced === 'none', 'movimento reduzido desliga a animação (' + anim + ' -> ' + animReduced + ')');
    check(app.errors.length === 0, 'tema escuro: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const { app } = await boot({ width: 1280, height: 800 }, false);
  const { page } = app;
  try {
    await page.waitForSelector('#events-list .list-item', { timeout: 15000 });
    check((await page.locator('#events-v2').count()) === 0, 'nenhum contêiner da v2');
    check((await page.locator('#panel-events[data-v2]').count()) === 0, 'painel sem a marca da v2');
    check((await page.locator('link[data-events-v2-css]').count()) === 0, 'o CSS da v2 nem é carregado');
    check((await page.locator('#events-list .list-item').count()) === 3, 'a lista de sempre mostra os três eventos');
    check((await page.locator('#events-list button:has-text("Inscrever-se")').count()) === 1, 'botão "Inscrever-se" de sempre');
    check(await page.locator('#panel-events > .card').first().isVisible(), 'a tela de sempre aparece');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function eventsV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await darkScenario();
  await flagOffScenario();
};
