#!/usr/bin/env node
/**
 * test/run-tests.mjs
 *
 * Teste local de ponta a ponta do pipeline, sem depender de nenhum download
 * (a sandbox de desenvolvimento só alcança o npm — ver instruções do WP10):
 *   1. gera fixtures (GLBs mínimos);
 *   2. roda optimize.mjs (dedup/weld/prune/simplify/quantize/meshopt);
 *   3. roda build-manifest.mjs (mapa nó→sid, bbox, licenças);
 *   4. roda validate.mjs (orçamento, nós mapeados, licenças separadas) e
 *      confere que ele PASSA no caso bom e FALHA quando uma licença é
 *      misturada de propósito.
 *
 * Uso: npm test  (ou node test/run-tests.mjs)
 */

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const WORK = path.join(__dirname, '.run');

let failures = 0;

function step(label, fn) {
  console.log(`\n--- ${label} ---`);
  try {
    fn();
    console.log(`OK: ${label}`);
  } catch (err) {
    failures++;
    console.error(`FALHOU: ${label}`);
    console.error(err.message || err);
  }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', ...opts });
}

function runExpectFailure(cmd, args, opts = {}) {
  try {
    run(cmd, args, opts);
    throw new Error('esperava falha (código != 0), mas o comando teve sucesso');
  } catch (err) {
    if (err.status === 1 || (err.code && err.code === 1)) return err.stdout || '';
    if (err.message === 'esperava falha (código != 0), mas o comando teve sucesso') throw err;
    return err.stdout || '';
  }
}

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });

step('1. Gerar fixtures', () => {
  run('node', ['test/make-fixtures.mjs']);
  const files = fs.readdirSync(path.join(ROOT, 'test/fixtures'));
  if (files.length < 3) throw new Error(`esperava >=3 fixtures, achou ${files.length}`);
});

const optimizedDir = path.join(WORK, 'optimized');
step('2. optimize.mjs (dedup/weld/prune/simplify/quantize/meshopt)', () => {
  run('node', ['optimize.mjs', '--in', 'test/fixtures', '--out', path.relative(ROOT, optimizedDir)]);
  for (const f of ['esqueletico.glb', 'esqueletico.lod1.glb', 'cardiovascular.glb', 'heart-male.glb']) {
    const p = path.join(optimizedDir, f);
    if (!fs.existsSync(p)) throw new Error(`arquivo esperado não gerado: ${p}`);
  }
  const lod0 = fs.statSync(path.join(optimizedDir, 'esqueletico.glb')).size;
  const lod1 = fs.statSync(path.join(optimizedDir, 'esqueletico.lod1.glb')).size;
  if (lod1 >= lod0) throw new Error(`LOD1 (${lod1}B) deveria ser menor que LOD0 (${lod0}B)`);
});

const configPath = path.join(WORK, 'manifest.config.json');
const manifestPath = path.join(optimizedDir, 'manifest.json');
const structuresPath = path.join(WORK, 'structures.json');
step('3. build-manifest.mjs (nó→sid, bbox, licenças)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/manifest.config.test.json'), 'utf8'));
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  run('node', [
    'build-manifest.mjs',
    '--config',
    path.relative(ROOT, configPath),
    '--models-dir',
    path.relative(ROOT, optimizedDir),
    '--out-structures',
    path.relative(ROOT, structuresPath),
  ]);
  if (!fs.existsSync(manifestPath)) throw new Error('manifest.json não foi gerado');
  if (!fs.existsSync(structuresPath)) throw new Error('structures.json não foi gerado');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const structures = JSON.parse(fs.readFileSync(structuresPath, 'utf8'));

  if (!Array.isArray(manifest.assets)) throw new Error('manifest.assets deveria ser um array (esquema do WP02)');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.generatedAt)) {
    throw new Error(`manifest.generatedAt deveria ser YYYY-MM-DD, veio "${manifest.generatedAt}"`);
  }
  for (const extra of ['systems', 'organs', 'budget', 'totalBytes', 'totalMB']) {
    if (extra in manifest) throw new Error(`manifest.json não deveria ter "${extra}" (esquema é additionalProperties:false na raiz)`);
  }

  // sid: SÓ "fma:" ou "za:" — nunca "hra:" (não existe no pattern do esquema).
  const expectedSids = new Set(['za:femur-l', 'za:femur-r', 'za:cranio', 'za:coracao', 'za:aorta', 'za:heart']);
  const gotSids = new Set(structures.map((s) => s.sid));
  for (const sid of expectedSids) {
    if (!gotSids.has(sid)) throw new Error(`sid esperado ausente em structures.json: ${sid}`);
  }
  for (const s of structures) {
    if (!/^(fma:[0-9]+|za:[a-z0-9]+(-[a-z0-9]+)*)$/.test(s.sid)) {
      throw new Error(`sid fora do padrão do esquema: "${s.sid}"`);
    }
  }

  const esqueleticoLod0 = manifest.assets.find((a) => a.system === 'esqueletico' && a.lod === 'lod0');
  if (!esqueleticoLod0 || esqueleticoLod0.nodeToSid['Femur.L'] !== 'za:femur-l') {
    throw new Error('mapa nó→sid incorreto para Femur.L');
  }

  const heartOrgan = manifest.assets.find((a) => a.file.includes('heart-male'));
  if (!heartOrgan || heartOrgan.license !== 'CC-BY-4.0') {
    throw new Error('licença do órgão HRA não é CC-BY-4.0');
  }
  const heartStructure = structures.find((s) => s.sid === 'za:heart');
  if (!heartStructure || heartStructure.source !== 'hra') {
    throw new Error('structures.json: estrutura do HRA sem source="hra"');
  }
});

step('4. validate.mjs — caso bom deve passar (esquema real + budgets.json reais do WP02)', () => {
  const schemaPath = path.join(ROOT, '../../frontend/modulos/anatomia-3d/data/atlas/schema/manifest.schema.json');
  const budgetsPath = path.join(ROOT, '../../frontend/modulos/anatomia-3d/data/atlas/schema/budgets.json');
  run('node', [
    'validate.mjs',
    '--manifest',
    path.relative(ROOT, manifestPath),
    '--schema',
    path.relative(ROOT, schemaPath),
    '--budgets',
    path.relative(ROOT, budgetsPath),
  ]);
});

step('4b. validate.mjs — licença misturada deve falhar', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const esqueleticoLod0 = manifest.assets.find((a) => a.system === 'esqueletico' && a.lod === 'lod0');
  esqueleticoLod0.license = 'CC-BY-9.9'; // valor inválido, proposital
  const badPath = path.join(WORK, 'manifest-licenca-misturada.json');
  fs.writeFileSync(badPath, JSON.stringify(manifest, null, 2));
  const output = runExpectFailure('node', [
    'validate.mjs',
    '--manifest',
    path.relative(ROOT, badPath),
    '--schema',
    path.relative(ROOT, path.join(WORK, 'schema-inexistente.json')),
    '--budgets',
    path.relative(ROOT, path.join(WORK, 'budgets-inexistente.json')),
  ]);
  if (!/licença/.test(output)) {
    throw new Error(`esperava mensagem de erro de licença na saída, recebeu:\n${output}`);
  }
});

step('4c. validate.mjs — sistema acima do orçamento deve falhar', () => {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const esqueleticoLod0 = manifest.assets.find((a) => a.system === 'esqueletico' && a.lod === 'lod0');
  esqueleticoLod0.bytes = 999 * 1024 * 1024; // 999 MB, bem acima do limite
  const badPath = path.join(WORK, 'manifest-orcamento-excedido.json');
  fs.writeFileSync(badPath, JSON.stringify(manifest, null, 2));
  const budgetsPath = path.join(ROOT, '../../frontend/modulos/anatomia-3d/data/atlas/schema/budgets.json');
  const output = runExpectFailure('node', [
    'validate.mjs',
    '--manifest',
    path.relative(ROOT, badPath),
    '--schema',
    path.relative(ROOT, path.join(WORK, 'schema-inexistente.json')),
    '--budgets',
    path.relative(ROOT, budgetsPath),
  ]);
  if (!/orçamento/.test(output)) {
    throw new Error(`esperava mensagem de erro de orçamento na saída, recebeu:\n${output}`);
  }
});

step('4d. validate.mjs --structures — caso bom deve passar (sentinelas presentes)', () => {
  const budgetsPath = path.join(ROOT, '../../frontend/modulos/anatomia-3d/data/atlas/schema/budgets.json');
  run('node', [
    'validate.mjs',
    '--manifest',
    path.relative(ROOT, manifestPath),
    '--budgets',
    path.relative(ROOT, budgetsPath),
    '--structures',
    path.relative(ROOT, structuresPath),
  ]);
});

step('4e. validate.mjs --structures — sistema sem sentinela deve falhar (guarda contra mapa sistema↔coleção errado)', () => {
  const structures = JSON.parse(fs.readFileSync(structuresPath, 'utf8'));
  // Simula o bug real (SOURCES.md): "cardiovascular" cheio de estruturas de
  // outro sistema (aqui, do esqueletico), sem nenhum coração/aorta.
  const tampered = structures.map((s) =>
    s.system === 'cardiovascular' ? { ...s, englishName: 'Interosseous membrane of leg', system: 'cardiovascular' } : s
  );
  const badPath = path.join(WORK, 'structures-sem-sentinela.json');
  fs.writeFileSync(badPath, JSON.stringify(tampered, null, 2));
  const budgetsPath = path.join(ROOT, '../../frontend/modulos/anatomia-3d/data/atlas/schema/budgets.json');
  const output = runExpectFailure('node', [
    'validate.mjs',
    '--manifest',
    path.relative(ROOT, manifestPath),
    '--budgets',
    path.relative(ROOT, budgetsPath),
    '--structures',
    path.relative(ROOT, badPath),
  ]);
  if (!/sentinela/.test(output)) {
    throw new Error(`esperava mensagem de erro de sentinela na saída, recebeu:\n${output}`);
  }
});

console.log(`\n=================================`);
if (failures > 0) {
  console.error(`${failures} etapa(s) falharam.`);
  process.exit(1);
}
console.log('Todas as etapas passaram.');
