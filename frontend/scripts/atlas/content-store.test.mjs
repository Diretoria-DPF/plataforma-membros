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
const { mergeLayers } = await import(path.join(ui, 'content-merge.js'));
const { normalizeCompound } = await import(path.resolve(ui, '../modes/pharmacology.js'));

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

console.log('content-store — camadas curado > legado > gerado (PR 3.2, D1)');
const gen = { summary_pt: 'Texto gerado.', ids: { wikidata: 'Q1' }, sources: [{ field: 'summary_pt', type: 'wikipedia', ref: 'W' }, { field: 'anatomy.relations', type: 'wikipedia', ref: 'W2' }], anatomy: { relations: 'gerado' }, review: { status: 'auto-draft' } };
const leg = { summary_pt: 'Texto legado.', sources: [{ field: 'summary_pt', type: 'other', ref: 'L' }], review: { status: 'legacy-unverified' } };
const cur = { summary_pt: 'Texto curado.', ids: { ta2: '123' }, sources: [{ field: 'summary_pt', type: 'textbook', ref: 'Gray', obraId: 'grays42' }], review: { status: 'editorial' } };

test('ficha curada ganha da gerada e da legada', () => {
  const m = mergeLayers({ curated: cur, generated: gen, legacy: leg });
  assert.equal(m.summary_pt, 'Texto curado.');
  assert.equal(m.review.status, 'editorial');
  assert.deepEqual(m.ids, { wikidata: 'Q1', ta2: '123' });
  // fontes do bloco substituído saem; as de blocos que o curado não tocou ficam
  assert.ok(m.sources.some((x) => x.obraId === 'grays42'));
  assert.ok(!m.sources.some((x) => x.ref === 'W' || x.ref === 'L'));
  assert.ok(m.sources.some((x) => x.ref === 'W2'));
  assert.equal(m.anatomy.relations, 'gerado');
});

test('ficha legada ganha da gerada (sem curado)', () => {
  const m = mergeLayers({ generated: gen, legacy: leg });
  assert.equal(m.summary_pt, 'Texto legado.');
});

test('sem curado e sem legado, cai para a gerada; sem nada, null', () => {
  assert.equal(mergeLayers({ generated: gen }).summary_pt, 'Texto gerado.');
  assert.equal(mergeLayers({}), null);
  assert.equal(mergeLayers({ curated: cur }).summary_pt, 'Texto curado.');
});

console.log('compostos — schema duplo (PR 3.2, D2)');
test('composto v1 ganha F/PD padrão e fica legacy-unverified', () => {
  const v1 = { id: 'x', nome: 'X', mecanismo: 'm', pk: { route: 'ORAL', vd: 25, halfLife: 5, dose: 500, ka: 1.1 }, review: { status: 'legacy-unverified' } };
  const n = normalizeCompound(v1);
  assert.equal(n.pk.F, 0.75);
  assert.equal(n.pk.tmax, null);
  assert.deepEqual(n.pd, { emax: 100, ec50: 1.25, hill: 1.5 });
  assert.equal(n.review.status, 'legacy-unverified');
  assert.equal(n.legacyDefaults, true);
});
test('composto v2 passa como está', () => {
  const v2 = { id: 'y', pk: { route: 'ORAL', vd: 10, halfLife: 2, dose: 100, ka: 1, F: 0.9, tmax: 1 }, pd: { emax: 80, ec50: 2, hill: 1 } };
  assert.equal(normalizeCompound(v2), v2);
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
