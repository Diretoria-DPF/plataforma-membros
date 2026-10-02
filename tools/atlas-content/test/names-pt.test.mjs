/**
 * names-pt.test.mjs — integração da tradução dos nomes (PR 3.1.5, Onda 3).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLote, applyNames } from '../names-pt.mjs';
import { displayName } from '../make-lotes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../../..');
const DATA = path.join(ROOT, 'frontend/modulos/anatomia-3d/data/atlas');

// parseLote: confere ordem, conta linhas, limpa "??", invisíveis e maiúscula.
const ok = parseLote('Femur\nKidney capsule\n', 'Femur\tfêmur\nKidney capsule\tCápsula​ renal ??\n');
assert.deepEqual(ok.errors, []);
assert.deepEqual(ok.entries, [
  { en: 'Femur', pt: 'Fêmur', review: false },
  { en: 'Kidney capsule', pt: 'Cápsula renal', review: true },
]);
assert.ok(parseLote('A\nB\n', 'A\tx\n').errors.length > 0, 'falta linha');
assert.ok(parseLote('A\nB\n', 'B\tx\nA\ty\n').errors.length > 0, 'ordem trocada');

// applyNames: por nome de exibição (lados e versões M/F do HRA juntos).
const s = [
  { sid: 'za:femur-l', englishName: 'Femur' },
  { sid: 'za:vh-f-heart', englishName: 'VH_F_heart' },
  { sid: 'za:x', englishName: 'Unknown thing' },
];
assert.equal(applyNames(s, { Femur: 'Fêmur', Heart: 'Coração' }), 1);
assert.equal(s[0].namePt, 'Fêmur');
assert.equal(s[1].namePt, 'Coração');
assert.equal(s[2].namePt, undefined);

// Dados gravados: todo nome único de structures.json tem tradução, sem "??"
// nem "*", e o boot carrega o mesmo namePt.
const names = JSON.parse(fs.readFileSync(path.join(DATA, 'names-pt.json'), 'utf8'));
const structures = JSON.parse(fs.readFileSync(path.join(DATA, 'generated/structures.json'), 'utf8'));
const boot = JSON.parse(fs.readFileSync(path.join(DATA, 'generated/structures.boot.json'), 'utf8'));
for (const st of structures) {
  const n = displayName(st.englishName);
  assert.ok(names.nomes[n], `sem tradução: ${n}`);
  assert.equal(st.namePt, names.nomes[n], `structures.json desatualizado para ${n}`);
}
for (const b of boot) assert.ok(b.namePt, `boot sem namePt: ${b.sid}`);
for (const v of Object.values(names.nomes)) assert.ok(!/\?\?|\*|​/.test(v), `marca sobrando: ${v}`);
const pick = (en) => names.nomes[en];
assert.equal(pick('Femur'), 'Fêmur');
assert.equal(pick('Kidney'), 'Rim');
assert.equal(pick('Second metacarpal bone'), 'Osso metacarpal II');
assert.equal(pick('Aortic valve'), 'Valva da aorta');

console.log('names-pt: ok');
