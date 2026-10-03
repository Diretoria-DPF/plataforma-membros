#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * study-store.test.mjs — teste de StudyStore e attachRecorder
 *
 * Roda com: node frontend/scripts/atlas/study-store.test.mjs
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const modesDir = path.resolve(here, '../../modulos/anatomia-3d/js/modes');
const coreDir = path.resolve(here, '../../modulos/anatomia-3d/js/core');

const { createStudyStore } = await import(path.join(modesDir, 'study-store.js'));
const { attachRecorder } = await import(path.join(modesDir, 'study.js'));
const { on, emit, EVENTS } = await import(path.join(coreDir, 'bus.js'));

let failures = 0;

/**
 * @param {string} name
 * @param {() => Promise<void>} fn
 */
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok — ${name}`);
  } catch (err) {
    failures += 1;
    console.error(`  FALHOU — ${name}`);
    console.error(`    ${err && err.message ? err.message : err}`);
  }
}

console.log('Testando StudyStore (fallback em-memória)...');

await test('store sem IndexedDB (private mode)', async () => {
  const store = createStudyStore({ indexedDB: undefined });
  assert.strictEqual(store.isPersistent(), false);
});

await test('histórico é limitado a 200 entradas', async () => {
  const store = createStudyStore({ indexedDB: undefined });

  // Adiciona 250 entradas
  for (let i = 0; i < 250; i++) {
    await store.addHistory({
      type: 'select',
      sid: `sid-${i}`,
      label: `label-${i}`,
      at: Date.now() + i,
    });
  }

  const list = await store.listHistory({});
  assert.ok(list.length <= 200, `esperava ≤200, obteve ${list.length}`);
});

await test('toggle pin: adiciona e remove', async () => {
  const store = createStudyStore({ indexedDB: undefined });

  // Primeira vez: adiciona
  const added = await store.togglePin({ sid: 'test-sid', label: 'Test' });
  assert.strictEqual(added, true);

  let pins = await store.listPins();
  assert.strictEqual(pins.length, 1);
  assert.strictEqual(pins[0].sid, 'test-sid');

  // Segunda vez: remove
  const removed = await store.togglePin({ sid: 'test-sid', label: 'Test' });
  assert.strictEqual(removed, false);

  pins = await store.listPins();
  assert.strictEqual(pins.length, 0);
});

await test('note round-trip', async () => {
  const store = createStudyStore({ indexedDB: undefined });
  const sid = 'note-test-sid';
  const text = 'Uma anotação de teste\ncom múltiplas linhas';

  await store.setNote(sid, text);
  const retrieved = await store.getNote(sid);

  assert.strictEqual(retrieved, text);
});

await test('note inexistente retorna null', async () => {
  const store = createStudyStore({ indexedDB: undefined });
  const retrieved = await store.getNote('nonexistent');
  assert.strictEqual(retrieved, null);
});

console.log('\nTestando attachRecorder com bus real...');

await test('attachRecorder registra eventos STRUCTURE_SELECT', async () => {
  const store = createStudyStore({ indexedDB: undefined });

  // Bus puro (do módulo core)
  const detach = attachRecorder({ on, emit }, store);

  emit(EVENTS.STRUCTURE_SELECT, { sid: 'test-structure', source: 'pick' });

  // Aguarda um pouco para a async completar
  await new Promise(r => setTimeout(r, 10));

  const history = await store.listHistory({});
  assert.ok(history.length > 0, 'histórico deve ter entradas');
  assert.strictEqual(history[0].sid, 'test-structure');
  assert.strictEqual(history[0].type, 'select');

  detach();
});

await test('attachRecorder registra eventos QUIZ_ANSWER', async () => {
  const store = createStudyStore({ indexedDB: undefined });

  const detach = attachRecorder({ on, emit }, store);

  emit(EVENTS.QUIZ_ANSWER, { caseId: 'quiz-1', sid: 'heart', correct: true });

  await new Promise(r => setTimeout(r, 10));

  const history = await store.listHistory({});
  assert.ok(history.length > 0);
  const quizEntry = history.find(e => e.type === 'quiz');
  assert.ok(quizEntry, 'deve haver entrada de quiz');
  assert.strictEqual(quizEntry.sid, 'heart');

  detach();
});

console.log(`\n${failures > 0 ? `${failures} testes falharam` : 'Todos os testes passaram'}!`);
process.exitCode = failures > 0 ? 1 : 0;
