#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * test/make-fixtures.mjs
 *
 * Gera GLBs mínimos (sem depender de nenhum download) para testar localmente
 * optimize.mjs, build-manifest.mjs e validate.mjs. Simula um "sistema" do
 * Z-Anatomy com duas estruturas nomeadas .L/.R e um objeto do HRA com um
 * único órgão — o suficiente para exercitar dedup/weld/prune/simplify/
 * quantize/meshopt e o mapeamento nó→sid.
 *
 * Uso: node test/make-fixtures.mjs
 */

import { Document, NodeIO } from '@gltf-transform/core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'fixtures');

/** Cria uma malha de esfera simples (icosaedro grosseiro) só para ter triângulos de sobra para o simplify cortar. */
function addSphereMesh(document, name, subdivisions = 3) {
  const buffer = document.getRoot().listBuffers()[0];

  // Malha em grade UV simples — não precisa ser bonita, só ter triângulos
  // suficientes (algumas centenas) para simplify/weld terem o que fazer.
  const rings = 8 * subdivisions;
  const sectors = 12 * subdivisions;
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let r = 0; r <= rings; r++) {
    const theta = (r / rings) * Math.PI;
    for (let s = 0; s <= sectors; s++) {
      const phi = (s / sectors) * Math.PI * 2;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      positions.push(x * 0.05, y * 0.05, z * 0.05);
      normals.push(x, y, z);
      uvs.push(s / sectors, r / rings);
    }
  }
  const indices = [];
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < sectors; s++) {
      const a = r * (sectors + 1) + s;
      const b = a + sectors + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }
  // Duplica alguns vértices para dar trabalho ao dedup/weld.
  const dupPositions = positions.concat(positions.slice(0, 30));
  const dupNormals = normals.concat(normals.slice(0, 30));
  const dupUvs = uvs.concat(uvs.slice(0, 20));

  const positionAccessor = document
    .createAccessor(`${name}_POSITION`)
    .setArray(new Float32Array(dupPositions))
    .setType('VEC3')
    .setBuffer(buffer);
  const normalAccessor = document
    .createAccessor(`${name}_NORMAL`)
    .setArray(new Float32Array(dupNormals))
    .setType('VEC3')
    .setBuffer(buffer);
  const uvAccessor = document
    .createAccessor(`${name}_TEXCOORD_0`)
    .setArray(new Float32Array(dupUvs))
    .setType('VEC2')
    .setBuffer(buffer);
  const indexAccessor = document
    .createAccessor(`${name}_INDICES`)
    .setArray(new Uint32Array(indices))
    .setType('SCALAR')
    .setBuffer(buffer);

  const material = document
    .createMaterial(`${name}_material`)
    .setBaseColorFactor([0.8, 0.2, 0.2, 1]);

  const primitive = document
    .createPrimitive()
    .setAttribute('POSITION', positionAccessor)
    .setAttribute('NORMAL', normalAccessor)
    .setAttribute('TEXCOORD_0', uvAccessor)
    .setIndices(indexAccessor)
    .setMaterial(material);

  const mesh = document.createMesh(name).addPrimitive(primitive);
  return mesh;
}

function buildSystemFixture({ fileName, nodeNames, extras }) {
  const document = new Document();
  document.createBuffer();
  const scene = document.createScene('Scene');

  for (const nodeName of nodeNames) {
    const mesh = addSphereMesh(document, `${nodeName}_mesh`);
    const node = document
      .createNode(nodeName)
      .setMesh(mesh)
      .setExtras({ ...extras, originalName: nodeName });
    scene.addChild(node);
  }

  // Objeto sem malha (empty/label) que o export do Blender também produziria
  // — o optimize.mjs/prune deve poder remover isso.
  const emptyNode = document.createNode('Label_Text_pointer');
  emptyNode.setExtras({ isLabel: true });
  scene.addChild(emptyNode);

  return document;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const io = new NodeIO();

  const skeleton = buildSystemFixture({
    fileName: 'esqueletico.glb',
    nodeNames: ['Femur.L', 'Femur.R', 'Cranio'],
    extras: { system: 'esqueletico', layer: 'esqueleto' },
  });
  await io.write(path.join(OUT_DIR, 'esqueletico.glb'), skeleton);

  const cardio = buildSystemFixture({
    fileName: 'cardiovascular.glb',
    nodeNames: ['Coracao', 'Aorta'],
    extras: { system: 'cardiovascular', layer: 'vasos' },
  });
  await io.write(path.join(OUT_DIR, 'cardiovascular.glb'), cardio);

  const hraOrgan = buildSystemFixture({
    fileName: 'heart-male.glb',
    nodeNames: ['heart'],
    extras: { source: 'hra', organId: 'VH_M_Heart', sex: 'male' },
  });
  await io.write(path.join(OUT_DIR, 'heart-male.glb'), hraOrgan);

  console.log('Fixtures geradas em', OUT_DIR);
  for (const f of fs.readdirSync(OUT_DIR)) {
    const { size } = fs.statSync(path.join(OUT_DIR, f));
    console.log(` - ${f}: ${(size / 1024).toFixed(1)} KB`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
