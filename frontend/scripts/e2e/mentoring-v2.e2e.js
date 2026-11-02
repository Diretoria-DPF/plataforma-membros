/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mentoring-v2.e2e.js — Mentoria v2 (frontend/mentoring-v2.js, mentoring-v2.css) atrás da flag mentoring_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho com resumo real, colunas, linhas com avatar e etiqueta,
 *    sem rolagem horizontal, alvos de 44 px, fontes de 12 px;
 *  - claro e escuro, movimento reduzido;
 *  - ações de sempre (aceitar, recusar, pedir mentoria, disponibilidade) chamam a mesma API;
 *  - vazio e erro; flag desligada: tela de sempre, sem nada do v2.
 * Capturas: defina MENTORIA_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, cols: 1 },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, cols: 1 },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, cols: 2 },
];

const peer = (id, fullName) => ({ id, fullName, username: fullName.split(' ')[0].toLowerCase(), avatarUrl: null });
function fakeServer(opts) {
  const o = opts || {};
  const calls = [];
  const link = (id, role, status, name, share) => ({ id, myRole: role, status, shareProgress: !!share, connected: status === 'active', peer: peer('p-' + id, name) });
  const state = {
    available: false,
    asMentee: o.empty ? [] : [link('l1', 'mentee', 'active', 'Carla Mendes', true), link('l2', 'mentee', 'pending', 'Isabela Cunha', false)],
    asMentor: o.empty ? [] : [link('l3', 'mentor', 'pending', 'Kauã Rocha', false), link('l4', 'mentor', 'pending', 'Larissa Vidal', false)],
    mentors: o.empty ? [] : [{ id: 'm1', fullName: 'Rafael Souza', username: 'rafael', linkStatus: null }],
  };
  return {
    calls,
    handlers: {
      apiGetFeatureFlags: () => ({ success: true, flags: { mentoring_enabled: true, mentoring_v2_enabled: o.flag !== false } }),
      apiMentoringOverview: () => (o.error ? { success: false, message: 'Não foi possível carregar a mentoria.' }
        : { success: true, enabled: true, available: state.available, hasMentorRole: true, asMentee: state.asMentee, asMentor: state.asMentor }),
      apiMentoringListMentors: () => ({ success: true, mentors: state.mentors }),
      apiMentoringRespond: (args) => {
        const input = args[1] || {};
        calls.push(['respond', input.id, input.accept]);
        state.asMentor = state.asMentor.map((l) => (l.id === input.id ? Object.assign({}, l, { status: input.accept ? 'active' : 'declined', connected: !!input.accept }) : l));
        return { success: true, message: 'ok' };
      },
      apiMentoringRequest: (args) => { calls.push(['request', (args[1] || {}).mentorId]); return { success: true, message: 'ok' }; },
      apiMentoringSetAvailability: (args) => { calls.push(['available', (args[1] || {}).available]); state.available = !!(args[1] || {}).available; return { success: true, message: 'ok' }; },
    },
  };
}

async function openPanel(app) {
  await app.login();
  await app.page.click('#app-menu-btn');
  await app.page.click('#app-menu [data-panel="panel-mentoring"]');
  await app.page.waitForSelector('#panel-mentoring:not(.hidden)');
}

async function shot(page, name) {
  const dir = process.env.MENTORIA_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const server = fakeServer();
  const app = await startApp({ role: 'member', viewport: vp.size, workerHandlers: server.handlers });
  const { page } = app;
  try {
    await openPanel(app);
    await page.waitForSelector('#panel-mentoring[data-m2="1"] .m2-stat', { timeout: 15000 });
    const stats = await page.$$eval('.m2-stat', (n) => n.map((x) => x.textContent.trim().replace(/\s+/g, ' ')));
    check(stats[0] === '1 mentoria ativa' && stats[1] === '2 pedidos para responder' && stats[2] === '1 pedido enviado', 'resumo com números reais (' + stats.join(' | ') + ')');
    check(stats[3] === 'Não disponível como mentor', 'resumo mostra a disponibilidade real');
    for (const id of ['mentoring-title', 'msg-mentoring', 'btn-mentoring-available', 'mentoring-request-share', 'mentoring-as-mentee', 'mentoring-as-mentor', 'mentoring-mentors', 'mentoring-mentor-card']) {
      check((await page.locator('#' + id).count()) === 1, 'continua existindo #' + id);
    }
    check((await page.locator('.mt-row .m2-av').count()) === 5, 'toda linha tem avatar (5)');
    check((await page.locator('.mt-row[data-m2-status="active"] .m2-pill--ok').count()) === 1, 'mentoria ativa com etiqueta de situação');
    check((await page.locator('.m2-av[aria-hidden="true"], .m2-pill[aria-hidden="true"]').count()) >= 6, 'enfeites ocultos para leitor de tela');

    const cols = await page.locator('#mentoring-body').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    check(cols === vp.cols, vp.name + ': ' + vp.cols + ' coluna(s) (' + cols + ')');
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');
    const sizes = await page.$$eval('#panel-mentoring .mt-btn, #panel-mentoring .mt-switch', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 8 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#panel-mentoring .m2-hero *, #panel-mentoring .m2-pill, #panel-mentoring .mt-row *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 8 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');

    // Ações de sempre: mesma API, mesmas mensagens.
    await page.click('#mentoring-as-mentor [data-id="l3"] [data-action="accept"]');
    await page.waitForFunction(() => document.querySelectorAll('.m2-stat')[0].textContent.indexOf('2 mentorias ativas') !== -1, null, { timeout: 8000 });
    check(JSON.stringify(server.calls[0]) === JSON.stringify(['respond', 'l3', true]), 'Aceitar chama apiMentoringRespond como sempre');
    check((await page.locator('.mt-row .m2-av').count()) === 5, 'avatares refeitos depois de recarregar a lista');
    await page.click('#mentoring-as-mentor [data-id="l4"] [data-action="decline"]');
    await page.waitForFunction(() => document.querySelectorAll('.m2-stat')[1].textContent.indexOf('0 pedidos para responder') !== -1, null, { timeout: 8000 });
    check(JSON.stringify(server.calls[1]) === JSON.stringify(['respond', 'l4', false]), 'Recusar chama a mesma API');
    await page.click('#mentoring-mentors [data-action="request"]');
    await page.waitForFunction(() => true);
    check(server.calls.some((c) => c[0] === 'request' && c[1] === 'm1'), 'Pedir mentoria chama apiMentoringRequest');
    await page.click('#btn-mentoring-available');
    await page.waitForFunction(() => document.querySelector('.m2-stat--text').textContent.indexOf('Disponível como mentor') === 0, null, { timeout: 8000 });
    check(server.calls.some((c) => c[0] === 'available' && c[1] === true), 'o interruptor de disponibilidade muda o resumo');

    await shot(page, 'mentoria-' + vp.size.width + '-claro');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function darkAndMotionScenario(size) {
  console.log('\n— tema escuro e movimento reduzido ' + size.width + 'x' + size.height);
  const server = fakeServer();
  const app = await startApp({ role: 'member', viewport: size, theme: 'dark', workerHandlers: server.handlers });
  const { page } = app;
  try {
    await openPanel(app);
    await page.waitForSelector('#panel-mentoring[data-m2="1"] .m2-stat', { timeout: 15000 });
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    check(lum(await page.locator('#mentoring-body .card').first().evaluate((n) => getComputedStyle(n).backgroundColor)) < 0.3, 'cartões escuros no tema escuro');
    check(/rgb\(12, 63, 58\)/.test(await page.locator('.m2-hero').evaluate((n) => getComputedStyle(n).backgroundImage)), 'cabeçalho com o gradiente escuro');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const t = await page.locator('.mt-btn').first().evaluate((n) => getComputedStyle(n).transitionDuration);
    check(/^(0s|1e-05s)/.test(t), 'movimento reduzido: sem transição (' + t + ')');
    await shot(page, 'mentoria-' + size.width + '-escuro');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function emptyAndErrorScenario() {
  console.log('\n— vazio e erro');
  let app = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: fakeServer({ empty: true }).handlers });
  try {
    await openPanel(app);
    await app.page.waitForSelector('#panel-mentoring[data-m2="1"] .m2-stat', { timeout: 15000 });
    check(await app.page.locator('#mentoring-as-mentee-empty').isVisible() && await app.page.locator('#mentoring-mentors-empty').isVisible(), 'estados vazios de sempre aparecem');
    const stats = await app.page.$$eval('.m2-stat', (n) => n.slice(0, 3).map((x) => x.querySelector('.m2-stat__value').textContent));
    check(stats.join(',') === '0,0,0', 'sem dados, o resumo mostra zero real');
    await shot(app.page, 'mentoria-375-vazio');
  } finally { await app.close(); }
  app = await startApp({ role: 'member', viewport: { width: 375, height: 812 }, workerHandlers: fakeServer({ error: true }).handlers });
  try {
    await openPanel(app);
    await app.page.waitForFunction(() => /Não foi possível carregar/.test(document.getElementById('msg-mentoring').textContent), null, { timeout: 10000 });
    check((await app.page.locator('.m2-stat').count()) === 0, 'com erro, nenhum número é inventado');
    check(await app.page.locator('#msg-mentoring').isVisible(), 'o erro de sempre aparece no cabeçalho');
    await shot(app.page, 'mentoria-375-erro');
  } finally { await app.close(); }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: fakeServer({ flag: false }).handlers });
  const { page } = app;
  try {
    await openPanel(app);
    await page.waitForSelector('#mentoring-as-mentee .mt-row');
    check((await page.locator('.m2-hero, .m2-col, .m2-stats, .m2-av, .m2-pill, [data-m2]').count()) === 0, 'nenhum elemento da Mentoria v2');
    check((await page.locator('link[data-mentoring-v2-css]').count()) === 0, 'o CSS da Mentoria v2 nem é carregado');
    check((await page.locator('#mentoring-body > .card').count()) === 4, 'quatro cartões de sempre direto no corpo');
    await shot(page, 'mentoria-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function mentoringV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await darkAndMotionScenario({ width: 375, height: 812 });
  await darkAndMotionScenario({ width: 1280, height: 800 });
  await emptyAndErrorScenario();
  await flagOffScenario();
};
