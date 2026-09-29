#!/usr/bin/env node
/**
 * xray-clip.test.mjs — teste do gerenciador de raio-X e plano de corte
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/xray-clip.test.mjs
 *
 * Testa createXrayClip com o THREE real, o bus e store reais, e um
 * renderer falso {clippingPlanes: []}.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const coreDir = path.resolve(here, '../../modulos/anatomia-3d/js/core');
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');
const vendorDir = path.resolve(here, '../../modulos/anatomia-3d/vendor');

// Importa o THREE real
const THREE = await import(path.join(vendorDir, 'three/three.module.js'));

// Importa bus e store reais
const { on, emit, EVENTS } = await import(path.join(coreDir, 'bus.js'));
const { get, set } = await import(path.join(coreDir, 'store.js'));

// Importa o módulo a testar
const { createXrayClip } = await import(path.join(engineDir, 'xray-clip.js'));

// Cria um bus falso compatível (com on/EVENTS)
const fakeBus = {
  on,
  emit,
  EVENTS,
};

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

console.log('xray-clip.js');

test('X-ray reduz opacidade de pele e musculos e emite LAYER_SET', () => {
  // Reseta o store
  set({ xray: false, layers: get().layers });

  const fakeRenderer = { clippingPlanes: [] };
  const renderCalls = [];
  const requestRender = () => renderCalls.push(1);

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  const emittedEvents = [];
  const offListener = on(EVENTS.LAYER_SET, (payload) => {
    emittedEvents.push(payload);
  });

  // Ativa o raio-X
  xrayClip.setXray(true);

  const state = get();
  assert.equal(state.xray, true);
  assert.equal(state.layers.pele.opacity, 0.08);
  assert.equal(state.layers.musculos.opacity, 0.12);

  // Confere que emitiu LAYER_SET para ambas as camadas
  assert.equal(emittedEvents.length, 2);
  assert.deepEqual(emittedEvents[0], {
    layer: 'pele',
    visible: state.layers.pele.visible,
    opacity: 0.08,
  });
  assert.deepEqual(emittedEvents[1], {
    layer: 'musculos',
    visible: state.layers.musculos.visible,
    opacity: 0.12,
  });

  offListener();
  xrayClip.dispose();
});

test('Desativar raio-X restaura opacidades anteriores, incluindo customizadas', () => {
  set({ xray: false, layers: get().layers });

  const fakeRenderer = { clippingPlanes: [] };
  const requestRender = () => {};

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  // Define opacidades customizadas
  const currentLayers = get().layers;
  set({
    layers: {
      ...currentLayers,
      pele: { ...currentLayers.pele, opacity: 0.5 },
      musculos: { ...currentLayers.musculos, opacity: 0.7 },
    },
  });

  // Ativa raio-X (salva as opacidades customizadas)
  xrayClip.setXray(true);
  assert.equal(get().xray, true);

  // Desativa raio-X
  xrayClip.setXray(false);
  assert.equal(get().xray, false);
  assert.equal(get().layers.pele.opacity, 0.5);
  assert.equal(get().layers.musculos.opacity, 0.7);

  xrayClip.dispose();
});

test('Ativar raio-X duas vezes é idempotente', () => {
  set({ xray: false, layers: get().layers });

  const fakeRenderer = { clippingPlanes: [] };
  const requestRender = () => {};

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  const emittedEvents = [];
  const offListener = on(EVENTS.LAYER_SET, (payload) => {
    emittedEvents.push(payload);
  });

  // Ativa duas vezes
  xrayClip.setXray(true);
  emittedEvents.length = 0; // Limpa eventos da primeira ativação
  xrayClip.setXray(true);

  // A segunda ativação não deveria emitir nada
  assert.equal(emittedEvents.length, 0);

  offListener();
  xrayClip.dispose();
});

test('Evento XRAY_SET no bus funciona sem loops infinitos', () => {
  set({ xray: false, layers: get().layers });

  const fakeRenderer = { clippingPlanes: [] };
  const requestRender = () => {};

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  // Emite evento do bus
  emit(EVENTS.XRAY_SET, { enabled: true });

  assert.equal(get().xray, true);

  emit(EVENTS.XRAY_SET, { enabled: false });

  assert.equal(get().xray, false);

  xrayClip.dispose();
});

test('Clip com transversal em offset 0 funciona corretamente', () => {
  const fakeRenderer = { clippingPlanes: [] };
  const renderCalls = [];
  const requestRender = () => renderCalls.push(1);

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  xrayClip.setModelBox({
    min: [-0.3, 0, -0.2],
    max: [0.3, 1.8, 0.2],
  });

  xrayClip.setClip('transversal', 0);

  const plane = xrayClip.getClipPlane();
  assert.ok(plane !== null);

  // Confere que o ponto (0, 0.9, 0) (centro do modelo em Y) está na parte mantida
  const kept = new THREE.Vector3(0, 0.9, 0);
  assert.ok(plane.distanceToPoint(kept) >= -1e-6);

  // Confere que o ponto (0, 1.5, 0) (acima do centro) está na parte removida
  const removed = new THREE.Vector3(0, 1.5, 0);
  assert.ok(plane.distanceToPoint(removed) < -1e-6);

  assert.equal(renderCalls.length, 1);

  xrayClip.dispose();
});

test('Clip sagital com offset 0.5 passa pelo X = 0.15', () => {
  const fakeRenderer = { clippingPlanes: [] };
  const requestRender = () => {};

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  xrayClip.setModelBox({
    min: [-0.3, 0, -0.2],
    max: [0.3, 1.8, 0.2],
  });

  xrayClip.setClip('sagital', 0.5);

  const plane = xrayClip.getClipPlane();

  // O plano passa através do ponto (0.15, 0.9, 0) com normal (-1, 0, 0)
  // Isso significa d = -0.15 + D, onde D vem de -1 * 0.15 + 0 * y + 0 * z = -0.15
  // Então quando testamos (0.15, y, z): (-1)*0.15 + 0*y + 0*z + d = -0.15 + d
  // Se d = 0.15, então distance = 0.

  // Confere que está próximo ao plano (distance ≈ 0)
  const onPlane = new THREE.Vector3(0.15, 0.9, 0);
  assert.ok(Math.abs(plane.distanceToPoint(onPlane)) < 1e-6);

  xrayClip.dispose();
});

test('setClip(null) limpa os planos', () => {
  const fakeRenderer = { clippingPlanes: [new THREE.Plane()] }; // Plano fake
  const requestRender = () => {};

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  xrayClip.setClip(null);

  assert.equal(fakeRenderer.clippingPlanes.length, 0);
  assert.equal(xrayClip.getClipPlane(), null);
  assert.deepEqual(get().clip, { plane: null, offset: null });

  xrayClip.dispose();
});

test('Evento CLIP_SET no bus funciona', () => {
  const fakeRenderer = { clippingPlanes: [] };
  const requestRender = () => {};

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  xrayClip.setModelBox({
    min: [-0.3, 0, -0.2],
    max: [0.3, 1.8, 0.2],
  });

  emit(EVENTS.CLIP_SET, { plane: 'coronal', offset: 0 });

  assert.equal(get().clip.plane, 'coronal');
  assert.ok(xrayClip.getClipPlane() !== null);

  emit(EVENTS.CLIP_SET, { plane: null });

  assert.equal(get().clip.plane, null);
  assert.equal(xrayClip.getClipPlane(), null);

  xrayClip.dispose();
});

test('requestRender é chamado ao mudar clip', () => {
  const fakeRenderer = { clippingPlanes: [] };
  const renderCalls = [];
  const requestRender = () => renderCalls.push(1);

  const xrayClip = createXrayClip({
    bus: fakeBus,
    store: { get, set },
    renderer: fakeRenderer,
    THREE,
    requestRender,
  });

  xrayClip.setModelBox({
    min: [-0.3, 0, -0.2],
    max: [0.3, 1.8, 0.2],
  });

  xrayClip.setClip('sagital', 0);
  assert.equal(renderCalls.length, 1);

  xrayClip.setClip(null);
  assert.equal(renderCalls.length, 2);

  xrayClip.dispose();
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
