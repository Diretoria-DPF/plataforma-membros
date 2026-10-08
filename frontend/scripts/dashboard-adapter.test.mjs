/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Adaptador do Início (frontend/dashboardAdapter.js): funções puras sobre as
// respostas de apiGetHomeSummary e apiGetMyTimeseries. Nada de DOM aqui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const A = require('../dashboardAdapter.js');

const serie = (points, extra) => ({
  success: true, range: '30d', granularity: 'day', series: points.map(([date, value]) => ({ date, value })),
  ...(extra || {}),
});

test('normaliza a série: ordena por data, descarta datas inválidas e põe rótulo', () => {
  const res = A.normalizeSeries(serie([['2026-10-02', 3], ['lixo', 9], ['2026-10-01', 1], ['2026-13-01', 4], [null, 2]]));
  assert.equal(res.ok, true);
  assert.equal(res.granularity, 'day');
  assert.deepEqual(res.points, [
    { date: '2026-10-01', label: '01/10', value: 1 },
    { date: '2026-10-02', label: '02/10', value: 3 },
  ]);
});

test('valores ausentes ou não numéricos viram zero, nunca NaN', () => {
  const res = A.normalizeSeries(serie([['2026-10-01', null], ['2026-10-02', 'abc'], ['2026-10-03', '4']]));
  assert.deepEqual(res.points.map((p) => p.value), [0, 0, 4]);
});

test('rótulo mensal usa mês abreviado em pt-BR e ano curto', () => {
  const res = A.normalizeSeries({ success: true, granularity: 'month', series: [{ date: '2026-09-01', value: 2 }] });
  assert.equal(res.points[0].label, 'set/26');
  assert.equal(A.labelFor('2026-12-01', 'month'), 'dez/26');
});

test('falha da API (success falso, sem série ou formato errado) vira ok:false com mensagem', () => {
  assert.deepEqual(A.normalizeSeries({ success: false, message: 'Servidor ocupado.' }), { ok: false, message: 'Servidor ocupado.' });
  assert.equal(A.normalizeSeries({ success: false }).message, 'Não foi possível carregar os dados.');
  assert.equal(A.normalizeSeries({ success: true }).ok, false);
  assert.equal(A.normalizeSeries(null).ok, false);
  assert.equal(A.normalizeSeries(undefined).ok, false);
});

test('série vazia é válida (ok) e sem pontos', () => {
  const res = A.normalizeSeries(serie([]));
  assert.equal(res.ok, true);
  assert.deepEqual(res.points, []);
});

test('soma com duas casas (horas de estudo fracionadas) e vazia vale zero', () => {
  assert.equal(A.sumValues([{ value: 0.1 }, { value: 0.2 }]), 0.3);
  assert.equal(A.sumValues([{ value: 1.005 }, { value: 2 }]), 3.01);
  assert.equal(A.sumValues([]), 0);
});

test('série sem nenhum valor positivo é tratada como vazia', () => {
  assert.equal(A.isEmptySeries([]), true);
  assert.equal(A.isEmptySeries([{ value: 0 }, { value: 0 }]), true);
  assert.equal(A.isEmptySeries([{ value: 0 }, { value: 1 }]), false);
});

test('variação compara a metade final com a inicial', () => {
  const pts = [1, 1, 2, 4].map((value) => ({ value }));
  assert.deepEqual(A.variation(pts), { previous: 2, current: 6, percent: 200 });
  const queda = [4, 4, 2, 2].map((value) => ({ value }));
  assert.equal(A.variation(queda).percent, -50);
});

test('variação sem base de comparação é null, nunca infinito', () => {
  assert.equal(A.variation([0, 0, 3, 3].map((value) => ({ value }))).percent, null);
  assert.equal(A.variation([0, 0, 0, 0].map((value) => ({ value }))).percent, null);
  assert.equal(A.variation([]).percent, null);
  assert.equal(A.percentChange(0, 5), null);
});

test('variação com tamanho ímpar descarta o ponto do meio', () => {
  const pts = [2, 9, 2, 4, 4].map((value) => ({ value }));
  assert.deepEqual(A.variation(pts), { previous: 11, current: 8, percent: -27 });
});

test('texto da variação: sinal, sem variação e sem base', () => {
  assert.equal(A.formatVariation(12), '+12%');
  assert.equal(A.formatVariation(-5), '−5%');
  assert.equal(A.formatVariation(0), 'sem variação');
  assert.equal(A.formatVariation(null), 'sem base de comparação');
});

test('resumo de membro: números presentes e selos', () => {
  const view = A.summaryView({
    tasks: { myPendingCount: 2, availableCount: 1, next: null },
    voting: { openCount: 1, pendingCount: 1, nextClosesAt: null },
    learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
    inbox: { unreadMessages: 0, pendingConnectionRequests: 0 },
  });
  assert.equal(view.hasTasks, true);
  assert.equal(view.hasVoting, true);
  assert.equal(view.hasInbox, true);
  assert.equal(view.pendingTasks, 2);
  assert.equal(view.accuracyPct, 72);
  assert.deepEqual(view.badges, { unlocked: 2, total: 5, remaining: 3, percent: 40 });
});

test('resumo de visitante: seções nulas viram ausência, nunca zero', () => {
  const view = A.summaryView({
    tasks: null, voting: null, inbox: null,
    learning: { accuracyPct: null, questionsAnswered: 0, totalActivities: 0, unlockedBadges: 0, totalBadges: 0 },
  });
  assert.equal(view.hasTasks, false);
  assert.equal(view.hasVoting, false);
  assert.equal(view.hasInbox, false);
  assert.equal(view.pendingTasks, null);
  assert.equal(view.accuracyPct, null);
  assert.equal(view.badges, null);
});

test('resumo ausente não quebra', () => {
  const view = A.summaryView(undefined);
  assert.equal(view.hasTasks, false);
  assert.equal(view.pendingTasks, null);
});

test('selos: conquistados nunca passam do total e total zero não tem progresso', () => {
  assert.deepEqual(A.badgeProgress({ unlockedBadges: 9, totalBadges: 5 }), { unlocked: 5, total: 5, remaining: 0, percent: 100 });
  assert.deepEqual(A.badgeProgress({ unlockedBadges: -3, totalBadges: 4 }), { unlocked: 0, total: 4, remaining: 4, percent: 0 });
  assert.equal(A.badgeProgress({ unlockedBadges: 0, totalBadges: 0 }), null);
  assert.equal(A.badgeProgress(null), null);
});

test('linhas da rosca de selos: conquistados e a conquistar', () => {
  assert.deepEqual(A.badgeRows({ unlocked: 2, remaining: 3 }), [
    { label: 'Conquistados', value: 2 },
    { label: 'A conquistar', value: 3 },
  ]);
});

test('comparativo mensal: uma linha por métrica com o mês anterior e o atual', () => {
  const byMetric = {
    events: A.normalizeSeries({ success: true, granularity: 'month', series: [
      { date: '2026-08-01', value: 3 }, { date: '2026-09-01', value: 5 }, { date: '2026-10-01', value: 7 },
    ] }),
    learning: A.normalizeSeries({ success: true, granularity: 'month', series: [
      { date: '2026-09-01', value: 10 }, { date: '2026-10-01', value: 4 },
    ] }),
  };
  const cmp = A.monthlyComparison(byMetric);
  assert.deepEqual(cmp.seriesNames, ['set/26', 'out/26']);
  assert.deepEqual(cmp.rows, [
    { label: 'Eventos', values: [5, 7] },
    { label: 'Aprendizagem', values: [10, 4] },
  ]);
});

test('comparativo mensal isola a falha: métrica que falhou fica de fora', () => {
  const ok = A.normalizeSeries({ success: true, granularity: 'month', series: [
    { date: '2026-09-01', value: 1 }, { date: '2026-10-01', value: 2 },
  ] });
  const failed = A.normalizeSeries({ success: false, message: 'Falhou.' });
  const cmp = A.monthlyComparison({ events: failed, tasks: ok });
  assert.deepEqual(cmp.rows, [{ label: 'Tarefas', values: [1, 2] }]);
});

test('comparativo mensal sem métrica utilizável devolve null', () => {
  assert.equal(A.monthlyComparison({ events: A.normalizeSeries({ success: false }) }), null);
  const umMes = A.normalizeSeries({ success: true, granularity: 'month', series: [{ date: '2026-10-01', value: 2 }] });
  assert.equal(A.monthlyComparison({ events: umMes }), null);
  assert.equal(A.monthlyComparison(undefined), null);
});

test('entrada da API e métricas do membro', () => {
  assert.deepEqual(A.seriesInput('study_hours', '12m'), { range: '12m', metric: 'study_hours' });
  assert.deepEqual(A.secondaryMetrics(true), ['events', 'learning', 'tasks', 'study_hours']);
  assert.deepEqual(A.secondaryMetrics(false), ['events', 'learning', 'study_hours']);
  assert.deepEqual(A.RANGE_OPTIONS.map((o) => o.range), ['30d', '90d', '12m']);
});
