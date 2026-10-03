#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * telemetry.test.mjs — telemetria anônima do atlas (Onda 3.5, A.2).
 * Uso: node --test scripts/atlas/telemetry.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { on, off, emit, EVENTS } from '../../modulos/anatomia-3d/js/core/bus.js';
import { createTelemetry, newSessionId, scrubMessage, BATCH_MAX, ERRORS_MAX } from '../../modulos/anatomia-3d/js/core/telemetry.js';

const bus = { on, off, emit, EVENTS };

function fakeWin() {
  const listeners = {};
  const docListeners = {};
  let timerFn = null;
  const win = {
    crypto: { getRandomValues: (a) => { a.fill(7); return a; } },
    innerWidth: 390,
    navigator: { onLine: true, serviceWorker: { controller: null } },
    document: { visibilityState: 'visible', addEventListener: (n, f) => { docListeners[n] = f; }, removeEventListener: () => {} },
    addEventListener: (n, f) => { listeners[n] = f; },
    removeEventListener: () => {},
    setInterval: (f) => { timerFn = f; return 1; },
    clearInterval: () => { timerFn = null; },
  };
  return { win, listeners, docListeners, tick: () => timerFn && timerFn() };
}

function setup(flags = { telemetry: true }) {
  const sent = [];
  const api = { call: async (action, input) => { sent.push({ action, input }); return { success: true }; } };
  const w = fakeWin();
  const t = createTelemetry({ bus, api, flags, win: w.win, now: (() => { let n = 1000; return () => (n += 5000); })(), getMode: () => 'explorar' });
  return { t, sent, w };
}

test('sem a flag, sem api ou sem janela: inerte, nada é enviado nem escutado', async () => {
  assert.equal(createTelemetry({ bus, api: { call() {} }, flags: { telemetry: false }, win: fakeWin().win }).enabled, false);
  assert.equal(createTelemetry({ bus, api: null, flags: { telemetry: true }, win: fakeWin().win }).enabled, false);
  const t = createTelemetry({ bus, api: { call() {} }, flags: { telemetry: true }, win: null });
  assert.equal(t.enabled, false);
  assert.equal(await t.flush(), 0);
});

test('id de sessão: aleatório, 8 a 40 caracteres, sem dados da pessoa', () => {
  const id = newSessionId({ getRandomValues: (a) => { a.fill(200); return a; } });
  assert.match(id, /^[a-z0-9]{8,40}$/);
  assert.match(newSessionId(null), /^[a-z0-9]{8,40}$/);
});

test('scrubMessage tira URL, e-mail e limita o tamanho', () => {
  const m = scrubMessage('Falhou em https://x.test/a?token=abc por ana@exemplo.com ' + 'x'.repeat(300));
  assert.ok(!/https?:|@/.test(m));
  assert.ok(m.length <= 120);
});

test('eventos do atlas viram lote: abertura, estrutura vista, busca (só tamanhos), fim do quiz', async () => {
  const { t, sent } = setup();
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'za:left-ventricle', source: 'pick' });
  emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'api' });
  emit(EVENTS.SEARCH_RUN, { len: 6, results: 3 });
  emit(EVENTS.QUIZ_FINISH, { correct: 7, total: 10 });
  assert.equal(await t.flush(), 4);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].action, 'apiLearnAtlasTelemetry');
  assert.equal(sent[0].input.sessionId, t.sessionId);
  const ev = sent[0].input.events;
  assert.deepEqual(ev.map((e) => e.event), ['app_open', 'structure_view', 'search', 'quiz_finish']);
  assert.deepEqual(ev[0].props, { mode: 'explorar', viewport: 'm', offline: false });
  assert.deepEqual(ev[1], { event: 'structure_view', sid: 'za:left-ventricle', props: { source: 'pick' } });
  assert.deepEqual(ev[2].props, { len: 6, results: 3 });
  assert.ok(!JSON.stringify(sent).includes('"q"'), 'a busca não envia o texto');
  t.destroy();
});

test('erros de JS: no máximo 10 por sessão, sem URL', async () => {
  const { t, sent, w } = setup();
  for (let i = 0; i < ERRORS_MAX + 5; i++) w.listeners.error({ message: `quebrou https://x.test/${i}.js` });
  w.listeners.unhandledrejection({ reason: new Error('nada') });
  await t.flush();
  const errs = sent.flatMap((s) => s.input.events).filter((e) => e.event === 'error_js');
  assert.equal(errs.length, ERRORS_MAX);
  assert.ok(errs.every((e) => !/https?:/.test(e.props.message)));
  t.destroy();
});

test('aba escondida: registra fim de sessão e envia na hora; a fila grande sai em lotes de 50', async () => {
  const { t, sent, w } = setup();
  for (let i = 0; i < 120; i++) emit(EVENTS.STRUCTURE_SELECT, { sid: `za:s${i}`, source: 'pick' });
  w.win.document.visibilityState = 'hidden';
  w.docListeners.visibilitychange();
  await new Promise((r) => setTimeout(r, 20));
  const all = sent.flatMap((s) => s.input.events);
  assert.ok(sent.every((s) => s.input.events.length <= BATCH_MAX));
  const end = all.filter((e) => e.event === 'session_end');
  assert.equal(end.length, 1);
  assert.ok(end[0].props.views > 0 && end[0].props.durationS >= 0);
  t.destroy();
});

test('falha na chamada é ignorada (nunca lança)', async () => {
  const w = fakeWin();
  const t = createTelemetry({ bus, api: { call: async () => { throw new Error('rede'); } }, flags: { telemetry: true }, win: w.win });
  await assert.doesNotReject(() => t.flush());
  t.destroy();
});
