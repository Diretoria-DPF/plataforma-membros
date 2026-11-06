/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * qa-mobile-cracha.e2e.js — o crachá virtual cabe em celular estreito (QA mobile, 2026-11-05): em 320 px o QR fixo
 * de 200 px e a etiqueta do cargo passavam da borda do cartão e eram cortados. Confere a geometria em 320, 360 e 390 px,
 * no tema claro e no escuro, com o QR normal e ampliado, e que os botões de baixo ficam alcançáveis (alvo de 44 px).
 */
const { startApp, check } = require('./harness');

const PHONES = [{ w: 320, h: 568 }, { w: 360, h: 640 }, { w: 390, h: 844 }];

/** Retângulos relativos ao cartão: nada pode passar da borda direita/esquerda do cartão nem do diálogo. */
function geometry() {
  const q = (s) => document.querySelector(s);
  const r = (s) => { const el = q(s); return el ? el.getBoundingClientRect() : null; };
  const box = r('.credential-box');
  const card = r('.credential-card');
  const inner = ['.credential-head', '.credential-logo', '.credential-role', '.credential-person', '.credential-qr-wrap', '#learn-credential-qr'];
  const out = [];
  inner.forEach((s) => {
    const x = r(s);
    if (!x || !card) return;
    if (x.right > card.right + 0.5 || x.left < card.left - 0.5) out.push(s + ' passa do cartão (' + Math.round(x.left) + '..' + Math.round(x.right) + ' em ' + Math.round(card.left) + '..' + Math.round(card.right) + ')');
  });
  if (card && box && (card.right > box.right + 0.5 || card.left < box.left - 0.5)) out.push('cartão passa do diálogo');
  const boxEl = q('.credential-box');
  return { out, hscroll: boxEl ? boxEl.scrollWidth - boxEl.clientWidth : -1, qr: r('#learn-credential-qr') && Math.round(r('#learn-credential-qr').width) };
}

module.exports = async function qaMobileCracha() {
  for (const theme of ['light', 'dark']) {
    for (const phone of PHONES) {
      const tag = `${theme} ${phone.w}x${phone.h}`;
      const app = await startApp({ role: 'admin', theme, viewport: { width: phone.w, height: phone.h } });
      try {
        await app.login();
        await app.showPanel('panel-profile');
        await app.page.click('#btn-profile-credential');
        await app.page.waitForSelector('#modal-learn-credential:not(.hidden)');
        await app.page.waitForFunction(() => { const i = document.getElementById('learn-credential-qr'); return i && i.getAttribute('src'); });
        let g = await app.page.evaluate(geometry);
        check(g.out.length === 0, `${tag}: crachá cabe no cartão (${g.out.join('; ')})`);
        check(g.hscroll <= 0, `${tag}: o diálogo do crachá não rola na horizontal (${g.hscroll})`);
        check(g.qr >= 150, `${tag}: QR com pelo menos 150 px para leitura (${g.qr})`);
        await app.page.click('#learn-credential-zoom');
        g = await app.page.evaluate(geometry);
        check(g.out.length === 0 && g.hscroll <= 0, `${tag}: QR ampliado cabe (${g.out.join('; ')})`);
        await app.page.click('#learn-credential-zoom');
        const fechar = app.page.locator('#learn-credential-close');
        await fechar.scrollIntoViewIfNeeded();
        const b = await fechar.boundingBox();
        check(!!b && b.height >= 44 && b.y + b.height <= phone.h + 1, `${tag}: "Fechar" alcançável com 44 px (${b && Math.round(b.height)})`);
        check(app.errors.length === 0, `${tag}: sem erros de página (${app.errors.join('; ')})`);
      } finally {
        await app.close();
      }
    }
  }
};
