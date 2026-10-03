#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * study-io.test.mjs — exportar/importar o progresso e "Continuar" (Onda 3.5, A.3).
 * Uso: node --test scripts/atlas/study-io.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExport, validateImport, planMerge, summarize, lastStudiedSid } from '../../modulos/anatomia-3d/js/modes/study-io.js';

const H = [{ type: 'select', sid: 'za:a', label: 'A', at: 3 }, { type: 'select', sid: 'za:b', label: 'B', at: 9 }];

test('exportar e importar de volta preserva histórico, fixados e anotações', () => {
  const file = buildExport({ history: H, pins: [{ sid: 'za:a', label: 'A', at: 1 }], notes: [{ sid: 'za:a', text: 'nota', at: 2 }] }, 0);
  assert.equal(file.app, 'laift-atlas');
  const r = validateImport(JSON.parse(JSON.stringify(file)));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.history, H);
  assert.equal(r.data.pins.length, 1);
  assert.equal(r.data.notes[0].text, 'nota');
});

test('arquivo que não é do atlas, versão errada ou sid fora do formato são recusados/descartados', () => {
  assert.equal(validateImport({ app: 'outro' }).ok, false);
  assert.equal(validateImport(null).ok, false);
  assert.equal(validateImport({ app: 'laift-atlas', v: 99 }).ok, false);
  const r = validateImport({ app: 'laift-atlas', v: 1, history: [{ sid: 'x y; DROP', at: 1 }, { sid: 'za:ok', at: 2 }], pins: [{ sid: 5 }], notes: [{ sid: 'za:n', text: 7 }] });
  assert.deepEqual(r.data.history.map((e) => e.sid), ['za:ok']);
  assert.equal(r.data.pins.length, 0);
  assert.equal(r.data.notes.length, 0);
});

test('mesclar não duplica: só entra o que falta; anotação mais nova vence, mais velha não', () => {
  const existing = { history: [H[0]], pins: [{ sid: 'za:a' }], notes: [{ sid: 'za:a', text: 'velha', at: 5 }] };
  const incoming = { history: H, pins: [{ sid: 'za:a', label: 'A', at: 1 }, { sid: 'za:b', label: 'B', at: 1 }], notes: [{ sid: 'za:a', text: 'nova', at: 8 }, { sid: 'za:c', text: 'c', at: 1 }] };
  const plan = planMerge(existing, incoming);
  assert.deepEqual(plan.history, [H[1]]);
  assert.deepEqual(plan.pins.map((p) => p.sid), ['za:b']);
  assert.deepEqual(plan.notes.map((n) => n.sid).sort(), ['za:a', 'za:c']);
  assert.equal(planMerge({ history: H, pins: [], notes: [] }, { history: H, pins: [], notes: [] }).history.length, 0);
  const again = planMerge({ history: [], pins: [], notes: [{ sid: 'za:a', text: 'x', at: 9 }] }, { history: [], pins: [], notes: [{ sid: 'za:a', text: 'y', at: 4 }] });
  assert.equal(again.notes.length, 0);
});

test('resumo ao aluno e última estrutura estudada', () => {
  assert.match(summarize({ history: [1, 2], pins: [1], notes: [] }), /2 no histórico, 1 fixada\./);
  assert.match(summarize({ history: [], pins: [], notes: [] }), /Nada novo/);
  assert.equal(lastStudiedSid(H), 'za:b');
  assert.equal(lastStudiedSid(H, (s) => s !== 'za:b'), 'za:a');
  assert.equal(lastStudiedSid([], () => true), null);
  assert.equal(lastStudiedSid([{ type: 'quiz', sid: 'za:q', at: 99 }], () => true), null);
});

import { studyStats } from '../../modulos/anatomia-3d/js/modes/study-io.js';

test('studyStats: estruturas distintas (lados juntos), quizzes e sequência de dias', () => {
  const day = 86400000;
  const now = new Date(2026, 9, 10, 15).getTime();
  const h = (type, sid, daysAgo) => ({ type, sid, at: now - daysAgo * day });
  const hist = [h('select', 'za:kidney-l', 0), h('select', 'za:kidney-r', 0), h('select', 'za:heart', 1), h('quiz', null, 2), h('select', 'za:x', 5)];
  assert.deepEqual(studyStats(hist, now), { structures: 3, quizzes: 1, days: 4, streak: 3 });
  assert.equal(studyStats([h('select', 'za:a', 1)], now).streak, 1, 'ontem ainda conta');
  assert.equal(studyStats([h('select', 'za:a', 3)], now).streak, 0, 'sequência quebrada');
  assert.deepEqual(studyStats([], now), { structures: 0, quizzes: 0, days: 0, streak: 0 });
  assert.equal(studyStats([{ type: 'select', sid: 'za:a' }, null], now).structures, 0);
});
