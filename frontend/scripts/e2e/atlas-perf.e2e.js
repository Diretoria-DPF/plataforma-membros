/**
 * atlas-perf.e2e.js — orçamento de desempenho do Atlas v2 (docs/ATLAS_UX_SPEC.md
 * §17) em dois viewports (celular retrato e desktop).
 * ---------------------------------------------------------------------------
 * Depois do modelo ficar pronto (window.__atlasInternals montado e os
 * sistemas padrão — esquelético+muscular, ver DEFAULT_SYSTEMS em js/main.js —
 * carregados):
 *   1. bytes transferidos (respostas HTTP da própria origem, sem compressão
 *      no servidor estático local — ver scripts/e2e/harness.js) até esse
 *      ponto ≤ 5 MB (orçamento de 1ª carga, plano §4);
 *   2. draw calls ≤ 150 e triângulos ≤ 1,5 M, via `renderer.info`
 *      (exposto só-leitura em `window.__atlasPerf.getStats()`, ver js/main.js);
 *   3. heap JS (CDP `Performance.getMetrics` → `JSHeapUsedSize`) ≤ 250 MB;
 *   4. render-on-demand: `renderer.info`/`getStats().renders` não cresce
 *      durante 2 s sem interação (o motor só renderiza quando algo pede —
 *      ver js/engine/renderer.js `requestRender`/`addTicker`).
 *
 * Roda contra o BUILD (frontend/dist/), como as demais suítes.
 */
const { startApp, check } = require('./harness');

const MB = 1024 * 1024;
const BUDGET_BYTES_BEFORE_READY = 5 * MB;
const BUDGET_DRAW_CALLS = 150;
const BUDGET_TRIANGLES = 1_500_000;
const BUDGET_HEAP_BYTES = 250 * MB;

async function measureAtViewport(viewport) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });

  // O servidor estático local (scripts/e2e/harness.js) responde com
  // `Transfer-Encoding: chunked` (sem `Content-Length`) — soma o corpo de
  // cada resposta da própria origem para medir bytes de verdade, não um
  // cabeçalho ausente.
  const bytes = { total: 0, done: false, pending: [] };
  app.page.on('response', (res) => {
    if (bytes.done) return;
    const url = res.url();
    if (!url.startsWith(app.baseUrl)) return; // CDNs já são abortados pelo harness
    bytes.pending.push(res.body().then((buf) => { bytes.total += buf.length; }).catch(() => {}));
  });

  try {
    await app.login();
    const frame = await app.openModule('anatomia');

    // ---- Espera o modelo ficar pronto (sistemas padrão carregados) ----
    await frame.waitForFunction(() => !!window.__atlasInternals, null, { timeout: 20000 });
    await frame.waitForFunction(() => {
      const st = window.__atlasInternals.store.get();
      const def = window.__atlasInternals.DEFAULT_SYSTEMS || [];
      return def.every((s) => st.loadedSystems.includes(s));
    }, null, { timeout: 20000 });
    // Mais um frame de "assentamento" (a última malha registrada ainda pode
    // estar a caminho de um requestRender agendado) antes de fechar a
    // contagem de bytes "antes de pronto".
    await frame.waitForTimeout(150);
    bytes.done = true;
    await Promise.all(bytes.pending);

    check(bytes.total > 0, `${label}: harness mediu algum byte transferido (sanity check, ${bytes.total}b)`);
    check(bytes.total <= BUDGET_BYTES_BEFORE_READY,
      `${label}: bytes transferidos até o modelo ficar pronto ≤ 5 MB (medido: ${(bytes.total / MB).toFixed(2)} MB)`);

    // ---- Draw calls / triângulos (renderer.info via window.__atlasPerf) ----
    const stats1 = await frame.evaluate(() => window.__atlasPerf.getStats());
    check(!!stats1, `${label}: window.__atlasPerf.getStats() está disponível`);
    check(stats1.drawCalls <= BUDGET_DRAW_CALLS, `${label}: draw calls ≤ 150 (medido: ${stats1.drawCalls})`);
    check(stats1.triangles <= BUDGET_TRIANGLES, `${label}: triângulos ≤ 1,5 M (medido: ${stats1.triangles})`);

    // ---- Heap JS (CDP) ----
    const client = await app.context.newCDPSession(app.page);
    await client.send('Performance.enable');
    const { metrics } = await client.send('Performance.getMetrics');
    const heapBytes = (metrics.find((m) => m.name === 'JSHeapUsedSize') || {}).value || 0;
    check(heapBytes > 0, `${label}: CDP mediu algum heap JS (sanity check, ${heapBytes}b)`);
    check(heapBytes <= BUDGET_HEAP_BYTES, `${label}: heap JS ≤ 250 MB (medido: ${(heapBytes / MB).toFixed(2)} MB)`);

    // ---- Render-on-demand: sem interação, o contador de frames não cresce ----
    await frame.waitForTimeout(300); // deixa qualquer tween/animação em curso (câmera, tickers) assentar
    const rendersBefore = (await frame.evaluate(() => window.__atlasPerf.getStats())).renders;
    await app.page.waitForTimeout(2000); // 2s sem nenhuma interação do teste
    const rendersAfter = (await frame.evaluate(() => window.__atlasPerf.getStats())).renders;
    check(rendersAfter === rendersBefore,
      `${label}: render-on-demand — a contagem de frames não cresce em 2s de ociosidade (antes: ${rendersBefore}, depois: ${rendersAfter})`);

    console.log(`  · ${label}: ${(bytes.total / MB).toFixed(2)} MB até pronto · ${stats1.drawCalls} draw calls · ${stats1.triangles} triângulos · ${(heapBytes / MB).toFixed(1)} MB heap · renders ${rendersBefore}→${rendersAfter}`);

    check(app.errors.length === 0, `${label}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function atlasPerf() {
  await measureAtViewport({ width: 390, height: 844 });
  await measureAtViewport({ width: 1440, height: 900 });
};
