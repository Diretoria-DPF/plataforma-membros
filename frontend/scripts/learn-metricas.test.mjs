/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Conquistas e métricas do Aprender v2 (learn-metricas.js): modelo puro, sequência da semana, estado vazio e fiação sob demanda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = require('../learn-metricas.js');
const Lazy = require('../lazy-bundles.js');

const NOW = new Date('2026-11-04T15:00:00-03:00'); // quarta-feira
const MODULES = [{ id: 'farmaco', stat: 'farmacologia', name: 'Farmacologia' }, { id: 'toxico', stat: 'toxicologia', name: 'Toxicologia' }];

test('sem nenhum dado, o modelo é vazio e orienta o primeiro passo', () => {
  const m = lib.buildModel({ stats: { questionsAnswered: 0, byModule: {} }, streak: null, modules: MODULES, weak: [], now: NOW });
  assert.equal(m.isEmpty, true);
  assert.equal(m.week.filter((d) => d.on).length, 0);
});

test('modelo com dados: sequência, melhor sequência, acerto por módulo e próxima conquista', () => {
  const m = lib.buildModel({
    stats: { accuracyPct: 72, questionsAnswered: 40, byModule: { farmacologia: { attempts: 5, accuracyPct: 72 } }, badges: [{ id: 'centena', unlocked: false }] },
    streak: { current: 4, best: 6, activeToday: true }, modules: MODULES, weak: [], now: NOW,
  });
  assert.equal(m.isEmpty, false);
  assert.equal(m.streak, 4);
  assert.equal(m.best, 6);
  assert.equal(m.accuracy, 72);
  assert.deepEqual(m.modules.map((x) => x.name), ['Farmacologia']);
  assert.deepEqual(m.next, { label: 'Centena', done: 40, total: 100 });
});

test('a melhor sequência nunca fica abaixo da atual; conquista já aberta some da próxima', () => {
  const m = lib.buildModel({ stats: { questionsAnswered: 150, badges: [{ id: 'centena', unlocked: true }] }, streak: { current: 9, best: 3, activeToday: false }, modules: MODULES, now: NOW });
  assert.equal(m.best, 9);
  assert.equal(m.next, null);
});

test('semana: sete dias terminando hoje, acesos pela sequência e texto alternativo', () => {
  const week = lib.weekSeries({ current: 3, activeToday: true }, NOW);
  assert.equal(week.length, 7);
  assert.equal(week[6].today, true);
  assert.deepEqual(week.map((d) => d.on), [false, false, false, false, true, true, true]);
  assert.equal(week[6].name, 'quarta');
  assert.match(lib.weekSummary(week), /^3 dias de estudo nos últimos 7 dias \(segunda, terça, quarta\)$/);
  const ontem = lib.weekSeries({ current: 2, activeToday: false }, NOW);
  assert.deepEqual(ontem.map((d) => d.on), [false, false, false, false, true, true, false]);
  assert.equal(lib.weekSummary(lib.weekSeries(null, NOW)), '0 dias de estudo nos últimos 7 dias');
});

test('entradas inválidas não quebram o modelo', () => {
  const m = lib.buildModel({ stats: { questionsAnswered: 'x', accuracyPct: 'y', byModule: { farmacologia: { attempts: -2, accuracyPct: null } } }, streak: { current: -1 }, modules: MODULES, now: NOW });
  assert.equal(m.isEmpty, true);
  assert.equal(m.accuracy, null);
  assert.equal(lib.buildModel({}).isEmpty, true);
});

test('o pacote "metricas" é sob demanda: está em lazy-bundles, existe no disco e fora do index e do PRECACHE', () => {
  assert.deepEqual(Lazy.BUNDLES.metricas, ['learn-metricas.js']);
  assert.ok(fs.existsSync(path.join(raiz, 'learn-metricas.js')));
  const index = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8');
  assert.ok(!index.includes('learn-metricas.js'));
  assert.ok(!sw.includes('learn-metricas.js'));
});

test('linguagem: sem diminutivos nem texto de revisão, IA ou rascunho', () => {
  const src = fs.readFileSync(path.join(raiz, 'learn-metricas.js'), 'utf8');
  assert.ok(!/revisad|rascunho|\bIA\b|por IA|inho\b|inha\b/i.test(src.replace(/Plataforma|Licença/g, '')));
  assert.ok(!/innerHTML/.test(src));
});
