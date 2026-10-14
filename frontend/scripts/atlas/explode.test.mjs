#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * explode.test.mjs — vista "Separar peças": matemática pura, deslocamento nas
 * instâncias do Registry real (inclusive o lote espelhado), pick na posição
 * separada e o controlador (animação, escopo, reduzir movimento, reset).
 * Roda com: node frontend/scripts/atlas/explode.test.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = path.resolve(here, '../../modulos/anatomia-3d');
const url = (rel) => pathToFileURL(path.join(mod, rel)).href;
const THREE = await import(url('vendor/three/three.module.js'));
const math = await import(url('js/engine/explode-math.js'));
const { createRegistry } = await import(url('js/engine/registry.js'));
const { createExplode } = await import(url('js/engine/explode.js'));
const { EVENTS, on, emit } = await import(url('js/core/bus.js'));
const panel = await import(url('js/ui/explode-panel.js'));

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

console.log('explode-math');
test('amount 0 não desloca nada; deslocamento cresce com amount', () => {
  assert.deepEqual(math.radialOffset([0, 0, 0], [1, 0, 0], 0, 1), [0, 0, 0]);
  const half = math.radialOffset([0, 0, 0], [1, 0, 0], 0.5, 1);
  const full = math.radialOffset([0, 0, 0], [1, 0, 0], 1, 1);
  assert.ok(full[0] > half[0] && half[0] > 0);
  assert.ok(near(full[1], 0) && near(full[2], 0));
});
test('o deslocamento é radial: aponta de centro → peça', () => {
  const o = math.radialOffset([0, 1, 0], [0, 1, -2], 1, 1);
  assert.ok(o[2] < 0 && near(o[0], 0) && near(o[1], 0));
});
test('camadas superficiais andam mais que as profundas', () => {
  const skin = math.radialOffset([0, 0, 0], [0, 0, 1], 1, math.layerWeight('pele'));
  const organ = math.radialOffset([0, 0, 0], [0, 0, 1], 1, math.layerWeight('visceras'));
  assert.ok(skin[2] > organ[2] * 2);
  assert.equal(math.layerWeight('desconhecida'), 0.5);
});
test('peça no próprio centro anda numa direção estável (não NaN)', () => {
  const a = math.radialOffset([1, 1, 1], [1, 1, 1], 1, 1, 3);
  const b = math.radialOffset([1, 1, 1], [1, 1, 1], 1, 1, 3);
  assert.deepEqual(a, b);
  assert.ok(a.every(Number.isFinite) && Math.hypot(...a) > 0);
});
test('computeExplodeOffsets: modo corpo = 1 deslocamento por estrutura; modo órgão = por parte', () => {
  const items = [
    { sid: 'a', layer: 'pele', center: [1, 0, 0], parts: [[1, 0, 0]] },
    { sid: 'b', layer: 'esqueleto', center: [0, 2, 0], parts: [[0, 2, 0], [0, 2.2, 0]] },
  ];
  const body = math.computeExplodeOffsets(items, { center: [0, 0, 0], amount: 1, mode: 'corpo' });
  assert.equal(body.size, 2);
  assert.equal(body.get('b').length, 3);
  const organ = math.computeExplodeOffsets([items[1]], { center: [0, 2.1, 0], amount: 1, mode: 'orgao' });
  assert.equal(organ.get('b').length, 2);
  assert.ok(organ.get('b')[0][1] < 0 && organ.get('b')[1][1] > 0, 'as partes se afastam em sentidos opostos');
  assert.equal(math.computeExplodeOffsets(items, { center: [0, 0, 0], amount: 0 }).size, 0);
});
test('approach converge ao alvo, independe da taxa de quadros e encosta (done)', () => {
  let cur = 0;
  let done = false;
  for (let i = 0; i < 200 && !done; i++) ({ value: cur, done } = math.approach(cur, 1, 16));
  assert.equal(cur, 1);
  assert.equal(done, true);
  const one = math.approach(0, 1, 100).value;
  let two = math.approach(0, 1, 50);
  two = math.approach(two.value, 1, 50).value;
  assert.ok(near(one, two, 1e-9));
});
test('percentToAmount limita a 0..1; unionBoxes ignora caixas inválidas', () => {
  assert.equal(math.percentToAmount(150), 1);
  assert.equal(math.percentToAmount(-5), 0);
  assert.equal(math.percentToAmount('abc'), 0);
  const u = math.unionBoxes([{ min: [0, 0, 0], max: [1, 1, 1] }, null, { min: [NaN, 0, 0], max: [1, 1, 1] }, { min: [-1, 0, 0], max: [0, 2, 1] }]);
  assert.deepEqual(u, { min: [-1, 0, 0], max: [1, 2, 1] });
  assert.equal(math.unionBoxes([]), null);
});

console.log('registry + lote espelhado');
function buildScene() {
  const geo = new THREE.SphereGeometry(0.2, 24, 16);
  const root = new THREE.Group();
  const mk = (name, x, sx) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    m.name = name;
    m.position.set(x, 1, 0);
    m.scale.set(sx, 1, 1);
    root.add(m);
  };
  mk('Peca.r', 0.5, 1);
  mk('Peca.l', -0.5, -1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 1, 4);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const registry = createRegistry({ engine: { scene, camera, requestRender() {} } });
  registry.registerSystem('muscular', { root, nodeToSid: { 'Peca.r': 'za:peca-r', 'Peca.l': 'za:peca-l' }, sex: 'U', lod: 'lod1' });
  scene.updateMatrixWorld(true);
  return { registry, scene, camera };
}
const worldCenter = (scene, sid) => {
  const b = scene.children.filter((o) => o.isBatchedMesh).find((x) => [...x.userData.sidByInstance.values()].includes(sid));
  const id = [...b.userData.sidByInstance].find(([, s]) => s === sid)[0];
  const m = new THREE.Matrix4();
  b.getMatrixAt(id, m);
  m.premultiply(b.matrixWorld);
  return new THREE.Vector3().setFromMatrixPosition(m);
};

test('getExplodeItems lista as duas peças com centro e partes', () => {
  const { registry } = buildScene();
  const items = registry.getExplodeItems();
  assert.equal(items.length, 2);
  const left = items.find((i) => i.sid === 'za:peca-l');
  assert.ok(near(left.center[0], -0.5, 1e-3) && near(left.center[1], 1, 1e-3));
  assert.equal(left.parts, undefined, 'o corpo todo não calcula partes (custo por input do slider)');
  assert.equal(registry.getExplodeParts('za:peca-l').length, 1);
});
test('deslocamento em mundo vale igual nos dois lotes (o espelhado multiplica por MIRROR_X)', () => {
  const { registry, scene } = buildScene();
  const before = { r: worldCenter(scene, 'za:peca-r'), l: worldCenter(scene, 'za:peca-l') };
  registry.setExplodeOffsets(new Map([['za:peca-r', [0.3, 0.1, 0]], ['za:peca-l', [-0.3, 0.1, 0]]]));
  scene.updateMatrixWorld(true);
  const after = { r: worldCenter(scene, 'za:peca-r'), l: worldCenter(scene, 'za:peca-l') };
  assert.ok(near(after.r.x - before.r.x, 0.3) && near(after.r.y - before.r.y, 0.1));
  assert.ok(near(after.l.x - before.l.x, -0.3), `esquerda deveria andar -0,3 em X (andou ${after.l.x - before.l.x})`);
  assert.ok(near(after.l.y - before.l.y, 0.1));
});
test('o pick acerta a peça na posição separada (e não na de repouso)', () => {
  const { registry, camera } = buildScene();
  const ndcAt = (x) => { const p = new THREE.Vector3(x, 1, 0).project(camera); return { x: p.x, y: p.y }; };
  registry.setExplodeOffsets(new Map([['za:peca-l', [-0.6, 0, 0]], ['za:peca-r', [0.6, 0, 0]]]));
  assert.equal(registry.pick(ndcAt(-1.1)), 'za:peca-l');
  assert.equal(registry.pick(ndcAt(1.1)), 'za:peca-r');
  assert.equal(registry.pick(ndcAt(-0.5)), null, 'na posição de repouso não há mais nada');
});
test('sem draw calls extras: continuam dois lotes', () => {
  const { registry, scene } = buildScene();
  registry.setExplodeOffsets(new Map([['za:peca-r', [0.3, 0, 0]]]));
  assert.equal(scene.children.filter((o) => o.isBatchedMesh).length, 2);
});
test('getBBox segue a peça; null devolve tudo à posição original', () => {
  const { registry, scene } = buildScene();
  const rest = registry.getBBox('za:peca-r');
  registry.setExplodeOffsets(new Map([['za:peca-r', [0.3, 0, 0]]]));
  assert.ok(near(registry.getBBox('za:peca-r').min[0] - rest.min[0], 0.3));
  registry.setExplodeOffsets(null);
  assert.deepEqual(registry.getBBox('za:peca-r'), rest);
  scene.updateMatrixWorld(true);
  assert.ok(near(worldCenter(scene, 'za:peca-l').x, -0.5, 1e-3));
});
test('estrutura que sai do mapa volta à posição original', () => {
  const { registry, scene } = buildScene();
  registry.setExplodeOffsets(new Map([['za:peca-r', [0.3, 0, 0]], ['za:peca-l', [-0.3, 0, 0]]]));
  registry.setExplodeOffsets(new Map([['za:peca-r', [0.3, 0, 0]]]));
  scene.updateMatrixWorld(true);
  assert.ok(near(worldCenter(scene, 'za:peca-l').x, -0.5, 1e-3));
});

console.log('controlador');
function controller({ reduced = false, isolation = { active: 'none', sid: null }, items, onChange } = {}) {
  const calls = [];
  const tickers = [];
  const registry = {
    getExplodeItems: () => items || [
      { sid: 'a', layer: 'pele', center: [1, 1, 0], box: { min: [0.5, 0.5, -0.5], max: [1.5, 1.5, 0.5] }, parts: [[1, 1, 0]] },
      { sid: 'b', layer: 'esqueleto', center: [-1, 1, 0], box: { min: [-1.5, 0.5, -0.5], max: [-0.5, 1.5, 0.5] }, parts: [[-1, 1, 0]] },
    ],
    setExplodeOffsets: (m) => calls.push(m),
  };
  const state = { isolation };
  const ctl = createExplode({
    registry,
    store: { get: () => state },
    bus: { on, EVENTS },
    addTicker: (fn) => { tickers.push(fn); return () => tickers.splice(tickers.indexOf(fn), 1); },
    requestRender() {},
    reducedMotion: () => reduced,
    onChange,
  });
  return { ctl, calls, tickers, state };
}
const runTicks = (tickers, n = 200) => { for (let i = 0; i < n && tickers.length; i++) tickers[0](16); };

test('sem usar, não há ticker nem matriz alterada (custo zero)', () => {
  const { ctl, calls, tickers } = controller();
  assert.equal(tickers.length, 0);
  assert.equal(calls.length, 0);
  assert.equal(ctl.isActive(), false);
  ctl.dispose();
});
test('animação: ticker suaviza até o alvo e some; as peças se afastam do centro do corpo', () => {
  const { ctl, calls, tickers } = controller();
  ctl.setAmount(1);
  assert.equal(tickers.length, 1);
  runTicks(tickers);
  assert.equal(tickers.length, 0, 'o ticker se remove ao chegar');
  const last = calls[calls.length - 1];
  assert.ok(last.get('a')[0] > 0, 'a (x=+1) vai para +x');
  assert.ok(last.get('b')[0] < 0, 'b (x=-1) vai para -x');
  assert.ok(Math.abs(last.get('a')[0]) > Math.abs(last.get('b')[0]), 'a (pele) anda mais que b (esqueleto)');
  ctl.dispose();
});
test('prefers-reduced-motion: salta direto, sem ticker', () => {
  const { ctl, calls, tickers } = controller({ reduced: true });
  ctl.setAmount(0.6);
  assert.equal(tickers.length, 0);
  assert.ok(calls[calls.length - 1] instanceof Map && calls[calls.length - 1].size === 2);
  ctl.dispose();
});
test('zerar volta ao normal (null) e reset() também; Centralizar e sair do Explorar desfazem', () => {
  const { ctl, calls } = controller({ reduced: true });
  ctl.setAmount(1);
  ctl.setAmount(0);
  assert.equal(calls[calls.length - 1], null);
  ctl.setAmount(1);
  emit(EVENTS.VIEW_RESET, {});
  assert.equal(calls[calls.length - 1], null);
  assert.equal(ctl.isActive(), false);
  ctl.setAmount(1);
  emit(EVENTS.MODE_CHANGE, { mode: 'quiz' });
  assert.equal(calls[calls.length - 1], null);
  ctl.dispose();
});
test('estrutura isolada vira o centro: escopo "orgao"; com uma peça só, avisa que não separa', () => {
  const items = [{ sid: 'x', layer: 'visceras', center: [0, 1, 0], box: { min: [-1, 0, -1], max: [1, 2, 1] }, parts: [[-0.5, 1, 0], [0.5, 1, 0]] }];
  const a = controller({ reduced: true, isolation: { active: 'isolate', sid: 'x' }, items });
  a.ctl.setAmount(1);
  const offs = a.calls[a.calls.length - 1].get('x');
  assert.ok(offs[0][0] < 0 && offs[1][0] > 0);
  assert.equal(a.ctl.getInfo().mode, 'orgao');
  assert.equal(a.ctl.getInfo().separable, true);
  a.ctl.dispose();
  const one = [{ ...items[0], parts: [[0, 1, 0]] }];
  const b = controller({ reduced: true, isolation: { active: 'isolate', sid: 'x' }, items: one });
  assert.equal(b.ctl.getInfo().separable, false);
  b.ctl.dispose();
});
test('avisa os rótulos (onChange) a cada gravação e ao juntar', () => {
  let n = 0;
  const { ctl } = controller({ reduced: true, onChange: () => { n += 1; } });
  ctl.setAmount(0.5);
  assert.equal(n, 1);
  ctl.setAmount(0);
  assert.equal(n, 2);
  ctl.setAmount(0.8);
  ctl.reset();
  assert.equal(n, 4);
  ctl.dispose();
});
test('só a estrutura isolada pede as partes ao Registry; os itens do corpo são reaproveitados', () => {
  const counts = { items: 0, parts: 0 };
  const registry = {
    getExplodeItems: () => { counts.items += 1; return [
      { sid: 'a', layer: 'pele', center: [1, 1, 0], box: { min: [0, 0, 0], max: [2, 2, 1] } },
      { sid: 'b', layer: 'esqueleto', center: [-1, 1, 0], box: { min: [-2, 0, 0], max: [0, 2, 1] } },
    ]; },
    getExplodeParts: () => { counts.parts += 1; return [[1, 1, 0], [1.2, 1, 0]]; },
    setExplodeOffsets() {},
  };
  const state = { isolation: { active: 'none', sid: null } };
  const ctl = createExplode({ registry, store: { get: () => state }, bus: { on, EVENTS }, addTicker: () => () => {}, requestRender() {}, reducedMotion: () => true });
  for (const v of [0.1, 0.2, 0.3, 0.4]) ctl.setAmount(v);
  assert.equal(counts.items, 1);
  assert.equal(counts.parts, 0);
  state.isolation = { active: 'isolate', sid: 'a' };
  ctl.setAmount(0.5);
  assert.equal(counts.parts, 1);
  assert.equal(counts.items, 1);
  assert.equal(ctl.getInfo().separable, true);
  ctl.dispose();
});
test('isolar com a vista ativa reavalia o escopo sem perder o valor', () => {
  const { ctl, calls, state } = controller({ reduced: true });
  ctl.setAmount(0.5);
  state.isolation = { active: 'isolate', sid: 'a' };
  emit(EVENTS.VISIBILITY_ISOLATE, { sid: 'a' });
  assert.equal(ctl.getInfo().mode, 'orgao');
  assert.equal(ctl.getAmount(), 0.5);
  assert.ok(calls.length >= 2);
  ctl.dispose();
});

console.log('painel (textos)');
test('valueText e hintFor em PT-BR', () => {
  assert.equal(panel.valueText(0), 'Peças juntas');
  assert.equal(panel.valueText(40), 'Peças 40% separadas');
  assert.match(panel.hintFor({ mode: 'corpo', separable: true }), /centro do corpo/);
  assert.match(panel.hintFor({ mode: 'orgao', separable: false }), /uma peça só/);
});

if (failures) {
  console.error(`\n${failures} teste(s) falharam.`);
  process.exit(1);
}
console.log('\nexplode: ok');
