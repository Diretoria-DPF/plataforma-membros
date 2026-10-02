/**
 * atlas-farmaco.e2e.js — modo Farmacologia com o modelo PK/PD (PR 3.2, Bloco C).
 *  - Selecionar um composto mostra Cmax/Tmax/AUC calculados por
 *    js/core/pk-model.js (os mesmos números do módulo puro) e os gráficos
 *    Cp(t) e E(t) (Chart.js do espelho local).
 *  - Composto legado (sem fonte) traz o aviso de rascunho.
 *  - Celular e desktop; sem erros de JavaScript.
 */
const { startApp, check } = require('./harness');
const mirror = require('./cdn-mirror');

async function runAt(viewport, pkgs) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  await app.context.route('https://cdn.jsdelivr.net/**', (route) => {
    const file = pkgs && mirror.resolveCdnUrl(pkgs, route.request().url());
    if (!file) return route.abort();
    return route.fulfill({ status: 200, contentType: file.contentType, body: file.body, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => !!window.__atlasInternals && !!window.AtlasShell, null, { timeout: 60000 });
    await frame.evaluate(() => window.AtlasShell.setMode('farmacologia'));
    await frame.waitForSelector('.compound-card', { timeout: 15000 });
    const firstId = await frame.evaluate(() => document.querySelector('.compound-card').dataset.compoundId);
    await frame.evaluate(() => document.querySelector('.compound-card').click());
    await frame.waitForSelector('#pk-panel .pk-summary', { timeout: 15000 });

    const ui = await frame.evaluate(() => ({
      summary: document.querySelector('#pk-panel .pk-summary').textContent,
      params: document.querySelector('#pk-panel .pk-params').textContent,
      legacy: !!document.querySelector('#pk-panel .pk-legacy'),
      cp: !!document.querySelector('#pkCpCanvas'),
      eff: !!document.querySelector('#pkEffectCanvas'),
      chart: typeof window.Chart !== 'undefined',
    }));
    // Mesmo cálculo no módulo puro, carregado no próprio frame.
    const ref = await frame.evaluate(async (id) => {
      const m = await import('./js/core/pk-model.js');
      const ph = await import('./js/modes/pharmacology.js');
      const list = await (await fetch('data/atlas/compounds.json')).json();
      const c = ph.normalizeCompound(list.find((x) => x.id === id));
      const s = m.simulate(c);
      return { cmax: s.cmax, tmax: s.tmax, legacy: !!c.legacyDefaults || (c.review && c.review.status === 'legacy-unverified') };
    }, firstId);
    const num = (re) => { const m = re.exec(ui.summary); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : NaN; };
    const cmaxUi = num(/Cmax ≈ ([\d.,]+)/);
    check(Number.isFinite(cmaxUi) && Math.abs(cmaxUi - ref.cmax) / ref.cmax < 0.05, `${label}: Cmax na tela (${cmaxUi}) = modelo puro (${ref.cmax.toFixed(3)})`);
    if (!/bolus IV/.test(ui.summary)) {
      const tmaxUi = num(/Tmax ≈ ([\d.,]+)/);
      check(Math.abs(tmaxUi - ref.tmax) < 0.06, `${label}: Tmax na tela (${tmaxUi} h) = modelo puro (${ref.tmax.toFixed(2)} h)`);
    }
    check(/F [\d,]+/.test(ui.params) && /Vd/.test(ui.params), `${label}: parâmetros usados visíveis (${ui.params})`);
    check(ui.legacy === ref.legacy, `${label}: aviso de rascunho ${ref.legacy ? 'presente' : 'ausente'} conforme o status do composto`);
    if (pkgs) check(ui.chart && ui.cp && ui.eff, `${label}: gráficos Cp(t) e E(t) desenhados`);
    else check(!ui.cp, `${label}: sem Chart.js, só o resumo em texto`);
    check(app.errors.length === 0, `${label}: sem erros de JavaScript${app.errors.length ? ': ' + app.errors.join(' | ') : ''}`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasFarmaco() {
  const pkgs = mirror.ensureMirror();
  await runAt({ width: 1280, height: 800 }, pkgs);
  await runAt({ width: 390, height: 844 }, pkgs);
};
