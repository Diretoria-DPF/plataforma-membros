#!/usr/bin/env node
/**
 * selection.test.mjs — teste do gerenciador de seleção (WP02)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/selection.test.mjs
 *
 * Testa a seleção de estruturas: emissão de eventos, destaque de cor,
 * reatividade a seleções de outras fontes, e prevenção de loops infinitos.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');
const coreDir = path.resolve(here, '../../modulos/anatomia-3d/js/core');

// Importa o módulo a testar
const { createSelection, announce } = await import(
  path.join(engineDir, 'selection.js')
);

// Importa bus e store reais
const { on, off, emit, EVENTS } = await import(
  path.join(coreDir, 'bus.js')
);
const { get, set, subscribe } = await import(
  path.join(coreDir, 'store.js')
);

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

// --- Mocks ---

/**
 * Mock de Registry
 */
function createMockRegistry() {
  const setColorCalls = [];
  const pickResults = {};

  return {
    // pick retorna sid com base em ndc.x: positivo → 'fma:7088', negativo → null
    pick(ndc) {
      if (ndc && ndc.x > 0) {
        return 'fma:7088';
      }
      if (ndc && typeof ndc.x === 'number' && ndc.x === 0) {
        return 'fma:1234';
      }
      return null;
    },
    // Registra chamadas a setColor
    setColor(sid, color) {
      setColorCalls.push({ sid, color });
    },
    // Retorna histórico de setColor
    getSetColorCalls() {
      return setColorCalls;
    },
    // Reseta o histórico
    resetSetColorCalls() {
      setColorCalls.length = 0;
    },
  };
}

/**
 * Mock de funções
 */
function createMocks() {
  const requestRenderCalls = [];
  const focusSidCalls = [];

  return {
    requestRender() {
      requestRenderCalls.push({});
    },
    focusSid(sid) {
      focusSidCalls.push(sid);
    },
    getRequestRenderCalls() {
      return requestRenderCalls;
    },
    getFocusSidCalls() {
      return focusSidCalls;
    },
    reset() {
      requestRenderCalls.length = 0;
      focusSidCalls.length = 0;
    },
  };
}

console.log('announce()');

test('announce retorna string correta para seleção', () => {
  const result = announce('Coração', 'Cardiovascular');
  assert.strictEqual(result, 'Selecionado: Coração — Cardiovascular');
});

test('announce retorna "Seleção limpa" quando label é null', () => {
  const result = announce(null, 'Qualquer Sistema');
  assert.strictEqual(result, 'Seleção limpa');
});

console.log('selection.createSelection()');

test('tap seleciona, emite evento uma vez, e aplica cor', () => {
  // Setup
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
    highlightColor: '#ffb020',
  });

  const emittedEvents = [];
  const unsubscribe = on(EVENTS.STRUCTURE_SELECT, (e) => {
    emittedEvents.push(e);
  });

  // Execute: tap em ndc.x > 0 → pick retorna 'fma:7088'
  selection.handlePick({ ndc: { x: 1, y: 0 }, kind: 'tap' });

  // Verify
  assert.strictEqual(selection.getSelected(), 'fma:7088');
  assert.strictEqual(emittedEvents.length, 1, 'deve emitir evento uma vez');
  assert.deepEqual(emittedEvents[0], { sid: 'fma:7088', source: 'pick' });

  // Verifica setColor
  const setColorCalls = registry.getSetColorCalls();
  assert.ok(
    setColorCalls.some((c) => c.sid === 'fma:7088' && c.color === '#ffb020'),
    'deve chamar setColor com a cor correta'
  );

  unsubscribe();
  selection.dispose();
});

test('segundo tap em outra estrutura restaura a cor anterior', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  // Primeiro tap
  selection.handlePick({ ndc: { x: 1, y: 0 }, kind: 'tap' });
  registry.resetSetColorCalls();

  // Segundo tap em outro lugar (x=0 → pick retorna 'fma:1234')
  selection.handlePick({ ndc: { x: 0, y: 0 }, kind: 'tap' });

  const setColorCalls = registry.getSetColorCalls();

  // Deve ter restaurado 'fma:7088' passando null
  assert.ok(
    setColorCalls.some((c) => c.sid === 'fma:7088' && c.color === null),
    'deve restaurar cor da estrutura anterior (setColor(..., null))'
  );

  // Deve ter aplicado a cor nova a 'fma:1234'
  assert.ok(
    setColorCalls.some((c) => c.sid === 'fma:1234' && c.color === '#ffb020'),
    'deve aplicar cor à nova estrutura'
  );

  assert.strictEqual(selection.getSelected(), 'fma:1234');
  selection.dispose();
});

test('tap em espaço vazio limpa a seleção', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  // Seleciona algo
  selection.handlePick({ ndc: { x: 1, y: 0 }, kind: 'tap' });
  assert.strictEqual(selection.getSelected(), 'fma:7088');

  // Reseta
  registry.resetSetColorCalls();

  // Tap em vazio (x < 0 → pick retorna null)
  selection.handlePick({ ndc: { x: -1, y: 0 }, kind: 'tap' });

  const setColorCalls = registry.getSetColorCalls();
  assert.ok(
    setColorCalls.some((c) => c.sid === 'fma:7088' && c.color === null),
    'deve restaurar a cor ao limpar'
  );

  assert.strictEqual(selection.getSelected(), null);
  selection.dispose();
});

test('focus chama focusSid', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  // Focus em estrutura
  selection.handlePick({ ndc: { x: 1, y: 0 }, kind: 'focus' });

  const focusSidCalls = mocks.getFocusSidCalls();
  assert.strictEqual(focusSidCalls.length, 1);
  assert.strictEqual(focusSidCalls[0], 'fma:7088');

  selection.dispose();
});

test('evento externo de seleção (search) aplica destaque e não re-emite', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  const emittedEvents = [];
  const unsubscribe = on(EVENTS.STRUCTURE_SELECT, (e) => {
    emittedEvents.push(e);
  });

  // Simula evento de search (source !== 'pick' e !== 'api')
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:9999', source: 'search' });

  // Deve ter aplicado o destaque
  const setColorCalls = registry.getSetColorCalls();
  assert.ok(
    setColorCalls.some((c) => c.sid === 'fma:9999' && c.color === '#ffb020'),
    'deve aplicar cor à estrutura de source externo'
  );

  // Não deve ter re-emitido (apenas o evento externo deve ser recebido)
  // Contamos eventos: deveria ser só 1 (do emit externo)
  const externalOnly = emittedEvents.filter((e) => e.source === 'search');
  assert.strictEqual(externalOnly.length, 1, 'não deve re-emitir');

  unsubscribe();
  selection.dispose();
});

test('sem loop infinito ao reagir a eventos externos', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  const emittedEvents = [];
  const unsubscribe = on(EVENTS.STRUCTURE_SELECT, (e) => {
    emittedEvents.push(e);
  });

  // Emite vários eventos rapidamente
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:1', source: 'search' });
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:2', source: 'navigator' });
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:3', source: 'quiz' });

  // Se houvesse loop, teríamos muitos eventos. Aqui devemos ter apenas 3.
  assert.strictEqual(emittedEvents.length, 3);

  unsubscribe();
  selection.dispose();
});

test('setHighlightColor reaplica a cor ao selecionado', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
    highlightColor: '#ffb020',
  });

  // Seleciona algo
  selection.handlePick({ ndc: { x: 1, y: 0 }, kind: 'tap' });
  registry.resetSetColorCalls();

  // Muda a cor
  selection.setHighlightColor('#ff0000');

  const setColorCalls = registry.getSetColorCalls();
  assert.ok(
    setColorCalls.some((c) => c.sid === 'fma:7088' && c.color === '#ff0000'),
    'deve reaplicar com a nova cor'
  );

  selection.dispose();
});

test('setHighlightColor sem seleção não faz nada', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  const initialCallCount = registry.getSetColorCalls().length;
  selection.setHighlightColor('#ff0000');

  // Não deve ter chamado setColor
  assert.strictEqual(
    registry.getSetColorCalls().length,
    initialCallCount,
    'não deve chamar setColor se não há seleção'
  );

  selection.dispose();
});

test('após dispose(), eventos externos são ignorados', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });

  selection.dispose();

  registry.resetSetColorCalls();

  // Emite evento externo
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:7088', source: 'search' });

  // Não deve ter processado
  assert.strictEqual(
    registry.getSetColorCalls().length,
    0,
    'após dispose, eventos externos não devem ser processados'
  );
});

test('seleções externas gravam store.selectedSid e apagam o destaque anterior', () => {
  set({ selectedSid: null });
  const registry = createMockRegistry();
  const mocks = createMocks();
  const selection = createSelection({
    registry,
    bus: { on, off, emit, EVENTS },
    store: { get, set },
    requestRender: mocks.requestRender,
    focusSid: mocks.focusSid,
  });
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:1', source: 'search' });
  assert.equal(get().selectedSid, 'fma:1', 'busca grava a seleção no store');
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:2', source: 'navigator' });
  assert.equal(get().selectedSid, 'fma:2', 'navegador grava a seleção no store');
  assert.ok(
    registry.getSetColorCalls().some((c) => c.sid === 'fma:1' && c.color === null),
    'o destaque da seleção anterior é apagado'
  );
  emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'api' });
  assert.equal(get().selectedSid, null, 'limpar pela API zera a seleção');
  selection.dispose();
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
