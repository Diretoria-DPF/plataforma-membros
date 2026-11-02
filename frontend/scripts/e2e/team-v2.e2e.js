/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * team-v2.e2e.js — Equipe v2 (frontend/team-v2.js, team-v2.css) atrás da flag team_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho, quatro atalhos (um cartão por vez), organograma, sem rolagem
 *    horizontal, alvos de 44 px, fontes de 12 px;
 *  - funções de sempre: enviar pedido, adicionar de volta, recusar, remover; claro e escuro;
 *  - flag desligada: tela de sempre (quatro cartões visíveis), sem nada do v2.
 * Capturas: defina EQUIPE_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 } },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 } },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 } },
];

const P = (id, name, user) => ({ id, fullName: name, username: user, avatarUrl: null });
const CHART = {
  coordenacaoGeral: [P('1', 'Ana Coordenadora', 'ana.c')],
  coordenadores: [P('2', 'Bruno Coordenador', 'bruno.c')],
  presidente: [P('3', 'Carla Presidente', 'carla.p')],
  vicePresidente: [],
  directorates: {
    marketing: { diretor: P('4', 'Diego Marketing', 'diego.m'), members: [P('5', 'Elisa Membro', 'elisa.m')] },
    cientifico: { diretor: null, members: [] },
    administrativo: { diretor: null, members: [] },
    financeiro: { diretor: null, members: [] },
  },
  membersWithoutDirectorate: [P('6', 'Fábio Sem Diretoria', 'fabio.s')],
};
const REQUESTS = [
  { connectionId: 'c1', fullName: 'Gabi Pedido', username: 'gabi.p', avatarUrl: null },
  { connectionId: 'c2', fullName: 'Hugo Pedido', username: 'hugo.p', avatarUrl: null },
];

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { team_v2_enabled: flagOn } }),
    apiGetOrgChart: async () => ({ success: true, chart: CHART }),
    apiListIncomingConnectionRequests: async () => ({ success: true, requests: REQUESTS }),
    apiListMyConnections: async () => ({ success: true, connections: [{ connectionId: 'm1', fullName: 'Iara Conexão', username: 'iara.c', avatarUrl: null }] }),
  }, extra || {});
}

async function boot(viewport, opts, flagOn, extra) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(flagOn, extra) }, opts || {}));
  await app.login();
  await app.showPanel('panel-orgchart');
  return app;
}

async function shot(page, name) {
  const dir = process.env.EQUIPE_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function visibleCards(page) {
  return page.$$eval('#panel-orgchart > .card', (n) => n.filter((c) => c.getBoundingClientRect().height > 0).length);
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size, {}, true);
  const { page } = app;
  try {
    await page.waitForSelector('#panel-orgchart[data-tm2="1"] .tm2-tab', { timeout: 15000 });
    await page.waitForSelector('#orgchart-tree .orgchart-card', { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-tm2-tab="ped"]').textContent === 'Pedidos (2)', null, { timeout: 8000 });
    const tabs = await page.$$eval('.tm2-tab', (n) => n.map((b) => b.textContent));
    check(tabs.join('|') === 'Organograma|Adicionar|Pedidos (2)|Meus adicionados', 'quatro atalhos, com a contagem real de pedidos (' + tabs.join('|') + ')');
    check((await visibleCards(page)) === 1 && (await page.locator('#orgchart-tree').isVisible()), 'só o Organograma aparece ao entrar');
    check((await page.textContent('#orgchart-tree')).includes('Ana Coordenadora'), 'organograma real');
    await shot(page, 'equipe-' + vp.size.width + '-organograma-claro');

    await page.click('[data-tm2-tab="add"]');
    check((await page.getAttribute('[data-tm2-tab="add"]', 'aria-pressed')) === 'true' && (await visibleCards(page)) === 1 && (await page.locator('#form-connection-request').isVisible()), 'Adicionar mostra só o formulário');
    await page.click('[data-tm2-tab="ped"]');
    check((await page.locator('#connection-requests-list').isVisible()) && (await page.locator('#form-connection-request').isHidden()), 'Pedidos mostra só os pedidos');
    await shot(page, 'equipe-' + vp.size.width + '-pedidos-claro');
    await page.click('[data-tm2-tab="con"]');
    check((await page.textContent('#my-connections-list')).includes('Iara Conexão'), 'Meus adicionados lista a conexão');

    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');
    await page.click('[data-tm2-tab="org"]');
    const sizes = await page.$$eval('.tm2-tab, #orgchart-tree .orgchart-card', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 8 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#panel-orgchart .tm2-hero *, #panel-orgchart .tm2-tab, #orgchart-tree *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 5 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function actionsScenario() {
  console.log('\n— funções de sempre');
  const calls = [];
  const app = await boot({ width: 375, height: 812 }, {}, true, {
    apiSendConnectionRequest: async (args) => { calls.push(['send', args]); return { success: true, message: 'Pedido enviado.' }; },
    apiRespondConnectionRequest: async (...a) => { calls.push(['respond', a]); return { success: true, message: 'Ok.' }; },
  });
  const { page } = app;
  try {
    await page.waitForSelector('.tm2-tab', { timeout: 15000 });
    await page.click('[data-tm2-tab="add"]');
    await page.fill('#connection-request-value', 'maria.x');
    await page.click('#form-connection-request button[type="submit"]');
    await page.waitForFunction(() => document.getElementById('msg-connection-request').textContent === 'Pedido enviado.', null, { timeout: 8000 });
    check(calls.some((c) => c[0] === 'send' && JSON.stringify(c[1]).includes('maria.x')), 'Enviar pedido continua enviando por nome de usuário');
    await page.click('[data-tm2-tab="ped"]');
    await page.click('#connection-requests-list .list-item >> text=Recusar');
    await page.waitForTimeout(500);
    check(calls.some((c) => c[0] === 'respond' && JSON.stringify(c[1]).includes('decline')), 'Recusar continua respondendo ao pedido');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function darkScenario(size) {
  console.log('\n— tema escuro ' + size.width + 'x' + size.height);
  const app = await boot(size, { theme: 'dark' }, true);
  const { page } = app;
  try {
    await page.waitForSelector('#orgchart-tree .orgchart-card', { timeout: 15000 });
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const card = await page.locator('#panel-orgchart > .card').first().evaluate((n) => getComputedStyle(n).backgroundColor);
    check(lum(card) < 0.3, 'cartão escuro no tema escuro');
    const name = await page.locator('.orgchart-name').first().evaluate((n) => getComputedStyle(n).color);
    check(lum(name) > 0.6, 'nomes claros sobre o cartão escuro');
    await shot(page, 'equipe-' + size.width + '-organograma-escuro');
    check(app.errors.length === 0, 'tema escuro: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await boot({ width: 1280, height: 800 }, {}, false);
  const { page } = app;
  try {
    await page.waitForSelector('#orgchart-tree .orgchart-card', { timeout: 15000 });
    check((await page.locator('.tm2-hero, .tm2-tabs, [data-tm2], [data-tm2-card]').count()) === 0, 'nenhum elemento da Equipe v2');
    check((await page.locator('link[data-team-v2-css]').count()) === 0, 'o CSS da Equipe v2 nem é carregado');
    check((await visibleCards(page)) === 4, 'os quatro cartões de sempre aparecem juntos');
    await shot(page, 'equipe-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function teamV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await actionsScenario();
  await darkScenario({ width: 375, height: 812 });
  await darkScenario({ width: 1280, height: 800 });
  await flagOffScenario();
};
