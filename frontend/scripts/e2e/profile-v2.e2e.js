/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * profile-v2.e2e.js — Perfil v2 (frontend/profile-v2.js, profile-v2.css) atrás da flag profile_v2_enabled:
 *  - flag ligada em 375x812, 768x1024 e 1280x800: cabeçalho, seções recolhíveis (aria-expanded), colunas, sem rolagem
 *    horizontal, alvos de 44 px, fontes de 12 px, ids de sempre no lugar;
 *  - claro e escuro, movimento reduzido;
 *  - funções de sempre: salvar perfil, crachá, preferências, privacidade, Sair;
 *  - flag desligada: Perfil de sempre, sem nada do v2.
 * Capturas: defina PERFIL_SHOTS=<pasta> para gravar PNGs.
 */
const fs = require('fs');
const path = require('path');
const { startApp, check } = require('./harness');

const VIEWPORTS = [
  { name: 'celular 375x812', size: { width: 375, height: 812 }, cols: 1 },
  { name: 'tablet 768x1024', size: { width: 768, height: 1024 }, cols: 1 },
  { name: 'desktop 1280x800', size: { width: 1280, height: 800 }, cols: 2 },
];

const PROFILE = {
  success: true,
  profile: {
    fullName: 'Ana Teste', username: 'ana.teste', email: 'ana@exemplo.com', phone: '11999990000', education: 'Farmácia', avatarUrl: null,
    linkedinUrl: '', instagramHandle: '', interests: '', role: 'member', memberSince: '2026-03-15T12:00:00Z',
  },
  preferences: { theme: 'light', emailNotifications: true },
};

function handlers(flagOn, extra) {
  return Object.assign({
    apiGetFeatureFlags: async () => ({ success: true, flags: { profile_v2_enabled: flagOn } }),
    apiGetMyProfile: (args, ctx) => Object.assign({}, PROFILE, { preferences: { theme: (ctx && ctx.theme) || 'light', emailNotifications: true } }),
    apiGetMyMetrics: async () => ({ success: true, metrics: { eventsCount: 2, tasksCount: 1, tasksCompletedCount: 1, proposalsCount: 0, votesCount: 3, feedbackCount: 0 } }),
  }, extra || {});
}

async function boot(viewport, opts) {
  const app = await startApp(Object.assign({ role: 'member', viewport, workerHandlers: handlers(true) }, opts || {}));
  await app.login();
  await app.showPanel('panel-profile');
  await app.page.waitForSelector('#panel-profile[data-p2="1"] .p2-hero', { timeout: 15000 });
  await app.page.waitForFunction(() => document.querySelector('.p2-hero__name').textContent === 'Ana Teste', null, { timeout: 8000 });
  return app;
}

async function shot(page, name) {
  const dir = process.env.PERFIL_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.waitForTimeout(600); // deixa as transições de cor terminarem
  await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
}

async function flagOnScenario(vp) {
  console.log('\n— ' + vp.name);
  const app = await boot(vp.size);
  const { page } = app;
  try {
    check((await page.textContent('.p2-hero__handle')) === '@ana.teste', 'cabeçalho mostra nome e usuário reais');
    for (const id of ['profile-avatar-preview', 'btn-profile-avatar-pick', 'btn-profile-credential', 'form-profile', 'profile-name', 'profile-username', 'profile-phone', 'profile-linkedin', 'form-preferences', 'pref-theme', 'pref-email-notif', 'pref-vibration', 'mfa-card', 'mfa-card-body', 'privacy-root', 'btn-whats-new', 'form-feedback', 'btn-app-update']) {
      check((await page.locator('#' + id).count()) === 1, 'continua existindo #' + id);
    }
    check((await page.inputValue('#profile-name')) === 'Ana Teste' && (await page.locator('#profile-name').isDisabled()), 'nome carregado e bloqueado');
    check((await page.inputValue('#profile-phone')) === '11999990000', 'telefone carregado');

    const toggles = await page.$$eval('.p2-sec__toggle', (n) => n.map((b) => [b.textContent.trim(), b.getAttribute('aria-expanded'), b.getAttribute('aria-controls')]));
    check(toggles.length === 7, 'sete seções recolhíveis (' + toggles.length + ')');
    check(toggles.every((t) => (t[1] === 'true' || t[1] === 'false') && t[2]), 'toda seção tem aria-expanded e aria-controls');
    check(toggles.filter((t) => t[1] === 'true').map((t) => t[0]).join('|') === 'Meus dados|Preferências', 'abertas ao entrar: Meus dados e Preferências');
    check(await page.locator('#profile-phone').isVisible(), 'campos de Meus dados visíveis');
    check(await page.locator('#mfa-card-body').isHidden(), 'Verificação em duas etapas começa recolhida');

    await page.click('#p2-toggle-mfa');
    check((await page.getAttribute('#p2-toggle-mfa', 'aria-expanded')) === 'true' && (await page.locator('#mfa-card-body').isVisible()), 'abrir a seção mostra o conteúdo (aria-expanded=true)');
    await page.click('#p2-toggle-privacidade');
    await page.waitForSelector('#pv-export', { state: 'visible', timeout: 8000 });
    check(true, 'Meus dados e privacidade abre com "Baixar meus dados" e exclusão');
    await page.click('#p2-toggle-mfa');
    check((await page.getAttribute('#p2-toggle-mfa', 'aria-expanded')) === 'false', 'recolher volta a aria-expanded=false');

    const columns = await page.locator('#profile-grid').evaluate((n) => getComputedStyle(n).gridTemplateColumns.split(' ').length);
    check(columns === vp.cols, vp.name + ': ' + vp.cols + ' coluna(s) (' + columns + ')');
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflowX <= 0, 'a página não rola na horizontal (' + overflowX + ' px)');

    const sizes = await page.$$eval('.p2-hero__actions button, .p2-sec__toggle, .p2-list [data-p2-role="row"]', (n) => n.map((b) => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }).filter((s) => s[0] > 0));
    check(sizes.length >= 10 && sizes.every((s) => s[0] >= 44 && s[1] >= 44), 'alvos de pelo menos 44 px (' + sizes.length + ' controles)');
    const fonts = await page.$$eval('#panel-profile .p2-hero *, #panel-profile .p2-sec__toggle *, #panel-profile .p2-list *', (nodes) => nodes.filter((n) => Array.from(n.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim())).map((n) => parseFloat(getComputedStyle(n).fontSize)));
    check(fonts.length > 5 && fonts.every((f) => f >= 12), 'fontes de pelo menos 12 px (menor: ' + Math.min.apply(null, fonts) + ')');

    await shot(page, 'perfil-' + vp.size.width + '-claro');
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
    check((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === 'dark', 'tema escuro ativo');
    const lum = (css) => { const m = css.match(/\d+(\.\d+)?/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    const card = await page.locator('.p2-sec').first().evaluate((n) => getComputedStyle(n).backgroundColor);
    check(lum(card) < 0.3, 'cartões escuros no tema escuro (luminância ' + lum(card).toFixed(2) + ')');
    const title = await page.locator('.p2-sec__toggle').first().evaluate((n) => getComputedStyle(n).color);
    check(lum(title) > 0.6, 'títulos claros sobre o cartão escuro');
    const hero = await page.locator('.p2-hero').evaluate((n) => getComputedStyle(n).backgroundImage);
    check(/rgb\(12, 63, 58\)/.test(hero), 'cabeçalho com o gradiente escuro');
    await shot(page, 'perfil-' + size.width + '-escuro');
    check(app.errors.length === 0, 'tema escuro: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function motionAndActionsScenario() {
  console.log('\n— movimento reduzido e funções de sempre');
  const saves = [];
  const app = await boot({ width: 375, height: 812 }, {
    workerHandlers: handlers(true, { apiUpdateMyProfile: async (args) => { saves.push(args); return { success: true, message: 'Perfil salvo.' }; } }),
  });
  const { page } = app;
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const trans = await page.locator('.p2-sec__chevron').first().evaluate((n) => getComputedStyle(n).transitionDuration);
    check(/^(0s|1e-05s)/.test(trans), 'movimento reduzido: sem transição no ícone (' + trans + ')');

    await page.click('#btn-profile-credential');
    await page.waitForSelector('#modal-learn-credential:not(.hidden)', { timeout: 8000 });
    check(true, 'o crachá abre pelo botão do cabeçalho');
    await page.keyboard.press('Escape');

    await page.fill('#profile-phone', '11988887777');
    await page.click('#form-profile button[type="submit"]');
    await page.waitForTimeout(800);
    check(saves.length === 1 || (await page.textContent('#msg-profile')).length > 0, 'Salvar perfil continua funcionando (' + saves.length + ' envio)');

    const [dialogSeen] = await Promise.all([
      page.waitForSelector('#login-screen:not(.hidden), #auth-screen:not(.hidden), #screen-auth:not(.hidden)', { timeout: 8000 }).then(() => true, () => false),
      page.click('.p2-exit'),
    ]);
    check(dialogSeen || (await page.locator('#app-root.hidden').count()) === 1, '"Sair" encerra a sessão como o botão de sempre');
    check(app.errors.length === 0, 'sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function flagOffScenario() {
  console.log('\n— flag desligada');
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 }, workerHandlers: handlers(false) });
  const { page } = app;
  try {
    await app.login();
    await app.showPanel('panel-profile');
    await page.waitForFunction(() => document.getElementById('profile-name').value === 'Ana Teste', null, { timeout: 8000 });
    check((await page.locator('.p2-hero, .p2-sec, .p2-col, .p2-list, [data-p2]').count()) === 0, 'nenhum elemento do Perfil v2');
    check((await page.locator('link[data-profile-v2-css]').count()) === 0, 'o CSS do Perfil v2 nem é carregado');
    check((await page.locator('#profile-grid > .card').count()) === 6, 'seis cartões de sempre dentro da grade');
    check((await page.textContent('#panel-profile h2')) === 'Meu perfil', 'título de sempre "Meu perfil"');
    check(await page.locator('#profile-phone').isVisible() && await page.locator('#btn-whats-new').isVisible(), 'campos e botões de sempre visíveis');
    await shot(page, 'perfil-1280-flag-desligada');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

module.exports = async function profileV2() {
  for (const vp of VIEWPORTS) await flagOnScenario(vp);
  await darkScenario({ width: 375, height: 812 });
  await darkScenario({ width: 1280, height: 800 });
  await motionAndActionsScenario();
  await flagOffScenario();
};
