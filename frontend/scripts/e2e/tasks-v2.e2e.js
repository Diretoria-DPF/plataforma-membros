/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * tasks-v2.e2e.js — Tarefas v2 (frontend/tasks-v2.js, tasks-v2.css) atrás da flag tasks_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho, resumo, listas Disponíveis e Minhas tarefas com filtro,
 *    sem rolagem horizontal, alvos de 44 px, fontes de 12 px;
 *  - claro e escuro; ações de sempre (aderir, concluir); estados vazio e erro;
 *  - flag desligada: tela de sempre, sem nada do v2.
 * Capturas: defina TAREFAS_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 } },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 } },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, cols: 2 },
];

function tasks() {
  return [
    { id: 't1', title: 'Revisar fichas de Farmacologia', description: 'Conferir as fichas.', dueDate: '2026-11-20T12:00:00Z', signupCount: 1, alreadySignedUp: false, completed: false },
    { id: 't2', title: 'Organizar a lista de presença', description: 'Montar a lista.', dueDate: '2026-11-07T12:00:00Z', signupCount: 0, alreadySignedUp: false, completed: false },
    { id: 't3', title: 'Montar cartazes da oficina', description: 'Cartazes.', dueDate: '2026-11-12T12:00:00Z', signupCount: 2, alreadySignedUp: true, completed: false },
    { id: 't4', title: 'Conferir referências de Toxicologia', description: 'Referências.', dueDate: '2026-11-18T12:00:00Z', signupCount: 3, alreadySignedUp: true, completed: true },
  ];
}

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { tasks_v2_enabled: flagOn } }),
    apiListTasks: async () => ({ success: true, tasks: tasks() }),
  }, extra || {});
}

async function boot(viewport, opts, wait) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.showPanel('panel-tasks');
  await app.page.waitForSelector('#panel-tasks[data-t2="1"] .t2-hero', { timeout: 15000 });
  if (wait !== false) await app.page.waitForSelector('#tasks-list .list-item', { state: 'attached', timeout: 8000 });
  return app;
}

async function shot(page, name) {
  const dir = process.env.TAREFAS_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

const visibleTitles = (page) => page.$$eval('#tasks-list .list-item', (n) => n.filter((x) => !x.hidden).map((x) => x.querySelector('h4').textContent));

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size);
  const { page } = app;
  try {
    check((await page.locator('#tasks-status').count()) === 1 && (await page.locator('#tasks-list').count()) === 1, 'continuam #tasks-status e #tasks-list');
    check((await page.textContent('.t2-foco__title')) === '1 tarefa em curso', 'resumo conta as tarefas em curso');
    check((await page.textContent('.t2-foco__sub')) === '2 disponíveis para você aderir', 'resumo conta as disponíveis');
    check((await page.$$eval('.t2-stat b', (n) => n.map((b) => b.textContent).join(','))) === '1,1,2', 'números: em curso, concluídas, disponíveis');
    check((await visibleTitles(page)).length === 2, 'abre em Disponíveis (2 tarefas)');
    await page.click('.t2-chips:not(.t2-chips--sub) .t2-chip:nth-child(2)');
    check((await visibleTitles(page)).length === 2 && (await page.locator('.t2-chips--sub').isVisible()), 'Minhas tarefas mostra aderidas e concluídas, com filtro');
    await page.click('.t2-chips--sub .t2-chip:nth-child(3)');
    check((await visibleTitles(page)).join() === 'Conferir referências de Toxicologia', 'filtro Concluídas');
    await page.click('.t2-chips--sub .t2-chip:nth-child(2)');
    check((await visibleTitles(page)).join() === 'Montar cartazes da oficina', 'filtro Em curso');
    check((await page.getAttribute('.t2-chips--sub .t2-chip:nth-child(2)', 'aria-pressed')) === 'true', 'filtro marcado com aria-pressed');
    const cols = await page.locator('#tasks-list').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    check(cols === (vp.cols || 1), vp.name + ': ' + (vp.cols || 1) + ' coluna(s) (' + cols + ')');
    check((await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, 'a página não rola na horizontal');
    await page.click('.t2-chips:not(.t2-chips--sub) .t2-chip:nth-child(1)');
    const sizes = await page.$$eval('.t2-chip, #tasks-list .actions-row button', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 5 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#panel-tasks .t2-hero *, #panel-tasks .t2-foco *, #panel-tasks .t2-chip *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 5 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
    await shot(page, 'tarefas-' + vp.size.width + '-claro');
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
    check(lum(await page.locator('.t2-foco').evaluate((n) => getComputedStyle(n).backgroundColor)) < 0.3 && lum(await page.locator('.t2-foco__title').evaluate((n) => getComputedStyle(n).color)) > 0.6, 'resumo escuro com texto claro');
    check(/rgb\(12, 63, 58\)/.test(await page.locator('.t2-hero').evaluate((n) => getComputedStyle(n).backgroundImage)), 'cabeçalho com o gradiente escuro');
    await shot(page, 'tarefas-' + size.width + '-escuro');
    check(app.errors.length === 0, 'tema escuro: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function actionsScenario() {
  console.log('\n— ações de sempre');
  const calls = [];
  let list = tasks();
  const app = await boot({ width: 375, height: 812 }, {
    workerHandlers: handlers(true, {
      apiListTasks: async () => ({ success: true, tasks: list }),
      apiSignupForTask: async (args) => { calls.push(['signup', args]); list = list.map((t) => (t.id === 't1' ? Object.assign({}, t, { alreadySignedUp: true }) : t)); return { success: true, message: 'Adesão registrada.' }; },
      apiMarkTaskComplete: async (args) => { calls.push(['complete', args]); list = list.map((t) => (t.id === 't3' ? Object.assign({}, t, { completed: true }) : t)); return { success: true, message: 'Tarefa concluída.' }; },
    }),
  });
  const { page } = app;
  try {
    await page.click('#tasks-list .list-item >> text=Aderir');
    await page.waitForFunction(() => document.querySelector('.t2-foco__title').textContent === '2 tarefas em curso', null, { timeout: 8000 });
    check(calls.length === 1 && calls[0][0] === 'signup', 'Aderir continua chamando a API e o resumo atualiza');
    check((await page.textContent('#tasks-status')).includes('Adesão registrada'), 'aviso de sempre mostrado');
    await page.click('.t2-chips:not(.t2-chips--sub) .t2-chip:nth-child(2)');
    await page.click('#tasks-list .list-item:not([hidden]) >> text=Marcar como concluída');
    await page.waitForFunction(() => document.querySelector('.t2-stat b').textContent === '1', null, { timeout: 8000 });
    check(calls.length === 2 && calls[1][0] === 'complete', 'Marcar como concluída continua chamando a API');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function statesScenario() {
  console.log('\n— estados vazio e erro');
  let app = await boot({ width: 375, height: 812 }, { workerHandlers: handlers(true, { apiListTasks: async () => ({ success: true, tasks: [] }) }) }, false);
  try {
    await app.page.waitForFunction(() => document.querySelector('.t2-foco__title').textContent === 'Nenhuma tarefa publicada', null, { timeout: 8000 });
    check(await app.page.locator('#tasks-list .state-empty, #tasks-list .empty-state').count() === 1, 'vazio: mensagem de sempre da lista');
  } finally { await app.close(); }
  app = await boot({ width: 375, height: 812 }, { workerHandlers: handlers(true, { apiListTasks: async () => ({ success: false, message: 'Falhou ao carregar.' }) }) }, false);
  try {
    await app.page.waitForFunction(() => /Não foi possível/.test(document.querySelector('.t2-foco__title').textContent), null, { timeout: 8000 });
    check((await app.page.textContent('.t2-foco__sub')).includes('Falhou'), 'erro: resumo mostra o aviso do servidor');
  } finally { await app.close(); }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  const { page } = app;
  try {
    await app.login();
    await app.showPanel('panel-tasks');
    await page.waitForSelector('#tasks-list .list-item', { timeout: 8000 });
    check((await page.locator('.t2-hero, .t2-foco, .t2-chips, .t2-empty, [data-t2]').count()) === 0, 'nenhum elemento de Tarefas v2');
    check((await page.locator('link[data-tasks-v2-css]').count()) === 0, 'o CSS nem é carregado');
    check((await page.locator('#tasks-list .list-item').count()) === 4 && (await visibleTitles(page)).length === 4, 'todas as tarefas de sempre aparecem');
    check((await page.textContent('#panel-tasks .card h2')) === 'Tarefas', 'título de sempre');
    await shot(page, 'tarefas-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function tasksV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await darkScenario({ width: 375, height: 812 });
  await darkScenario({ width: 1280, height: 800 });
  await actionsScenario();
  await statesScenario();
  await flagOffScenario();
};
