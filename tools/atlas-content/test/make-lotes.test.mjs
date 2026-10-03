/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * make-lotes.test.mjs — 20 lotes cobrem todos os nomes únicos, sem repetição
 * (PR 3.1.1, Onda 3).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { displayName, uniqueNames, splitLotes } from '../make-lotes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');

assert.equal(displayName('VH_F_kidney_capsule'), 'Kidney capsule');
assert.equal(displayName('VH_M_kidney_capsule'), 'Kidney capsule');
assert.equal(displayName('Orbital part of  inferior frontal gyrus'), 'Orbital part of inferior frontal gyrus');

const names = uniqueNames([
  { englishName: 'Femur', system: 'esqueletico' },
  { englishName: 'Femur', system: 'esqueletico' },
  { englishName: 'VH_F_heart', system: 'cardiovascular' },
  { englishName: 'VH_M_heart', system: 'cardiovascular' },
]);
assert.deepEqual(names.map((n) => n.name), ['Femur', 'Heart']);

const parts = splitLotes(Array.from({ length: 41 }, (_, i) => i), 4);
assert.deepEqual(parts.map((p) => p.length), [11, 10, 10, 10]);
assert.deepEqual(parts.flat(), Array.from({ length: 41 }, (_, i) => i));

// Lotes gravados em docs/atlas-traducao: 20, cobrindo todos os nomes únicos
// de structures.json, cada nome uma vez só.
const structures = JSON.parse(fs.readFileSync(path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas/generated/structures.json'), 'utf8'));
const expected = new Set(uniqueNames(structures).map((n) => n.name));
const dir = path.join(ROOT, 'docs/atlas-traducao');
const files = fs.readdirSync(dir).filter((f) => /^lote-\d+\.txt$/.test(f));
assert.equal(files.length, 20, `esperava 20 lotes, achou ${files.length}`);
const all = files.flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean));
assert.equal(new Set(all).size, all.length, 'nome repetido entre lotes');
assert.equal(all.length, expected.size, `lotes têm ${all.length} nomes; structures.json tem ${expected.size} únicos`);
for (const n of all) assert.ok(expected.has(n), `nome fora de structures.json: ${n}`);

console.log('make-lotes: ok');
