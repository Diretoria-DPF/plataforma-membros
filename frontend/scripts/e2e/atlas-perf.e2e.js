/**
 * atlas-perf.e2e.js — orçamento de desempenho do Atlas v2 (docs/ATLAS_UX_SPEC.md
 * §17) em dois viewports (celular retrato e desktop).
 * ---------------------------------------------------------------------------
 * Depois do modelo ficar pronto (window.__atlasInternals montado e os
 * sistemas padrão — só o esquelético, ver DEFAULT_SYSTEMS em js/main.js —
 * carregados):
 *   1. bytes transferidos (respostas HTTP da própria origem, sem compressão
 *      no servidor estático local — ver scripts/e2e/harness.js) até esse
 *      ponto ≤ 2 MB (só o esqueleto; os músculos vêm depois, em segundo
 *      plano). No GitHub Pages JS/JSON vão comprimidos: ≈ 1,3 MB reais;
 *   2. draw calls ≤ 150 e triângulos ≤ 1,5 M, via `renderer.info`
 *      (exposto só-leitura em `window.__atlasPerf.getStats()`, ver js/main.js);
 *   3. heap JS (CDP `Performance.getMetrics` → `JSHeapUsedSize`) ≤ 250 MB;
 *   4. render-on-demand: `renderer.info`/`getStats().renders` não cresce
 *      durante 2 s sem interação (o motor só renderiza quando algo pede —
 *      ver js/engine/renderer.js `requestRender`/`addTicker`).
 *
 * Roda contra o BUILD (frontend/dist/), como as demais suítes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { startApp, check } = require('./harness');

const DIST = path.join(__dirname, '../../dist');

const MB = 1024 * 1024;
const BUDGET_BYTES_BEFORE_READY = 2 * MB;
// Presets de rede EXATAMENTE como os do Chrome DevTools (front_end/core/sdk/
// NetworkManager.ts): "Fast 3G" = 1,6 Mbit/s × 0,9 de descida, 750 kbit/s ×
// 0,9 de subida, 150 ms × 3,75 = 562,5 ms de latência; "Slow 3G" = 500
// kbit/s × 0,8 nos dois sentidos, 400 ms × 5 = 2000 ms. Ver docs/atlas-qa/rede.md.
// Meta local < 15 s: o servidor de teste é HTTP/1.1 (6 conexões por host), e
// o .glb e o three.js prendem conexões enquanto ~45 módulos esperam na fila.
// Em produção (GitHub Pages, HTTP/2) a mesma abertura mede ~9,3 s; a meta
// da Onda 3 (< 10 s) é conferida lá, por atlas-prod-check.js.
const FAST_3G = { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1000 * 1000 / 8) * 0.9, uploadThroughput: (750 * 1000 / 8) * 0.9 };
const SLOW_3G = { offline: false, latency: 2000, downloadThroughput: (500 * 1000 / 8) * 0.8, uploadThroughput: (500 * 1000 / 8) * 0.8 };
const BUDGET_3G_INTERACTIVE_MS = 15000;
const BUDGET_DRAW_CALLS = 150;
const BUDGET_TRIANGLES = 1_500_000;
const BUDGET_HEAP_BYTES = 250 * MB;

/**
 * Lista os arquivos da abertura: bytes transferidos aqui (servidor local,
 * sem compressão), content-encoding recebido e o tamanho em gzip — estimativa
 * do que um servidor que comprime entregaria. O número de PRODUÇÃO sai de
 * scripts/e2e/atlas-prod-check.js (workflow atlas-prod-check.yml).
 */
function reportFiles(files, baseUrl) {
  const rows = files
    .filter((f) => f.url.includes('/modulos/anatomia-3d/'))
    .map((f) => {
      const rel = f.url.slice(baseUrl.length).split('?')[0];
      let gzip = null;
      try { gzip = zlib.gzipSync(fs.readFileSync(path.join(DIST, decodeURIComponent(rel)))).length; } catch (e) { /* fora do dist */ }
      return { rel: rel.replace('modulos/anatomia-3d/', ''), transfer: f.transfer, gzip, encoding: f.encoding || '-' };
    })
    .sort((a, b) => b.transfer - a.transfer);
  const sum = (k) => rows.reduce((acc, r) => acc + (r[k] || 0), 0);
  console.log('  · arquivos da abertura (transferido | se fosse gzip | content-encoding):');
  for (const r of rows.slice(0, 12)) {
    console.log(`      ${(r.transfer / 1024).toFixed(0).padStart(6)} KB | ${r.gzip === null ? '   ?' : (r.gzip / 1024).toFixed(0).padStart(4)} KB | ${r.encoding} | ${r.rel}`);
  }
  console.log(`  · total do módulo: ${(sum('transfer') / MB).toFixed(2)} MB transferidos (o servidor local já comprime JS/JSON; o GLB vai sem); ${(sum('gzip') / MB).toFixed(2)} MB se o GLB também fosse comprimido`);
}

async function measureAtViewport(viewport) {
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });

  // Use CDP Network to measure actual transferred bytes (encodedDataLength)
  const client = await app.context.newCDPSession(app.page);
  await client.send('Network.enable');
  const bytes = { total: 0, done: false };

  client.on('Network.loadingFinished', (params) => {
    if (bytes.done) return;
    const { requestId } = params;
    client.send('Network.getResponseBody', { requestId }).then((body) => {
      // The response object from getResponseBody has headers; use the response from Network.responseReceived
      // to get the full response details including url, status, etc.
    }).catch(() => {});
  });

  // Track all network activity to sum encodedDataLength from responses on the origin
  const responses = {};
  const files = [];
  client.on('Network.responseReceived', (params) => {
    if (bytes.done) return;
    const { requestId, response } = params;
    const url = response.url || '';
    if (url.startsWith(app.baseUrl)) {
      const enc = Object.entries(response.headers || {}).find(([k]) => k.toLowerCase() === 'content-encoding');
      responses[requestId] = { url, encoding: enc ? enc[1] : '' };
    }
  });

  client.on('Network.loadingFinished', (params) => {
    if (bytes.done) return;
    const { requestId, encodedDataLength } = params;
    if (responses[requestId]) {
      bytes.total += encodedDataLength;
      files.push({ ...responses[requestId], transfer: encodedDataLength });
      delete responses[requestId];
    }
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
    await client.send('Network.disable');

    if (viewport.width < 600) reportFiles(files, app.baseUrl);
    check(bytes.total > 0, `${label}: harness mediu algum byte transferido (sanity check, ${bytes.total}b)`);
    check(bytes.total <= BUDGET_BYTES_BEFORE_READY,
      `${label}: bytes transferidos até o modelo ficar pronto ≤ 2 MB (medido: ${(bytes.total / MB).toFixed(2)} MB)`);

    // ---- Draw calls / triângulos (renderer.info via window.__atlasPerf) ----
    const stats1 = await frame.evaluate(() => window.__atlasPerf.getStats());
    check(!!stats1, `${label}: window.__atlasPerf.getStats() está disponível`);
    check(stats1.drawCalls <= BUDGET_DRAW_CALLS, `${label}: draw calls ≤ 150 (medido: ${stats1.drawCalls})`);
    check(stats1.triangles <= BUDGET_TRIANGLES, `${label}: triângulos ≤ 1,5 M (medido: ${stats1.triangles})`);

    // ---- Heap JS (CDP) ----
    const perfClient = await app.context.newCDPSession(app.page);
    await perfClient.send('Performance.enable');
    const { metrics } = await perfClient.send('Performance.getMetrics');
    const heapBytes = (metrics.find((m) => m.name === 'JSHeapUsedSize') || {}).value || 0;
    check(heapBytes > 0, `${label}: CDP mediu algum heap JS (sanity check, ${heapBytes}b)`);
    check(heapBytes <= BUDGET_HEAP_BYTES, `${label}: heap JS ≤ 250 MB (medido: ${(heapBytes / MB).toFixed(2)} MB)`);

    // ---- Render-on-demand: sem interação, o contador de frames não cresce ----
    // Os sistemas de segundo plano (músculos) chegam ~1,5 s depois de pronto
    // e redesenham uma vez — a ociosidade conta a partir daí.
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 20000 });
    await frame.waitForTimeout(300); // deixa qualquer tween/animação em curso (câmera, tickers) assentar
    const rendersBefore = (await frame.evaluate(() => window.__atlasPerf.getStats())).renders;
    await app.page.waitForTimeout(2000); // 2s sem nenhuma interação do teste
    const rendersAfter = (await frame.evaluate(() => window.__atlasPerf.getStats())).renders;
    check(rendersAfter === rendersBefore,
      `${label}: render-on-demand — a contagem de frames não cresce em 2s de ociosidade (antes: ${rendersBefore}, depois: ${rendersAfter})`);

    // ---- Render-on-demand DEPOIS de interagir ----
    // Foco por busca (tween de câmera + Raio-X), giro com o mouse (inércia),
    // rótulos ligados e troca de modos: quando tudo assenta, o 3D tem de
    // parar de redesenhar. Antes, o tween terminado ficava registrado e
    // puxava a câmera a cada quadro, e o ticker dos rótulos reagendava
    // quadros sem fim depois de qualquer giro.
    const settleIdle = async () => {
      // Espera assentar (inércia ≤ 1,2 s; navegador de teste é lento).
      for (let i = 0; i < 20; i++) {
        const a = (await frame.evaluate(() => window.__atlasPerf.getStats())).renders;
        await app.page.waitForTimeout(1500);
        const b = (await frame.evaluate(() => window.__atlasPerf.getStats())).renders;
        if (a === b) return { settled: true, renders: b };
      }
      return { settled: false, renders: (await frame.evaluate(() => window.__atlasPerf.getStats())).renders };
    };
    await frame.evaluate(() => {
      const I = window.__atlasInternals;
      const sid = I.contentStore.getIndex().find((s) => /heart/i.test(s.englishName || '')).sid;
      I.bus.emit(I.bus.EVENTS.STRUCTURE_SELECT, { sid, source: 'search' });
      window.AtlasShell.toggleLabels();
    });
    const box = await frame.locator('#atlas-canvas canvas').boundingBox();
    await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 10 });
    await app.page.mouse.up();
    await frame.evaluate(() => { window.AtlasShell.setMode('fisiologia'); window.AtlasShell.setMode('estudo'); });
    const idle = await settleIdle();
    check(idle.settled, `${label}: depois de focar, girar, ligar rótulos e trocar de modo, o 3D para de redesenhar (renders: ${idle.renders})`);
    const camBefore = await frame.evaluate(() => window.__atlasInternals.engine.camera.position.toArray());
    await app.page.waitForTimeout(1000);
    const camAfter = await frame.evaluate(() => window.__atlasInternals.engine.camera.position.toArray());
    check(camBefore.every((v, i) => v === camAfter[i]), `${label}: parada, a câmera fica onde o usuário deixou (não volta para o último foco)`);

    console.log(`  · ${label}: ${(bytes.total / MB).toFixed(2)} MB até pronto · ${stats1.drawCalls} draw calls · ${stats1.triangles} triângulos · ${(heapBytes / MB).toFixed(1)} MB heap · renders ${rendersBefore}→${rendersAfter}`);

    check(app.errors.length === 0, `${label}: sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

/**
 * Celular com rede limitada (presets do DevTools): do toque em Anatomia até
 * o esqueleto estar no corpo (tocável) — "Fast 3G" < 15 s (meta), "Slow 3G"
 * só relatório; e, com conexão lenta, os músculos NÃO baixam sozinhos (só
 * quando a camada for ligada).
 */
async function measureThrottled({ preset, name, budgetMs }) {
  const label = `390×844 em ${name}`;
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
  try {
    await app.login();
    const client = await app.context.newCDPSession(app.page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', { ...preset, connectionType: 'cellular3g' });
    // O throttle do CDP não muda navigator.connection.effectiveType; simula
    // o que um celular em 3G informa, para exercitar o caminho "sob demanda".
    await app.context.addInitScript(() => {
      try { Object.defineProperty(Navigator.prototype, 'connection', { configurable: true, get: () => ({ effectiveType: '3g', saveData: false }) }); } catch (e) { /* sem suporte */ }
    });
    const t0 = Date.now();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && I.DEFAULT_SYSTEMS.every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 120000, polling: 200 });
    const elapsed = Date.now() - t0;
    if (budgetMs) {
      check(elapsed < budgetMs, `${label} (preset do DevTools): esqueleto tocável em < ${budgetMs / 1000} s (medido: ${(elapsed / 1000).toFixed(1)} s)`);
    }
    const constrained = await frame.evaluate(() => /^(slow-2g|2g|3g)$/.test((navigator.connection || {}).effectiveType || ''));
    if (constrained) {
      await frame.waitForTimeout(3000);
      const st = await frame.evaluate(() => {
        const s = window.__atlasInternals.store.get();
        return { muscular: s.loadedSystems.includes('muscular'), musculos: s.layers.musculos.visible };
      });
      check(!st.muscular && !st.musculos, `${label}: conexão lenta não baixa os músculos sozinha e a camada fica desligada (${JSON.stringify(st)})`);
    }
    console.log(`  · ${label}: esqueleto em ${(elapsed / 1000).toFixed(1)} s${budgetMs ? '' : ' (só relatório, sem meta)'} (effectiveType 3g: ${constrained})`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasPerf() {
  await measureThrottled({ preset: FAST_3G, name: 'Fast 3G', budgetMs: BUDGET_3G_INTERACTIVE_MS });
  await measureThrottled({ preset: SLOW_3G, name: 'Slow 3G', budgetMs: null });
  await measureAtViewport({ width: 390, height: 844 });
  await measureAtViewport({ width: 1440, height: 900 });
};
