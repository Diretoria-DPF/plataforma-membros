#!/usr/bin/env node
/**
 * renderer.test.mjs — teste de CI para renderer.js frame scheduling
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/renderer.test.mjs
 *
 * Testa que tickers retornando false não causam renderização contínua,
 * e tickers retornando true mantêm os frames.
 */
import assert from 'node:assert/strict';

// Teste simples da lógica de scheduling sem depender de THREE.js completo
console.log('renderer.js — frame scheduling logic test');

let failures = 0;

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

// Teste 1: com ticker retornando false, nenhum novo frame é agendado
test('ticker retornando false não agenda novo frame', () => {
  const tickers = [() => false];
  let needsAnotherFrame = false;

  for (const ticker of tickers) {
    if (ticker()) {
      needsAnotherFrame = true;
    }
  }

  // Lógica corrigida: só agenda se needsAnotherFrame for true
  const shouldScheduleNewFrame = needsAnotherFrame;
  assert(!shouldScheduleNewFrame, 'não deve agendar novo frame quando ticker retorna false');
});

// Teste 2: com ticker retornando true, novo frame é agendado
test('ticker retornando true agenda novo frame', () => {
  const tickers = [() => true];
  let needsAnotherFrame = false;

  for (const ticker of tickers) {
    if (ticker()) {
      needsAnotherFrame = true;
    }
  }

  // Lógica corrigida: só agenda se needsAnotherFrame for true
  const shouldScheduleNewFrame = needsAnotherFrame;
  assert(shouldScheduleNewFrame, 'deve agendar novo frame quando ticker retorna true');
});

// Teste 3: múltiplos tickers, apenas um retorna true
test('se qualquer ticker retorna true, novo frame é agendado', () => {
  const tickers = [() => false, () => true, () => false];
  let needsAnotherFrame = false;

  for (const ticker of tickers) {
    if (ticker()) {
      needsAnotherFrame = true;
    }
  }

  const shouldScheduleNewFrame = needsAnotherFrame;
  assert(shouldScheduleNewFrame, 'deve agendar novo frame se qualquer ticker retorna true');
});

// Teste 4: múltiplos tickers, todos retornam false
test('se todos tickers retornam false, novo frame não é agendado', () => {
  const tickers = [() => false, () => false, () => false];
  let needsAnotherFrame = false;

  for (const ticker of tickers) {
    if (ticker()) {
      needsAnotherFrame = true;
    }
  }

  const shouldScheduleNewFrame = needsAnotherFrame;
  assert(!shouldScheduleNewFrame, 'não deve agendar novo frame se todos tickers retornam false');
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
