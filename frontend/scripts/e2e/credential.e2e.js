/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * credential.e2e.js — crachá virtual (frontend/credential.js).
 * Cartão com nome, papel e "membro desde", QR assinado gerado localmente,
 * ampliar o QR, salvar a imagem (PNG), foco e Esc, e o formato provisório
 * quando a Worker não entrega a credencial assinada.
 */
const { startApp, check } = require('./harness');

const PROFILE = {
  success: true,
  profile: {
    fullName: 'Ana Teste', username: 'ana', email: 'ana@exemplo.com', phone: '', education: '', avatarUrl: null,
    linkedinUrl: '', instagramHandle: '', interests: '', role: 'member', memberSince: '2026-03-15T12:00:00Z',
  },
  preferences: { theme: 'light', emailNotifications: true },
};

module.exports = async function credential() {
  // ---- Credencial assinada: cartão completo ----
  const app = await startApp({ role: 'member', workerHandlers: { apiGetMyProfile: () => PROFILE } });
  try {
    const page = app.page;
    await app.login();
    await app.showPanel('panel-profile');
    await page.click('#btn-profile-credential');
    await page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 10000 });

    check(await page.getAttribute('#learn-credential-qr', 'data-qr-kind') === 'v2', 'o QR é a credencial assinada (v2)');
    check(await page.textContent('#learn-credential-name') === 'Ana Teste', 'o cartão mostra o nome');
    check(await page.textContent('#learn-credential-role') === 'Membro', 'o cartão mostra o papel');
    await page.waitForFunction(() => /03\/2026/.test(document.getElementById('learn-credential-since').textContent));
    check(true, 'o cartão mostra "membro desde 03/2026"');
    check(/Apresente na portaria/.test(await page.textContent('#learn-credential-note')), 'a nota de portaria aparece');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'learn-credential-close', 'o foco entra no crachá');
    check(await page.locator('#learn-credential-save:not([disabled])').count() === 1, 'salvar imagem fica disponível com a credencial assinada');

    // Ampliar o QR para o fiscal ler
    const smallSize = await page.$eval('#learn-credential-qr', (n) => n.getBoundingClientRect().width);
    await page.click('#learn-credential-zoom');
    check(await page.getAttribute('#learn-credential-zoom', 'aria-pressed') === 'true', 'o botão "Ampliar QR" informa o estado (aria-pressed)');
    const bigSize = await page.$eval('#learn-credential-qr', (n) => n.getBoundingClientRect().width);
    check(bigSize > smallSize, 'o QR cresce ao ampliar (' + Math.round(smallSize) + 'px → ' + Math.round(bigSize) + 'px)');
    await page.click('#learn-credential-zoom');
    check(await page.getAttribute('#learn-credential-zoom', 'aria-pressed') === 'false', 'reduzir volta ao tamanho normal');

    // Salvar a imagem: baixa um PNG com nome seguro
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#learn-credential-save')]);
    check(download.suggestedFilename() === 'cracha-laift-ana-teste.png', 'o PNG baixa com nome seguro (' + download.suggestedFilename() + ')');

    // Esc fecha e o foco volta ao botão que abriu
    await page.keyboard.press('Escape');
    check(await page.locator('#modal-learn-credential.hidden').count() === 1, 'Esc fecha o crachá');
    check(await page.evaluate(() => document.activeElement && document.activeElement.id) === 'btn-profile-credential', 'o foco volta ao botão que abriu o crachá');

    check(app.calls.external.every((c) => c.method === 'GET' && !/LAIFT:v2|cracha-laift/i.test(c.url + c.body)), 'o QR e a imagem são locais: nada do crachá vai para fora (' + app.calls.external.length + ' GET de bibliotecas)');
    check(app.errors.length === 0, 'sem erros de página (' + app.errors.join('; ') + ')');
  } finally {
    await app.close();
  }

  // ---- Sem credencial assinada: formato provisório, avisa e não deixa salvar ----
  const legacy = await startApp({
    role: 'member',
    workerHandlers: { apiGetMyProfile: () => PROFILE, apiLearnGetMyAttendanceQr: () => ({ success: false, message: 'indisponível' }) },
  });
  try {
    await legacy.login();
    await legacy.showPanel('panel-profile');
    await legacy.page.click('#btn-profile-credential');
    await legacy.page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 10000 });
    check(await legacy.page.getAttribute('#learn-credential-qr', 'data-qr-kind') === 'legacy', 'sem assinatura o QR é o provisório');
    check(/provisória/.test(await legacy.page.textContent('#learn-credential-note')), 'o aviso de credencial provisória aparece');
    check(await legacy.page.locator('#learn-credential-save[disabled]').count() === 1, 'a imagem provisória não pode ser salva');
  } finally {
    await legacy.close();
  }

  // ---- O perfil falha só na chamada do crachá: o cartão segue sem o "membro desde" ----
  let profileDown = false;
  const noProfile = await startApp({
    role: 'member',
    workerHandlers: { apiGetMyProfile: () => (profileDown ? { success: false, message: 'fora do ar' } : PROFILE) },
  });
  try {
    await noProfile.login();
    await noProfile.showPanel('panel-profile');
    profileDown = true; // só a chamada feita pelo crachá falha
    await noProfile.page.click('#btn-profile-credential');
    await noProfile.page.waitForFunction(() => (document.getElementById('learn-credential-qr').src || '').startsWith('data:image/'), null, { timeout: 10000 });
    check(await noProfile.page.textContent('#learn-credential-since') === '', 'sem o perfil, não aparece "membro desde"');
    check(await noProfile.page.getAttribute('#learn-credential-qr', 'data-qr-kind') === 'v2', 'mesmo assim o QR assinado aparece');
  } finally {
    await noProfile.close();
  }

  // ---- QR rotativo (A2): evento em andamento -> LAIFT:v3 com contagem regressiva, renovação e PNG sem QR ----
  const EV = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const PID = '11111111-1111-4111-8111-111111111111';
  let issued = 0;
  const rot = await startApp({
    role: 'member',
    workerHandlers: {
      apiGetMyProfile: () => PROFILE,
      apiListEvents: () => ({ success: true, events: [{ id: EV, title: 'Simpósio LAIFT', status: 'in_progress', isRegistered: true, eventDate: '2026-11-05T12:00:00Z' }] }),
      apiLearnGetMyAttendanceQr: (args) => {
        issued += 1;
        const now = Date.now();
        return { success: true, rotating: true, eventId: EV, windowSeconds: 30, serverTime: now,
          refreshAt: now + 2000, qrPayload: 'LAIFT:v3:' + PID + '.' + EV + '.' + (60000000 + issued) + '.AbCdEfGhIjKlMnOpQrStUvWx' };
      },
    },
  });
  try {
    await rot.login();
    await rot.showPanel('panel-profile');
    await rot.page.click('#btn-profile-credential');
    await rot.page.waitForFunction(() => document.getElementById('learn-credential-qr').getAttribute('data-qr-kind') === 'v3', null, { timeout: 10000 });
    check(/Simpósio LAIFT.*muda em \d+ s/.test(await rot.page.textContent('#learn-credential-note')), 'o crachá rotativo mostra o evento e a contagem regressiva');
    check(/sem QR/.test(await rot.page.textContent('#learn-credential-note')), 'avisa que "Salvar imagem" guarda só o crachá, sem QR');
    await rot.page.waitForFunction(() => document.getElementById('learn-credential-qr').getAttribute('data-qr-kind') === 'v3', null);
    const first = await rot.page.getAttribute('#learn-credential-qr', 'src');
    await rot.page.waitForFunction((src) => document.getElementById('learn-credential-qr').getAttribute('src') !== src, first, { timeout: 10000 });
    check(issued >= 2, 'o QR é renovado sozinho ao fim da janela (' + issued + ' emissões)');
    check(await rot.page.locator('#learn-credential-save:not([disabled])').count() === 1, 'salvar imagem fica disponível (sem QR)');
    const [dl] = await Promise.all([rot.page.waitForEvent('download'), rot.page.click('#learn-credential-save')]);
    check(dl.suggestedFilename() === 'cracha-laift-ana-teste.png', 'o PNG sem QR baixa com nome seguro');
    await rot.page.keyboard.press('Escape');
    const before = issued;
    await rot.page.waitForTimeout(2600);
    check(issued === before, 'fechar o crachá para a renovação do QR');
  } finally {
    await rot.close();
  }
};
