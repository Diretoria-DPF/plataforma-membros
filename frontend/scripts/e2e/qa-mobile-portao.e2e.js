/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * qa-mobile-portao.e2e.js — Portaria no celular (QA mobile, 2026-11-05):
 *  - o botão "Ler QR Code" aparece na primeira tela (o texto de apresentação empurrava o botão para baixo);
 *  - no cartão de resultado, a pessoa sem foto mostra as iniciais visíveis (o fundo herdava o branco do texto e o círculo ficava vazio).
 */
const { startApp, check } = require('./harness');

const E1 = '33333333-3333-4333-8333-333333333333';
const PHONES = [{ w: 320, h: 568 }, { w: 360, h: 800 }, { w: 390, h: 844 }];
const NAV_H = 76; // barra inferior da plataforma

module.exports = async function qaMobilePortao() {
  for (const phone of PHONES) {
    const tag = `${phone.w}x${phone.h}`;
    const app = await startApp({
      role: 'admin', viewport: { width: phone.w, height: phone.h },
      workerHandlers: {
        apiAdminAttendanceListEvents: () => ({ success: true, events: [{ id: E1, title: 'Simpósio de Toxicologia', eventDate: '2026-09-26T13:00:00Z', status: 'in_progress', capacity: 50, registeredCount: 10, checkedInCount: 3, checkInOpen: true }] }),
        apiAdminAttendanceSearch: () => ({ success: true, participants: [] }),
        apiAdminAttendanceCheckIn: () => ({ success: true, message: 'Presença registrada: Ana Souza.', participant: { profileId: '11111111-1111-4111-8111-111111111111', fullName: 'Ana Souza', alreadyCheckedIn: false, walkIn: false, checkedInAt: new Date().toISOString(), avatarUrl: null, role: 'member' } }),
      },
    });
    try {
      await app.login();
      await app.page.click('#btn-enter-admin-mode');
      await app.showPanel('panel-admin-fiscal');
      const handle = await app.page.waitForSelector('#admin-fiscal-frame-wrap iframe');
      const frame = await handle.contentFrame();
      await frame.waitForLoadState('load').catch(() => {});
      await frame.waitForSelector('#fiscalArea:not(.hidden)', { timeout: 6000 });
      await frame.waitForFunction(() => document.querySelectorAll('#fiscalEvent option').length >= 1, null, { timeout: 6000 });

      // O botão "Ler QR Code" precisa estar na primeira tela (acima da barra inferior), sem rolar.
      // (em 320x568, telas de 568 px, o contador do evento e as abas ocupam a primeira tela: lá a rolagem de uma tela é esperada.)
      const box = await frame.locator('#scannerStart').boundingBox();
      if (phone.h >= 640) check(!!box && box.y + box.height <= phone.h - NAV_H, `${tag}: "Ler QR Code" na primeira tela (base em ${box && Math.round(box.y + box.height)} de ${phone.h - NAV_H})`);

      // Dublê do leitor: dispara uma leitura e confere as iniciais no cartão de resultado.
      await frame.evaluate(() => {
        window.Html5Qrcode = function FakeScanner() {
          this.start = (cfg, opts, successCb) => { window.__qrOnScan = successCb; return Promise.resolve(); };
          this.stop = () => Promise.resolve();
          this.clear = () => Promise.resolve();
        };
      });
      await frame.locator('#scannerStart').scrollIntoViewIfNeeded();
      await frame.locator('#scannerStart').click();
      await frame.evaluate(() => window.__qrOnScan('LAIFT:v2:11111111-1111-4111-8111-111111111111.AbCdEfGhIjKlMnOpQrStUv_-'));
      await frame.waitForSelector('.gate-avatar', { timeout: 5000 });
      const avatar = await frame.evaluate(() => {
        const el = document.querySelector('.gate-avatar');
        const cs = getComputedStyle(el);
        return { text: el.textContent.trim(), bg: cs.backgroundColor, fg: cs.color };
      });
      check(avatar.text === 'AS', `${tag}: o cartão mostra as iniciais "AS" (${avatar.text})`);
      check(avatar.bg !== avatar.fg, `${tag}: iniciais com contraste, fundo diferente do texto (${avatar.bg} x ${avatar.fg})`);
      check(app.errors.length === 0, `${tag}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
};
