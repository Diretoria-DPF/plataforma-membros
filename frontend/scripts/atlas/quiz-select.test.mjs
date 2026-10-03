#!/usr/bin/env node
/**
 * quiz-select.test.mjs — sorteio e filtros do Quiz (Onda 3.5, B.2).
 * Uso: node --test scripts/atlas/quiz-select.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickCases, availableFilters, filterCases, seedFromSearch, randomSeed, shuffleWithSeed, QUIZ_COUNT } from '../../modulos/anatomia-3d/js/modes/quiz-select.js';

const SYS = ['nervoso', 'digestorio', 'urinario'];
const DIF = ['facil', 'medio', 'dificil'];
const ALL = Array.from({ length: 30 }, (_, i) => ({ id: `c${i}`, system: SYS[i % 3], difficulty: DIF[i % 3 === 0 ? i % 2 : 2] }));

test('a rodada sorteia no máximo 10 casos e é reproduzível pela semente', () => {
  const a = pickCases(ALL, { seed: 5 });
  assert.equal(a.length, QUIZ_COUNT);
  assert.deepEqual(a.map((c) => c.id), pickCases(ALL, { seed: 5 }).map((c) => c.id));
  assert.notDeepEqual(a.map((c) => c.id), pickCases(ALL, { seed: 6 }).map((c) => c.id));
  assert.equal(new Set(a.map((c) => c.id)).size, a.length, 'sem repetir caso');
  assert.equal(pickCases(ALL.slice(0, 4), { seed: 1 }).length, 4);
});

test('filtros por sistema e dificuldade; sem resultado devolve vazio', () => {
  const nerv = pickCases(ALL, { system: 'nervoso', seed: 1 });
  assert.ok(nerv.length > 0 && nerv.every((c) => c.system === 'nervoso'));
  const dif = filterCases(ALL, { difficulty: 'dificil' });
  assert.ok(dif.length > 0 && dif.every((c) => c.difficulty === 'dificil'));
  assert.deepEqual(pickCases(ALL, { system: 'endocrino' }), []);
  assert.equal(filterCases(ALL, { system: 'nervoso', difficulty: 'dificil' }).every((c) => c.system === 'nervoso' && c.difficulty === 'dificil'), true);
});

test('availableFilters conta só o que existe, em português e ordenado', () => {
  const f = availableFilters(ALL);
  assert.deepEqual(f.systems.map((s) => s.id), ['digestorio', 'nervoso', 'urinario']);
  assert.equal(f.systems.reduce((n, s) => n + s.count, 0), 30);
  assert.equal(f.systems[1].label, 'Nervoso');
  assert.deepEqual(availableFilters([{ system: 'nervoso', difficulty: 'facil' }]).difficulties.map((d) => d.label), ['Fácil']);
});

test('?seed= fixa a rodada; valor inválido ou ausente cai no sorteio', () => {
  assert.equal(seedFromSearch('?seed=42'), 42);
  assert.equal(seedFromSearch('?seed=-1'), null);
  assert.equal(seedFromSearch('?seed=abc'), null);
  assert.equal(seedFromSearch(''), null);
  assert.equal(seedFromSearch('?seed=1.5'), null);
  const r = randomSeed(() => 0.5);
  assert.ok(Number.isInteger(r) && r > 0);
});

test('o embaralhamento antigo (semente 42) continua igual', () => {
  assert.deepEqual(shuffleWithSeed([1, 2, 3, 4, 5], 42), shuffleWithSeed([1, 2, 3, 4, 5], 42));
  assert.equal(shuffleWithSeed([1, 2, 3, 4, 5], 42).length, 5);
});
