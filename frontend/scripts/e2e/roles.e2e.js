/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * roles.e2e.js — cargos funcionais na interface (ROL-03), em celular 375x812: o membro com cargo de gestor vê o grupo
 * "Gestão" no menu (só os itens do cargo) e não vê o botão Admin; abrir "Eventos" pela Gestão carrega o painel. O admin
 * não vê a Gestão (usa o modo admin) e encontra o painel "Cargos" na barra do modo admin.
 */
const { startApp, check } = require('./harness');

const MOBILE = { width: 375, height: 812 };
const GESTOR = {
  role: 'member',
  functionalRoles: ['gestor'],
  capabilities: ['events.manage', 'tasks.manage', 'attendance.manage', 'proposals.review', 'orgchart.edit'],
};

async function visible(page, selector) {
  return page.locator(selector).first().isVisible().catch(() => false);
}

async function gestor() {
  const app = await startApp({ role: 'member', viewport: MOBILE, workerHandlers: {
    apiGetMyProfile: async (args, ctx) => ({
      success: true,
      profile: Object.assign({ id: ctx.profile.id, fullName: ctx.profile.fullName, username: ctx.profile.username, email: ctx.profile.email }, GESTOR),
      preferences: { theme: ctx.theme, emailNotifications: true },
    }),
  } });
  try {
    await app.login();
    await app.page.waitForFunction(() => {
      const badge = document.getElementById('header-role-badge');
      return badge && /Gestor/.test(badge.textContent);
    }, null, { timeout: 5000 }).catch(() => {});
    check(/Membro · Gestor/.test(await app.page.textContent('#header-role-badge')), 'gestor: o crachá mostra o cargo');
    check(!(await visible(app.page, '#btn-enter-admin-mode')), 'gestor: não vê o botão Admin');
    await app.page.click('#app-menu-btn');
    check(await visible(app.page, '#app-menu [data-grupo="gestao"]'), 'gestor: o menu tem o grupo Gestão');
    check(await visible(app.page, '#app-menu [data-grupo="gestao"] [data-panel="panel-admin-events"]'), 'gestor: Gestão traz Eventos');
    check(!(await visible(app.page, '#app-menu [data-grupo="gestao"] [data-panel="panel-admin-reports"]')), 'gestor: Gestão não traz Denúncias (é do moderador)');
    await app.page.click('#app-menu [data-grupo="gestao"] [data-panel="panel-admin-events"]');
    await app.page.waitForSelector('#panel-admin-events:not(.hidden)');
    check(app.calls.worker.some((c) => c.action === 'apiAdminListAllEvents'), 'gestor: abrir Eventos carrega a lista pelo servidor');
    check(!app.calls.worker.some((c) => c.action === 'apiAdminDashboard' || c.action === 'apiAdminListRoles'), 'gestor: nada exclusivo do admin é chamado');
    check(app.errors.length === 0, 'gestor: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

async function admin() {
  const app = await startApp({ role: 'admin', viewport: MOBILE, workerHandlers: {
    apiAdminListRoles: async () => ({ success: true, available: [], people: [{ profileId: 'p1', fullName: 'Bia', baseRole: 'member', roles: ['gestor'] }] }),
  } });
  try {
    await app.login();
    await app.page.click('#app-menu-btn');
    check(!(await visible(app.page, '#app-menu [data-grupo="gestao"]')), 'admin: não vê o grupo Gestão (usa o modo admin)');
    await app.page.keyboard.press('Escape');
    await app.page.click('#btn-enter-admin-mode');
    check(await visible(app.page, '#app-nav [data-panel="panel-admin-roles"]'), 'admin: a barra do modo admin tem Cargos');
    await app.page.click('#app-nav [data-panel="panel-admin-roles"]');
    await app.page.waitForSelector('#panel-admin-roles:not(.hidden)');
    await app.page.waitForSelector('#admin-roles-list .role-person', { timeout: 5000 }).catch(() => {});
    const texto = await app.page.textContent('#admin-roles-list');
    check(texto.includes('Bia') && texto.includes('Gestor'), 'admin: Cargos lista quem tem cargo');
    check(app.errors.length === 0, 'admin: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function rolesE2e() {
  await gestor();
  await admin();
};
