#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * registry-pick.test.mjs — o clique atravessa o que está (quase) transparente.
 * Achado da varredura de funcionalidades (13/10/2026): com o Raio-X ligado
 * (pele 8%, músculos 12%) ou uma estrutura em fantasma, o raycast ignorava a
 * opacidade e o clique em um órgão visível por transparência selecionava o
 * músculo na frente dele.
 * Roda com: node frontend/scripts/atlas/registry-pick.test.mjs
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = path.resolve(here, '../../modulos/anatomia-3d');
const THREE = await import(pathToFileURL(path.join(mod, 'vendor/three/three.module.js')).href);
const { createRegistry } = await import(pathToFileURL(path.join(mod, 'js/engine/registry.js')).href);
const { SEE_THROUGH_OPACITY } = await import(pathToFileURL(path.join(mod, 'js/engine/registry-pick.js')).href);

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

/** Músculo (esfera grande) na frente de um órgão (esfera menor); câmera em +Z. */
function build({ withOrgan = true } = {}) {
  const geo = (r) => new THREE.SphereGeometry(r, 24, 16);
  const root = new THREE.Group();
  const muscle = new THREE.Mesh(geo(0.3), new THREE.MeshBasicMaterial());
  muscle.name = 'Biceps.r';
  root.add(muscle);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const registry = createRegistry({ engine: { scene, camera, requestRender() {} } });
  registry.registerSystem('muscular', { root, nodeToSid: { 'Biceps.r': 'za:biceps-r' }, sex: 'U', lod: 'lod1' });
  if (withOrgan) {
    const organRoot = new THREE.Group();
    const organ = new THREE.Mesh(geo(0.12), new THREE.MeshBasicMaterial());
    organ.name = 'Liver';
    organRoot.add(organ);
    registry.registerSystem('digestorio', { root: organRoot, nodeToSid: { Liver: 'za:liver' }, sex: 'U', lod: 'lod1' });
  }
  scene.updateMatrixWorld(true);
  return registry;
}
const CENTER = { x: 0, y: 0 };

test('opaco: o músculo na frente é o que se clica', () => {
  assert.equal(build().pick(CENTER), 'za:biceps-r');
});
test('Raio-X/fantasma (opacidade < limiar): o clique atravessa o músculo e acerta o órgão', () => {
  const r = build();
  r.setOpacity('za:biceps-r', 0.12);
  assert.ok(0.12 < SEE_THROUGH_OPACITY);
  assert.equal(r.pick(CENTER), 'za:liver');
});
test('camada em 45% (ex.: Fáscias na abertura) ainda é sólida para o clique', () => {
  const r = build();
  r.setOpacity('za:biceps-r', 0.45);
  assert.equal(r.pick(CENTER), 'za:biceps-r');
});
test('só há transparentes sob o ponto: a mais próxima ainda é selecionável', () => {
  const r = build({ withOrgan: false });
  r.setOpacity('za:biceps-r', 0.08);
  assert.equal(r.pick(CENTER), 'za:biceps-r');
  assert.equal(r.pickCycle(CENTER), 'za:biceps-r');
});
test('um órgão também transparente não rouba o clique do músculo opaco na frente', () => {
  const r = build();
  r.setOpacity('za:liver', 0.1);
  assert.equal(r.pick(CENTER), 'za:biceps-r');
});

if (failures) {
  console.error(`\n${failures} teste(s) falharam.`);
  process.exit(1);
}
console.log('\nregistry-pick: ok');
