#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * structure-groups.test.mjs — uma linha por estrutura (crime C3, Onda 3)
 * Roda com: node frontend/scripts/atlas/structure-groups.test.mjs
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const mod = path.resolve(here, '../../modulos/anatomia-3d');
const { groupEntries, groupKeyOf, sideLabel } = await import(path.join(mod, 'js/ui/structure-groups.js'));

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

const e = (sid, en, side, system = 'urinario') => ({ sid, system, side, names: { pt: '', en, la: '' } });

console.log('structure-groups.js');

test('os dois lados viram um grupo com selo E/D e primary no lado direito', () => {
  const [g, ...rest] = groupEntries([e('za:kidney-l', 'Kidney', 'l'), e('za:kidney-r', 'Kidney', 'r')]);
  assert.equal(rest.length, 0);
  assert.deepEqual(g.sids.sort(), ['za:kidney-l', 'za:kidney-r']);
  assert.equal(g.sid, 'za:kidney-r');
  assert.equal(sideLabel(g.sides), 'E/D');
});

test('órgão HRA: M e F viram um grupo; primary é do sexo atual', () => {
  const list = [
    e('za:vh-f-hilum-of-kidney-l', 'Hilum of kidney', 'l'),
    e('za:vh-m-hilum-of-kidney-l', 'Hilum of kidney', 'l'),
    e('za:vh-m-hilum-of-kidney-r', 'Hilum of kidney', 'r'),
  ];
  assert.equal(groupEntries(list, { sex: 'M' })[0].sid, 'za:vh-m-hilum-of-kidney-r');
  assert.equal(groupEntries(list, { sex: 'F' })[0].sid, 'za:vh-f-hilum-of-kidney-l');
  assert.equal(groupEntries(list).length, 1);
});

test('corpo Z-Anatomy vence o órgão HRA com o mesmo nome', () => {
  const [g] = groupEntries([e('za:vh-m-kidney-r', 'Kidney', 'r'), e('za:kidney-r', 'Kidney', 'r')]);
  assert.equal(g.sid, 'za:kidney-r');
});

test('mesmo nome em sistemas diferentes não se junta', () => {
  assert.notEqual(groupKeyOf(e('a', 'Fascia', null, 'muscular')), groupKeyOf(e('b', 'Fascia', null, 'esqueletico')));
});

test('índice real: nenhum grupo repete nome no mesmo sistema e todo sid tem grupo', () => {
  const raw = JSON.parse(readFileSync(path.join(mod, 'data/atlas/generated/structures.boot.json'), 'utf8'));
  const pretty = (s) => String(s || '').replace(/^VH_[MF]_/, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const entries = raw.map((s) => ({ ...s, names: { pt: '', en: pretty(s.englishName), la: s.latinName || '' } }));
  const groups = groupEntries(entries);
  const seen = new Set();
  for (const g of groups) {
    assert.ok(!seen.has(g.key), `grupo repetido: ${g.key}`);
    seen.add(g.key);
  }
  assert.equal(groups.reduce((n, g) => n + g.sids.length, 0), entries.length);
  assert.ok(groups.length < entries.length * 0.7, `esperava bem menos linhas que sids (${groups.length}/${entries.length})`);
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
