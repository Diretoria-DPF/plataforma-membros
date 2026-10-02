/**
 * atlas-fisiologia.e2e.js — modo Fisiologia & Vias (PR 3.2, Bloco D).
 *  - Via: dados de PK da via (F, Tmax, primeira passagem) e "estudo de via"
 *    passo a passo (Ponto X de N, ◀/▶), concluído entra no histórico.
 *  - Processo: passo com texto e, quando houver, "Na clínica".
 *  - Visão sistêmica: grafo SVG + lista acessível; tocar abre o processo.
 *  - Celular e desktop; sem erros de JavaScript.
 */
const { startApp, check } = require('./harness');

async function runAt(viewport) {
  const label = `${viewport.width}×${viewport.height}`;
  // A visão sistêmica está atrás da flag `systemic` (desligada no padrão).
  const app = await startApp({ role: 'member', viewport, atlasFlags: { onboarding: false, hints: false, systemic: true } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals && !!window.AtlasShell, null, { timeout: 60000 });
    await frame.evaluate(() => {
      window.__studyPath = [];
      window.__atlasInternals.bus.on('study:path', (p) => window.__studyPath.push(p));
    });
    await frame.evaluate(() => window.AtlasShell.setMode('fisiologia'));
    await frame.waitForSelector('.physiology-card', { timeout: 15000 });
    // No celular a folha abre recolhida: o aluno a puxa para cima.
    if (viewport.width < 600) { await frame.evaluate(() => window.AtlasSheet && window.AtlasSheet.snapFull()); await frame.waitForTimeout(500); }

    // ---- Via: estudo passo a passo ----
    await frame.evaluate(() => document.querySelector('.physiology-card').click());
    await frame.waitForSelector('.physiology-study', { timeout: 5000 });
    const route = await frame.evaluate(() => ({
      count: document.querySelector('.physiology-study-count').textContent.trim(),
      pk: (document.querySelector('.route-pk') || {}).textContent || '',
    }));
    check(/^Ponto 1 de \d+$/.test(route.count), `${label}: estudo de via começa em "${route.count}"`);
    check(/Biodisponibilidade típica/.test(route.pk) && !/N\/A/.test(route.pk), `${label}: dados da via sem "N/A" (${route.pk.replace(/\s+/g, ' ').trim()})`);
    const total = Number(/de (\d+)/.exec(route.count)[1]);
    for (let i = 1; i < total; i++) {
      await frame.locator('.physiology-next').click({ timeout: 5000 });
      await frame.waitForTimeout(120);
    }
    const end = await frame.evaluate(() => ({
      count: document.querySelector('.physiology-study-count').textContent.trim(),
      bar: document.querySelector('.physiology-progress').getAttribute('aria-valuenow'),
      study: window.__studyPath.slice(),
    }));
    check(end.count === `Ponto ${total} de ${total}` && end.bar === String(total), `${label}: "▶" chega ao último ponto, com a barra cheia (${end.count})`);
    check(end.study.length === 0, `${label}: nada é salvo sem pedir`);
    await frame.locator('.physiology-save').click({ timeout: 5000 });
    const saved = await frame.evaluate(() => ({ study: window.__studyPath.slice(), done: !!document.querySelector('.physiology-saved'), btn: !!document.querySelector('.physiology-save') }));
    check(saved.study.length === 1 && saved.study[0].kind === 'route' && saved.done && !saved.btn, `${label}: "Salvar no Meu Estudo" registra uma vez (${JSON.stringify(saved.study)})`);
    await frame.locator('.physiology-prev').click();
    check(await frame.evaluate((t) => document.querySelector('.physiology-study-count').textContent.trim() === `Ponto ${t - 1} de ${t}`, total), `${label}: "◀" volta um ponto`);

    // ---- Processo ----
    await frame.locator('.physiology-tab[data-tab="processos"]').click();
    await frame.waitForSelector('.physiology-card');
    await frame.evaluate(() => document.querySelector('.physiology-card').click());
    await frame.waitForSelector('.physiology-study');
    const proc = await frame.evaluate(() => document.querySelector('.physiology-study').textContent.replace(/\s+/g, ' ').trim());
    check(/^Passo 1 de \d+/.test(proc) && proc.length > 40, `${label}: processo mostra o passo com explicação (${proc.slice(0, 80)}…)`);
    check(await frame.evaluate(() => /^Fonte: /.test((document.querySelector('.physiology-study-fonte') || {}).textContent || '')), `${label}: passo do processo mostra a fonte`);

    // ---- Visão sistêmica ----
    await frame.locator('.physiology-tab[data-tab="sistemica"]').click();
    await frame.waitForSelector('.physiology-systemic svg');
    const sys = await frame.evaluate(() => ({
      nodes: document.querySelectorAll('.physiology-systemic .systemic-node').length,
      items: document.querySelectorAll('.physiology-systemic .systemic-open').length,
      label: document.querySelector('.physiology-systemic svg').getAttribute('aria-label'),
    }));
    check(sys.nodes > 0 && sys.nodes === sys.items, `${label}: visão sistêmica com grafo e lista equivalentes (${sys.label})`);
    const target = await frame.evaluate(() => document.querySelector('.systemic-open').dataset.process);
    await frame.locator('.systemic-open').first().click();
    await frame.waitForSelector('.physiology-study');
    const opened = await frame.evaluate(() => document.querySelector('.physiology-tab[aria-pressed="true"]').dataset.tab);
    check(opened === 'processos', `${label}: tocar em "${target}" abre o estudo do processo`);
    check(app.errors.length === 0, `${label}: sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasFisiologia() {
  await runAt({ width: 1280, height: 800 });
  await runAt({ width: 390, height: 844 });
};
