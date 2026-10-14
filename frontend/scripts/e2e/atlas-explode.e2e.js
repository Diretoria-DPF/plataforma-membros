/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * atlas-explode.e2e.js — vista "Separar peças" (explodida).
 * ---------------------------------------------------------------------------
 *   1. Sem custo no boot: o controlador, a matemática, o painel e o CSS só
 *      são baixados ao abrir (no boot ficam só o ponto de entrada e a cola do
 *      Registry).
 *   2. Controle discreto: item "Separar peças…" no menu "Mais opções" abre um
 *      painel acessível (diálogo, slider com rótulo e valor em PT-BR).
 *   3. Deslocamento radial correto nos DOIS lados (lote espelhado incluído):
 *      cada fêmur se afasta do plano sagital do corpo (para fora), em mundo.
 *   4. O pick acerta a peça na posição separada.
 *   5. "Juntar peças" devolve tudo à posição original; Esc fecha o painel.
 *   6. "Reduzir movimento": o deslocamento é aplicado direto (sem animação).
 *   7. Celular: painel inteiro na tela e slider com alvo de toque de 44px.
 */
const { startApp, check } = require('./harness');

const R = 'za:femur-r';
const L = 'za:femur-l';

async function ready(frame) {
  await frame.waitForFunction(() => {
    const I = window.__atlasInternals;
    return !!I && (I.BACKGROUND_SYSTEMS || []).every((s) => I.store.get().loadedSystems.includes(s));
  }, null, { timeout: 60000 });
  await frame.waitForTimeout(1500);
}

/** Posição em mundo (translação) da 1ª instância de `sid` + centro da caixa do Registry. */
const probe = (frame, sid) => frame.evaluate((id) => {
  const I = window.__atlasInternals;
  let pos = null;
  I.engine.scene.traverse((b) => {
    if (!b.isBatchedMesh || pos) return;
    for (const [inst, s] of b.userData.sidByInstance) {
      if (s !== id) continue;
      const m = b.matrixWorld.clone();
      const mi = b.matrixWorld.clone();
      b.getMatrixAt(inst, mi);
      m.multiply(mi);
      pos = [m.elements[12], m.elements[13], m.elements[14]];
      break;
    }
  });
  const box = I.registry.getBBox(id);
  return { pos, center: box ? box.min.map((v, i) => (v + box.max[i]) / 2) : null };
}, sid);

const setSlider = (frame, value) => frame.evaluate((v) => {
  const r = document.getElementById('atlas-explode-range');
  r.value = String(v);
  r.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

async function openFromMenu(frame) {
  await frame.evaluate(() => window.AtlasShell.openMoreMenu());
  await frame.waitForTimeout(300);
  const item = frame.locator('.atlas-dropdown button', { hasText: 'Separar peças' });
  check(await item.count() === 1, 'o menu "Mais opções" tem o item "Separar peças…"');
  await item.click();
  await frame.waitForSelector('#atlas-explode-range', { timeout: 15000 });
}

const resourceNames = (frame) => frame.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name));

async function checkDeltas(frame, before) {
  await frame.waitForTimeout(3000); // GL por software: a animação leva alguns quadros
  const [r1, l1] = [await probe(frame, R), await probe(frame, L)];
  const dr = r1.pos.map((v, i) => v - before.r.pos[i]);
  const dl = l1.pos.map((v, i) => v - before.l.pos[i]);
  const bboxDr = r1.center.map((v, i) => v - before.r.center[i]);
  const bboxDl = l1.center.map((v, i) => v - before.l.center[i]);
  // O lado direito do paciente fica em -X (VIEW_PRESETS); cada fêmur deve se afastar do plano sagital.
  const outR = dr[0] * Math.sign(before.r.center[0]);
  const outL = dl[0] * Math.sign(before.l.center[0]);
  check(before.r.center[0] * before.l.center[0] < 0, 'os dois fêmures ficam em lados opostos do corpo');
  check(outR > 0.02, `fêmur direito se afasta do centro em X (Δ para fora = ${outR.toFixed(3)})`);
  check(outL > 0.02, `fêmur esquerdo (lote espelhado) também se afasta do centro em X (Δ para fora = ${outL.toFixed(3)})`);
  check(Math.abs(dr[0] - bboxDr[0]) < 1e-3 && Math.abs(dl[0] - bboxDl[0]) < 1e-3, 'a caixa do Registry acompanha a peça separada (rótulos/foco)');
  check(Math.abs(outL - outR) < 0.05, 'simetria: os dois lados andam quase o mesmo');
  return { r1, l1 };
}

async function checkPick(frame) {
  await frame.evaluate(() => {
    const I = window.__atlasInternals;
    const layers = {};
    for (const [k, v] of Object.entries(I.store.get().layers)) layers[k] = { ...v, visible: k === 'esqueleto' };
    I.store.set({ layers });
    for (const k of Object.keys(layers)) I.bus.emit(I.bus.EVENTS.LAYER_SET, { layer: k, visible: layers[k].visible, opacity: layers[k].opacity });
    I.bus.emit(I.bus.EVENTS.VIEW_PRESET, { name: 'anterior' });
  });
  await frame.waitForTimeout(3500);
  const hits = await frame.evaluate(({ R: idR, L: idL }) => {
    const I = window.__atlasInternals;
    const V = I.engine.camera.position.constructor;
    const out = {};
    for (const id of [idR, idL]) {
      const b = I.registry.getBBox(id);
      const c = new V((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2).project(I.engine.camera);
      let found = null;
      for (let dy = -0.12; dy <= 0.12 && !found; dy += 0.03) {
        for (let dx = -0.04; dx <= 0.04 && !found; dx += 0.01) if (I.registry.pick({ x: c.x + dx, y: c.y + dy }) === id) found = { dx, dy };
      }
      out[id] = found;
    }
    return out;
  }, { R, L });
  check(!!hits[R] && !!hits[L], `o pick acerta o fêmur direito e o esquerdo na posição separada (${JSON.stringify(hits)})`);
}

async function runDesktop() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);

    const LAZY = /explode(-math|-panel)?.(js|css)$/i;
    const early = (await resourceNames(frame)).filter((n) => LAZY.test(n) && !/explode-entry|registry-explode/.test(n));
    check(early.length === 0, `controlador, matemática, painel e CSS da vista não são baixados no boot (${early.map((n) => n.split('/').pop()).join(', ') || 'nenhum'})`);

    const before = { r: await probe(frame, R), l: await probe(frame, L) };
    await openFromMenu(frame);
    const late = (await resourceNames(frame)).filter((n) => /explode/i.test(n));
    check(late.length >= 5, `ao abrir, a vista carrega sob demanda (${late.map((n) => n.split('/').pop()).join(', ')})`);

    const dlg = await frame.evaluate(() => {
      const host = document.querySelector('.atlas-explode-host');
      const range = document.getElementById('atlas-explode-range');
      return {
        role: host.getAttribute('role'), label: host.getAttribute('aria-label'), hidden: host.hidden,
        labelFor: !!document.querySelector('label[for="atlas-explode-range"]'),
        valuetext: range.getAttribute('aria-valuetext'),
        focused: document.activeElement === range,
        join: document.querySelector('.atlas-explode-join').disabled,
      };
    });
    check(dlg.role === 'dialog' && dlg.label === 'Separar peças' && !dlg.hidden, 'painel é um diálogo "Separar peças"');
    check(dlg.labelFor && dlg.valuetext === 'Peças juntas' && dlg.focused, `slider com rótulo, aria-valuetext e foco (${dlg.valuetext})`);
    check(dlg.join === true, '"Juntar peças" desabilitado enquanto está tudo junto');

    await setSlider(frame, 70);
    const { r1 } = await checkDeltas(frame, before);
    const txt = await frame.evaluate(() => document.getElementById('atlas-explode-range').getAttribute('aria-valuetext'));
    check(txt === 'Peças 70% separadas', `aria-valuetext acompanha o valor (${txt})`);
    await checkPick(frame);

    await frame.click('.atlas-explode-join');
    await frame.waitForTimeout(3500);
    const back = await probe(frame, R);
    const moved = Math.hypot(...back.pos.map((v, i) => v - before.r.pos[i]));
    check(moved < 1e-3 && r1.pos[0] !== back.pos[0], `"Juntar peças" devolve a peça à posição original (resíduo ${moved.toExponential(1)})`);

    await app.page.keyboard.press('Escape');
    const hidden = await frame.evaluate(() => document.querySelector('.atlas-explode-host').hidden);
    check(hidden === true, 'Esc fecha o painel');
    check(app.errors.length === 0, 'atlas-explode (desktop) sem erros de JavaScript' + (app.errors.length ? `: ${app.errors.join(' | ')}` : ''));
  } finally {
    await app.close();
  }
}

async function runReducedMotion() {
  const app = await startApp({ role: 'member', viewport: { width: 1280, height: 800 } });
  try {
    await app.page.emulateMedia({ reducedMotion: 'reduce' });
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    const before = await probe(frame, R);
    await openFromMenu(frame);
    await setSlider(frame, 100);
    const after = await probe(frame, R); // sem esperar: sem animação, já está no alvo
    const out = (after.pos[0] - before.pos[0]) * Math.sign(before.center[0]);
    check(out > 0.02, `reduzir movimento: o deslocamento é imediato, sem animação (Δ para fora = ${out.toFixed(3)})`);
  } finally {
    await app.close();
  }
}

async function runMobile() {
  const app = await startApp({ role: 'member', viewport: { width: 390, height: 844 } });
  try {
    await app.login();
    const frame = await app.openModule('anatomia');
    await ready(frame);
    await frame.evaluate(() => window.AtlasShell.toggleExplode());
    await frame.waitForSelector('#atlas-explode-range', { timeout: 15000 });
    await frame.waitForTimeout(400);
    const m = await frame.evaluate(() => {
      const host = document.querySelector('.atlas-explode-host').getBoundingClientRect();
      const range = document.getElementById('atlas-explode-range').getBoundingClientRect();
      const join = document.querySelector('.atlas-explode-join').getBoundingClientRect();
      return { left: host.left, right: host.right, top: host.top, bottom: host.bottom, w: innerWidth, h: innerHeight, rangeH: range.height, joinH: join.height };
    });
    check(m.left >= 0 && m.right <= m.w && m.top >= 0 && m.bottom <= m.h, `celular: painel inteiro na tela (${JSON.stringify(m)})`);
    check(m.rangeH >= 44 && m.joinH >= 44, `celular: alvos de toque ≥ 44px (slider ${m.rangeH}px, botão ${m.joinH}px)`);
  } finally {
    await app.close();
  }
}

module.exports = async function atlasExplode() {
  await runDesktop();
  await runReducedMotion();
  await runMobile();
};
