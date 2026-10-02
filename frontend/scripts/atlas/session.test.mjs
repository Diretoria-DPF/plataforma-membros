#!/usr/bin/env node
/**
 * session.test.mjs — "continuar de onde parou" e link direto (js/ui/session.js).
 * Uso: node scripts/atlas/session.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const S = await import(path.resolve(here, '../../modulos/anatomia-3d/js/ui/session.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) {
    failures += 1; console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const NOW = 1_800_000_000_000;
const state = { selectedSid: 'za:liver', mode: 'explorar', layers: { pele: { visible: false }, visceras: { visible: true } } };
const camera = { position: [0, 1, 2], target: [0, 1, 0] };

console.log('session.js');

test('hash: lê sid e vista válidos e ignora o resto', () => {
  assert.deepEqual(S.parseAtlasHash('#sid=za:liver&view=posterior'), { sid: 'za:liver', view: 'posterior' });
  assert.deepEqual(S.parseAtlasHash('#sid=<script>&view=lado'), { sid: null, view: null });
  assert.deepEqual(S.parseAtlasHash(''), { sid: null, view: null });
});

test('hash: buildAtlasHash é o inverso de parseAtlasHash', () => {
  const h = S.buildAtlasHash({ sid: 'za:kidney-r', view: 'anterior' });
  assert.deepEqual(S.parseAtlasHash(h), { sid: 'za:kidney-r', view: 'anterior' });
  assert.equal(S.buildAtlasHash({}), '');
});

test('grava e lê a sessão (seleção, camadas, câmera)', () => {
  const st = memory();
  assert.ok(S.writeSession(st, S.snapshotSession(state, camera, NOW)));
  const back = S.readSession(st, NOW + 1000);
  assert.equal(back.selectedSid, 'za:liver');
  assert.deepEqual(back.layers, { pele: false, visceras: true });
  assert.deepEqual(back.camera, camera);
});

test('sessão sem nada para retomar, velha ou corrompida vira null', () => {
  const st = memory();
  S.writeSession(st, S.snapshotSession({ selectedSid: null, mode: 'explorar', layers: {} }, null, NOW));
  assert.equal(S.readSession(st, NOW), null);
  S.writeSession(st, S.snapshotSession(state, camera, NOW));
  assert.equal(S.readSession(st, NOW + S.SESSION_MAX_AGE_MS + 1), null);
  st.setItem(S.SESSION_KEY, '{quebrado');
  assert.equal(S.readSession(st, NOW), null);
});

test('modo diferente de Explorar vale retomar mesmo sem seleção', () => {
  const st = memory();
  S.writeSession(st, S.snapshotSession({ selectedSid: null, mode: 'quiz', layers: {} }, null, NOW));
  assert.equal(S.readSession(st, NOW).mode, 'quiz');
});

test('armazenamento bloqueado não lança erro', () => {
  const blocked = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceeded'); } };
  assert.equal(S.readSession(blocked, NOW), null);
  assert.equal(S.writeSession(blocked, S.snapshotSession(state, camera, NOW)), false);
});

test('registro de outra schemaVersion é descartado e apagado', () => {
  const st = memory();
  st.setItem(S.SESSION_KEY, JSON.stringify({ ...S.snapshotSession(state, camera, NOW), schemaVersion: 0 }));
  assert.equal(S.readSession(st, NOW), null);
  assert.equal(st.getItem(S.SESSION_KEY), null);
});

test('sid que não existe mais zera seleção e câmera', () => {
  const saved = S.validateSession(S.snapshotSession({ ...state, mode: 'quiz' }, camera, NOW), NOW);
  const kept = S.dropUnknownSid(saved, () => true);
  assert.equal(kept.selectedSid, 'za:liver');
  const dropped = S.dropUnknownSid(saved, () => false);
  assert.equal(dropped.selectedSid, null);
  assert.equal(dropped.camera, null);
  assert.equal(dropped.mode, 'quiz');
  const explorar = S.validateSession(S.snapshotSession(state, camera, NOW), NOW);
  assert.equal(S.dropUnknownSid(explorar, () => false), null, 'sem sid e em Explorar não há o que retomar');
});

test('"Continuar" é oferecido uma vez por aba', () => {
  const ss = memory();
  assert.equal(S.resumeAlreadyOffered(ss), false);
  S.markResumeOffered(ss);
  assert.equal(S.resumeAlreadyOffered(ss), true);
  assert.equal(S.resumeAlreadyOffered({ getItem() { throw new Error('x'); } }), false);
});

test('progresso do quiz é salvo e volta só no modo Quiz', () => {
  const quiz = { caseId: 'caso-b', sessionSeed: 42, score: 175, correct: 1, answered: 1 };
  const st = memory();
  S.writeSession(st, S.snapshotSession({ selectedSid: null, mode: 'quiz', layers: {} }, null, NOW, quiz));
  assert.deepEqual(S.readSession(st, NOW).quiz, quiz);
  const bad = S.snapshotSession({ selectedSid: null, mode: 'quiz', layers: {} }, null, NOW, { caseId: '<x>' });
  assert.equal(bad.quiz, undefined, 'caseId fora do formato é descartado');
  S.writeSession(st, S.snapshotSession(state, camera, NOW, quiz));
  assert.equal(S.readSession(st, NOW).quiz, null, 'fora do modo Quiz não retoma quiz');
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
