#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * labels.test.mjs — teste de CI das funções puras de rótulos (WP04)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/labels.test.mjs
 *
 * Testa funções puras exportadas por js/engine/labels.js sem depender
 * de THREE, canvas ou DOM. Segue o estilo de frontend/scripts/atlas/core.test.mjs.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');

const { projectToScreen, resolveOverlaps, pickLargest, placeLabels } = await import(path.join(engineDir, 'labels.js'));

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

console.log('labels.js — funções puras');

test('projectToScreen converte NDC para pixels', () => {
  const rect = { x: 0, y: 0, width: 800, height: 600 };
  const ndc = { x: 0, y: 0, z: 0.5 };
  const result = projectToScreen(ndc, rect);
  assert.equal(typeof result.x, 'number');
  assert.equal(typeof result.y, 'number');
  assert.equal(typeof result.visible, 'boolean');
  assert.equal(result.visible, true);
  // Centro NDC (0, 0) deve ser o centro do retângulo em pixels
  assert.equal(result.x, 400); // 800/2
  assert.equal(result.y, 300); // 600/2
});

test('projectToScreen marca como invisível quando z > 1 (atrás da câmera)', () => {
  const rect = { x: 0, y: 0, width: 800, height: 600 };
  const ndc = { x: 0, y: 0, z: 1.5 };
  const result = projectToScreen(ndc, rect);
  assert.equal(result.visible, false);
});

test('projectToScreen marca como invisível quando fora da tela', () => {
  const rect = { x: 0, y: 0, width: 800, height: 600 };
  const ndc = { x: 2, y: 2, z: 0.5 };
  const result = projectToScreen(ndc, rect);
  assert.equal(result.visible, false);
});

test('resolveOverlaps empilha rótulos que se sobrepõem', () => {
  const items = [
    { id: '1', x: 100, y: 100, width: 80, height: 18, visible: true },
    { id: '2', x: 110, y: 105, width: 80, height: 18, visible: true },
    { id: '3', x: 200, y: 200, width: 80, height: 18, visible: true },
  ];
  const result = resolveOverlaps(items);
  // item 2 deve ser empurrado para baixo porque sobrepõe item 1
  assert(result[1].y > items[1].y);
  // item 3 não sobrepõe, deve ficar no mesmo lugar
  assert.equal(result[2].y, items[2].y);
});

test('pickLargest coloca selecionado primeiro', () => {
  const items = [
    { sid: 'fma:1', size: 100, visible: true },
    { sid: 'fma:2', size: 200, visible: true },
    { sid: 'fma:3', size: 150, visible: true },
  ];
  const selected = 'fma:1';
  const result = pickLargest(items, selected, 2);
  assert.equal(result[0].sid, 'fma:1', 'selecionado deve vir primeiro');
  assert.equal(result.length, 2);
});

test('pickLargest respeita o máximo de items', () => {
  const items = [
    { sid: 'fma:1', size: 100, visible: true },
    { sid: 'fma:2', size: 200, visible: true },
    { sid: 'fma:3', size: 150, visible: true },
  ];
  const result = pickLargest(items, null, 2);
  assert.equal(result.length, 2);
  // Maiores: fma:2 (200) e fma:3 (150)
  assert.ok(result.some((i) => i.sid === 'fma:2'));
  assert.ok(result.some((i) => i.sid === 'fma:3'));
});

test('pickLargest ignora invisíveis', () => {
  const items = [
    { sid: 'fma:1', size: 100, visible: true },
    { sid: 'fma:2', size: 200, visible: false },
    { sid: 'fma:3', size: 150, visible: true },
  ];
  const result = pickLargest(items, null, 2);
  assert.ok(!result.some((i) => i.sid === 'fma:2'));
});

test('placeLabels: dois rótulos na mesma âncora não se cobrem', () => {
  const items = [
    { sid: 'a', x: 100, y: 100, width: 120, height: 20 },
    { sid: 'b', x: 105, y: 102, width: 140, height: 20 },
  ];
  const [a, b] = placeLabels(items, { width: 400, height: 400 });
  assert.ok(a.shown && b.shown);
  const overlap = a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;
  assert.equal(overlap, false);
});

test('placeLabels: oculta quem não cabe em vez de empilhar', () => {
  const items = Array.from({ length: 10 }, (_, i) => ({ sid: `s${i}`, x: 100, y: 100, width: 150, height: 20 }));
  const out = placeLabels(items, { width: 400, height: 400 });
  assert.equal(out[0].shown, true); // o de maior prioridade sempre aparece
  assert.ok(out.filter((o) => o.shown).length <= 5);
  assert.ok(out.some((o) => !o.shown));
});

test('placeLabels: mantém o rótulo dentro da área', () => {
  const [r] = placeLabels([{ sid: 'a', x: 395, y: 50, width: 120, height: 20 }], { width: 400, height: 400 });
  assert.ok(r.shown);
  assert.ok(r.left >= 0 && r.left + r.width <= 400);
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
