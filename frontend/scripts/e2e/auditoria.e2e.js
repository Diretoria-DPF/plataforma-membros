/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * auditoria.e2e.js — correções da auditoria de frontend de 2026-10-20 no navegador:
 *  - F-09: recarga sem rede mantém a sessão salva e entra sozinha quando a rede volta; recusa real volta ao login;
 *  - F-10: no processo seletivo, falha de rede mostra erro com "Tentar de novo", e não "inscrições fechadas";
 *  - F-08: falha ao gerar o QR aparece dentro do modal do crachá;
 *  - F-12: foto de evento abre pelo teclado; o visualizador fecha com Esc e devolve o foco;
 *  - F-13: "Voltar" do modo admin fica visível no celular mesmo com a faixa rolada até o fim.
 */
const { startApp, check, NETWORK_DOWN } = require('./harness');
const { axeGate } = require('./axe-gate');

const MOBILE = { width: 390, height: 844 };

async function recargaSemRede() {
  const handlers = {};
  const app = await startApp({ role: 'member', viewport: MOBILE, workerHandlers: handlers });
  const { page } = app;
  try {
    await app.login();
    handlers.apiGetMyProfile = () => NETWORK_DOWN;
    await page.reload();
    await page.waitForFunction(() => /Sem conexão/.test(document.getElementById('msg-login').textContent), null, { timeout: 10000 });
    check(await page.locator('#app-root.hidden').count() === 1, 'recarga sem rede: mostra o aviso na tela de entrada');
    check(await page.evaluate(() => Object.keys(localStorage).some((k) => /session/i.test(k))), 'recarga sem rede: a sessão salva continua no aparelho');
    delete handlers.apiGetMyProfile; // a rede volta
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForSelector('#app-root:not(.hidden)', { timeout: 10000 });
    check(true, 'recarga sem rede: quando a internet volta, entra sozinho sem pedir a senha');

    handlers.apiGetMyProfile = () => ({ success: false, message: 'Sessão inválida ou expirada.' });
    await page.reload();
    await page.waitForSelector('#screen-welcome:not(.hidden)', { timeout: 10000 });
    check(!(await page.evaluate(() => Object.keys(localStorage).some((k) => /session/i.test(k)))), 'sessão recusada pelo servidor: volta ao login e apaga a sessão salva');
    check(app.errors.length === 0, 'recarga: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally { await app.close(); }
}

async function seletivoSemRede() {
  const overviewOk = () => ({ success: true, enabled: true, open: true, windowDays: 7, batchEveryDays: 15, nextReviewOn: '2026-11-05', vacanciesNote: null, mine: null });
  const handlers = {
    apiGetFeatureFlags: () => ({ success: true, flags: { selection_enabled: true } }),
    apiSelectionOverview: () => NETWORK_DOWN,
    apiSelectionGetMine: () => ({ success: true, application: null, content: {} }),
  };
  const app = await startApp({ role: 'visitor', viewport: MOBILE, workerHandlers: handlers });
  const { page } = app;
  try {
    await app.login();
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-flag-selection-enabled'), null, { timeout: 10000 });
    await page.click('#app-menu-btn');
    await page.click('#app-menu [data-panel="panel-selection"]');
    await page.waitForSelector('[data-sel-load="error"]', { timeout: 10000 });
    const texto = await page.locator('#selection-root').innerText();
    check(!/não estão abertas|fechadas/.test(texto) && /conexão/.test(texto), 'seletivo sem rede: explica a falha de conexão, sem dizer que está fechado');
    const retry = page.locator('#sel-retry');
    const box = await retry.boundingBox();
    check(box && box.height >= 44, 'seletivo sem rede: "Tentar de novo" com alvo de 44px');
    await axeGate(page, 'seletivo sem rede');
    handlers.apiSelectionOverview = overviewOk;
    await retry.click();
    await page.waitForSelector('#sel-start', { timeout: 10000 });
    check(true, 'seletivo sem rede: "Tentar de novo" carrega a inscrição quando a rede volta');
    check(app.errors.length === 0, 'seletivo sem rede: sem erros de JavaScript' + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally { await app.close(); }
}

async function crachaComErro() {
  const app = await startApp({ role: 'member', viewport: MOBILE });
  const { page } = app;
  try {
    await page.route('**/vendor/qrcode-generator.js', (route) => route.abort());
    await app.login();
    await page.evaluate(() => { try { delete window.qrcode; } catch (e) { window.qrcode = undefined; } window.LaiftCredential.open(); });
    await page.waitForSelector('#learn-credential-note.credential-note--error', { timeout: 10000 });
    check(await page.locator('#modal-learn-credential:not(.hidden)').count() === 1, 'crachá com erro: o modal continua aberto');
    check(/Não foi possível gerar o QR/.test(await page.textContent('#learn-credential-note')), 'crachá com erro: a mensagem aparece dentro do modal');
    check(await page.locator('#learn-credential-qr.hidden').count() === 1, 'crachá com erro: sem imagem de QR quebrada');
    await page.keyboard.press('Escape');
    check(await page.locator('#modal-learn-credential.hidden').count() === 1, 'crachá com erro: Esc fecha o modal');
  } finally { await app.close(); }
}

async function fotoDeEvento() {
  const handlers = {
    apiListRecentCompletedEvents: () => ({ success: true, events: [{ id: 'ev-1', title: 'Simpósio de Toxicologia', description: 'Encontro aberto.', eventDate: '2026-10-01T12:00:00Z', location: 'Auditório', imageUrl: 'icons/icon-192.png' }] }),
  };
  const app = await startApp({ role: 'member', workerHandlers: handlers });
  const { page } = app;
  try {
    await app.login();
    await app.showPanel('panel-events');
    const foto = page.locator('#events-history-list .event-image-btn');
    await foto.waitFor({ timeout: 10000 });
    check((await foto.getAttribute('aria-label')) === 'Ampliar a foto: Simpósio de Toxicologia', 'foto de evento: botão com nome acessível');
    await foto.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#modal-image-lightbox:not(.hidden)');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'lightbox-close', 'visualizador: o foco vai para "Fechar"');
    await page.keyboard.press('Escape');
    check(await page.locator('#modal-image-lightbox.hidden').count() === 1, 'visualizador: Esc fecha');
    check(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('event-image-btn')), 'visualizador: o foco volta à foto que abriu');
    check(app.errors.length === 0, 'foto de evento: sem erros de JavaScript');
  } finally { await app.close(); }
}

async function voltarDoAdminNoCelular() {
  const app = await startApp({ role: 'admin', viewport: MOBILE });
  const { page } = app;
  try {
    await app.login();
    await page.click('#btn-enter-admin-mode');
    await page.waitForSelector('#nav-group-admin:not(.hidden)');
    const dentro = async () => {
      const b = await page.locator('#btn-exit-admin-mode').boundingBox();
      return !!b && b.x >= 0 && b.x + b.width <= MOBILE.width && b.height >= 44;
    };
    check(await dentro(), 'admin no celular: "Voltar" visível ao entrar');
    await page.evaluate(() => { const n = document.getElementById('nav-group-admin'); n.scrollLeft = n.scrollWidth; });
    check(await dentro(), 'admin no celular: "Voltar" continua visível com a faixa rolada até o fim');
    await page.click('#btn-exit-admin-mode');
    await page.waitForSelector('#nav-group-admin.hidden', { state: 'attached' });
    check(true, 'admin no celular: "Voltar" sai do modo admin');
  } finally { await app.close(); }
}

module.exports = async function auditoria() {
  await recargaSemRede();
  await seletivoSemRede();
  await crachaComErro();
  await fotoDeEvento();
  await voltarDoAdminNoCelular();
};
