#!/usr/bin/env node
/**
 * sheet-snap.test.mjs — testes unitários do algoritmo pickSnap (WP08)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/sheet-snap.test.mjs
 *
 * Testa a função pickSnap (regra de encaixe automático com momentum,
 * sem pulo de estados e detecção de toque) independente de DOM/CSS,
 * importando-a diretamente do módulo sheet.js.
 *
 * Estilo: node:assert/strict, sem frameworks, compatível com o pipeline
 * de CI (core.test.mjs, make-fixtures, etc.).
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sheetDir = path.resolve(here, '../../modulos/anatomia-3d/js/ui');

const { pickSnap } = await import(path.join(sheetDir, 'sheet.js'));

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

// Altura padrão de layout de telefone (390×844)
const PHONE_HEIGHTS = { peek: 96, half: 380, full: 760 };

console.log('pickSnap — encaixe automático com momentum e regra de "sem pulo"');

test('peek + arraste até 386px, v=0.2 px/ms → half', () => {
  // Arraste de 96 até 386 (próximo da metade), velocidade positiva baixa (abrindo lentamente).
  // Projeção: 386 + 0.2*120 = 386 + 24 = 410 — mais próximo de half(380) que full(760).
  // startIdx=0, targetIdx=1 → diferença de 1, pode ir.
  const result = pickSnap({
    startState: 'peek',
    endHeight: 386,
    velocity: 0.2,
    heights: PHONE_HEIGHTS
  });
  assert.equal(result, 'half', 'deveria encaixar em half');
});

test('peek + arraste até 700px, v=0.3 px/ms → half (sem pulo)', () => {
  // Arraste de 96 até 700 (muito perto de full(760)), velocidade positiva.
  // Projeção: 700 + 0.3*120 = 700 + 36 = 736 — bem perto de full(760).
  // Sem velocidade de flick (0.3 < 1.5), então SEM PULO: startIdx=0, targetIdx=2.
  // Classa para adjacent (idx 1 = half).
  const result = pickSnap({
    startState: 'peek',
    endHeight: 700,
    velocity: 0.3,
    heights: PHONE_HEIGHTS
  });
  assert.equal(result, 'half', 'sem flick, não pula de peek direto para full');
});

test('peek + flick com v=2.0 px/ms → full', () => {
  // Velocidade de flick (2.0 > 1.5), então PODE pular (sem limite de 1 estado).
  // Projeção: 400 + 2.0*120 = 400 + 240 = 640 — mais perto de full(760) que half(380).
  // startIdx=0, targetIdx=2 (diferença de 2), mas isFlick=true permite pulo.
  const result = pickSnap({
    startState: 'peek',
    endHeight: 400,
    velocity: 2.0,
    heights: PHONE_HEIGHTS
  });
  assert.equal(result, 'full', 'flick permite pulo direto para full');
});

test('half + arraste até 120px, v=-0.2 px/ms → peek', () => {
  // Arraste de half(380) até 120 (perto de peek(96)), velocidade negativa (fechando).
  // Projeção: 120 + (-0.2)*120 = 120 - 24 = 96 — exato em peek.
  // startIdx=1, targetIdx=0 → diferença de 1, pode ir.
  const result = pickSnap({
    startState: 'half',
    endHeight: 120,
    velocity: -0.2,
    heights: PHONE_HEIGHTS
  });
  assert.equal(result, 'peek', 'deveria encaixar em peek');
});

test('full + arraste até 500px, v=0 → half', () => {
  // Arraste de full(760) até 500, sem velocidade (v=0, solução parada).
  // Projeção: 500 + 0*120 = 500 — mais perto de half(380) que full(760).
  // startIdx=2, targetIdx=1 → diferença de 1, pode ir.
  const result = pickSnap({
    startState: 'full',
    endHeight: 500,
    velocity: 0,
    heights: PHONE_HEIGHTS
  });
  assert.equal(result, 'half', 'sem velocidade, pega o estado mais próximo');
});

test('arraste pequeno (5px) → mantém o estado', () => {
  // Arraste de apenas 5px (< 8px mínimo) = toque, não movimento real.
  // Qualquer que seja a velocidade, o estado não muda.
  const result = pickSnap({
    startState: 'peek',
    endHeight: 101, // 101 - 96 = 5px
    velocity: 10.0,
    heights: PHONE_HEIGHTS
  });
  assert.equal(result, 'peek', 'arraste < 8px é toque, estado inalterado');
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações de pickSnap passaram.');
}
