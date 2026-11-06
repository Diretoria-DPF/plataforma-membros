/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * qa-mobile-clinica.e2e.js — Clínica Virtual, aba Diálogo, em celular de 320 a 390 px (QA mobile, 2026-11-05):
 * as sugestões do "Guia Semiológico" ocupam a largura toda (antes ficavam numa coluna de ~70 px, com o texto cortado),
 * têm alvo de toque de 44 px e a conversa mantém pelo menos 180 px de altura.
 */
const { startApp, check } = require('./harness');

const PHONES = [{ w: 320, h: 568 }, { w: 360, h: 800 }, { w: 390, h: 844 }];

module.exports = async function qaMobileClinica() {
  for (const phone of PHONES) {
    const tag = `${phone.w}x${phone.h}`;
    const app = await startApp({
      role: 'member', viewport: { width: phone.w, height: phone.h },
      workerHandlers: { apiGetFeatureFlags: async () => ({ success: true, flags: { learn_v2_enabled: true } }) },
    });
    try {
      await app.login();
      const frame = await app.openModule('clinica').catch(async () => {
        await app.page.evaluate(() => window.LaiftLearning.openModule('clinica'));
        const el = await app.page.waitForSelector('.learn-frame:not(.hidden)');
        return el.contentFrame();
      });
      await frame.waitForSelector('button:has-text("Assumir Atendimento")', { timeout: 10000 });
      await frame.locator('button:has-text("Assumir Atendimento")').first().click();
      await frame.waitForSelector('#tab-dialogo', { state: 'visible' });
      await frame.locator('#tab-dialogo').click();
      await frame.waitForFunction(() => document.querySelectorAll('#suggestionsList .suggestion-chip').length > 0, null, { timeout: 8000 });
      const g = await frame.evaluate(() => {
        const r = (s) => document.querySelector(s).getBoundingClientRect();
        const chips = Array.from(document.querySelectorAll('#suggestionsList .suggestion-chip')).map((c) => c.getBoundingClientRect());
        const root = document.documentElement;
        return {
          chatH: Math.round(r('#chatHistory').height), listW: Math.round(r('#suggestionsList').width), rowW: Math.round(r('.suggested-questions-row').width),
          chipMinH: Math.round(Math.min.apply(null, chips.map((c) => c.height))), hscroll: root.scrollWidth - root.clientWidth,
        };
      });
      check(g.listW >= g.rowW - 2, `${tag}: sugestões na largura toda (${g.listW} de ${g.rowW} px)`);
      check(g.chipMinH >= 44, `${tag}: sugestões com alvo de 44 px (${g.chipMinH})`);
      check(g.chatH >= 180, `${tag}: a conversa mantém 180 px ou mais (${g.chatH})`);
      check(g.hscroll <= 0, `${tag}: sem rolagem horizontal (${g.hscroll})`);
      check(app.errors.length === 0, `${tag}: sem erros de página (${app.errors.join('; ')})`);
    } finally {
      await app.close();
    }
  }
};
