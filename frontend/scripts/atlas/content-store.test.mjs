#!/usr/bin/env node
/**
 * content-store.test.mjs — índice sem duplicatas e ficha compartilhada entre
 * os lados (A.1/A.2 do PR 3.0, Onda 3).
 * Roda com: node frontend/scripts/atlas/content-store.test.mjs
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, '../../modulos/anatomia-3d/js/ui');
const { groupEntries, collapseResults, contentCandidates, baseSid } = await import(path.join(ui, 'structure-groups.js'));
const { buildSearchIndex, search } = await import(path.join(ui, 'search-index.js'));

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

console.log('content-store — índice sem duplicatas');

test("['za:kidney-l', 'za:kidney-r', 'za:heart'] (só sids) vira 2 entradas", () => {
  const groups = groupEntries([
    { sid: 'za:kidney-l', system: 'urinario', side: 'l' },
    { sid: 'za:kidney-r', system: 'urinario', side: 'r' },
    { sid: 'za:heart', system: 'cardiovascular' },
  ]);
  assert.equal(groups.length, 2);
  const kidney = groups.find((g) => g.sids.includes('za:kidney-r'));
  assert.equal(kidney.sids.length, 2);
  assert.equal(kidney.hasLeft, true);
  assert.equal(kidney.hasRight, true);
  assert.equal(kidney.sid, 'za:kidney-r'); // lado direito primeiro
  const heart = groups.find((g) => g.sids.includes('za:heart'));
  assert.equal(heart.hasLeft || heart.hasRight, false);
});

test('busca "rim" devolve 1 resultado (não 2)', () => {
  const entries = [
    { sid: 'za:kidney-l', system: 'urinario', side: 'l', names: { pt: 'Rim', en: 'Kidney', la: '' } },
    { sid: 'za:kidney-r', system: 'urinario', side: 'r', names: { pt: 'Rim', en: 'Kidney', la: '' } },
    { sid: 'za:heart', system: 'cardiovascular', names: { pt: 'Coração', en: 'Heart', la: '' } },
  ];
  const raw = search(buildSearchIndex(entries), 'rim');
  assert.equal(raw.length, 2); // o índice de busca tem os dois lados…
  const results = collapseResults(raw, new Map(entries.map((e) => [e.sid, e])));
  assert.equal(results.length, 1); // …e a lista mostra uma linha
  assert.equal(results[0].sideText, 'E/D');
});

test("ficha de 'za:kidney-r' é procurada também em 'za:kidney' e no outro lado", () => {
  assert.equal(baseSid('za:kidney-r'), 'za:kidney');
  assert.deepEqual(contentCandidates('za:kidney-r', ['za:kidney-l', 'za:kidney-r']), ['za:kidney-r', 'za:kidney', 'za:kidney-l']);
  assert.deepEqual(contentCandidates('za:heart', ['za:heart']), ['za:heart']);
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
