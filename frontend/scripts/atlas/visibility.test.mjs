#!/usr/bin/env node
/**
 * visibility.test.mjs — teste de CI do motor de visibilidade (WP06)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/visibility.test.mjs
 *
 * Testa a lógica de visibilidade, precedência e eventos do barramento
 * usando mocks do Registry e do Engine, com o barramento real.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, '../../modulos/anatomia-3d/js/core');
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');

const { on, emit, EVENTS } = await import(path.join(coreDir, 'bus.js'));
const { createVisibility } = await import(path.join(engineDir, 'visibility.js'));

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
 * Cria um Registry mock que registra as últimas chamadas setVisible/setOpacity.
 * @param {Array} structures - Estruturas [{sid, system, layer}...]
 * @returns {Object} Mock registry
 */
function createMockRegistry(structures) {
  const byId = new Map(structures.map((s) => [s.sid, s]));
  const state = new Map(); // {sid: {visible, opacity}}

  return {
    iterate() {
      return byId.values();
    },
    getBySid(sid) {
      return byId.get(sid) || null;
    },
    setVisible(sid, visible) {
      const entry = state.get(sid) || {};
      entry.visible = visible;
      state.set(sid, entry);
    },
    setOpacity(sid, opacity) {
      const entry = state.get(sid) || {};
      entry.opacity = opacity;
      state.set(sid, entry);
    },
    setColor() {
      // stub
    },
    getBySystem() {
      return [];
    },
    pick() {
      return null;
    },
    getBBox() {
      return null;
    },
    getState() {
      return state;
    },
  };
}

/**
 * Cria um Engine mock que conta chamadas a requestRender.
 * @returns {Object} Mock engine
 */
function createMockEngine() {
  let renderCount = 0;

  return {
    requestRender() {
      renderCount += 1;
    },
    getRenderCount() {
      return renderCount;
    },
    resetRenderCount() {
      renderCount = 0;
    },
  };
}

// --- Estruturas de teste ---
const structures = [
  { sid: 'pele:1', system: 'tegumentar', layer: 'pele' },
  { sid: 'pele:2', system: 'tegumentar', layer: 'pele' },
  { sid: 'musculo:1', system: 'muscular', layer: 'musculos' },
  { sid: 'musculo:2', system: 'muscular', layer: 'musculos' },
  { sid: 'osso:1', system: 'esqueletico', layer: 'esqueleto' },
  { sid: 'osso:2', system: 'esqueletico', layer: 'esqueleto' },
];

const busObj = { on, emit, EVENTS };

console.log('visibility.js — applyAll e precedência');

test('applyAll segue o estado das camadas', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: false, opacity: 1 },
      esqueleto: { visible: true, opacity: 0.8 },
    }),
  });

  visibility.applyAll();

  const state = registry.getState();
  assert.equal(state.get('pele:1').visible, true);
  assert.equal(state.get('pele:1').opacity, 1);
  assert.equal(state.get('musculo:1').visible, false);
  assert.equal(state.get('osso:1').visible, true);
  assert.equal(state.get('osso:1').opacity, 0.8);

  visibility.dispose();
});

test('uma camada desligada oculta suas estruturas', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: false, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.applyAll();

  const state = registry.getState();
  assert.equal(state.get('pele:1').visible, false);
  assert.equal(state.get('pele:2').visible, false);
  assert.equal(state.get('musculo:1').visible, true);

  visibility.dispose();
});

test('isolate mostra apenas a estrutura, mesmo com camada desligada', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: false, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.isolate('pele:1');

  const state = registry.getState();
  assert.equal(state.get('pele:1').visible, true);
  assert.equal(state.get('pele:1').opacity, 1);
  assert.equal(state.get('pele:2').visible, false);
  assert.equal(state.get('musculo:1').visible, false);

  visibility.dispose();
});

test('hide oculta a estrutura', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.hide('musculo:1');

  const state = registry.getState();
  assert.equal(state.get('musculo:1').visible, false);
  assert.equal(state.get('musculo:2').visible, true);

  visibility.dispose();
});

test('ghost dá opacidade 0.12', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.ghost('osso:1');

  const state = registry.getState();
  assert.equal(state.get('osso:1').visible, true);
  assert.equal(state.get('osso:1').opacity, 0.12);

  visibility.dispose();
});

test('ghost chamado duas vezes restaura a estrutura', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.ghost('osso:1');
  visibility.ghost('osso:1'); // toggle back

  const state = registry.getState();
  assert.equal(state.get('osso:1').visible, true);
  assert.equal(state.get('osso:1').opacity, 1);

  visibility.dispose();
});

test('reset restaura o estado das camadas', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.hide('pele:1');
  visibility.hide('musculo:1');
  visibility.ghost('osso:1');

  const stateBefore = registry.getState();
  assert.equal(stateBefore.get('pele:1').visible, false);
  assert.equal(stateBefore.get('musculo:1').visible, false);
  assert.equal(stateBefore.get('osso:1').opacity, 0.12);

  visibility.reset();

  const stateAfter = registry.getState();
  assert.equal(stateAfter.get('pele:1').visible, true);
  assert.equal(stateAfter.get('musculo:1').visible, true);
  assert.equal(stateAfter.get('osso:1').opacity, 1);

  visibility.dispose();
});

test('hiding the isolated structure clears isolation', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.isolate('pele:1');
  visibility.hide('pele:1');

  const state = registry.getState();
  // After hide, pele:1 is hidden, but other structures should follow layer state
  assert.equal(state.get('pele:1').visible, false);
  // Since isolation was cleared, pele:2 should follow layer state (visible=true)
  assert.equal(state.get('pele:2').visible, true);

  visibility.dispose();
});

console.log('visibility.js — eventos do barramento');

test('evento VISIBILITY_ISOLATE dispara isolate', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  emit(EVENTS.VISIBILITY_ISOLATE, { sid: 'pele:1' });

  const state = registry.getState();
  assert.equal(state.get('pele:1').visible, true);
  assert.equal(state.get('musculo:1').visible, false);

  visibility.dispose();
});

test('evento VISIBILITY_HIDE dispara hide', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  emit(EVENTS.VISIBILITY_HIDE, { sid: 'osso:1' });

  const state = registry.getState();
  assert.equal(state.get('osso:1').visible, false);
  assert.equal(state.get('osso:2').visible, true);

  visibility.dispose();
});

test('evento VISIBILITY_GHOST dispara ghost', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  emit(EVENTS.VISIBILITY_GHOST, { sid: 'musculo:2' });

  const state = registry.getState();
  assert.equal(state.get('musculo:2').opacity, 0.12);

  visibility.dispose();
});

test('evento VISIBILITY_RESET dispara reset', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.isolate('pele:1');
  visibility.hide('musculo:1');

  emit(EVENTS.VISIBILITY_RESET, {});

  const state = registry.getState();
  assert.equal(state.get('pele:1').visible, true);
  assert.equal(state.get('musculo:1').visible, true);

  visibility.dispose();
});

test('evento LAYER_SET dispara applyAll', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const layersRef = {
    pele: { visible: true, opacity: 1 },
    musculos: { visible: true, opacity: 1 },
    esqueleto: { visible: true, opacity: 1 },
  };

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => layersRef,
  });

  visibility.applyAll(); // initial state
  engine.resetRenderCount();

  // Simula mudança de estado da camada
  layersRef.pele.visible = false;
  emit(EVENTS.LAYER_SET, { layer: 'pele', visible: false, opacity: 1 });

  const state = registry.getState();
  assert.equal(state.get('pele:1').visible, false);
  assert.equal(state.get('pele:2').visible, false);

  visibility.dispose();
});

test('evento SYSTEM_LOAD_DONE dispara applyAll', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  engine.resetRenderCount();
  emit(EVENTS.SYSTEM_LOAD_DONE, { system: 'tegumentar' });

  assert.ok(engine.getRenderCount() > 0);

  visibility.dispose();
});

console.log('visibility.js — requestRender');

test('requestRender é chamado uma vez por operação', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  engine.resetRenderCount();
  visibility.isolate('pele:1');
  const countAfterIsolate = engine.getRenderCount();
  assert.equal(countAfterIsolate, 1);

  engine.resetRenderCount();
  visibility.hide('musculo:1');
  assert.equal(engine.getRenderCount(), 1);

  engine.resetRenderCount();
  visibility.ghost('osso:1');
  assert.equal(engine.getRenderCount(), 1);

  engine.resetRenderCount();
  visibility.reset();
  assert.equal(engine.getRenderCount(), 1);

  visibility.dispose();
});

console.log('visibility.js — getStats');

test('getStats retorna contagens corretas', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  let stats = visibility.getStats();
  assert.equal(stats.total, 6);
  assert.equal(stats.visible, 6);
  assert.equal(stats.hidden, 0);
  assert.equal(stats.ghosted, 0);
  assert.equal(stats.isolated, null);

  visibility.hide('pele:1');
  visibility.hide('pele:2');
  visibility.ghost('musculo:1');
  visibility.isolate('osso:1');

  stats = visibility.getStats();
  assert.equal(stats.total, 6);
  assert.equal(stats.visible, 1); // apenas osso:1 visível (isolado)
  assert.equal(stats.hidden, 2);
  assert.equal(stats.ghosted, 1);
  assert.equal(stats.isolated, 'osso:1');

  visibility.dispose();
});

console.log('visibility.js — dispose');

test('após dispose, eventos não afetam mais nada', () => {
  const registry = createMockRegistry(structures);
  const engine = createMockEngine();

  const visibility = createVisibility({
    registry,
    bus: busObj,
    engine,
    getLayers: () => ({
      pele: { visible: true, opacity: 1 },
      musculos: { visible: true, opacity: 1 },
      esqueleto: { visible: true, opacity: 1 },
    }),
  });

  visibility.dispose();

  const stateBeforeEvent = registry.getState();
  emit(EVENTS.VISIBILITY_ISOLATE, { sid: 'pele:1' });

  const stateAfterEvent = registry.getState();
  // Estado não deveria ter mudado porque dispose() desinscreve dos eventos
  const pele1Before = stateBeforeEvent.get('pele:1');
  const pele1After = stateAfterEvent.get('pele:1');

  // Se dispose funcionou, o isolate não deveria ter sido processado
  // Verificando que não há mudança de visibilidade por causa do evento
  // (pele:1 não está em estado especial)
  assert.equal(pele1Before, undefined); // nunca foi aplicado
  assert.equal(pele1After, undefined);
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
