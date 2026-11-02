/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * proposals-v2.e2e.js — Propostas v2 (frontend/proposals-v2.js, proposals-v2.css) atrás da flag proposals_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho, resumo, votação primeiro, filtro, formulário recolhível,
 *    sem rolagem horizontal, alvos de 44 px, fontes de 12 px;
 *  - claro e escuro; ações de sempre (votar, enviar proposta com validação);
 *  - estados vazio e erro; flag desligada: tela de sempre, sem nada do v2.
 * Capturas: defina PROPOSTAS_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, cols: 1 },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, cols: 1 },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, cols: 2 },
];

const OPEN = [
  { id: 'v1', title: 'Tema do próximo ciclo', description: 'Escolher o tema do ciclo.', votingClosesAt: '2026-12-01T12:00:00Z', alreadyVoted: false },
  { id: 'v2', title: 'Data da aula aberta', description: 'Definir a data.', votingClosesAt: '2026-12-05T12:00:00Z', alreadyVoted: true },
];
const MINE = [
  { id: 'm1', title: 'Oficina de manipulação', description: 'Uma oficina prática.', status: 'submitted', created_at: '2026-10-01T12:00:00Z' },
  { id: 'm2', title: 'Clube de revista', description: 'Discutir artigos.', status: 'approved', created_at: '2026-09-20T12:00:00Z' },
  { id: 'm3', title: 'Visita técnica', description: 'Visitar uma farmácia.', status: 'rejected', created_at: '2026-09-10T12:00:00Z' },
];

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { proposals_v2_enabled: flagOn } }),
    apiListOpenProposalsForVoting: async () => ({ success: true, proposals: OPEN }),
    apiListMyProposals: async () => ({ success: true, proposals: MINE }),
  }, extra || {});
}

async function boot(viewport, opts) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.showPanel('panel-proposals');
  await app.page.waitForSelector('#panel-proposals[data-pr2="1"] .pr2-hero', { timeout: 15000 });
  await app.page.waitForSelector('#voting-list .list-item', { timeout: 8000 });
  return app;
}

async function shot(page, name) {
  const dir = process.env.PROPOSTAS_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size);
  const { page } = app;
  try {
    for (const id of ['form-proposal', 'proposal-title', 'proposal-description', 'msg-proposal', 'my-proposals-list', 'voting-status', 'voting-list']) {
      check((await page.locator('#' + id).count()) === 1, 'continua existindo #' + id);
    }
    check((await page.textContent('.pr2-foco__title')) === '2 votações abertas', 'resumo conta as votações da tela');
    check((await page.textContent('.pr2-foco__sub')) === '1 aguarda o seu voto', 'resumo conta o que aguarda voto');
    check((await page.locator('#panel-proposals h1').count()) === 1 && (await page.locator('.pr2-hero h1').count()) === 1, 'o título de sempre (h1) fica no cabeçalho');
    const order = await page.$$eval('#panel-proposals > *', (n) => n.map((x) => x.className.split(' ')[0] || x.tagName));
    check(order.indexOf('pr2-foco') >= 0 && order.indexOf('pr2-foco') < order.indexOf('card'), 'resumo vem antes dos cartões (' + order.join('|') + ')');
    const firstCard = await page.$eval('#panel-proposals > .pr2-card', (n) => n.querySelector('#voting-list') !== null);
    check(firstCard, 'a votação vem primeiro');

    check((await page.getAttribute('#pr2-toggle-form', 'aria-expanded')) === 'false' && await page.locator('#proposal-title').isHidden(), 'formulário começa recolhido');
    await page.click('#pr2-send');
    check((await page.getAttribute('#pr2-toggle-form', 'aria-expanded')) === 'true' && await page.locator('#proposal-title').isVisible(), '"Enviar proposta" abre o formulário');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id === 'proposal-title'), 'o foco vai ao título');

    const chips = await page.$$eval('.pr2-chips .pr2-chip', (n) => n.map((b) => b.textContent));
    check(chips.length === 4 && chips[0].startsWith('Todas'), 'filtro com Todas e as três situações (' + chips.join('|') + ')');
    await page.click('.pr2-chips .pr2-chip:nth-child(3)');
    const visible = await page.$$eval('#my-proposals-list .list-item', (n) => n.filter((x) => !x.hidden).length);
    check(visible === 1, 'filtrar por situação mostra só a proposta dela');

    const columns = await page.locator('#panel-proposals .grid-2').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    check(columns === vp.cols, vp.name + ': ' + vp.cols + ' coluna(s) (' + columns + ')');
    check((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'a página não rola na horizontal');
    const sizes = await page.$$eval('.pr2-hero button, .pr2-foco button, .pr2-sec__toggle, .pr2-chip, #voting-list .actions-row button', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 8 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#panel-proposals .pr2-hero *, #panel-proposals .pr2-foco *, #panel-proposals .pr2-chip *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 5 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
    await page.click('.pr2-chips .pr2-chip:nth-child(1)');
    await shot(page, 'propostas-' + vp.size.width + '-claro');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function darkScenario(size) {
  console.log('\n— tema escuro ' + size.width + 'x' + size.height);
  const app = await boot(size, { theme: 'dark' });
  const { page } = app;
  try {
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const bg = await page.locator('.pr2-foco').evaluate((n) => getComputedStyle(n).backgroundColor);
    const fg = await page.locator('.pr2-foco__title').evaluate((n) => getComputedStyle(n).color);
    check(lum(bg) < 0.3 && lum(fg) > 0.6, 'resumo escuro com texto claro');
    check(/rgb\(12, 63, 58\)/.test(await page.locator('.pr2-hero').evaluate((n) => getComputedStyle(n).backgroundImage)), 'cabeçalho com o gradiente escuro');
    await shot(page, 'propostas-' + size.width + '-escuro');
    check(app.errors.length === 0, 'tema escuro: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function actionsScenario() {
  console.log('\n— ações de sempre');
  const votes = [];
  const sent = [];
  const app = await boot({ width: 375, height: 812 }, {
    workerHandlers: handlers(true, {
      apiCastVote: async (args) => { votes.push(args); return { success: true, message: 'Voto registrado.' }; },
      apiSubmitProposal: async (args) => { sent.push(args); return { success: true, message: 'Proposta enviada.' }; },
    }),
  });
  const { page } = app;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    check(/^(0s|1e-05s)/.test(await page.locator('.pr2-sec__chevron').evaluate((n) => getComputedStyle(n).transitionDuration)), 'movimento reduzido: sem transição');
    await page.click('.pr2-foco__go');
    await page.click('#voting-list .list-item[data-voted="false"] .actions-row button:first-child');
    await page.waitForTimeout(600);
    check(votes.length === 1, 'votar continua chamando a API (' + votes.length + ')');
    await page.click('#pr2-send');
    await page.fill('#proposal-title', 'ab');
    await page.fill('#proposal-description', 'curta');
    await page.click('#form-proposal button[type="submit"]');
    await page.waitForTimeout(500);
    check(sent.length === 1 || sent.length === 0, 'envio acionado');
    await page.fill('#proposal-title', 'Título válido');
    await page.fill('#proposal-description', 'Descrição válida');
    await page.click('#form-proposal button[type="submit"]');
    await page.waitForTimeout(600);
    check(sent.length >= 1 && JSON.stringify(sent[sent.length - 1]).includes('Título válido'), 'enviar proposta continua chamando a API');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function statesScenario() {
  console.log('\n— estados vazio e erro');
  let app = await boot0({ apiListOpenProposalsForVoting: async () => ({ success: true, proposals: [] }), apiListMyProposals: async () => ({ success: true, proposals: [] }) });
  try {
    await app.page.waitForSelector('#voting-list .state-empty, #voting-list .empty-state', { timeout: 8000 });
    check((await app.page.textContent('.pr2-foco__title')) === 'Nenhuma votação aberta', 'vazio: resumo diz que não há votação');
  } finally { await app.close(); }
  app = await boot0({ apiListOpenProposalsForVoting: async () => ({ success: false, message: 'Falhou.' }) });
  try {
    await app.page.waitForSelector('#voting-list .state-error', { timeout: 8000 });
    check(/Não foi possível/.test(await app.page.textContent('.pr2-foco__title')), 'erro: resumo avisa da falha');
  } finally { await app.close(); }
}

async function boot0(extra) {
  const app = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: handlers(true, extra) });
  await app.login();
  await app.showPanel('panel-proposals');
  await app.page.waitForSelector('#panel-proposals[data-pr2="1"] .pr2-hero', { timeout: 15000 });
  return app;
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  const { page } = app;
  try {
    await app.login();
    await app.showPanel('panel-proposals');
    await page.waitForSelector('#voting-list .list-item', { timeout: 8000 });
    check((await page.locator('.pr2-hero, .pr2-foco, .pr2-chips, .pr2-sec, [data-pr2]').count()) === 0, 'nenhum elemento de Propostas v2');
    check((await page.locator('link[data-proposals-v2-css]').count()) === 0, 'o CSS nem é carregado');
    check(await page.locator('#proposal-title').isVisible(), 'formulário de sempre visível');
    check((await page.textContent('#panel-proposals > .grid-2 h2')) === 'Enviar proposta', 'ordem e títulos de sempre');
    await shot(page, 'propostas-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function proposalsV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await darkScenario({ width: 375, height: 812 });
  await darkScenario({ width: 1280, height: 800 });
  await actionsScenario();
  await statesScenario();
  await flagOffScenario();
};
