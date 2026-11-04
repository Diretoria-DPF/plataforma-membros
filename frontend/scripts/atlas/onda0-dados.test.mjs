#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * onda0-dados.test.mjs — correções de dados da Onda 0 do Atlas (ATL-02, 03, 04).
 * Roda com: node frontend/scripts/atlas/onda0-dados.test.mjs
 *
 * - Quiz: gabarito coerente com o enunciado e sem erros conhecidos.
 * - Identificadores externos: o mesmo Wikidata/TA2/FMA/UBERON não pode aparecer
 *   em estruturas de nomes diferentes (espelhos esquerdo/direito e
 *   masculino/feminino compartilham o conceito, e são aceitos).
 * - Laringe: epiglote e cartilagem tireóidea no sistema respiratório.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '../../modulos/anatomia-3d/data/atlas');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) { failures += 1; console.error(`  FALHOU — ${name}\n    ${err.message}`); }
}

// ---------------------------------------------------------------- quiz ----
const cases = readJson('quiz-cases.json');
const structures = readJson('generated/structures.json');
const sidSet = new Set(structures.map((s) => s.sid));
const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
const accepted = (c) => new Set([].concat(c.correctSid || [], c.correctSids || []));
const text = (c) => `${c.prompt_pt}\n${c.explanation_pt}`;

console.log('quiz-cases.json (ATL-02)');

test('todos os sids dos casos existem no corpo 3D e nenhum distrator conta como acerto', () => {
  for (const c of cases) {
    const ok = accepted(c);
    for (const sid of [...ok, ...(c.distractorSids || [])]) assert.ok(sidSet.has(sid), `${c.id}: sid inexistente ${sid}`);
    for (const d of c.distractorSids || []) assert.ok(!ok.has(d), `${c.id}: distrator ${d} também é acerto`);
  }
});

test('adrenalina na anafilaxia: gabarito é o vasto lateral (face anterolateral da coxa)', () => {
  const c = byId['caso-injecao-deltoide'];
  assert.ok(c, 'caso presente');
  assert.match(c.correctSid, /^za:vastus-lateralis-muscle-[lr]$/);
  assert.ok(!/deltoid/.test([...accepted(c)].join(' ')), 'deltoide não é acerto');
  assert.ok(!/fenestrad/i.test(text(c)), 'capilar do músculo esquelético é contínuo, não fenestrado');
  assert.match(c.prompt_pt, /anterolateral/i);
  assert.ok(!/\b0[.,]5\s*mg\b/i.test(text(c)), 'sem dose não confirmada em fonte');
});

test('neuroeixo L3-L4: o gabarito não é a medula espinal', () => {
  const c = byId['caso-neuroeixo-espinhal'];
  assert.ok(c, 'caso presente');
  const ok = [...accepted(c)].join(' ');
  assert.ok(!/spinal-cord/.test(ok), 'medula espinal termina em L1-L2 no adulto');
  assert.ok(accepted(c).has('za:spinal-dura'));
  assert.match(text(c), /cauda equina/i);
  assert.ok(!/Peridural/.test(c.prompt_pt), 'o enunciado descreve só o bloqueio subaracnóideo');
});

test('BHE: pés terminais dos astrócitos (não podócitos) e distratores fora do encéfalo', () => {
  const c = byId['caso-bhe-neurologia'];
  assert.ok(c, 'caso presente');
  assert.ok(!/podócit/i.test(text(c)));
  assert.match(c.prompt_pt, /pés terminais|prolongamentos/i);
  for (const d of c.distractorSids) assert.ok(!/cerebell|medulla|spinal|telenceph|midbrain|pons/.test(d), `distrator ${d} também é do SNC`);
});

test('nenhum caso traz dose numérica de fármaco no enunciado', () => {
  for (const c of cases) assert.ok(!/\b\d+([.,]\d+)?\s*(mg|mcg|µg|g|mL|UI)\b/i.test(c.prompt_pt), `${c.id}: dose no enunciado`);
});

// ------------------------------------------------ identificadores externos --
console.log('identificadores externos (ATL-03)');

const family = (sid) => sid.replace(/^za:vh-[mf]-/, "za:").replace(/-[lr]$/, "");
// Pares que são o mesmo conceito sob nomes diferentes (decisão registrada).
const SAME_CONCEPT = [new Set(['za:vh-f-skin', 'za:pele-epiderme-derme'])];
const sameConcept = (a, b) => SAME_CONCEPT.some((s) => s.has(a) && s.has(b));
const ID_KEYS = ['wikidata', 'ta2', 'fma', 'uberon'];

function loadRecords(dir) {
  const out = [];
  for (const f of fs.readdirSync(path.join(DATA, dir)).filter((n) => n.endsWith('.json')).sort()) {
    const data = readJson(`${dir}/${f}`);
    for (const [sid, rec] of Object.entries(data)) out.push({ sid, ids: rec.ids || {}, file: `${dir}/${f}` });
  }
  return out;
}

/** Devolve as colisões "chave:valor" -> sids de famílias diferentes. */
export function findIdCollisions(records) {
  const seen = new Map();
  for (const r of records) {
    for (const k of ID_KEYS) {
      const v = r.ids[k];
      if (!v) continue;
      const key = `${k}:${v}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(r.sid);
    }
  }
  const out = [];
  for (const [key, sids] of seen) {
    const distinct = [...new Set(sids)];
    const clash = distinct.some((a) => distinct.some((b) => a !== b && family(a) !== family(b) && !sameConcept(a, b)));
    if (clash) out.push(`${key} -> ${distinct.join(', ')}`);
  }
  return out;
}

test('o detector acusa o mesmo id em estruturas de nomes diferentes e aceita espelhos', () => {
  const bad = findIdCollisions([
    { sid: 'za:pancreas-fracao-exocrina', ids: { wikidata: 'Q9612' } },
    { sid: 'za:utero-f', ids: { wikidata: 'Q9612' } },
  ]);
  assert.equal(bad.length, 1);
  const ok = findIdCollisions([
    { sid: 'za:vh-m-mitral-valve', ids: { ta2: 'A12.1.04.003' } },
    { sid: 'za:vh-f-mitral-valve', ids: { ta2: 'A12.1.04.003' } },
    { sid: 'za:rectus-abdominis-muscle-l', ids: { wikidata: 'Q275150' } },
    { sid: 'za:rectus-abdominis-muscle-r', ids: { wikidata: 'Q275150' } },
  ]);
  assert.deepEqual(ok, []);
});

for (const dir of ['content', 'legacy/content']) {
  test(`${dir}: sem Wikidata/TA2/FMA/UBERON repetido entre estruturas diferentes`, () => {
    assert.deepEqual(findIdCollisions(loadRecords(dir)), []);
  });
}

test('ids corrigidos (consulta à API do Wikidata em 04/11/2026)', () => {
  const all = Object.fromEntries(loadRecords('content').map((r) => [r.sid, r.ids]));
  assert.equal(all['za:pancreas-fracao-exocrina'].wikidata, 'Q9618');
  assert.equal(all['za:utero-f'].wikidata, 'Q9612');
  assert.equal(all['za:sangue-plasma-elementos-figurados'].wikidata, 'Q7873');
  assert.equal(all['za:penis-corpos-cavernosos-m'].wikidata, 'Q1455226');
  assert.equal(all['za:mesenterio-peritonio'].wikidata, 'Q1135563');
  assert.equal(all['za:arvore-bronquica'].wikidata, 'Q66517812');
  assert.equal(all['za:vh-f-left-ventricle'].ta2, 'A12.1.04.001');
  assert.equal(all['za:vh-f-right-ventricle'].ta2, 'A12.1.02.001');
  assert.equal(all['za:vh-f-right-ventricle'].wikidata, 'Q1308310');
});

// ------------------------------------------------------------ laringe ------
console.log('laringe (ATL-04)');

test('epiglote e cartilagem tireóidea ficam no sistema respiratório (sem duplicata em outro sistema)', () => {
  for (const sid of ['za:epiglottis', 'za:thyroid-cartilage']) {
    const systems = structures.filter((s) => s.sid === sid).map((s) => s.system);
    assert.ok(systems.length >= 1, `${sid} existe`);
    assert.deepEqual([...new Set(systems)], ['respiratorio'], `${sid}: ${systems.join(',')}`);
  }
});

if (failures) { console.error(`\n${failures} falha(s)`); process.exit(1); }
console.log('\ntodos os testes passaram');
