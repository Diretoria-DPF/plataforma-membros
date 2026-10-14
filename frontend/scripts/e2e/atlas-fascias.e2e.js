/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-fascias.e2e.js — camada "Fáscias", pick que prefere a estrutura sob
 * a fáscia e o modo "somente fáscias" (decisão do dono, opção 2).
 * ---------------------------------------------------------------------------
 *   1. Painel de camadas: linha "Fáscias" (desligada na abertura) e botão
 *      "Somente fáscias" com aria-pressed.
 *   2. Camada desligada: nenhuma fáscia visível nem acertada pelo clique.
 *   3. Camada ligada: num ponto coberto por fáscia, o clique real seleciona a
 *      estrutura de baixo; clicar de novo no mesmo ponto seleciona a fáscia;
 *      e a seleção da fáscia acende o destaque (cor da instância).
 *   4. "Somente fáscias": todas as outras camadas somem, o clique só acerta
 *      fáscias, e sair do modo restaura o estado anterior.
 */
const { startApp, check } = require('./harness');

// #ffb020 (selection.js) em espaço linear: é assim que a cor fica na instância.
const HIGHLIGHT_RGB = [1, 0.434, 0.0144];

async function ready(frame) {
  await frame.waitForFunction(() => {
    const I = window.__atlasInternals;
    return !!I && (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
  }, null, { timeout: 60000 });
  await frame.waitForTimeout(1500);
}

const layerRow = (frame) => frame.evaluate(() => {
  const row = [...document.querySelectorAll('.atlas-layers-host .atlas-layers-row')].find((r) => /Fáscias/.test(r.textContent));
  const btn = document.querySelector('.atlas-layers-fascia-only');
  const sw = row && row.querySelector('.atlas-layers-toggle');
  return {
    hasRow: !!row,
    switchChecked: sw ? sw.getAttribute('aria-checked') : null,
    btnPressed: btn ? btn.getAttribute('aria-pressed') : null,
    btnLabel: btn ? btn.getAttribute('aria-label') : null,
    btnText: btn ? btn.textContent : null,
  };
});

/** Procura, numa grade sobre a caixa de `sid`, um ponto em que a fáscia cobre outra estrutura. */
async function findCoveredPoint(sid) {
  const M = await import('./vendor/three/three.module.js');
  const I = window.__atlasInternals;
  const b = I.registry.getBBox(sid);
  const THREE = I.engine.camera.position.constructor; // Vector3
  const cam = I.engine.camera;
  const corners = [];
  for (const ix of [0, 1]) for (const iy of [0, 1]) for (const iz of [0, 1]) {
    corners.push(new THREE(ix ? b.max[0] : b.min[0], iy ? b.max[1] : b.min[1], iz ? b.max[2] : b.min[2]).project(cam));
  }
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  I.registry.setPreferUnderFascia(false);
  const rawAt = {};
  const N = 14;
  for (let gy = 1; gy < N; gy++) for (let gx = 1; gx < N; gx++) {
    const ndc = { x: x0 + (x1 - x0) * gx / N, y: y0 + (y1 - y0) * gy / N };
    rawAt[`${gx},${gy}`] = { ndc, sid: I.registry.pick(ndc) };
  }
  I.registry.setPreferUnderFascia(true);
  for (const { ndc, sid: raw } of Object.values(rawAt)) {
    const rec = raw && I.registry.getBySid(raw);
    if (!rec || rec.layer !== 'fascias') continue;
    const under = I.registry.pick(ndc);
    if (under && under !== raw) {
      const cv = I.engine.renderer.domElement.getBoundingClientRect();
      // Ponto 3D na fáscia: a ficha muda o tamanho do canvas, então o 2º clique
      // é reprojetado a partir dele (o app compara pontos 3D, não pixels).
      const rc = new M.Raycaster();
      rc.setFromCamera(ndc, cam);
      const fb = I.engine.scene.children.find((o) => o.isBatchedMesh && o.name === 'layer:fascias');
      const hit = rc.intersectObject(fb, false).sort((p, q) => p.distance - q.distance)[0];
      const world = hit ? [hit.point.x, hit.point.y, hit.point.z] : null;
      return { ndc, fascia: raw, under, world, px: cv.left + (ndc.x + 1) / 2 * cv.width, py: cv.top + (1 - ndc.y) / 2 * cv.height };
    }
  }
  return null;
}

const highlightOf = (sid) => import('./vendor/three/three.module.js').then((THREE) => {
  const I = window.__atlasInternals;
  const rec = I.registry.getBySid(sid);
  if (!rec) return null;
  let out = null;
  const v = new THREE.Vector4();
  I.engine.scene.traverse((b) => {
    if (!b.isBatchedMesh || out) return;
    for (const [id, s] of b.userData.sidByInstance) {
      if (s === sid) { b.getColorAt(id, v); out = [v.x, v.y, v.z]; break; }
    }
  });
  return out;
});

const coveredPoint = (frame, sid) => frame.evaluate(findCoveredPoint, sid);

async function settle(frame) {
  for (let i = 0; i < 6; i++) {
    await frame.evaluate(() => window.__atlasInternals.engine.requestRender());
    await frame.waitForTimeout(500);
  }
}

async function reproject(frame, p) {
  return frame.evaluate((w) => {
    const I = window.__atlasInternals;
    const v = new (I.engine.camera.position.constructor)(w[0], w[1], w[2]).project(I.engine.camera);
    const cv = I.engine.renderer.domElement.getBoundingClientRect();
    return { px: cv.left + (v.x + 1) / 2 * cv.width, py: cv.top + (1 - v.y) / 2 * cv.height };
  }, p.world);
}

async function realClick(app, frame, p) {
  const box = await (await frame.frameElement()).boundingBox();
  await app.page.mouse.click(box.x + p.px, box.y + p.py);
  await frame.waitForTimeout(1200);
}

const selected = (frame) => frame.evaluate(() => window.__atlasInternals.store.get().selectedSid);

async function layersOpen(frame) {
  await frame.evaluate(() => window.AtlasShell.toggleLayers());
  await frame.waitForTimeout(500);
}

async function testPanelAndDefaults(frame) {
  await layersOpen(frame);
  const row = await layerRow(frame);
  check(row.hasRow, 'o painel de camadas tem a linha "Fáscias"');
  check(row.switchChecked === 'false', `Fáscias começa desligada (aria-checked=${row.switchChecked})`);
  check(row.btnPressed === 'false' && /fáscias/i.test(row.btnLabel || '') && row.btnText === 'Somente fáscias', 'botão "Somente fáscias" com rótulo acessível e aria-pressed=false');
  const stats = await frame.evaluate(() => {
    const I = window.__atlasInternals;
    const all = [...I.registry.iterate()].filter((s) => s.layer === 'fascias');
    return { total: all.length, visible: all.filter((s) => s.visible).length };
  });
  check(stats.total > 20, `fáscias registradas na camada própria (${stats.total})`);
  check(stats.visible === 0, `com a camada desligada nenhuma fáscia está visível (${stats.visible})`);
}

async function testCoveredPoint(app, frame) {
  await frame.evaluate(() => {
    const I = window.__atlasInternals;
    const layers = { ...I.store.get().layers, fascias: { visible: true, opacity: 0.45 } };
    I.store.set({ layers });
    I.bus.emit(I.bus.EVENTS.LAYER_SET, { layer: 'fascias', visible: true, opacity: 0.45 });
    I.bus.emit(I.bus.EVENTS.VIEW_PRESET, { name: 'anterior' });
  });
  await settle(frame);
  const spot = await coveredPoint(frame, 'za:fascia-lata-r');
  check(!!spot, `há ponto da coxa em que a fáscia cobre outra estrutura (${spot && spot.under})`);
  if (!spot) return;
  await realClick(app, frame, spot);
  const first = await selected(frame);
  check(first === spot.under, `1º clique seleciona a estrutura sob a fáscia (${first})`);
  await settle(frame);
  const again = spot.world ? { ...spot, ...(await reproject(frame, spot)) } : spot;
  await realClick(app, frame, again);
  const second = await selected(frame);
  const layer = await frame.evaluate((sid) => (window.__atlasInternals.registry.getBySid(sid) || {}).layer, second);
  check(layer === 'fascias', `clicar de novo no mesmo ponto seleciona a fáscia (${second})`);
  // O pulso de confirmação (400 ms) termina no destaque; o GL por software demora.
  await settle(frame);
  await settle(frame);
  const rgb = await frame.evaluate(highlightOf, second);
  check(!!rgb && rgb.every((c, i) => Math.abs(c - HIGHLIGHT_RGB[i]) < 0.12), `a fáscia selecionada fica com o destaque visível (${rgb && rgb.map((c) => c.toFixed(2))})`);
}

async function testOnlyFascias(app, frame) {
  await frame.evaluate(() => window.__atlasInternals.selection.select(null, 'api'));
  await frame.click('.atlas-layers-fascia-only');
  await frame.waitForTimeout(800);
  const on = await frame.evaluate(() => {
    const I = window.__atlasInternals;
    const vis = [...I.registry.iterate()].filter((s) => s.visible);
    return {
      pressed: document.querySelector('.atlas-layers-fascia-only').getAttribute('aria-pressed'),
      others: vis.filter((s) => s.layer !== 'fascias').length,
      fasciasVisible: vis.filter((s) => s.layer === 'fascias').length,
      opacity: I.store.get().layers.fascias.opacity,
    };
  });
  check(on.pressed === 'true', 'Somente fáscias: aria-pressed=true');
  check(on.others === 0 && on.fasciasVisible > 0, `Somente fáscias: só fáscias visíveis (${on.fasciasVisible} fáscias, ${on.others} de outras camadas)`);
  check(on.opacity === 1, 'Somente fáscias: fáscias opacas');
  const spot = await coveredPoint(frame, 'za:fascia-lata-r');
  const onlyFascia = await frame.evaluate(() => {
    const I = window.__atlasInternals;
    for (let i = -8; i <= 8; i++) {
      const sid = I.registry.pick({ x: i / 12, y: 0.1 });
      if (sid) return I.registry.getBySid(sid).layer;
    }
    return null;
  });
  check(spot === null, 'Somente fáscias: nenhum ponto tem estrutura sob a fáscia para preferir');
  check(onlyFascia === 'fascias', `Somente fáscias: o clique acerta fáscias (${onlyFascia})`);
  await frame.click('.atlas-layers-fascia-only');
  await frame.waitForTimeout(800);
  const off = await frame.evaluate(() => {
    const L = window.__atlasInternals.store.get().layers;
    return { musc: L.musculos.visible, esq: L.esqueleto.visible, fas: L.fascias.visible, pressed: document.querySelector('.atlas-layers-fascia-only').getAttribute('aria-pressed') };
  });
  check(off.musc && off.esq && off.fas && off.pressed === 'false', `sair do modo restaura as camadas de antes (${JSON.stringify(off)})`);
}

module.exports = async function atlasFascias() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    await testPanelAndDefaults(frame);
    await testCoveredPoint(app, frame);
    await testOnlyFascias(app, frame);
    check(app.errors.length === 0, 'atlas-fascias sem erros de JavaScript' + (app.errors.length ? `: ${app.errors.join(' | ')}` : ''));
  } finally {
    await app.close();
  }
};
