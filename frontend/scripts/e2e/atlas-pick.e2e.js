/**
 * atlas-pick.e2e.js — tocar/clicar no CORPO abre a estrutura (crime C2).
 * ---------------------------------------------------------------------------
 * Os outros cenários selecionam por evento do bus; este usa toque (celular)
 * e clique (desktop) de verdade no canvas, que passam pelo raycast do
 * Registry. Antes do hotfix, `registry.pick(ndc)` era chamado sem câmera e
 * devolvia null para todo toque — nenhuma estrutura abria pelo corpo 3D.
 *   1. Toque no meio do tronco seleciona alguma estrutura e a ficha abre.
 *   2. Em 5 sistemas (esquelético, muscular, cardiovascular, nervoso,
 *      digestório): a estrutura é isolada e enquadrada, e o toque no centro
 *      dela na tela seleciona exatamente ela e abre a ficha.
 */
const { startApp, check } = require('./harness');

const TARGETS = [
  ['esqueletico', 'za:femur-r'],
  ['muscular', 'za:acromial-part-of-deltoid-muscle-r'],
  ['cardiovascular', 'za:left-ventricle'],
  ['nervoso', 'za:white-matter-of-telencephalon-r'],
  ['digestorio', 'za:liver'],
];

async function tapAt(app, mobile, x, y) {
  if (mobile) await app.page.touchscreen.tap(x, y);
  else await app.page.mouse.click(x, y);
}

async function fichaName(frame) {
  return frame.evaluate(() => {
    const n = document.querySelector('#atlas-sheet .atlas-card-name, #atlas-inspector .atlas-card-name');
    return n && n.offsetParent !== null ? n.textContent : null;
  });
}

async function runAt(viewport) {
  const mobile = viewport.width < 600;
  const label = `${viewport.width}×${viewport.height}`;
  const app = await startApp({ role: 'member', viewport });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await frame.waitForFunction(() => {
      const I = window.__atlasInternals;
      return !!I && (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
    }, null, { timeout: 30000 });
    await frame.waitForTimeout(1200);
    const canvasBox = await frame.locator('#atlas-canvas canvas').boundingBox();

    // 1) Toque no tronco
    await tapAt(app, mobile, canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height * 0.42);
    await frame.waitForTimeout(800);
    const torso = await frame.evaluate(() => window.__atlasInternals.store.get().selectedSid);
    const torsoName = await fichaName(frame);
    check(!!torso && !!torsoName, `${label}: ${mobile ? 'tocar' : 'clicar'} no tronco seleciona uma estrutura e abre a ficha (${torso} → ${torsoName})`);

    // 2) Uma estrutura de cada sistema
    for (const [system, sid] of TARGETS) {
      const point = await frame.evaluate(async ({ system: sys, sid: s }) => {
        const I = window.__atlasInternals;
        if (!I.assetLoader.isLoaded(sys)) I.loadSystem(sys);
        const t0 = Date.now();
        while (!I.registry.getBySid(s) && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 200));
        const rec = I.registry.getBySid(s);
        if (!rec) return { error: `${s} não está no corpo` };
        const st = I.store.get();
        // Liga a camada da estrutura e isola: só ela fica tocável.
        const layers = { ...st.layers, [rec.layer]: { ...st.layers[rec.layer], visible: true } };
        I.store.set({ layers });
        I.bus.emit(I.bus.EVENTS.LAYER_SET, { layer: rec.layer, visible: true, opacity: 1 });
        I.bus.emit(I.bus.EVENTS.VISIBILITY_ISOLATE, { sid: s });
        I.engine.focusSid(s, { animate: false });
        await new Promise((r) => setTimeout(r, 300));
        const b = I.registry.getBBox(s);
        if (!b) return { error: `${s} sem bbox` };
        const THREE = I.engine.camera.position.constructor;
        // Painel recolhido no celular: o toque precisa cair no 3D, não na ficha.
        if (window.AtlasSheet && window.AtlasSheet.snapPeek) window.AtlasSheet.snapPeek();
        await new Promise((r) => setTimeout(r, 350));
        const v = (p, i) => (Array.isArray(p) ? p[i] : [p.x, p.y, p.z][i]);
        // Cantos da caixa projetados → retângulo na tela; procura numa grade
        // um ponto que o raycast acerte (o centro da caixa pode cair num vão,
        // ex.: substância branca em volta do ventrículo).
        const corners = [];
        for (const ix of [0, 1]) for (const iy of [0, 1]) for (const iz of [0, 1]) {
          corners.push(new THREE(v(ix ? b.max : b.min, 0), v(iy ? b.max : b.min, 1), v(iz ? b.max : b.min, 2)).project(I.engine.camera));
        }
        const xs = corners.map((c) => c.x); const ys = corners.map((c) => c.y);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const r = I.engine.renderer.domElement.getBoundingClientRect();
        const sheet = document.getElementById('atlas-sheet').getBoundingClientRect();
        for (let gy = 1; gy < 8; gy++) {
          for (let gx = 1; gx < 8; gx++) {
            const ndc = { x: x0 + (x1 - x0) * gx / 8, y: y0 + (y1 - y0) * gy / 8 };
            const px = r.left + (ndc.x + 1) / 2 * r.width;
            const py = r.top + (1 - ndc.y) / 2 * r.height;
            const underSheet = sheet.height > 0 && py > sheet.top && px > sheet.left && px < sheet.right;
            if (underSheet || px < r.left || px > r.right || py < r.top || py > r.bottom) continue;
            if (I.registry.pick(ndc) === s) return { x: px, y: py };
          }
        }
        return { error: `${s}: nenhum ponto visível na tela acerta a estrutura` };
      }, { system, sid });
      if (point.error || !Number.isFinite(point.x) || !Number.isFinite(point.y)) { check(false, `${label}: ${system} — ponto inválido ${JSON.stringify(point)}`); continue; }
      const frameBox = await (await frame.frameElement()).boundingBox();
      await tapAt(app, mobile, frameBox.x + point.x, frameBox.y + point.y);
      await frame.waitForTimeout(900);
      const got = await frame.evaluate(() => window.__atlasInternals.store.get().selectedSid);
      const name = await fichaName(frame);
      check(got === sid && !!name, `${label}: ${system} — ${mobile ? 'tocar' : 'clicar'} em ${sid} abre a ficha (selecionado: ${got}; ficha: ${name})`);
      await frame.evaluate(() => {
        const I = window.__atlasInternals;
        I.bus.emit(I.bus.EVENTS.VISIBILITY_RESET, {});
        I.store.set({ isolation: { active: 'none', sid: null } });
      });
    }
    if (!mobile) {
      // Todo caso do quiz tem a resposta no corpo (antes o arquivo HRA do
      // sexo substituía o Z-Anatomy e o estômago, por exemplo, sumia).
      const missing = await frame.evaluate(async () => {
        const I = window.__atlasInternals;
        const cases = await (await fetch('data/atlas/quiz-cases.json')).json();
        const out = [];
        for (const c of cases) {
          const sids = [].concat(c.correctSids || [], c.correctSid || []);
          const systems = new Set(sids.map((sid) => (I.contentStore.getEntry(sid) || {}).system).filter(Boolean));
          if (c.correctSystem) systems.add(c.correctSystem);
          for (const sys of systems) if (!I.assetLoader.isLoaded(sys)) await I.loadSystem(sys);
          const t0 = Date.now();
          let ok = false;
          while (!ok && Date.now() - t0 < 15000) {
            ok = sids.some((sid) => I.registry.getBySid(sid)) || (c.correctSystem && I.registry.getBySystem(c.correctSystem).length > 0);
            if (!ok) await new Promise((r) => setTimeout(r, 200));
          }
          if (!ok) out.push(c.id);
        }
        return out;
      });
      check(missing.length === 0, `todos os casos do quiz têm a resposta no corpo 3D${missing.length ? ' — faltando: ' + missing.join(', ') : ''}`);
    }
    check(app.errors.length === 0, `${label}: atlas-pick sem erros de JavaScript` + (app.errors.length ? ': ' + app.errors.join(' | ') : ''));
  } finally {
    await app.close();
  }
}

module.exports = async function atlasPick() {
  await runAt({ width: 390, height: 844 });
  await runAt({ width: 1280, height: 800 });
};
