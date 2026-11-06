/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/** lab-regulacao-mobile.e2e.js — Regulação de controlados em 320 px: nenhuma aba cria rolagem horizontal. */
const { startApp, check } = require('./harness');

module.exports = async function () {
  const app = await startApp({ role: 'member', viewport: { width: 320, height: 568 }, theme: 'dark' });
  try {
    await app.login();
    const frame = await app.openModule('lab');
    await frame.waitForSelector('#faixaMissao');
    await frame.goto(app.baseUrl + 'modulos/laboratorio/regulacao/index.html');
    await frame.waitForSelector('.rg-aba');
    const n = await frame.$$eval('.rg-aba', (els) => els.length);
    check(n >= 4, `Regulação tem ${n} abas`);
    for (let i = 0; i < n; i++) {
      await frame.evaluate((k) => document.querySelectorAll('.rg-aba')[k].click(), i);
      await frame.waitForTimeout(200);
      const hs = await frame.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(hs <= 0, `aba ${i + 1} sem rolagem horizontal em 320 px (excesso ${hs} px)`);
    }
    check(app.errors.length === 0, `sem erro de JavaScript (${app.errors.join(' | ')})`);
  } finally { await app.close(); }
};
