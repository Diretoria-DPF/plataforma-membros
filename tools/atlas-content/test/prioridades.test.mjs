/**
 * prioridades.test.mjs — lista das 300 respeita as cotas e a ordem dos
 * critérios (PR 3.1.7, Onda 3).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPriorities, collectSids, COTAS } from '../prioridades.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');

assert.equal(Object.values(COTAS).reduce((a, b) => a + b, 0), 300);
assert.deepEqual(collectSids({ a: ['za:heart', 'x'], b: { c: 'za:liver' }, d: 'za:liver' }), ['za:heart', 'za:liver', 'za:liver']);

const box = (s) => ({ min: [0, 0, 0], max: [s, s, s] });
const structures = [
  { sid: 'za:kidney-l', englishName: 'Kidney', system: 'urinario', side: 'l', bbox: box(0.1) },
  { sid: 'za:kidney-r', englishName: 'Kidney', system: 'urinario', side: 'r', bbox: box(0.1) },
  { sid: 'za:ureter-r', englishName: 'Ureter', system: 'urinario', side: 'r', bbox: box(0.3) },
  { sid: 'za:vh-f-renal-pelvis-l', englishName: 'VH_F_renal_pelvis', system: 'urinario', side: 'l', bbox: box(0.01) },
  { sid: 'za:vh-m-renal-pelvis-l', englishName: 'VH_M_renal_pelvis', system: 'urinario', side: 'l', bbox: box(0.01) },
  { sid: 'za:big', englishName: '(Urinary group)', system: 'urinario', bbox: box(1) },
  { sid: 'za:skin', englishName: 'Skin', system: 'tegumentar', bbox: box(2) },
];
const items = buildPriorities(structures, {
  usage: { quiz: new Set(['za:kidney-l']) },
  withContent: new Set(['za:vh-m-renal-pelvis-l']),
}, { urinario: 3 });
assert.equal(items.length, 3);
assert.equal(items[0].name, 'Kidney'); // uso no quiz vence volume
assert.deepEqual(items[0].sids, ['za:kidney-l', 'za:kidney-r']); // lados contam uma vez
assert.equal(items[0].sid, 'za:kidney-r');
assert.equal(items[1].name, 'Renal pelvis'); // ficha existente vence volume; M e F juntos
assert.equal(items[1].sids.length, 2);
assert.equal(items[2].name, 'Ureter'); // grupo entre parênteses fica atrás
assert.ok(!items.some((i) => i.system === 'tegumentar')); // sistema sem cota não entra

// Arquivo gerado: 300 entradas, cotas exatas, sem estrutura repetida.
const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/atlas-conteudo/prioridades.json'), 'utf8'));
assert.equal(file.itens.length, 300);
const count = {};
for (const it of file.itens) count[it.system] = (count[it.system] || 0) + 1;
for (const [sys, cota] of Object.entries(COTAS)) assert.equal(count[sys] || 0, cota, `${sys}: ${count[sys] || 0} ≠ ${cota}`);
const allSids = file.itens.flatMap((i) => i.sids);
assert.equal(new Set(allSids).size, allSids.length, 'sid repetido na lista');

console.log('prioridades: ok');
