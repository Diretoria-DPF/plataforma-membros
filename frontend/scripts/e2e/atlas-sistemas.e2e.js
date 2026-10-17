/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-sistemas.e2e.js — aba "Estruturas" do Atlas: tocar num sistema cujo modelo 3D ainda NÃO foi carregado
 * (qualquer um além do esqueleto, que vem no boot, e do muscular, que vem em segundo plano) abre a lista de
 * estruturas na hora e carrega o modelo em seguida. Antes, o toque era descartado em silêncio.
 */
const { startApp, check } = require('./harness');

const SISTEMAS = [['Digestório', 'digestorio'], ['Respiratório', 'respiratorio'], ['Nervoso', 'nervoso'], ['Urinário', 'urinario']];

async function ready(frame) {
  await frame.waitForFunction(() => { const I = window.__atlasInternals; return !!I && I.store.get().loadedSystems.includes('esqueletico'); }, null, { timeout: 60000 });
}

module.exports = async function atlasSistemas() {
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 800 } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    await frame.click('.atlas-nav-toggle');
    await frame.waitForSelector('.atlas-nav-row', { timeout: 15000 });

    for (const [rotulo, id] of SISTEMAS) {
      // Volta à lista de sistemas (o primeiro item da trilha) e toca no sistema.
      await frame.evaluate(() => { const b = document.querySelector('.atlas-nav-breadcrumb-btn'); if (b) b.click(); });
      await frame.waitForFunction((r) => Array.from(document.querySelectorAll('.atlas-nav-row')).some((n) => n.textContent.includes(r)), rotulo, { timeout: 10000 });
      const carregadoAntes = await frame.evaluate((s) => window.__atlasInternals.store.get().loadedSystems.includes(s), id);
      await frame.evaluate((r) => { Array.from(document.querySelectorAll('.atlas-nav-row')).find((n) => n.textContent.includes(r)).click(); }, rotulo);
      const abriu = await frame.waitForFunction((r) => {
        const trilha = (document.querySelector('.atlas-nav-breadcrumb') || {}).textContent || '';
        return trilha.includes(r) && document.querySelectorAll('.atlas-nav-row').length > 0;
      }, rotulo, { timeout: 8000 }).then(() => true, () => false);
      check(abriu, `${rotulo}: o toque abre a lista de estruturas (modelo ${carregadoAntes ? 'já estava carregado' : 'ainda não carregado'})`);
      const carregou = await frame.waitForFunction((s) => window.__atlasInternals.store.get().loadedSystems.includes(s), id, { timeout: 30000 }).then(() => true, () => false);
      check(carregou, `${rotulo}: o modelo 3D carrega depois do toque`);
    }
    check(app.errors.length === 0, `atlas-sistemas: sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
};
