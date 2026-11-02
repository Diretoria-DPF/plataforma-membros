/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * admin-v2.e2e.js — Administração v2 (frontend/admin-v2.js, admin-v2.css) atrás da flag admin_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: faixa de pendências, barra com "Voltar" visível, seções roláveis,
 *    navegação entre as seções de sempre, seção Flags (ler, alterar, confirmar e salvar), sem rolagem horizontal,
 *    alvos de 44 px, fontes de 12 px;
 *  - claro e escuro, movimento reduzido;
 *  - Voltar devolve a navegação de membro;
 *  - flag desligada: modo administrador de sempre, sem nada do v2.
 * Capturas: defina ADMIN_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 } },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 } },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 } },
];

const FLAGS = [
  { key: 'admin_v2_enabled', enabled: true, rolloutPct: 100, conditions: {}, description: 'Administração v2' },
  { key: 'events_v2_enabled', enabled: false, rolloutPct: 100, conditions: {}, description: 'Eventos v2' },
  { key: 'mentoring_enabled', enabled: true, rolloutPct: 50, conditions: { role: 'member' }, description: '' },
  { key: 'mfa_required', enabled: false, rolloutPct: 100, conditions: {}, description: 'Verificação obrigatória' },
];

function handlers(flagOn, seen) {
  const store = FLAGS.map((f) => Object.assign({}, f));
  return {
    apiGetFeatureFlags: async () => ({ success: true, flags: { admin_v2_enabled: flagOn } }),
    apiAdminDashboard: async () => ({ success: true, indicators: { active_members: 40, active_admins: 2, banned_accounts: 0, published_events: 3, proposals_pending: 5, proposals_voting: 1, tasks_open: 7 } }),
    apiSelectionCommitteeOverview: async () => ({ success: true, counts: { submitted: 2, in_review: 1, interview: 0, waitlist: 1, approved: 0, not_selected: 0 }, appeals: 0, settings: {}, aiEnabled: false, items: [] }),
    apiAdminListDeletionRequests: async () => ({ success: true, items: [{ id: 'd1', status: 'requested', dueAt: '2027-01-01T00:00:00Z' }] }),
    apiAdminListFeatureFlags: async () => ({ success: true, flags: store }),
    apiAdminSetFeatureFlag: async (args) => {
      if (seen) seen.push({ key: args[1], input: args[2] });
      const f = store.find((x) => x.key === args[1]);
      if (f) f.enabled = args[2].enabled;
      return { success: true, message: 'Flag atualizada.' };
    },
  };
}

async function boot(viewport, opts) {
  const app = await startApp(Object.assign({ role: 'admin', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.page.click('#btn-enter-admin-mode');
  await app.page.waitForSelector('#adm2-bar:not([hidden]) .adm2-tab', { timeout: 15000 });
  return app;
}

async function shot(page, name) {
  const dir = process.env.ADMIN_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: false });
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size);
  const { page } = app;
  try {
    await page.waitForFunction(() => document.querySelector('[data-chip="selection"] .adm2-chip__n').textContent === '3', null, { timeout: 8000 });
    const chips = await page.$$eval('.adm2-chip', (n) => n.map((b) => [b.getAttribute('data-chip'), b.querySelector('.adm2-chip__n').textContent]));
    check(JSON.stringify(chips) === JSON.stringify([['selection', '3'], ['deletions', '1'], ['proposals', '5'], ['flags', '0']]), 'faixa de pendências com os números da API: ' + JSON.stringify(chips));
    await page.waitForFunction(() => getComputedStyle(document.getElementById('app-nav')).display === 'none', null, { timeout: 8000 }).catch(() => {});
    check(await page.locator('#app-nav').isHidden(), 'a barra de baixo do modo admin fica escondida');
    check(await page.locator('#adm2-back').isVisible(), 'Voltar visível');

    const tabs = await page.$$eval('.adm2-tab', (n) => n.map((b) => b.textContent));
    check(tabs.slice(0, 4).join('|') === 'Painel|Seleção|Destaques|Flags', 'seções na ordem da prévia (' + tabs.slice(0, 4).join('|') + ')');
    for (const t of ['Usuários', 'Eventos', 'Propostas', 'Tarefas', 'Feedback', 'Auditoria', 'Denúncias', 'Fiscal', 'IA', 'Biblioteca', 'Exclusões', 'Cargos']) {
      check(tabs.includes(t), 'seção de sempre mantida: ' + t);
    }
    check((await page.getAttribute('.adm2-tab.is-active', 'aria-current')) === 'page', 'seção atual marcada com aria-current');

    await page.click('.adm2-tab[data-panel="panel-admin-selection"]');
    await page.waitForSelector('#panel-admin-selection:not(.hidden)');
    check(await page.locator('.adm2-strip').isHidden(), 'a faixa só aparece no Painel');
    check(await page.locator('#adm2-back').isVisible(), 'Voltar continua visível em outra seção');
    await page.click('.adm2-tab[data-panel="panel-admin-roles"]');
    await page.waitForSelector('#panel-admin-roles:not(.hidden)');
    check(await page.locator('#form-roles-search').count() === 1, 'a seção Cargos de sempre abre com a busca');

    await page.click('.adm2-tab[data-panel="panel-admin-dashboard"]');
    await page.waitForSelector('.adm2-strip:not([hidden])');
    await page.click('[data-chip="deletions"]');
    await page.waitForSelector('#panel-admin-privacy:not(.hidden)');
    check(true, 'tocar num número abre a seção correspondente');

    await page.click('.adm2-tab[data-panel="panel-admin-flags"]');
    await page.waitForSelector('.adm2-flag');
    check((await page.locator('.adm2-flag').count()) === 4, 'quatro flags listadas');
    check(await page.locator('[data-flag="mfa_required"]').isDisabled(), 'flag que exige reautenticação fica só para leitura');
    await page.fill('#adm2-flag-filter', 'eventos');
    check((await page.locator('.adm2-flag').count()) === 1, 'busca filtra as flags');
    await page.fill('#adm2-flag-filter', 'zzz');
    check(/combina com a busca/.test(await page.locator('.adm2-empty').innerText()), 'estado vazio da busca');
    await page.fill('#adm2-flag-filter', '');
    await page.click('[data-flag="events_v2_enabled"]');
    check((await page.getAttribute('[data-flag="events_v2_enabled"]', 'aria-checked')) === 'true', 'interruptor alterado (aria-checked)');
    check(/1 alteração não salva/.test(await page.locator('.adm2-savebar__n').innerText()), 'contador de alterações não salvas');
    check((await page.textContent('[data-chip="flags"] .adm2-chip__n')) === '1', 'a faixa conta a flag não salva');

    const sizes = await page.$$eval('.adm2-bar button, .adm2-switch, .adm2-savebar button', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 8 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('.adm2-bar *, .adm2-flag *, .adm2-savebar *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 8 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');
    await shot(page, 'admin-flags-' + vp.size.width + '-claro');

    await page.click('.adm2-tab[data-panel="panel-admin-dashboard"]');
    await page.waitForSelector('.adm2-strip:not([hidden])');
    await shot(page, 'admin-painel-' + vp.size.width + '-claro');
    check(app.errors.length === 0, 'sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function flagsSaveScenario() {
  console.log('\n— salvar flags');
  const seen = [];
  const app = await boot({ width: 375, height: 812 }, { workerHandlers: handlers(true, seen) });
  const { page } = app;
  try {
    await page.click('.adm2-tab[data-panel="panel-admin-flags"]');
    await page.waitForSelector('.adm2-flag');
    await page.click('[data-flag="events_v2_enabled"]');
    await page.click('#adm2-flags-save');
    await page.waitForSelector('#modal-confirm:not(.hidden), dialog[open]', { timeout: 8000 }).catch(() => {});
    check(seen.length === 0, 'nada é salvo antes da confirmação');
    await page.click('#modal-confirm-ok');
    await page.waitForFunction(() => /Flag salva/.test(document.querySelector('#panel-admin-flags .adm2-status').textContent), null, { timeout: 8000 });
    check(seen.length === 1 && seen[0].key === 'events_v2_enabled' && seen[0].input.enabled === true, 'enviou só a flag alterada: ' + JSON.stringify(seen));
    check(await page.locator('.adm2-savebar').isHidden(), 'a barra de salvar some depois de salvar');
    await page.click('[data-flag="mentoring_enabled"]');
    await page.click('#adm2-flags-discard');
    check((await page.getAttribute('[data-flag="mentoring_enabled"]', 'aria-checked')) === 'true', 'Descartar volta ao valor salvo');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function errorStatesScenario() {
  console.log('\n— estados de erro');
  const app = await boot({ width: 375, height: 812 }, {
    workerHandlers: Object.assign(handlers(true), {
      apiSelectionCommitteeOverview: async () => ({ success: false, message: 'Falhou' }),
      apiAdminListFeatureFlags: async () => ({ success: false, message: 'Sem acesso às flags.' }),
    }),
  });
  const { page } = app;
  try {
    await page.waitForFunction(() => document.querySelector('[data-chip="selection"] .adm2-chip__n').textContent === '—', null, { timeout: 8000 });
    check((await page.getAttribute('[data-chip="selection"]', 'aria-label')) === 'Inscrições a analisar: indisponível agora', 'número indisponível é dito com clareza');
    await page.click('.adm2-tab[data-panel="panel-admin-flags"]');
    await page.waitForSelector('#adm2-flags-retry:not([hidden])');
    check(/Sem acesso às flags/.test(await page.locator('#panel-admin-flags .adm2-status').innerText()), 'erro das flags com botão de tentar de novo');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function darkAndMotionScenario(size) {
  console.log('\n— tema escuro e movimento reduzido ' + size.width + 'x' + size.height);
  const app = await boot(size, { theme: 'dark' });
  const { page } = app;
  try {
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'tema escuro ativo');
    const strip = await page.locator('.adm2-strip').evaluate((n) => getComputedStyle(n).backgroundImage);
    check(/rgb\(63, 26, 74\)/.test(strip), 'faixa com o gradiente escuro');
    const tab = await page.locator('.adm2-tab:not(.is-active)').first().evaluate((n) => getComputedStyle(n).color);
    check(lum(tab) > 0.6, 'texto das seções claro no tema escuro');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.click('.adm2-tab[data-panel="panel-admin-flags"]');
    await page.waitForSelector('.adm2-switch');
    const trans = await page.locator('.adm2-switch__track').first().evaluate((n) => getComputedStyle(n).transitionDuration);
    check(/^(0s|1e-05s)/.test(trans), 'movimento reduzido: sem transição no interruptor (' + trans + ')');
    await shot(page, 'admin-flags-' + size.width + '-escuro');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function voltarScenario() {
  console.log('\n— Voltar');
  const app = await boot({ width: 375, height: 812 });
  const { page } = app;
  try {
    await page.click('#adm2-back');
    await page.waitForSelector('#nav-group-member:not(.hidden)');
    check(await page.locator('#nav-group-admin.hidden').count() === 1, 'a navegação de membro volta');
    check(await page.locator('#app-nav').isVisible(), 'a barra de baixo volta');
    check(await page.locator('#adm2-bar').isHidden(), 'a barra de seções some fora do modo administrador');
    check((await page.evaluate(() => document.documentElement.hasAttribute('data-admin-v2'))) === false, 'o <html> perde o atributo do modo administrador');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'admin', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  const { page } = app;
  try {
    await app.login();
    await page.click('#btn-enter-admin-mode');
    await page.waitForSelector('#panel-admin-dashboard:not(.hidden)');
    await page.waitForTimeout(800);
    check((await page.locator('.adm2-bar, .adm2-strip, #panel-admin-flags, [data-admin-v2]').count()) === 0, 'nenhum elemento da Administração v2');
    check((await page.locator('link[data-admin-v2-css]').count()) === 0, 'o CSS da Administração v2 nem é carregado');
    check(await page.locator('#nav-group-admin').isVisible() && await page.locator('#btn-exit-admin-mode').isVisible(), 'barra do modo administrador de sempre, com Voltar');
    check((await page.locator('#nav-group-admin [data-panel]').count()) === 15, 'as quinze seções de sempre');
    await shot(page, 'admin-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function adminV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await flagsSaveScenario();
  await errorStatesScenario();
  await darkAndMotionScenario({ width: 375, height: 812 });
  await darkAndMotionScenario({ width: 1280, height: 800 });
  await voltarScenario();
  await flagOffScenario();
};
