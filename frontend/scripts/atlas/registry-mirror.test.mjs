#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * registry-mirror.test.mjs — regressão do bug "clicar nas peças do lado
 * espelhado não destaca nada" (diagnóstico de cliques, 2026-10-13).
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/registry-mirror.test.mjs
 *
 * O Z-Anatomy modela o lado esquerdo como a MESMA malha do direito com escala
 * -1 em X. Dentro de um BatchedMesh comum, a instância com determinante
 * negativo não inverte o sentido das faces: o three só chama
 * gl.frontFace(CW) quando a matriz do OBJETO (o batch) tem determinante
 * negativo. Resultado: a peça era desenhada "por dentro" enquanto o raycast
 * acertava a face de fora. O que o clique acerta tem que ser a face que o GPU
 * desenha — e a posição final de cada peça não pode mudar.
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

// Cena: duas peças "irmãs" — mesma malha; a esquerda é a direita espelhada.
const geo = new THREE.SphereGeometry(0.2, 24, 16);
geo.translate(0.03, 0.02, 0); // assimétrica em X de propósito
const root = new THREE.Group();
const right = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
right.name = 'Teste.r';
right.position.set(0.5, 0, 0);
const left = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
left.name = 'Teste.l';
left.position.set(-0.5, 0, 0);
left.scale.set(-1, 1, 1);
root.add(right, left);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
camera.position.set(0, 0, 3);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const registry = createRegistry({ engine: { scene, camera, requestRender() {} } });
registry.registerSystem('muscular', {
  root,
  nodeToSid: { 'Teste.r': 'za:teste-r', 'Teste.l': 'za:teste-l' },
  sex: 'U',
  lod: 'lod1',
});
scene.updateMatrixWorld(true);

const batches = scene.children.filter((o) => o.isBatchedMesh);
const batchOf = (sid) => batches.find((b) => [...b.userData.sidByInstance.values()].includes(sid));
const instanceOf = (sid) => {
  const b = batchOf(sid);
  const id = [...b.userData.sidByInstance].find(([, s]) => s === sid)[0];
  return { b, id };
};
const ndcOf = (x) => {
  const p = new THREE.Vector3(x, 0, 0).project(camera);
  return { x: p.x, y: p.y };
};
const worldVertex = (b, id, i) => {
  const m = new THREE.Matrix4();
  b.getMatrixAt(id, m);
  m.premultiply(b.matrixWorld);
  return new THREE.Vector3().fromBufferAttribute(b.geometry.getAttribute('position'), i).applyMatrix4(m);
};

for (const [sid, x] of [['za:teste-r', 0.5], ['za:teste-l', -0.5]]) {
  test(`${sid}: o clique acerta a estrutura certa`, () => {
    assert.equal(registry.pick(ndcOf(x)), sid);
  });

  test(`${sid}: a face acertada pelo raio é a que o GPU desenha`, () => {
    const { b } = instanceOf(sid);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndcOf(x), camera);
    const hit = rc.intersectObject(b, false)
      .sort((p, q) => p.distance - q.distance)
      .find((h) => b.userData.sidByInstance.get(h.batchId) === sid);
    assert.ok(hit, 'raio não acertou a peça');
    const [A, B, C] = [hit.face.a, hit.face.b, hit.face.c].map((i) => worldVertex(b, hit.batchId, i));
    const n = new THREE.Vector3().subVectors(B, A).cross(new THREE.Vector3().subVectors(C, A));
    const toCam = new THREE.Vector3().subVectors(camera.position, hit.point);
    // O three só chama gl.frontFace(CW) quando o determinante do OBJETO é negativo.
    const frontFaceCW = b.matrixWorld.determinant() < 0;
    const drawn = frontFaceCW ? n.dot(toCam) < 0 : n.dot(toCam) > 0;
    assert.ok(drawn, `${sid}: o raycast acertou uma face que o GPU descartaria`);
  });
}

test('a matriz-mundo efetiva (batch x instância) continua a original', () => {
  for (const [sid, mesh] of [['za:teste-r', right], ['za:teste-l', left]]) {
    const { b, id } = instanceOf(sid);
    const m = new THREE.Matrix4();
    b.getMatrixAt(id, m);
    m.premultiply(b.matrixWorld);
    assert.ok(m.elements.every((v, i) => Math.abs(v - mesh.matrixWorld.elements[i]) < 1e-6), `${sid}: matriz-mundo alterada`);
  }
});

test('nenhuma instância de batch com scale.x > 0 tem determinante negativo (e vice-versa)', () => {
  for (const b of batches) {
    const mirrorBatch = b.scale.x < 0;
    for (const id of b.userData.sidByInstance.keys()) {
      const m = new THREE.Matrix4();
      b.getMatrixAt(id, m);
      m.premultiply(b.matrixWorld);
      assert.equal(m.determinant() < 0, mirrorBatch, `${b.name}: instância ${id} no lote errado`);
    }
  }
});

test('separa em dois lotes por camada (normal + espelhado): orçamento de draw calls', () => {
  assert.equal(batches.length, 2);
  assert.ok(batches.some((b) => b.scale.x < 0));
});

test('setColor, setVisible e setOpacity valem para os dois lotes', () => {
  for (const sid of ['za:teste-r', 'za:teste-l']) {
    registry.setColor(sid, '#ffb020');
    const { b, id } = instanceOf(sid);
    const c = new THREE.Vector4();
    b.getColorAt(id, c);
    assert.ok(Math.abs(c.x - 1) < 0.02 && c.w === 1, `${sid}: cor não gravada`);
    registry.setVisible(sid, false);
    assert.equal(b.getVisibleAt(id), false);
    registry.setVisible(sid, true);
    registry.setOpacity(sid, 0.4);
    b.getColorAt(id, c);
    assert.ok(Math.abs(c.w - 0.4) < 1e-6, `${sid}: opacidade não gravada`);
    registry.setOpacity(sid, 1);
    registry.setColor(sid, null);
  }
});

test('espelhado: o lote (material, renderOrder) herda a camada de origem', () => {
  const { b } = instanceOf('za:teste-l');
  const normal = instanceOf('za:teste-r').b;
  assert.equal(b.renderOrder, normal.renderOrder);
  assert.notEqual(b.material, normal.material);
});

test('o campo side do registro vem do sufixo .l/.r do nó', () => {
  assert.equal(registry.getBySid('za:teste-r').side, 'R');
  assert.equal(registry.getBySid('za:teste-l').side, 'L');
});

test('unregisterSystem remove as duas metades', () => {
  registry.unregisterSystem('muscular');
  assert.equal(registry.getBySid('za:teste-r'), null);
  assert.equal(registry.getBySid('za:teste-l'), null);
  assert.equal(registry.pick(ndcOf(-0.5)), null);
});

if (failures) {
  console.error(`\n${failures} teste(s) falharam.`);
  process.exit(1);
}
console.log('\nregistry-mirror: ok');
