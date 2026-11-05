// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// A1: erros do Quiz guardados no aparelho (API simples, reutilizável pela revisão espaçada da A3).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const E = require(path.join(frontend, 'modulos/shared/quiz-errors.js'));

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 10, 5, 12, 0, 0);

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    dump: () => Object.fromEntries(data),
  };
}

test('A1: erro novo entra com sequência zerada e revisão para o dia seguinte', () => {
  const s = E.record(E.emptyStore(), { module: 'farmacologia', id: 7, topic: 'AINEs', correct: false, now: T0 });
  const item = s.items['farmacologia:7'];
  assert.equal(item.wrong, 1);
  assert.equal(item.streak, 0);
  assert.equal(item.topic, 'AINEs');
  assert.equal(Date.parse(item.due), T0 + DAY);
  assert.equal(Date.parse(item.last), T0);
});

test('A1: acerto de questão que nunca foi errada não cria registro', () => {
  const s = E.record(E.emptyStore(), { module: 'toxicologia', id: 3, topic: 'Metais', correct: true, now: T0 });
  assert.deepEqual(s.items, {});
});

test('A1: record é puro (não altera o objeto de entrada)', () => {
  const before = E.emptyStore();
  const snapshot = JSON.stringify(before);
  E.record(before, { module: 'farmacologia', id: 1, topic: 'X', correct: false, now: T0 });
  assert.equal(JSON.stringify(before), snapshot);
});

test('A1: acertos seguidos espaçam a revisão (1, 3, 7 dias) e o terceiro acerto quita o erro', () => {
  let s = E.record(E.emptyStore(), { module: 'farmacologia', id: 9, topic: 'T', correct: false, now: T0 });
  s = E.record(s, { module: 'farmacologia', id: 9, topic: 'T', correct: true, now: T0 + DAY });
  assert.equal(s.items['farmacologia:9'].streak, 1);
  assert.equal(Date.parse(s.items['farmacologia:9'].due), T0 + DAY + 3 * DAY);
  s = E.record(s, { module: 'farmacologia', id: 9, topic: 'T', correct: true, now: T0 + 4 * DAY });
  assert.equal(s.items['farmacologia:9'].streak, 2);
  assert.equal(Date.parse(s.items['farmacologia:9'].due), T0 + 4 * DAY + 7 * DAY);
  s = E.record(s, { module: 'farmacologia', id: 9, topic: 'T', correct: true, now: T0 + 11 * DAY });
  assert.equal(s.items['farmacologia:9'], undefined);
});

test('A1: novo erro zera a sequência e soma ao contador de erros', () => {
  let s = E.record(E.emptyStore(), { module: 'farmacologia', id: 9, topic: 'T', correct: false, now: T0 });
  s = E.record(s, { module: 'farmacologia', id: 9, topic: 'T', correct: true, now: T0 + DAY });
  s = E.record(s, { module: 'farmacologia', id: 9, topic: 'T', correct: false, now: T0 + 2 * DAY });
  assert.equal(s.items['farmacologia:9'].streak, 0);
  assert.equal(s.items['farmacologia:9'].wrong, 2);
});

test('A1: pending e due filtram por módulo e por vencimento', () => {
  let s = E.emptyStore();
  s = E.record(s, { module: 'farmacologia', id: 1, topic: 'A', correct: false, now: T0 });
  s = E.record(s, { module: 'toxicologia', id: 2, topic: 'B', correct: false, now: T0 + 2 * DAY });
  assert.deepEqual(E.pending(s, 'farmacologia').map((x) => x.id), [1]);
  assert.deepEqual(E.pending(s, 'toxicologia').map((x) => x.id), [2]);
  assert.equal(E.pending(s).length, 2);
  assert.deepEqual(E.due(s, T0 + DAY, 'farmacologia').map((x) => x.id), [1]);
  assert.deepEqual(E.due(s, T0 + DAY).map((x) => x.id), [1]);
  assert.equal(E.count(s, 'toxicologia'), 1);
});

test('A1: pending lista primeiro o erro mais recente', () => {
  let s = E.emptyStore();
  s = E.record(s, { module: 'farmacologia', id: 1, topic: 'A', correct: false, now: T0 });
  s = E.record(s, { module: 'farmacologia', id: 2, topic: 'A', correct: false, now: T0 + 1000 });
  assert.deepEqual(E.pending(s, 'farmacologia').map((x) => x.id), [2, 1]);
});

test('A1: limite de 500 itens descarta os mais antigos', () => {
  let s = E.emptyStore();
  for (let i = 0; i < 520; i++) s = E.record(s, { module: 'farmacologia', id: i, topic: 'A', correct: false, now: T0 + i * 1000 });
  assert.equal(Object.keys(s.items).length, 500);
  assert.equal(s.items['farmacologia:0'], undefined);
  assert.ok(s.items['farmacologia:519']);
});

test('A1: parse aceita lixo e entradas inválidas sem lançar erro', () => {
  assert.deepEqual(E.parse('não é json').items, {});
  assert.deepEqual(E.parse(null).items, {});
  assert.deepEqual(E.parse('{"v":1,"items":{"farmacologia:1":{"module":"farmacologia","id":1,"wrong":2,"streak":0,"last":"2026-11-05T12:00:00.000Z","due":"2026-11-06T12:00:00.000Z"},"x":42,"y:2":{"id":"nao"}}}').items['farmacologia:1'].wrong, 2);
  assert.equal(Object.keys(E.parse('{"items":{"x":42,"y:2":{"id":"nao"}}}').items).length, 0);
});

test('A1: armazenamento que lança erro nunca derruba o quiz', () => {
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('cheio'); }, removeItem() { throw new Error('x'); } };
  const store = E.createStore(quebrado, () => '');
  assert.doesNotThrow(() => store.record({ module: 'farmacologia', id: 1, topic: 'A', correct: false, now: T0 }));
  assert.equal(store.count('farmacologia'), 0);
  assert.deepEqual(store.pending('farmacologia'), []);
  assert.doesNotThrow(() => store.clear('farmacologia'));
  assert.doesNotThrow(() => E.createStore(null, () => '').record({ module: 'farmacologia', id: 1, topic: 'A', correct: false, now: T0 }));
});

test('A1: createStore grava e relê pelo localStorage sob uma única chave', () => {
  const storage = fakeStorage();
  const store = E.createStore(storage, () => 'dono1');
  store.record({ module: 'farmacologia', id: 4, topic: 'A', correct: false, now: T0 });
  store.record({ module: 'toxicologia', id: 5, topic: 'B', correct: false, now: T0 });
  assert.deepEqual(Object.keys(storage.dump()), [E.KEY]);
  const outro = E.createStore(storage, () => 'dono1');
  assert.equal(outro.count('farmacologia'), 1);
  assert.deepEqual(outro.ids('toxicologia'), [5]);
  store.clear('farmacologia');
  assert.equal(outro.count('farmacologia'), 0);
  assert.equal(outro.count('toxicologia'), 1);
});

test('A1: erros de outra conta no mesmo aparelho não aparecem', () => {
  const storage = fakeStorage();
  E.createStore(storage, () => 'dono1').record({ module: 'farmacologia', id: 4, topic: 'A', correct: false, now: T0 });
  const visitante = E.createStore(storage, () => 'dono2');
  assert.equal(visitante.count('farmacologia'), 0);
  visitante.record({ module: 'farmacologia', id: 8, topic: 'A', correct: false, now: T0 });
  assert.deepEqual(visitante.ids('farmacologia'), [8]);
  assert.equal(E.createStore(storage, () => 'dono1').count('farmacologia'), 0);
});

test('A1: sem dono identificado (visitante), os erros continuam locais e visíveis', () => {
  const storage = fakeStorage();
  const s = E.createStore(storage, () => '');
  s.record({ module: 'toxicologia', id: 1, topic: 'A', correct: false, now: T0 });
  assert.equal(E.createStore(storage, () => '').count('toxicologia'), 1);
});
