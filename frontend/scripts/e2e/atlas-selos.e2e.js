/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-selos.e2e.js — o aluno NÃO vê selos nem textos de revisão (regra do dono:
 * a aprovação é do admin) e o boot não baixa fichas (M5).
 *  - Boot: nenhuma requisição a curated/ ou content/ antes de abrir uma ficha.
 *  - Navegador: chips [Todas] [Fichas completas] com contagem; sem ícones de
 *    revisão nas linhas; o filtro funciona (status injetado no
 *    review-status.json só neste teste).
 *  - Ficha: sem selo ⓘ, sem selo de status e sem texto de revisão ou rascunho.
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

    // M4: chip "Novo: N fichas completas" (2 sids no status injetado).
    const chipText = await frame.evaluate(() => (document.querySelector('.atlas-new-reviewed') || {}).textContent || '');
    check(/Novo: 2 fichas completas/.test(chipText), `${label}: chip "${chipText.trim()}" na barra`);
    if (chipText) {
      await frame.locator('.atlas-new-reviewed').click();
      await frame.waitForTimeout(200);
      check(await frame.evaluate(() => !document.querySelector('.atlas-new-reviewed') && localStorage.getItem('atlas-revisadas-vistas') === '2'), `${label}: tocar no chip some com ele e guarda o "visto"`);
    }

    const nav = await frame.evaluate(async () => {
      const I = window.__atlasInternals;
      await I.loadSystem('urinario');
      I.navigator.openSystem('urinario');
      await new Promise((r) => setTimeout(r, 300));
      const chips = [...document.querySelectorAll('.atlas-nav-filter-chip')].map((c) => c.textContent.trim());
      const rows = () => [...document.querySelectorAll('.atlas-nav-row')].map((r) => ({ name: r.querySelector('.atlas-nav-row-name').textContent.trim(), st: (r.querySelector('.atlas-nav-status') || {}).textContent || '', txt: r.textContent }));
      const preFilter = (document.querySelector('.atlas-nav-filter-chip[aria-pressed="true"]') || {}).dataset;
      document.querySelector('.atlas-nav-filter-chip[data-filter="all"]').click();
      const all = rows();
      document.querySelector('.atlas-nav-filter-chip[data-filter="c"]').click();
      const onlyC = rows();
      document.querySelector('.atlas-nav-filter-chip[data-filter="all"]').click();
      return { chips, total: all.length, onlyC, withMarks: all.filter((r) => r.st || /[✓⏳]/.test(r.txt)).length, preFilter: preFilter && preFilter.filter };
    });
    check(nav.chips.length === 2 && /^Todas/.test(nav.chips[0]) && /^Fichas completas \(2\)/.test(nav.chips[1]), `${label}: chips com contagem (${nav.chips.join(' · ')})`);
    check(nav.withMarks === 0, `${label}: nenhuma linha da lista traz ícone de revisão`);
    check(nav.preFilter === 'c', `${label}: o chip deixou o navegador filtrado em "Fichas completas" (${nav.preFilter})`);
    check(nav.onlyC.length === 2 && nav.onlyC.length < nav.total, `${label}: filtro Fichas completas (${nav.onlyC.length} de ${nav.total})`);

    const card = viewport.width < 600 ? '#atlas-sheet' : '#atlas-inspector';
    await frame.evaluate(() => { const I = window.__atlasInternals; I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:pulmonary-trunk', source: 'search' }); });
    await frame.waitForSelector(`${card} .atlas-card-tabbar`, { timeout: 15000 }).catch(() => {});
    const cardInfo = await frame.evaluate((c) => {
      const root = document.querySelector(c);
      return { text: root ? root.textContent.replace(/\s+/g, ' ') : '', status: !!(root && root.querySelector('.atlas-card-status')), seal: !!(root && root.querySelector('.laift-review-seal')) };
    }, card);
    check(!cardInfo.status && !cardInfo.seal, `${label}: ficha sem selo ⓘ nem selo de status`);
    check(!/revisad|rascunho|auto-?draft|autom[aá]tic|antigo|por IA|aguardando|sem descri/i.test(cardInfo.text), `${label}: ficha sem texto de revisão (${cardInfo.text.slice(0, 80)})`);
    check(contentReqs.some((u) => /content\/cardiovascular\.json/.test(u)), `${label}: abrir a ficha baixa só o arquivo do sistema dela`);
    // M4: Meu estudo mostra o progresso nas fichas completas (abriu o rim → 1 de 2).
    await frame.evaluate(() => { const I = window.__atlasInternals; I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid: 'za:kidney-l', source: 'search' }); });
    await frame.waitForTimeout(400);
    await frame.evaluate(() => window.AtlasShell.setMode('estudo'));
    await frame.waitForSelector('.study-reviewed', { timeout: 10000 }).catch(() => {});
    const prog = await frame.evaluate(() => (document.querySelector('.study-reviewed-count') || {}).textContent || '');
    check(/^1 de 2 fichas completas/.test(prog), `${label}: Meu estudo com o progresso nas fichas completas ("${prog}")`);

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
