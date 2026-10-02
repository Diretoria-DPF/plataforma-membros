/** fichas-lotes.test.mjs — 10 ondas, lotes ≤ 20, as 300 cobertas uma vez (PR 3.2, B.1). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOndas, ONDAS, LOTE_MAX } from '../fichas-lotes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const prio = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/atlas-conteudo/prioridades.json'), 'utf8'));
const ondas = buildOndas(prio.itens, { Heart: 'Coração' });

assert.equal(ondas.length, 10);
assert.deepEqual(ondas.map((o) => o.sistema), ONDAS);
assert.equal(ondas[0].sistema, 'cardiovascular');
assert.equal(ondas.reduce((n, o) => n + o.total, 0), 300);
const sids = ondas.flatMap((o) => o.lotes.flatMap((l) => l.itens.map((i) => i.sid)));
assert.equal(new Set(sids).size, 300);
for (const o of ondas) for (const l of o.lotes) assert.ok(l.itens.length >= 1 && l.itens.length <= LOTE_MAX);
// gravado em disco igual ao gerado
const disk = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/atlas-conteudo/fichas/onda-01.json'), 'utf8'));
assert.equal(disk.sistema, 'cardiovascular');
assert.equal(disk.total, ondas[0].total);
console.log('fichas-lotes: ok');
