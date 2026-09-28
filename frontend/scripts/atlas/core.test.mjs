#!/usr/bin/env node
/**
 * core.test.mjs — teste de CI dos contratos congelados do Atlas (WP01)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/core.test.mjs
 *
 * Importa js/core/{bus,store,contracts}.js exatamente como qualquer pacote
 * do Atlas importaria (ESM puro, caminho relativo, zero dependências de
 * npm) e confere o mesmo roteiro do dev/contracts-harness.js, mas sem
 * navegador — é isto que o CI roda antes de qualquer outro pacote poder
 * construir sobre `js/core/*`.
 *
 * Sem `node:test`/framework externo de propósito: o resto do pipeline de
 * scripts/atlas/ (make-fixtures, validate-content) também são scripts
 * `.mjs` simples chamados direto pelo Node, então este teste segue o mesmo
 * estilo — `node:assert/strict` (núcleo do Node, não é uma dependência) e
 * um contador de falhas que decide o `process.exitCode`.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, '../../modulos/anatomia-3d/js/core');

const { on, off, once, emit, EVENTS } = await import(path.join(coreDir, 'bus.js'));
const { get, set, subscribe } = await import(path.join(coreDir, 'store.js'));
const {
  LAYERS, LAYER_IDS, SYSTEMS, SYSTEM_IDS, MODES, MODE_IDS,
  SHEET_STATES, SHEET_STATE_IDS, LEGACY_COMPAT,
  isValidLayerId, isValidSystemId, isValidModeId, isValidSheetState,
  isRegistry, isAssetLoader, isEngine, isContentStore, isMode,
} = await import(path.join(coreDir, 'contracts.js'));

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

console.log('bus.js');
test('EVENTS está congelado e tem os nomes esperados', () => {
  assert.equal(Object.isFrozen(EVENTS), true);
  assert.equal(EVENTS.STRUCTURE_SELECT, 'structure:select');
  assert.equal(EVENTS.SYSTEM_LOAD_START, 'system:load:start');
  assert.equal(EVENTS.SYSTEM_LOAD_DONE, 'system:load:done');
  assert.equal(EVENTS.SYSTEM_LOAD_ERROR, 'system:load:error');
  assert.equal(EVENTS.VISIBILITY_ISOLATE, 'visibility:isolate');
  assert.equal(EVENTS.VISIBILITY_HIDE, 'visibility:hide');
  assert.equal(EVENTS.VISIBILITY_GHOST, 'visibility:ghost');
  assert.equal(EVENTS.VISIBILITY_RESET, 'visibility:reset');
  assert.equal(EVENTS.SHEET_SNAP, 'sheet:snap');
  assert.equal(EVENTS.MODE_CHANGE, 'mode:change');
  assert.equal(EVENTS.QUIZ_ANSWER, 'quiz:answer');
  assert.equal(EVENTS.THEME_CHANGE, 'theme:change');
  assert.equal(EVENTS.QUALITY_CHANGE, 'quality:change');
});

test('on() entrega o payload e a função devolvida cancela', () => {
  let received = null;
  let calls = 0;
  const offFn = on(EVENTS.STRUCTURE_SELECT, (payload) => { received = payload; calls += 1; });
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'fma:7088', source: 'pick' });
  assert.equal(calls, 1);
  assert.deepEqual(received, { sid: 'fma:7088', source: 'pick' });
  offFn();
  emit(EVENTS.STRUCTURE_SELECT, { sid: 'outro', source: 'pick' });
  assert.equal(calls, 1, 'off() deveria ter cancelado a assinatura');
});

test('off(evt, fn) cancela sem usar o retorno de on()', () => {
  let calls = 0;
  const fn = () => { calls += 1; };
  on(EVENTS.VIEW_RESET, fn);
  emit(EVENTS.VIEW_RESET, {});
  off(EVENTS.VIEW_RESET, fn);
  emit(EVENTS.VIEW_RESET, {});
  assert.equal(calls, 1);
});

test('once() dispara só na primeira emissão', () => {
  let calls = 0;
  once(EVENTS.MODE_CHANGE, () => { calls += 1; });
  emit(EVENTS.MODE_CHANGE, { mode: 'quiz' });
  emit(EVENTS.MODE_CHANGE, { mode: 'explorar' });
  assert.equal(calls, 1);
});

test('emit() isola erro de um assinante sem afetar os demais', () => {
  let secondCalled = false;
  on(EVENTS.SEARCH_OPEN, () => { throw new Error('falha proposital'); });
  on(EVENTS.SEARCH_OPEN, () => { secondCalled = true; });
  emit(EVENTS.SEARCH_OPEN, {});
  assert.equal(secondCalled, true);
});

test('emit() em evento sem assinantes não lança', () => {
  assert.doesNotThrow(() => emit('evento:sem-ninguem-escutando', { x: 1 }));
});

console.log('store.js');
test('get() traz o estado inicial documentado', () => {
  const s = get();
  assert.equal(s.mode, 'explorar');
  assert.equal(s.selectedSid, null);
  assert.equal(s.sex, 'M');
  assert.equal(s.xray, false);
  assert.equal(s.sheetState, 'peek');
  assert.equal(s.layers.pele.visible, false);
  assert.equal(s.layers.musculos.visible, true);
  assert.equal(s.layers.esqueleto.visible, true);
  for (const id of LAYER_IDS) {
    assert.ok(id in s.layers, `faltou a camada "${id}" em store.layers`);
    assert.equal(typeof s.layers[id].opacity, 'number');
  }
  assert.deepEqual(s.loadedSystems, []);
  assert.deepEqual(s.unavailableSystems, []);
});

test('set() muda o estado e subscribe() só notifica quando o valor selecionado muda', () => {
  const seen = [];
  const offSub = subscribe((s) => s.mode, (mode) => seen.push(mode));
  set({ mode: 'quiz' });
  set({ mode: 'quiz' }); // mesmo valor — não deveria notificar de novo
  set({ mode: 'estudo' });
  offSub();
  set({ mode: 'explorar' }); // depois de cancelar — não deveria notificar
  assert.deepEqual(seen, ['quiz', 'estudo']);
});

test('subscribe() ignora mudanças fora da fatia selecionada', () => {
  let calls = 0;
  const offSub = subscribe((s) => s.selectedSid, () => { calls += 1; });
  set({ mode: 'explorar' }); // não toca selectedSid
  offSub();
  assert.equal(calls, 0);
});

test('set() aceita uma função (patch derivado do estado atual)', () => {
  set({ selectedSid: 'fma:7088' });
  set((s) => ({ selectedSid: s.selectedSid ? null : 'x' }));
  assert.equal(get().selectedSid, null);
});

console.log('contracts.js');
test('LAYERS/SYSTEMS/MODES/SHEET_STATES estão congelados e com o tamanho esperado', () => {
  assert.equal(Object.isFrozen(LAYERS), true);
  assert.equal(Object.isFrozen(SYSTEMS), true);
  assert.equal(Object.isFrozen(MODES), true);
  assert.equal(Object.isFrozen(SHEET_STATES), true);
  assert.equal(LAYERS.length, 7);
  assert.equal(SYSTEMS.length, 12);
  assert.equal(MODES.length, 6);
  assert.equal(SHEET_STATES.length, 3);
  assert.equal(LAYER_IDS.length, LAYERS.length);
  assert.equal(SYSTEM_IDS.length, SYSTEMS.length);
  assert.equal(MODE_IDS.length, MODES.length);
  assert.equal(SHEET_STATE_IDS.length, SHEET_STATES.length);
});

test('cada camada/sistema/modo/estado do painel tem id e label em PT-BR', () => {
  for (const item of [...LAYERS, ...SYSTEMS, ...MODES, ...SHEET_STATES]) {
    assert.equal(typeof item.id, 'string');
    assert.ok(item.id.length > 0);
    assert.equal(typeof item.label, 'string');
    assert.ok(item.label.length > 0);
  }
});

test('validadores de id aceitam o válido e rejeitam o inválido', () => {
  assert.equal(isValidLayerId('pele'), true);
  assert.equal(isValidLayerId('cabelo'), false);
  assert.equal(isValidSystemId('cardiovascular'), true);
  assert.equal(isValidSystemId('cardiaco'), false);
  assert.equal(isValidModeId('quiz'), true);
  assert.equal(isValidModeId('quizz'), false);
  assert.equal(isValidSheetState('half'), true);
  assert.equal(isValidSheetState('metade'), false);
});

test('isRegistry/isAssetLoader/isEngine/isContentStore/isMode checam a forma', () => {
  assert.equal(isRegistry({}), false);
  assert.equal(isRegistry({
    getBySid() {}, getBySystem() {}, pick() {}, getBBox() {},
    setVisible() {}, setOpacity() {}, setColor() {}, iterate() {},
  }), true);

  assert.equal(isAssetLoader({ loadManifest() {}, loadSystem() {}, isLoaded() {} }), false);
  assert.equal(isAssetLoader({
    loadManifest() {}, loadSystem() {}, isLoaded() {}, onProgress() {},
  }), true);

  assert.equal(isEngine({ requestRender() {}, setViewOffset() {}, focusSid() {}, viewPreset() {} }), false, 'sem scene/camera/renderer não deveria passar');
  assert.equal(isEngine({
    scene: {}, camera: {}, renderer: {},
    requestRender() {}, setViewOffset() {}, focusSid() {}, viewPreset() {},
  }), true);

  assert.equal(isContentStore({ getIndex() {}, getContent() {} }), false);
  assert.equal(isContentStore({ getIndex() {}, getContent() {}, search() {} }), true);

  assert.equal(isMode({ id: 'x', label: 'X', icon: 'x', enter() {}, exit() {} }), false, 'sem sheetContent não deveria passar');
  assert.equal(isMode({
    id: 'explorar', label: 'Explorar', icon: 'body',
    enter() {}, exit() {}, sheetContent() { return null; },
  }), true);
});

test('LEGACY_COMPAT documenta a superfície que atlas.e2e.js/csp.e2e.js esperam', () => {
  assert.equal(LEGACY_COMPAT.globalNamespace, 'window.ThreeEngine');
  assert.equal(LEGACY_COMPAT.modelStateGlobal, 'window.__atlasModelState');
  assert.equal(LEGACY_COMPAT.modelReadyEvent, 'laift:atlas-model-ready');
  assert.equal(LEGACY_COMPAT.quizNamespace, 'window.QuizEngine');
  assert.ok(LEGACY_COMPAT.domIds.includes('#organ-name'));
  assert.ok(LEGACY_COMPAT.domIds.includes('#organ-hud'));
  assert.ok(LEGACY_COMPAT.domIds.includes('#bio-search-input'));
  assert.ok(LEGACY_COMPAT.domIds.includes('#biohacking-results-grid'));
  assert.ok(LEGACY_COMPAT.quizEngineMethods.includes('startQuiz'));
  assert.equal(LEGACY_COMPAT.quizStartAction, '[data-action="QuizEngine.startQuiz"]');
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
