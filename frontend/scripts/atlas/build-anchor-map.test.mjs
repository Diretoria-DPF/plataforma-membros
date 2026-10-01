#!/usr/bin/env node
/**
 * build-anchor-map.test.mjs — mapa de âncoras de Fisiologia & Vias.
 * Uso: node scripts/atlas/build-anchor-map.test.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAnchorMap, centerOf, requiredKeys } from './build-anchor-map.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ATLAS = path.resolve(here, '../../modulos/anatomia-3d/data/atlas');

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

const box = (min, max) => ({ min, max });
const STRUCTURES = [
  { sid: 'za:right-atrium', englishName: 'Right atrium', bbox: box([-0.04, 1.24, 0], [0, 1.30, 0.06]) },
  { sid: 'za:left-ventricle', englishName: 'Left ventricle', bbox: box([0, 1.23, 0], [0.08, 1.33, 0.07]) },
  { sid: 'za:vh-m-left-ventricle', englishName: 'VH_M_left_ventricle', bbox: box([0, 0.42, 0], [0.08, 0.52, 0.07]) },
  { sid: 'za:vh-m-porta-hepatis', englishName: 'VH_M_porta_hepatis', bbox: box([-0.02, 0.30, 0], [0, 0.32, 0.02]) },
  { sid: 'za:vh-f-porta-hepatis', englishName: 'VH_F_porta_hepatis', bbox: box([-0.02, 0.20, 0], [0, 0.22, 0.02]) },
  { sid: 'za:clavicle-l', englishName: 'Clavicle', side: 'l', bbox: box([0.01, 1.42, 0], [0.15, 1.44, 0.04]) },
  { sid: 'za:clavicle-r', englishName: 'Clavicle', side: 'r', bbox: box([-0.15, 1.42, 0], [-0.01, 1.44, 0.04]) },
  { sid: 'za:liver', englishName: 'Liver', bbox: box([-0.12, 1.08, -0.05], [0.06, 1.26, 0.1]) },
];

console.log('build-anchor-map.mjs');

test('âncora pelo nome vira a própria estrutura (sid + centro)', () => {
  const { map, errors } = buildAnchorMap({
    spec: { anchors: { 'za:atrio-direito': { name: 'Right atrium' } } },
    structures: STRUCTURES,
    routes: [{ id: 'iv', anchors: [{ sid: 'za:atrio-direito' }] }],
    processes: [],
  });
  assert.deepEqual(errors, []);
  assert.equal(map.anchors['za:atrio-direito'].sid, 'za:right-atrium');
  assert.deepEqual(map.anchors['za:atrio-direito'].point, [-0.02, 1.27, 0.03]);
});

test('offset aproxima estrutura ausente: só o ponto, sem sid', () => {
  const { map } = buildAnchorMap({
    spec: { anchors: { 'za:vcs': { name: 'Right atrium', offset: [0, 0.07, -0.01] } } },
    structures: STRUCTURES, routes: [{ id: 'iv', anchors: [{ sid: 'za:vcs' }] }], processes: [],
  });
  assert.equal(map.anchors['za:vcs'].sid, null);
  assert.deepEqual(map.anchors['za:vcs'].point, [-0.02, 1.34, 0.02]);
});

test('nome do Z-Anatomy vence o equivalente do HRA', () => {
  const { map } = buildAnchorMap({
    spec: { anchors: { k: { name: 'Left ventricle' } } },
    structures: STRUCTURES, routes: [{ id: 'r', anchors: [{ sid: 'k' }] }], processes: [],
  });
  assert.equal(map.anchors.k.sid, 'za:left-ventricle');
});

test('órgão do HRA: casa sem o prefixo VH_M_, prefere o masculino e soma os 0,81 m', () => {
  const { map } = buildAnchorMap({
    spec: { anchors: { k: { name: 'porta hepatis' } } },
    structures: STRUCTURES, routes: [{ id: 'r', anchors: [{ sid: 'k' }] }], processes: [],
  });
  assert.equal(map.anchors.k.sid, 'za:vh-m-porta-hepatis');
  assert.ok(Math.abs(map.anchors.k.point[1] - (0.31 + 0.81)) < 1e-9);
  assert.ok(Math.abs(centerOf(STRUCTURES[2])[1] - 1.28) < 1e-9);
});

test('estrutura par: sem side usa a direita; side "l" usa a esquerda', () => {
  const { map } = buildAnchorMap({
    spec: { anchors: { a: { name: 'Clavicle' }, b: { name: 'Clavicle', side: 'l' } } },
    structures: STRUCTURES, routes: [{ id: 'r', anchors: [{ sid: 'a' }, { sid: 'b' }] }], processes: [],
  });
  assert.equal(map.anchors.a.sid, 'za:clavicle-r');
  assert.equal(map.anchors.b.sid, 'za:clavicle-l');
});

test('âncora que já é estrutura real dispensa entrada no spec', () => {
  const { map, errors } = buildAnchorMap({
    spec: { anchors: {} }, structures: STRUCTURES,
    routes: [{ id: 'oral', anchors: [{ sid: 'za:liver' }] }], processes: [],
  });
  assert.deepEqual(errors, []);
  assert.equal(map.anchors['za:liver'].sid, 'za:liver');
});

test('passo de processo com entrada própria usa a chave "<processo>:<ordem>"', () => {
  const processes = [{ id: 'eixo', steps: [{ order: 1, anchors: [{ sid: 'za:eixo' }] }, { order: 2, anchors: [{ sid: 'za:eixo' }] }] }];
  const spec = { anchors: { 'za:eixo': { name: 'Liver' } }, steps: { 'eixo:2': { name: 'Right atrium' } } };
  const keys = requiredKeys([], processes, spec);
  assert.ok(keys.has('za:eixo') && keys.has('eixo:2') && !keys.has('eixo:1'));
  const { map, errors } = buildAnchorMap({ spec, structures: STRUCTURES, routes: [], processes });
  assert.deepEqual(errors, []);
  assert.equal(map.anchors['eixo:2'].sid, 'za:right-atrium');
});

test('âncora sem entrada e nome inexistente viram erro', () => {
  const { errors } = buildAnchorMap({
    spec: { anchors: { 'za:x': { name: 'Nonexistent organ' } } },
    structures: STRUCTURES,
    routes: [{ id: 'r', anchors: [{ sid: 'za:x' }, { sid: 'za:sem-spec' }] }], processes: [],
  });
  assert.equal(errors.length, 2);
  assert.match(errors.join('\n'), /Nonexistent organ/);
  assert.match(errors.join('\n'), /za:sem-spec/);
});

test('dados reais: toda âncora de routes/processes resolve e o anchor-map.json está em dia', () => {
  const read = (rel) => JSON.parse(readFileSync(path.join(ATLAS, rel), 'utf8'));
  const list = (x, k) => (Array.isArray(x) ? x : x[k]);
  const { map, errors } = buildAnchorMap({
    spec: read('anchor-spec.json'),
    structures: list(read('generated/structures.json'), 'structures'),
    routes: list(read('routes.json'), 'routes'),
    processes: list(read('processes.json'), 'processes'),
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(read('generated/anchor-map.json'), map,
    'generated/anchor-map.json desatualizado — rode: node scripts/atlas/build-anchor-map.mjs');
  // Todo ponto dentro do corpo (≈ 0–1,75 m de altura, ±0,4 m nos lados).
  for (const [k, { point }] of Object.entries(map.anchors)) {
    assert.ok(point[1] > 0 && point[1] < 1.75 && Math.abs(point[0]) < 0.4 && Math.abs(point[2]) < 0.3, `${k} fora do corpo: ${point}`);
  }
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
