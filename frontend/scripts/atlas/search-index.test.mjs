#!/usr/bin/env node
/**
 * search-index.test.mjs — teste de busca do Atlas
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/search-index.test.mjs
 *
 * Testa a implementação de busca com ranking (js/ui/search-index.js)
 * sobre o índice de fixture real (data/atlas/fixtures/index.json).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const searchIndexPath = path.resolve(here, '../../modulos/anatomia-3d/js/ui/search-index.js');
const fixturePath = path.resolve(here, '../../modulos/anatomia-3d/data/atlas/fixtures/index.json');

// Importar funções de busca
const { normalize, buildSearchIndex, search, levenshtein } = await import(searchIndexPath);

// Carregar fixture real
const fixtureData = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

// Construir índice
const index = buildSearchIndex(fixtureData);

let failures = 0;

/**
 * @param {string} name
 * @param {() => void} fn
 */
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

console.log('search-index.js');

test('normalize() remove acentos e espaços extras', () => {
  assert.equal(normalize('Coração'), 'coracao');
  assert.equal(normalize('Fígado'), 'figado');
  assert.equal(normalize('  pulmão   esquerdo  '), 'pulmao esquerdo');
  assert.equal(normalize(''), '');
});

test('levenshtein() calcula corretamente a distância', () => {
  assert.equal(levenshtein('figado', 'figado'), 0);
  assert.equal(levenshtein('figado', 'figado'), 0);
  assert.equal(levenshtein('figdo', 'figado'), 1); // falta um 'a'
  assert.equal(levenshtein('abc', 'xyz'), 3); // excede limite, retorna 3
});

test('"coracao" (sem acento) → primeiro resultado é o coração', () => {
  const results = search(index, 'coracao');
  assert.ok(results.length > 0, 'deveria ter resultados');
  assert.equal(results[0].sid, 'fma:7088', 'primeiro resultado deveria ser o coração');
});

test('"cor" → encontra o coração por prefix match', () => {
  const results = search(index, 'cor');
  const sids = results.map(r => r.sid);
  assert.ok(sids.includes('fma:7088'), 'coração deveria estar nos resultados');
});

test('"figdo" (typo) → encontra o fígado por fuzzy', () => {
  const results = search(index, 'figdo');
  const sids = results.map(r => r.sid);
  assert.ok(sids.includes('fma:7197'), 'fígado deveria estar nos resultados');
});

test('"liver" (nome em EN) → encontra fígado', () => {
  const results = search(index, 'liver');
  const sids = results.map(r => r.sid);
  assert.ok(sids.includes('fma:7197'), 'fígado (liver) deveria estar nos resultados');
});

test('"heart" (nome em EN) → encontra coração', () => {
  const results = search(index, 'heart');
  const sids = results.map(r => r.sid);
  assert.ok(sids.includes('fma:7088'), 'coração (heart) deveria estar nos resultados');
});

test('"pulmao esquerdo" → pulmão esquerdo rank primeiro', () => {
  const results = search(index, 'pulmao esquerdo');
  assert.ok(results.length > 0, 'deveria ter resultados');
  assert.equal(results[0].sid, 'fma:7310', 'pulmão esquerdo deveria ser o primeiro');
});

test('"" (query vazia) → retorna []', () => {
  const results = search(index, '');
  assert.deepEqual(results, [], 'query vazia deveria retornar array vazio');
});

test('limit é respeitado', () => {
  const results = search(index, 'pulmao', { limit: 1 });
  assert.ok(results.length <= 1, 'deveria respeitar o limite');
});

test('sem sids duplicados nos resultados', () => {
  const results = search(index, 'pulmao');
  const sids = results.map(r => r.sid);
  const uniqueSids = new Set(sids);
  assert.equal(sids.length, uniqueSids.size, 'não deveria haver sids duplicados');
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
