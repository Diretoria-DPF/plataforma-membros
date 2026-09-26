/**
 * smoke.e2e.js — garantias da Fase 1 (unificação). Cada fase acrescenta
 * o próprio arquivo *.e2e.js; este aqui não deve regredir.
 */
const { startApp, check } = require('./harness');

const MODULES = ['farmaco', 'toxico', 'clinica', 'lab', 'anatomia'];

// Erros esperados do ambiente de teste: bibliotecas de CDN abortadas de
// propósito. Lista explícita de globais — um "x is not defined" qualquer
// continua sendo falha.
const IGNORABLE = /\b(THREE|QRCode|\$3Dmol|SmilesDrawer|Chart|OCL|Html5QrcodeScanner|initRDKitModule)\b/;

module.exports = async function smoke() {
  // ---- Membro ----
  const app = await startApp({ role: 'member' });
  try {
    await app.page.goto(app.baseUrl);
    check(await app.page.locator('#form-login').isVisible(), 'a entrada é o login da plataforma');
    check((await app.page.locator('#identityForm, #otpForm, #studentId').count()) === 0, 'não existe o cadastro antigo do o-bala-vip');

    const direct = await app.context.newPage();
    await direct.goto(app.baseUrl + 'modulos/quiz/index.html');
    await direct.waitForURL(/\/index\.html$/, { timeout: 5000 }).catch(() => {});
    check(!direct.url().includes('/modulos/'), 'módulo aberto fora da plataforma redireciona ao login');
    await direct.close();

    await app.login();
    await app.showPanel('panel-learn');
    check((await app.page.locator('.learn-card').count()) === MODULES.length, `hub mostra ${MODULES.length} módulos`);

    for (const id of MODULES) {
      const frame = await app.openModule(id);
      const identity = await frame.evaluate(() => window.LaiftIdentity && window.LaiftIdentity.get());
      check(identity && identity.email === app.ctx.profile.email, `módulo "${id}" herda a identidade da plataforma`);
      await app.page.click('#learn-back');
    }

    await app.page.click('#btn-learn-credential');
    await app.page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 5000 }).catch(() => {});
    check((await app.page.getAttribute('#learn-credential-qr', 'src') || '').startsWith('data:image/'), 'QR da credencial é gerado localmente');
    await app.page.click('#learn-credential-close');

    await app.page.click('#btn-logout');
    check((await app.page.locator('iframe.learn-frame').count()) === 0, 'logout descarta os iframes dos módulos');

    const leaked = [...app.calls.appsScript].some((c) => JSON.stringify(c).includes(app.ctx.sessionToken));
    check(!leaked, 'o token de sessão da plataforma nunca é enviado ao Apps Script');

    const realErrors = app.errors.filter((e) => !IGNORABLE.test(e));
    check(realErrors.length === 0, 'sem erros de JavaScript nas páginas' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));
  } finally {
    await app.close();
  }

  // ---- Admin: terminal fiscal no modo admin ----
  const admin = await startApp({ role: 'admin' });
  try {
    await admin.login();
    await admin.page.click('#btn-enter-admin-mode');
    await admin.showPanel('panel-admin-fiscal');
    const el = await admin.page.waitForSelector('#admin-fiscal-frame-wrap iframe');
    const frame = await el.contentFrame();
    await frame.waitForLoadState('load').catch(() => {});
    await admin.page.waitForTimeout(300);
    check(!(await frame.locator('#fiscalDenied').isVisible()), 'admin não vê "acesso restrito" no terminal fiscal');
  } finally {
    await admin.close();
  }
};
