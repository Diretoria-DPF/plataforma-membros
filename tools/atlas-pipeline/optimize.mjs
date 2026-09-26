#!/usr/bin/env node
/**
 * optimize.mjs
 *
 * Recebe os GLBs "crus" exportados do Blender (Z-Anatomy) ou baixados do HRA
 * e produz, para cada um:
 *   - <nome>.glb       — LOD0 (completo, soldado e sem duplicatas)
 *   - <nome>.lod1.glb  — LOD1 (simplificado a ~25% dos triângulos)
 * ambos com quantização de atributos e compressão EXT_meshopt_compression
 * (decodifica mais rápido que Draco no celular — ver plano §3 e §4).
 *
 * Também remove objetos que não interessam ao motor 3D (texto, rótulos,
 * "empties" sem malha) e registra o nó→sid mais adiante em build-manifest.mjs
 * (este script só otimiza a geometria; não decide nomes).
 *
 * Uso:
 *   node optimize.mjs --in <dir com .glb crus> --out <dir de saída> [--lod1-ratio 0.25] [--dry-run]
 *
 * Convenção de entrada: um .glb por sistema (Z-Anatomy) ou por órgão+sexo
 * (HRA), já no referencial certo (Y para cima, metros).
 */

import { Document, NodeIO } from '@gltf-transform/core';
import {
  cloneDocument,
  dedup,
  weld,
  prune,
  simplify,
  quantize,
  meshopt,
} from '@gltf-transform/functions';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import * as fs from 'node:fs';
import * as path from 'node:path';

const args = parseArgs(process.argv.slice(2));
const IN_DIR = args.in;
const OUT_DIR = args.out;
const LOD1_RATIO = args['lod1-ratio'] ? Number(args['lod1-ratio']) : 0.25;
const DRY_RUN = Boolean(args['dry-run']);

if (!IN_DIR || !OUT_DIR) {
  console.error(
    'Uso: node optimize.mjs --in <dir> --out <dir> [--lod1-ratio 0.25] [--dry-run]'
  );
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    }
  }
  return out;
}

/** Remove nós sem malha e sem filhos com malha — texto, "empties", rótulos do Blender. */
function pruneNonMeshNodes(document) {
  const root = document.getRoot();
  let removed = 0;

  function nodeHasMeshDescendant(node) {
    if (node.getMesh()) return true;
    return node.listChildren().some(nodeHasMeshDescendant);
  }

  for (const scene of root.listScenes()) {
    for (const node of [...scene.listChildren()]) {
      if (!nodeHasMeshDescendant(node)) {
        // Heurística extra: nomes típicos de rótulo/texto/empty do Z-Anatomy.
        node.dispose();
        removed++;
      }
    }
  }
  return removed;
}

/** Normaliza sufixos .L/.R (Blender) para o padrão _l/_r usado no sid. Mantido nos extras, não no nome do nó em si (build-manifest.mjs lê o nome original). */
function annotateSide(document) {
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName() || '';
    const extras = node.getExtras() || {};
    if (/\.[Ll]$/.test(name) || /_[Ll]$/.test(name)) {
      node.setExtras({ ...extras, side: 'l' });
    } else if (/\.[Rr]$/.test(name) || /_[Rr]$/.test(name)) {
      node.setExtras({ ...extras, side: 'r' });
    }
  }
}

async function loadAndClean(filePath) {
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  const document = await io.read(filePath);

  const removed = pruneNonMeshNodes(document);
  annotateSide(document);

  await document.transform(
    dedup(),
    weld({ tolerance: 0.0001 }),
    prune({ keepAttributes: false, keepLeaves: false })
  );

  return { document, removedNonMesh: removed };
}

async function writeLod(document, outPath, { simplifyRatio } = {}) {
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });

  // Clona o documento para não afetar o LOD anterior — cada chamada parte
  // do mesmo estado "limpo" (dedup+weld+prune já aplicados em loadAndClean).
  const working = cloneDocument(document);

  if (simplifyRatio != null && simplifyRatio < 1) {
    await working.transform(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: simplifyRatio,
        error: 0.01,
      })
    );
  }

  await working.transform(
    quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 12 })
  );

  const meshoptExt = working.createExtension(EXTMeshoptCompression);
  meshoptExt.setRequired(true);
  await working.transform(
    meshopt({ encoder: MeshoptEncoder, level: 'high' })
  );

  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await io.write(outPath, working);
  }

  const bytes = DRY_RUN ? 0 : fs.statSync(outPath).size;
  const triangles = countTriangles(working);
  return { bytes, triangles };
}

function countTriangles(document) {
  let total = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      const count = indices ? indices.getCount() : prim.getAttribute('POSITION').getCount();
      total += Math.floor(count / 3);
    }
  }
  return total;
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;

  const files = fs
    .readdirSync(IN_DIR)
    .filter((f) => f.toLowerCase().endsWith('.glb') || f.toLowerCase().endsWith('.gltf'));

  if (files.length === 0) {
    console.warn(`Nenhum .glb/.gltf encontrado em ${IN_DIR} — nada para otimizar.`);
    return;
  }

  const report = [];

  for (const file of files) {
    const inPath = path.join(IN_DIR, file);
    const baseName = file.replace(/\.(glb|gltf)$/i, '');
    console.log(`\n=== ${file} ===`);

    const { document, removedNonMesh } = await loadAndClean(inPath);
    console.log(`  nós não-malha removidos: ${removedNonMesh}`);

    const lod0Path = path.join(OUT_DIR, `${baseName}.glb`);
    const lod0 = await writeLod(document, lod0Path, { simplifyRatio: 1 });
    console.log(
      `  LOD0: ${(lod0.bytes / 1024 / 1024).toFixed(2)} MB, ${lod0.triangles.toLocaleString('pt-BR')} triângulos`
    );

    const lod1Path = path.join(OUT_DIR, `${baseName}.lod1.glb`);
    const lod1 = await writeLod(document, lod1Path, { simplifyRatio: LOD1_RATIO });
    console.log(
      `  LOD1: ${(lod1.bytes / 1024 / 1024).toFixed(2)} MB, ${lod1.triangles.toLocaleString('pt-BR')} triângulos`
    );

    report.push({
      name: baseName,
      lod0: { path: path.relative(OUT_DIR, lod0Path), ...lod0 },
      lod1: { path: path.relative(OUT_DIR, lod1Path), ...lod1 },
    });
  }

  if (!DRY_RUN) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUT_DIR, 'optimize-report.json'),
      JSON.stringify(report, null, 2)
    );
  }

  console.log('\nResumo:');
  for (const r of report) {
    console.log(
      `  ${r.name}: LOD0 ${(r.lod0.bytes / 1024 / 1024).toFixed(2)} MB / LOD1 ${(r.lod1.bytes / 1024 / 1024).toFixed(2)} MB`
    );
  }
}

main().catch((err) => {
  console.error('Falha no optimize.mjs:', err);
  process.exit(1);
});
