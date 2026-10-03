/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-labels.e2e.js — rótulos legíveis e sem nomes repetidos (crimes C3 e
 * C5 da Onda 3).
 *  - Rótulos ligados: no máximo 6 no celular e 12 no desktop, nenhum cobrindo
 *    outro (medido no DOM) e nenhum nome repetido (os lados viram selo E/D).
 *  - Busca e navegador: uma linha por estrutura (rim esquerdo e direito, e as
 *    versões M/F do órgão HRA, não aparecem repetidos).
 */
const { startApp, check } = require('./harness');

async function runAt(viewport) {
  const mobile = viewport.width < 600;
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && ['esqueletico', 'muscular'].every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 60000 });
    if (mobile) await frame.evaluate(() => { if (window.AtlasSheet && window.AtlasSheet.snapPeek) window.AtlasSheet.snapPeek(); });

    // ---- Rótulos (C5) ----
    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      I.bus.emit(I.bus.EVENTS.LABELS_SET, { enabled: true });
    });
    await frame.waitForTimeout(600);
    const labels = await frame.evaluate(() => [...document.querySelectorAll('.atlas-label')]
      .filter((el) => getComputedStyle(el).display !== 'none')
      .map((el) => {
        const r = el.getBoundingClientRect();
        const side = el.querySelector('.atlas-label-side');
        return { text: el.firstChild ? el.firstChild.textContent : el.textContent, side: side ? side.textContent : '', r: [r.left, r.top, r.right, r.bottom] };
      }));
    const cap = Math.min(6, Math.floor(viewport.width / 100));
    check(labels.length >= 1 && labels.length <= cap, `${label}: ${labels.length} rótulo(s) visível(is) (1..${cap})`);
    const overlaps = [];
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].r; const b = labels[j].r;
        if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) overlaps.push(`${labels[i].text} × ${labels[j].text}`);
      }
    }
    check(overlaps.length === 0, `${label}: nenhum rótulo cobre outro${overlaps.length ? ': ' + overlaps.join(' | ') : ''}`);
    const texts = labels.map((l) => l.text.trim().toLowerCase());
    const dupes = texts.filter((t, i) => texts.indexOf(t) !== i);
    check(dupes.length === 0, `${label}: nenhum rótulo com nome repetido${dupes.length ? ': ' + dupes.join(', ') : ''}`);
    check(!labels.some((l) => /\((esquerdo|direito)\)/.test(l.text)), `${label}: rótulos de grupo sem "(esquerdo)/(direito)" no nome`);

    // ---- Busca (C3) ----
    const searchRows = await frame.evaluate(async () => {
      const sb = window.__atlasInternals.searchBox;
      if (!sb || !sb.open) return null;
      sb.open('kidney');
      await new Promise((r) => setTimeout(r, 400));
      return [...document.querySelectorAll('.atlas-search-option')].map((o) => ({
        name: (o.querySelector('.atlas-search-option-label') || o).textContent.trim(),
        side: (o.querySelector('.atlas-search-chip-side') || {}).textContent || '',
      }));
    });
    if (searchRows) {
      const names = searchRows.map((r) => r.name.toLowerCase());
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      check(searchRows.length > 0 && dup.length === 0, `${label}: busca "kidney" sem resultados repetidos (${searchRows.length} resultado(s)${dup.length ? '; repetidos: ' + dup.join(', ') : ''})`);
      check(searchRows.some((r) => r.side === 'E/D'), `${label}: estrutura com dois lados aparece uma vez, com selo E/D`);
    } else {
      check(false, `${label}: caixa de busca encontrada`);
    }
    await frame.evaluate(() => window.__atlasInternals.searchBox.close());

    // ---- Navegador (C3) ----
    const navRows = await frame.evaluate(async () => {
      const I = window.__atlasInternals;
      const nav = I.navigator;
      if (!nav || !nav.openSystem) return null;
      await I.loadSystem('urinario');
      nav.openSystem('urinario');
      await new Promise((r) => setTimeout(r, 300));
      return [...document.querySelectorAll('.atlas-nav-row')].map((r) => ({
        name: (r.querySelector('.atlas-nav-row-name') || r).textContent.trim(),
        side: (r.querySelector('.atlas-nav-side-chip') || {}).textContent || '',
      }));
    });
    if (navRows) {
      const names = navRows.map((r) => r.name.toLowerCase());
      const dup = names.filter((n, i) => names.indexOf(n) !== i);
      check(navRows.length > 0 && dup.length === 0, `${label}: navegador (urinário) sem linhas repetidas (${navRows.length} linha(s)${dup.length ? '; repetidas: ' + [...new Set(dup)].slice(0, 5).join(', ') : ''})`);
    }

    // ---- "Rins" uma vez só, com selo E/D (os dois lados carregados) ----
    const kidney = await frame.evaluate(async () => {
      const I = window.__atlasInternals;
      if (!I.labels || !I.labels.setSids) return null;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: null, source: 'api' });
      for (const sid of ['za:kidney-l', 'za:kidney-r']) I.registry.setVisible(sid, true);
      I.labels.setSids(['za:kidney-l', 'za:kidney-r']);
      await new Promise((r) => setTimeout(r, 300));
      return [...document.querySelectorAll('.atlas-label')]
        .filter((el) => getComputedStyle(el).display !== 'none')
        .map((el) => ({ text: el.firstChild ? el.firstChild.textContent : '', side: (el.querySelector('.atlas-label-side') || {}).textContent || '' }));
    });
    if (kidney) {
      check(kidney.length === 1 && kidney[0].side === 'E/D', `${label}: rim esquerdo + direito = 1 rótulo com selo E/D (${JSON.stringify(kidney)})`);
    } else {
      check(false, `${label}: API de rótulos exposta para o teste`);
    }
  } finally {
    await app.close();
  }
}

module.exports = async function atlasLabels() {
  await runAt({ width: 390, height: 844 });
  await runAt({ width: 1280, height: 800 });
};
