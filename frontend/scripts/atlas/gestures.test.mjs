#!/usr/bin/env node
/**
 * gestures.test.mjs — teste de CI do reconhecimento de gestos de ponteiro
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/gestures.test.mjs
 *
 * Testa o módulo js/engine/gestures.js com temporizadores injetados
 * (sem node:test, sem dependências npm, só node:assert/strict).
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');

const { createGestureRecognizer } = await import(path.join(engineDir, 'gestures.js'));

let failures = 0;

/**
 * @param {string} name
 * @param {() => void} fn
 */
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

/**
 * Cria um temporizador injetável para testes.
 * @returns {Object} {setTimer, clearTimer, callbacks}
 */
function createFakeTimer() {
  let nextId = 0;
  const callbacks = new Map();

  const setTimer = (fn, ms) => {
    const id = nextId++;
    callbacks.set(id, { fn, ms, time: Date.now() });
    return id;
  };

  const clearTimer = (id) => {
    callbacks.delete(id);
  };

  const fire = (id) => {
    const cb = callbacks.get(id);
    if (cb) {
      callbacks.delete(id);
      cb.fn();
    }
  };

  return { setTimer, clearTimer, callbacks, fire };
}

console.log('gestures.js');

test('um tap rápido dispara onTap', () => {
  const timer = createFakeTimer();
  let tapped = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { tapped = pos; },
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;
  recognizer.down({ id: 1, x: 100, y: 100, t: now });
  recognizer.up({ id: 1, x: 101, y: 101, t: now + 100 });

  assert.deepEqual(tapped, { x: 101, y: 101 });
});

test('uma liberação lenta após 300ms sem movimento não dispara tap', () => {
  const timer = createFakeTimer();
  let tapped = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { tapped = pos; },
    tapMaxMs: 250,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;
  recognizer.down({ id: 1, x: 100, y: 100, t: now });
  recognizer.up({ id: 1, x: 100, y: 100, t: now + 300 });

  assert.equal(tapped, null);
});

test('um drag de 20px não dispara nada', () => {
  const timer = createFakeTimer();
  let tapped = null;
  let longPressed = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { tapped = pos; },
    onLongPress: (pos) => { longPressed = pos; },
    tapMaxMove: 8,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;
  recognizer.down({ id: 1, x: 100, y: 100, t: now });
  recognizer.move({ id: 1, x: 120, y: 100, t: now + 50 });
  recognizer.up({ id: 1, x: 120, y: 100, t: now + 100 });

  assert.equal(tapped, null);
  assert.equal(longPressed, null);
});

test('long-press dispara em 500ms e a liberação após não dispara tap', () => {
  const timer = createFakeTimer();
  let longPressed = null;
  let tapped = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { tapped = pos; },
    onLongPress: (pos) => { longPressed = pos; },
    longPressMs: 500,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;
  recognizer.down({ id: 1, x: 100, y: 100, t: now });

  // Disparar o temporizador de long-press (id 0)
  assert.equal(timer.callbacks.size, 1);
  timer.fire(0);
  assert.deepEqual(longPressed, { x: 100, y: 100 });

  // Liberar
  recognizer.up({ id: 1, x: 100, y: 100, t: now + 600 });

  // Não deveria ter disparado tap
  assert.equal(tapped, null);
});

test('segundo tap dentro de 300ms e 10px dispara onDoubleTap', () => {
  const timer = createFakeTimer();
  const taps = [];
  let doubleTapped = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { taps.push(pos); },
    onDoubleTap: (pos) => { doubleTapped = pos; },
    doubleTapMs: 300,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;

  // Primeiro tap
  recognizer.down({ id: 1, x: 100, y: 100, t: now });
  recognizer.up({ id: 1, x: 100, y: 100, t: now + 100 });

  assert.equal(taps.length, 1);
  assert.equal(doubleTapped, null);

  // Segundo tap
  recognizer.down({ id: 2, x: 105, y: 105, t: now + 150 });
  recognizer.up({ id: 2, x: 105, y: 105, t: now + 250 });

  // Deveria ter disparado onDoubleTap, não um segundo onTap
  assert.equal(taps.length, 1, 'o segundo tap não deveria chamar onTap');
  assert.deepEqual(doubleTapped, { x: 105, y: 105 });
});

test('dois taps 400ms afastados disparam dois onTap', () => {
  const timer = createFakeTimer();
  const taps = [];

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { taps.push(pos); },
    doubleTapMs: 300,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;

  // Primeiro tap
  recognizer.down({ id: 1, x: 100, y: 100, t: now });
  recognizer.up({ id: 1, x: 100, y: 100, t: now + 100 });

  // Segundo tap (fora da janela de double-tap)
  recognizer.down({ id: 2, x: 100, y: 100, t: now + 400 });
  recognizer.up({ id: 2, x: 100, y: 100, t: now + 500 });

  assert.equal(taps.length, 2);
  assert.deepEqual(taps[0], { x: 100, y: 100 });
  assert.deepEqual(taps[1], { x: 100, y: 100 });
});

test('um pinch de dois dedos não dispara tap nem long-press', () => {
  const timer = createFakeTimer();
  let tapped = null;
  let longPressed = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { tapped = pos; },
    onLongPress: (pos) => { longPressed = pos; },
    longPressMs: 500,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;

  // Primeiro dedo
  recognizer.down({ id: 1, x: 100, y: 100, t: now });

  // Segundo dedo (multi-toque cancela tudo)
  recognizer.down({ id: 2, x: 200, y: 100, t: now + 50 });

  // Tentar disparar long-press
  if (timer.callbacks.size > 0) {
    timer.fire(0);
  }

  // Liberar
  recognizer.up({ id: 1, x: 100, y: 100, t: now + 600 });
  recognizer.up({ id: 2, x: 200, y: 100, t: now + 600 });

  assert.equal(tapped, null);
  assert.equal(longPressed, null);
});

test('cancel() reseta completamente', () => {
  const timer = createFakeTimer();
  let tapped = null;
  let longPressed = null;

  const recognizer = createGestureRecognizer({
    onTap: (pos) => { tapped = pos; },
    onLongPress: (pos) => { longPressed = pos; },
    longPressMs: 500,
    setTimer: timer.setTimer,
    clearTimer: timer.clearTimer,
  });

  const now = 1000;

  // Iniciar um gesto
  recognizer.down({ id: 1, x: 100, y: 100, t: now });

  // Cancelar
  recognizer.cancel();

  // Tentar disparar long-press (não deveria fazer nada)
  if (timer.callbacks.size > 0) {
    timer.fire(0);
  }

  assert.equal(tapped, null);
  assert.equal(longPressed, null);

  // Novo gesto deveria funcionar normalmente
  tapped = null;
  recognizer.down({ id: 2, x: 100, y: 100, t: now + 100 });
  recognizer.up({ id: 2, x: 100, y: 100, t: now + 200 });

  assert.deepEqual(tapped, { x: 100, y: 100 });
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
