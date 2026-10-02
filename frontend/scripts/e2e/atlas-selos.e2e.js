/**
 * atlas-selos.e2e.js — o aluno vê o que é confiável (PR 3.2, C2) e o boot
 * não baixa fichas (M5).
 *  - Boot: nenhuma requisição a curated/ ou content/ antes de abrir uma ficha.
 *  - Navegador: chips [Todas] [Revisadas] [Em revisão] com contagem; revisadas
 *    primeiro com ✓; filtro funciona (status injetado no review-status.json
 *    só neste teste — os dados reais ainda não têm onda assinada).
 *  - Ficha gerada: selo "○ Gerado automaticamente".
 */
const { startApp, check } = require('./harness');

const FAKE_STATUS = { v: 1, r: ['za:kidney-l', 'za:kidney-r'], e: ['za:urinary-bladder'], l: [], g: [] };

async function runAt(viewport) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  const contentReqs = [];
  app.context.on('request', (r) => { if (/\/data\/atlas\/(curated|content)\//.test(r.url())) contentReqs.push(r.url()); });
  await app.context.route('**/data/atlas/generated/review-status.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_STATUS) }));
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && I.store.get().loadedSystems.includes('esqueletico');
    }, null, { timeout: 60000 });
    check(contentReqs.length === 0, `${label}: boot sem baixar fichas (curated/ e content/ só sob demanda)${contentReqs.length ? ': ' + contentReqs.join(', ') : ''}`);

    const nav = await frame.evaluate(async () => {
      const I = window.__atlasInternals;
      await I.loadSystem('urinario');
      I.navigator.openSystem('urinario');
      await new Promise((r) => setTimeout(r, 300));
      const chips = [...document.querySelectorAll('.atlas-nav-filter-chip')].map((c) => c.textContent.trim());
      const rows = () => [...document.querySelectorAll('.atlas-nav-row')].map((r) => ({ name: r.querySelector('.atlas-nav-row-name').textContent.trim(), st: (r.querySelector('.atlas-nav-status') || {}).textContent || '' }));
      const all = rows();
      document.querySelector('.atlas-nav-filter-chip[data-filter="r"]').click();
      const onlyR = rows();
      document.querySelector('.atlas-nav-filter-chip[data-filter="e"]').click();
      const onlyE = rows();
      document.querySelector('.atlas-nav-filter-chip[data-filter="all"]').click();
      return { chips, first: all[0], total: all.length, onlyR, onlyE };
    });
    check(nav.chips.length === 3 && /Revisadas \(1\)/.test(nav.chips[1]) && /Em revisão \(1\)/.test(nav.chips[2]), `${label}: chips com contagem (${nav.chips.join(' · ')})`);
    check(nav.first && nav.first.st === '✓' && /^Rins?\b/i.test(nav.first.name), `${label}: revisada primeiro, com ✓ (${JSON.stringify(nav.first)})`);
    check(nav.onlyR.length === 1 && nav.onlyE.length === 1 && nav.onlyE[0].st === '⏳', `${label}: filtros Revisadas/Em revisão (${nav.onlyR.length}/${nav.onlyE.length} de ${nav.total})`);

    const card = viewport.width < 600 ? '#atlas-sheet' : '#atlas-inspector';
    await frame.evaluate(() => { const I = window.__atlasInternals; I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:pulmonary-trunk', source: 'search' }); });
    await frame.waitForSelector(`${card} .atlas-card-status`, { timeout: 15000 }).catch(() => {});
    const badge = await frame.evaluate((c) => { const b = document.querySelector(`${c} .atlas-card-status`); return b ? b.textContent.replace(/\s+/g, ' ').trim() : ''; }, card);
    check(/^○\s*Gerado automaticamente/.test(badge), `${label}: ficha gerada com selo cinza (${badge.slice(0, 60)})`);
    check(contentReqs.some((u) => /content\/cardiovascular\.json/.test(u)), `${label}: abrir a ficha baixa só o arquivo do sistema dela`);
    // M3: visão sistêmica desligada no padrão (flag systemic, até o teste de papel).
    await frame.evaluate(() => window.AtlasShell.setMode('fisiologia'));
    await frame.waitForSelector('.physiology-tab', { timeout: 15000 });
    check(await frame.evaluate(() => !document.querySelector('.physiology-tab[data-tab="sistemica"]')), `${label}: visão sistêmica fora do padrão (flag systemic desligada)`);
    check(app.errors.length === 0, `${label}: sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasSelos() {
  await runAt({ width: 1280, height: 800 });
  await runAt({ width: 390, height: 844 });
};
