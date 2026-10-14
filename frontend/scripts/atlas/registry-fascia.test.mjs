#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * registry-fascia.test.mjs — fáscias no Registry real (camada própria, pick
 * que prefere a estrutura sob a fáscia, alternância, só-fáscias).
 * Roda com: node frontend/scripts/atlas/registry-fascia.test.mjs
 *
 * Cena: um "músculo" (esfera) coberto por uma "fáscia" (esfera um pouco maior,
 * como a fáscia que envolve o músculo), e um "osso" bem atrás. A câmera olha
 * pelo eixo Z.
 */

import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = path.resolve(here, '../../modulos/anatomia-3d');
const THREE = await import(pathToFileURL(path.join(mod, 'vendor/three/three.module.js')).href);
const { createRegistry } = await import(pathToFileURL(path.join(mod, 'js/engine/registry.js')).href);

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

function build() {
  const root = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  const mk = (name, radius, z) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), mat);
    m.name = name;
    m.position.set(0, 0, z);
    root.add(m);
  };
  mk('Fascia lata.r', 0.22, 0);
  mk('Rectus femoris.r', 0.2, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.set(0, 0, 3);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const registry = createRegistry({ engine: { scene, camera, requestRender() {} } });
  registry.registerSystem('muscular', {
    root,
    nodeToSid: { 'Fascia lata.r': 'za:fascia-lata-r', 'Rectus femoris.r': 'za:rectus-femoris-r' },
    sex: 'U',
    lod: 'lod1',
  });
  scene.updateMatrixWorld(true);
  return { registry, scene };
}
const CENTER = { x: 0, y: 0 };

test('a fáscia vai para a camada "fascias"; o músculo continua em "musculos"', () => {
  const { registry } = build();
  assert.equal(registry.getBySid('za:fascia-lata-r').layer, 'fascias');
  assert.equal(registry.getBySid('za:rectus-femoris-r').layer, 'musculos');
});

test('fáscia e músculo têm lotes (material) próprios: a translucidez da fáscia não afeta os músculos', () => {
  const { registry, scene } = build();
  const batches = scene.children.filter((o) => o.isBatchedMesh);
  assert.equal(batches.length, 2);
  registry.setOpacity('za:fascia-lata-r', 0.45);
  const byName = Object.fromEntries(batches.map((b) => [b.name, b]));
  assert.equal(byName['layer:fascias'].material.depthWrite, false);
  assert.equal(byName['layer:musculos'].material.depthWrite, true);
});

test('o clique prefere o músculo sob a fáscia', () => {
  const { registry } = build();
  assert.equal(registry.pick(CENTER), 'za:rectus-femoris-r');
});

test('com a preferência desligada, a fáscia (a superfície mais próxima) vence', () => {
  const { registry } = build();
  registry.setPreferUnderFascia(false);
  assert.equal(registry.pick(CENTER), 'za:fascia-lata-r');
});

test('a fáscia continua selecionável: clicar de novo no mesmo ponto alterna', () => {
  const { registry } = build();
  assert.equal(registry.pickCycle(CENTER), 'za:rectus-femoris-r');
  assert.equal(registry.pickCycle({ x: 0.004, y: 0 }), 'za:fascia-lata-r');
  assert.equal(registry.pickCycle(CENTER), 'za:rectus-femoris-r');
  assert.equal(registry.pickCycle({ x: 0.6, y: 0.6 }), null);
});

test('modo somente fáscias (músculo oculto): só a fáscia é acertada', () => {
  const { registry } = build();
  registry.setVisible('za:rectus-femoris-r', false);
  assert.equal(registry.pick(CENTER), 'za:fascia-lata-r');
  assert.equal(registry.pickCycle(CENTER), 'za:fascia-lata-r');
});

test('fáscia oculta (camada desligada): o clique cai no músculo', () => {
  const { registry } = build();
  registry.setVisible('za:fascia-lata-r', false);
  assert.equal(registry.pick(CENTER), 'za:rectus-femoris-r');
});

test('tensor da fáscia lata é músculo, não fáscia', () => {
  const root = new THREE.Group();
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial());
  m.name = 'Tensor.r';
  root.add(m);
  const scene = new THREE.Scene();
  const registry = createRegistry({ engine: { scene, camera: new THREE.PerspectiveCamera(), requestRender() {} } });
  registry.registerSystem('muscular', { root, nodeToSid: { 'Tensor.r': 'za:tensor-fasciae-latae-r' }, sex: 'U', lod: 'lod1' });
  assert.equal(registry.getBySid('za:tensor-fasciae-latae-r').layer, 'musculos');
});

if (failures) {
  console.error(`\n${failures} teste(s) falharam.`);
  process.exit(1);
}
console.log('\nregistry-fascia: ok');
