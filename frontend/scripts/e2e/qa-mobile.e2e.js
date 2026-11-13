/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * qa-mobile.e2e.js — regressões da bateria de QA mobile (2026-11-05), sobre o BUILD, em celulares de 320 a 390 px:
 *  - campos de formulário com 16 px (o iOS dá zoom ao focar abaixo disso);
 *  - o crédito do rodapé é só texto (sem link, desde a #187), legível e sem estourar a largura;
 *  - o quiz mostra os tópicos em duas colunas até 320 px e o aviso de "sem tópico" não cita "menu lateral".
 */
const { startApp, check } = require('./harness');

const PHONES = [{ w: 320, h: 568 }, { w: 360, h: 800 }, { w: 390, h: 844 }];

/** Campos visíveis (exceto caixas de marcar e arquivos) com fonte menor que 16 px. */
function smallFields() {
  const out = [];
  document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]), select, textarea').forEach((el) => {
    if (!el.getClientRects().length) return;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size < 16) out.push((el.id || el.name || el.tagName) + ' ' + size + 'px');
  });
  return out;
}

module.exports = async function qaMobile() {
  for (const phone of PHONES) {
    const tag = `${phone.w}x${phone.h}`;
    const app = await startApp({ role: 'member', viewport: { width: phone.w, height: phone.h } });
    try {
      check((await app.page.goto(app.baseUrl)) !== null, `${tag}: entrada abre`);
      await app.page.waitForSelector('#login-email');
      check((await app.page.evaluate(smallFields)).length === 0, `${tag}: campos da entrada com 16 px`);
      const credito = await app.page.evaluate(() => {
        const el = document.querySelector('.site-credito--entrada') || document.querySelector('.site-credito');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { texto: el.textContent.trim(), links: el.querySelectorAll('a').length, dentro: r.left >= 0 && r.right <= window.innerWidth + 1 };
      });
      check(!!credito && /LAIFT/.test(credito.texto) && credito.links === 0 && credito.dentro, `${tag}: crédito do rodapé é texto, sem link e dentro da tela (${credito && credito.texto})`);
      await app.login();
      await app.showPanel('panel-profile');
      await app.page.waitForSelector('#profile-name');
      const small = await app.page.evaluate(smallFields);
      check(small.length === 0, `${tag}: campos do Perfil com 16 px (${small.join(', ')})`);

      const frame = await app.openModule('farmaco');
      await frame.waitForSelector('#topicsGrid .topic-btn');
      const cols = await frame.evaluate(() => getComputedStyle(document.getElementById('topicsGrid')).gridTemplateColumns.split(' ').length);
      check(cols === 2, `${tag}: tópicos do quiz em duas colunas (${cols})`);
      await frame.locator('#startQuiz').scrollIntoViewIfNeeded();
      await frame.locator('#startQuiz').click();
      const msg = (await frame.locator('#quizStatus').textContent()) || '';
      check(/tópico/i.test(msg) && !/menu lateral/i.test(msg), `${tag}: aviso sem tópico não cita menu lateral ("${msg.trim()}")`);
      await app.page.waitForTimeout(1200); // a rolagem é suave
      const topo = await frame.evaluate(() => document.getElementById('topicsGrid').getBoundingClientRect().top);
      check(topo >= -2 && topo < phone.h, `${tag}: o aviso leva os tópicos à tela (topo em ${Math.round(topo)})`);
      check(app.errors.length === 0, `${tag}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
};
