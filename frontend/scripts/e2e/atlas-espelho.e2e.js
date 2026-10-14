/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-espelho.e2e.js — o que se clica é o que aparece (peças espelhadas).
 * ---------------------------------------------------------------------------
 * Regressão do bug "clico e só metade do corpo sinaliza" (diagnóstico de
 * cliques, 2026-10-13): as peças do lado espelhado (matriz com determinante
 * negativo) eram desenhadas "por dentro" num BatchedMesh comum, enquanto o
 * raycast acertava a face de fora — o clique escolhia uma estrutura cujo
 * destaque não aparecia onde se clicou.
 *   1. Determinístico: em cada BatchedMesh da cena, a matriz-mundo efetiva de
 *      toda instância tem determinante negativo se e somente se o batch tem
 *      scale.x < 0 (nenhuma peça espelhada num batch comum).
 *   2. Orçamento: draw calls dentro do limite do UX spec (§17: 150).
 *   3. Mapa de IDs × pick: renderiza cada instância com uma cor-ID (mesmo
 *      culling), amostra uma grade sobre o corpo e confere que a estrutura
 *      que o clique devolve é a que aparece ali — com limiar de 75% em CADA
 *      metade da tela, nas vistas frontal e posterior (antes: 13% numa metade).
 * O GL por software (SwiftShader) leva ~1 s/quadro: a câmera é esperada até
 * estabilizar e o limiar tem folga para silhueta e empate de camada.
 */
const { startApp, check } = require('./harness');

const HALF_THRESHOLD = 0.75; // acerto mínimo por metade da tela
const MIN_POINTS_PER_HALF = 30; // grade precisa ter amostra relevante
const DRAW_CALL_BUDGET = 150; // docs/ATLAS_UX_SPEC.md §17
const GRID = { cols: 30, rows: 44 };
const VIEWS = ['anterior', 'posterior'];

async function waitRender(frame, n) {
  await frame.evaluate(async (count) => {
    const I = window.__atlasInternals;
    const s0 = window.__atlasPerf.getStats().renders;
    const t0 = Date.now();
    while (window.__atlasPerf.getStats().renders < s0 + count && Date.now() - t0 < 25000) {
      I.engine.requestRender();
      await new Promise((r) => setTimeout(r, 60));
    }
  }, n);
}

const cameraPose = (frame) => frame.evaluate(() => {
  const c = window.__atlasInternals.engine.camera;
  c.updateMatrixWorld();
  return c.matrixWorld.elements.map((v) => v.toFixed(4)).join(',');
});

async function settleCamera(frame) {
  let stable = 0;
  let last = null;
  for (let i = 0; i < 80 && stable < 3; i++) {
    await waitRender(frame, 3);
    const pose = await cameraPose(frame);
    stable = pose === last ? stable + 1 : 0;
    last = pose;
  }
  return last;
}

/** Conta instâncias no lote errado e mede o orçamento de batches. */
function auditBatches() {
  return import('./vendor/three/three.module.js').then((THREE) => {
    const M = new THREE.Matrix4();
    const out = { batches: 0, mirrorBatches: 0, wrong: 0, instances: 0 };
    window.__atlasInternals.engine.scene.traverse((b) => {
      if (!b.isBatchedMesh) return;
      out.batches += 1;
      b.updateMatrixWorld(true);
      const mirrorBatch = b.scale.x < 0;
      if (mirrorBatch) out.mirrorBatches += 1;
      for (const id of b.userData.sidByInstance.keys()) {
        b.getMatrixAt(id, M);
        M.premultiply(b.matrixWorld);
        out.instances += 1;
        if ((M.determinant() < 0) !== mirrorBatch) out.wrong += 1;
      }
    });
    return out;
  });
}

/** Troca o material dos batches por cor-ID (uma por instância); guarda como restaurar. */
function paintIdMap() {
  return import('./vendor/three/three.module.js').then((THREE) => {
    const I = window.__atlasInternals;
    const r = I.engine.renderer;
    const saved = [];
    const mats = [];
    const ids = [];
    const v = new THREE.Vector4();
    const tone = { tm: r.toneMapping, cs: r.outputColorSpace };
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    I.engine.scene.traverse((b) => {
      if (!b.isBatchedMesh) return;
      mats.push([b, b.material]);
      b.material = new THREE.MeshBasicMaterial({ color: 0xffffff, side: b.material.side });
      for (const [id, sid] of b.userData.sidByInstance) {
        b.getColorAt(id, v);
        saved.push([b, id, v.clone()]);
        ids.push(sid);
        const gid = ids.length;
        b.setColorAt(id, new THREE.Vector4((gid & 255) / 255, ((gid >> 8) & 255) / 255, 0, 1));
      }
    });
    const bg = I.engine.scene.background;
    I.engine.scene.background = new THREE.Color(0x000000);
    window.__idMap = {
      ids,
      restore() {
        for (const [b, id, c] of saved) b.setColorAt(id, c);
        for (const [b, m] of mats) b.material = m;
        r.toneMapping = tone.tm;
        r.outputColorSpace = tone.cs;
        I.engine.scene.background = bg;
        I.engine.requestRender();
      },
    };
    return ids.length;
  });
}

/** Lê o PNG do mapa de IDs no frame e compara com registry.pick numa grade. */
function compareGrid({ png, cols, rows }) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const data = g.getImageData(0, 0, img.width, img.height).data;
      const I = window.__atlasInternals;
      const cam = I.engine.camera;
      const cv = I.engine.renderer.domElement;
      const idAt = (x, y) => {
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) return 0;
        const i = (y * img.width + x) * 4;
        return data[i] + data[i + 1] * 256;
      };
      const half = { left: { ok: 0, n: 0 }, right: { ok: 0, n: 0 } };
      for (let r = 0; r < rows; r++) {
        for (let k = 0; k < cols; k++) {
          const nx = -0.55 + 1.1 * (k + 0.5) / cols;
          const ny = 0.95 - 1.9 * (r + 0.5) / rows;
          const sx = Math.round((nx + 1) / 2 * cv.clientWidth);
          const sy = Math.round((1 - ny) / 2 * cv.clientHeight);
          const ids = [];
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) ids.push(idAt(sx + dx, sy + dy));
          if (!ids[4] || !ids.every((v) => v === ids[4])) continue; // fundo ou borda de silhueta
          const side = nx < 0 ? half.left : half.right;
          side.n += 1;
          if (window.__idMap.ids[ids[4] - 1] === I.registry.pick({ x: nx, y: ny }, cam)) side.ok += 1;
        }
      }
      window.__idMap.restore();
      resolve(half);
    };
    img.src = `data:image/png;base64,${png}`;
  });
}

async function measureView(app, frame, view) {
  await frame.evaluate((name) => {
    const I = window.__atlasInternals;
    I.bus.emit(I.bus.EVENTS.VIEW_PRESET, { name });
  }, view);
  await frame.waitForTimeout(1500);
  const pose0 = await settleCamera(frame);
  await waitRender(frame, 3);
  await frame.evaluate(paintIdMap);
  await waitRender(frame, 3);
  const box = await frame.locator('#atlas-canvas canvas').boundingBox();
  const png = (await app.page.screenshot({ clip: box, type: 'png' })).toString('base64');
  const drift = (await cameraPose(frame)) !== pose0;
  const half = await frame.evaluate(compareGrid, { png, cols: GRID.cols, rows: GRID.rows });
  return { half, drift };
}

module.exports = async function atlasEspelho() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 60000 });
    await frame.waitForTimeout(1500);

    const audit = await frame.evaluate(auditBatches);
    check(audit.instances > 0 && audit.mirrorBatches > 0, `há peças espelhadas em lote próprio (${audit.mirrorBatches} lotes espelhados, ${audit.instances} instâncias)`);
    check(audit.wrong === 0, `nenhuma instância no lote errado: espelhada em batch comum ou o contrário (${audit.wrong})`);
    check(audit.batches <= DRAW_CALL_BUDGET, `lotes (≈ draw calls) dentro do orçamento: ${audit.batches} ≤ ${DRAW_CALL_BUDGET}`);

    for (const view of VIEWS) {
      const { half, drift } = await measureView(app, frame, view);
      check(!drift, `${view}: câmera estável durante a medição`);
      for (const side of ['left', 'right']) {
        const { ok, n } = half[side];
        const rate = n ? ok / n : 0;
        check(n >= MIN_POINTS_PER_HALF, `${view}/${side}: amostra suficiente (${n} pontos)`);
        check(rate >= HALF_THRESHOLD, `${view}/${side}: clique == peça que aparece em ${(rate * 100).toFixed(0)}% (≥ ${HALF_THRESHOLD * 100}%)`);
      }
    }
    check(app.errors.length === 0, 'atlas-espelho sem erros de JavaScript' + (app.errors.length ? `: ${app.errors.join(' | ')}` : ''));
  } finally {
    await app.close();
  }
};
