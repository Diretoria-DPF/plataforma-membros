/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * highlights.e2e.js — Destaques da Liga em celular 375x812:
 *  - flag ligada: o bloco "Na Liga" aparece na Início com os itens (manuais e eventos automáticos), sem tirar o #home-dashboard;
 *  - flag desligada: o bloco fica escondido e o pacote nem pede a lista;
 *  - gestor (home.curate): menu Gestão > Destaques da Liga; liga/desliga, sobe, adiciona e remove chamam o servidor;
 *    alvos de toque de pelo menos 44 px e interruptor com role="switch".
 */
const { startApp, check } = require('./harness');

const MOBILE = { width: 375, height: 812 };
const GESTOR = { role: 'member', functionalRoles: ['gestor'], capabilities: ['events.manage', 'home.curate'] };

const profileHandler = (extra) => async (args, ctx) => ({
  success: true,
  profile: Object.assign({ id: ctx.profile.id, fullName: ctx.profile.fullName, username: ctx.profile.username, email: ctx.profile.email, role: 'member' }, extra || {}),
  preferences: { theme: ctx.theme, emailNotifications: true },
});

async function visible(page, selector) {
  return page.locator(selector).first().isVisible().catch(() => false);
}

async function blockOn() {
  const app = await startApp({ role: 'member', viewport: MOBILE, workerHandlers: {
    apiGetMyProfile: profileHandler(),
    apiGetFeatureFlags: async () => ({ success: true, flags: { highlights_enabled: true } }),
    apiListHighlights: async () => ({ success: true, enabled: true, highlights: [
      { id: '11111111-1111-4111-8111-111111111111', kind: 'edital', title: 'Edital aberto', subtitle: 'Até 30/11', linkPath: '/edital.html' },
      { id: '22222222-2222-4222-8222-222222222222', kind: 'aviso', title: 'Reunião geral', subtitle: '', linkPath: null },
    ] }),
    apiListEvents: async () => ({ success: true, events: [
      { id: 'e1', title: 'Aula aberta', eventDate: new Date(Date.now() + 3 * 86400000).toISOString(), location: 'Online' },
    ] }),
  } });
  try {
    await app.login();
    await app.page.waitForSelector('#home-highlights:not(.hidden)', { timeout: 8000 }).catch(() => {});
    check(await visible(app.page, '#home-highlights'), 'flag ligada: o bloco Na Liga aparece na Início');
    const texto = (await app.page.textContent('#home-highlights').catch(() => '')) || '';
    check(texto.includes('Na Liga') && texto.includes('Edital aberto') && texto.includes('Reunião geral'), 'bloco traz os itens manuais');
    check(texto.includes('Aula aberta'), 'bloco traz o evento automático nas vagas livres');
    check((await app.page.locator('#home-highlights a[href="/edital.html"]').count()) === 1, 'item com link interno é um <a>');
    check(await app.page.locator('#home-dashboard').count() === 1, '#home-dashboard continua na Início');
    const box = await app.page.locator('#home-highlights .hl-card').first().boundingBox();
    check(box && box.height >= 44, 'cartão do bloco tem alvo de pelo menos 44 px');
    check(app.errors.length === 0, 'bloco: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function blockOff() {
  const app = await startApp({ role: 'member', viewport: MOBILE, workerHandlers: {
    apiGetMyProfile: profileHandler(),
    apiGetFeatureFlags: async () => ({ success: true, flags: { highlights_enabled: false } }),
    apiListHighlights: async () => ({ success: true, enabled: false, highlights: [] }),
  } });
  try {
    await app.login();
    await app.page.waitForTimeout(800);
    check(!(await visible(app.page, '#home-highlights')), 'flag desligada: o bloco fica escondido');
    check(!app.calls.worker.some((c) => c.action === 'apiListHighlights'), 'flag desligada: a lista nem é pedida');
    check(app.errors.length === 0, 'flag desligada: sem erros de JavaScript');
  } finally {
    await app.close();
  }
}

async function manage() {
  let rows = [
    { id: '11111111-1111-4111-8111-111111111111', kind: 'aviso', title: 'Primeiro', subtitle: '', linkPath: null, position: 0, isActive: true, endsAt: null, inWindow: true, visible: true },
    { id: '22222222-2222-4222-8222-222222222222', kind: 'edital', title: 'Segundo', subtitle: '', linkPath: '/edital.html', position: 1, isActive: true, endsAt: null, inWindow: true, visible: true },
  ];
  const view = () => {
    const visibleCount = rows.filter((r) => r.isActive).length;
    return { success: true, highlights: rows.map((r) => Object.assign({}, r, { inWindow: r.isActive, visible: r.isActive })), visibleMax: 8, visibleCount, totalMax: 100 };
  };
  const app = await startApp({ role: 'member', viewport: MOBILE, workerHandlers: {
    apiGetMyProfile: profileHandler(GESTOR),
    apiAdminListHighlights: async () => view(),
    apiAdminSetHighlightActive: async (args) => {
      const input = args[1] || {};
      rows = rows.map((r) => (r.id === input.id ? Object.assign({}, r, { isActive: input.isActive }) : r));
      return { success: true, message: 'Destaque atualizado.' };
    },
    apiAdminReorderHighlights: async (args) => {
      const ids = (args[1] || {}).ids || [];
      rows = ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
      return { success: true, message: 'Ordem atualizada.' };
    },
    apiAdminSaveHighlight: async (args) => {
      const input = args[1] || {};
      rows = [Object.assign({ id: '33333333-3333-4333-8333-333333333333', subtitle: '', position: -1, isActive: true, endsAt: null }, input)].concat(rows);
      return { success: true, message: 'Destaque adicionado.', id: '33333333-3333-4333-8333-333333333333', warning: null };
    },
    apiAdminDeleteHighlight: async (args) => {
      rows = rows.filter((r) => r.id !== (args[1] || {}).id);
      return { success: true, message: 'Destaque removido.' };
    },
    apiListEvents: async () => ({ success: true, events: [] }),
  } });
  try {
    await app.login();
    await app.page.click('#app-menu-btn');
    check(await visible(app.page, '#app-menu [data-grupo="gestao"] [data-panel="panel-admin-highlights"]'), 'gestor: Gestão traz Destaques da Liga');
    await app.page.click('#app-menu [data-grupo="gestao"] [data-panel="panel-admin-highlights"]');
    await app.page.waitForSelector('#panel-admin-highlights:not(.hidden)');
    await app.page.waitForSelector('#highlights-list .hl-row', { timeout: 8000 });
    check((await app.page.locator('#highlights-list .hl-row').count()) === 2, 'gestão: lista os dois destaques');
    check(/2 de 8/.test(await app.page.textContent('#highlights-cap')), 'gestão: mostra o teto de 8 visíveis');

    const sw = app.page.locator('#highlights-list .hl-row').first().locator('[role="switch"]');
    check((await sw.getAttribute('aria-checked')) === 'true', 'interruptor começa ligado (role=switch)');
    const swBox = await sw.boundingBox();
    check(swBox && swBox.height >= 44 && swBox.width >= 44, 'interruptor tem alvo de pelo menos 44 px');
    await sw.click();
    await app.page.waitForFunction(() => document.querySelector('#highlights-list .hl-row [role="switch"]').getAttribute('aria-checked') === 'false', null, { timeout: 5000 });
    check(app.calls.worker.some((c) => c.action === 'apiAdminSetHighlightActive'), 'ocultar chama o servidor');
    const focused = await app.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role'));
    check(focused === 'switch', 'o foco volta ao interruptor depois de atualizar');

    await app.page.locator('#highlights-list .hl-row').nth(1).locator('[data-action="up"]').click();
    await app.page.waitForFunction(() => document.querySelector('#highlights-list .hl-row .hl-row__title').textContent === 'Segundo', null, { timeout: 5000 });
    check(app.calls.worker.some((c) => c.action === 'apiAdminReorderHighlights'), 'subir chama o servidor e reordena');
    check(await app.page.locator('#highlights-list .hl-row').first().locator('[data-action="up"]').isDisabled(), 'o primeiro item não sobe');

    await app.page.click('#btn-highlight-add');
    check((await app.page.getAttribute('#btn-highlight-add', 'aria-expanded')) === 'true', 'Adicionar destaque abre o formulário');
    await app.page.click('#highlight-form button[type="submit"]');
    check(/título/i.test(await app.page.textContent('#msg-highlights')), 'título vazio é recusado no formulário');
    await app.page.fill('#hl-title', 'Novo aviso');
    await app.page.fill('#hl-link', 'javascript:alert(1)');
    await app.page.click('#highlight-form button[type="submit"]');
    check(/link/i.test(await app.page.textContent('#msg-highlights')), 'link perigoso é recusado no formulário');
    check(!app.calls.worker.some((c) => c.action === 'apiAdminSaveHighlight'), 'entrada inválida não chega ao servidor');
    await app.page.fill('#hl-link', '/blog/');
    await app.page.click('#highlight-form button[type="submit"]');
    await app.page.waitForFunction(() => document.querySelectorAll('#highlights-list .hl-row').length === 3, null, { timeout: 5000 });
    check(app.calls.worker.some((c) => c.action === 'apiAdminSaveHighlight'), 'adicionar chama o servidor');

    await app.page.locator('#highlights-list .hl-row').first().locator('button', { hasText: 'Remover' }).click();
    await app.page.click('#modal-confirm-ok');
    await app.page.waitForFunction(() => document.querySelectorAll('#highlights-list .hl-row').length === 2, null, { timeout: 5000 });
    check(app.calls.worker.some((c) => c.action === 'apiAdminDeleteHighlight'), 'remover confirma e chama o servidor');
    check(app.errors.length === 0, 'gestão: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function highlightsE2e() {
  await blockOn();
  await blockOff();
  await manage();
};
