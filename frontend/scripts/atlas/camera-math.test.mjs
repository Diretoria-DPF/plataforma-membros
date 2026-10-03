#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * camera-math.test.mjs — Teste de CI para as funções de matemática da câmera 3D
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/camera-math.test.mjs
 *
 * Importa js/engine/camera-math.js (ESM puro, caminho relativo, zero
 * dependências) e valida todas as exportações com números concretos.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');

const {
  VIEW_PRESETS,
  fitDistance,
  presetPose,
  easeInOutCubic,
  lerpPose,
  freeRect,
  viewOffsetFor,
  clampDistance
} = await import(path.join(engineDir, 'camera-math.js'));

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

console.log('camera-math.js');

test('VIEW_PRESETS está congelado e tem presets normalizados', () => {
  assert.equal(Object.isFrozen(VIEW_PRESETS), true);

  // Verifica se anterior aponta em +Z
  assert.deepEqual(VIEW_PRESETS.anterior, [0, 0, 1]);
  assert.deepEqual(VIEW_PRESETS.posterior, [0, 0, -1]);
  assert.deepEqual(VIEW_PRESETS.esquerda, [1, 0, 0]);
  assert.deepEqual(VIEW_PRESETS.direita, [-1, 0, 0]);

  // Verifica se superiores/inferior estão normalizados
  const sup = VIEW_PRESETS.superior;
  const supLen = Math.sqrt(sup[0]*sup[0] + sup[1]*sup[1] + sup[2]*sup[2]);
  assert.ok(Math.abs(supLen - 1) < 0.0001, 'superior deveria estar normalizado');

  // Default também deveria estar normalizado
  const def = VIEW_PRESETS.default;
  const defLen = Math.sqrt(def[0]*def[0] + def[1]*def[1] + def[2]*def[2]);
  assert.ok(Math.abs(defLen - 1) < 0.0001, 'default deveria estar normalizado');
});

test('fitDistance com aspect 0.5 é maior que com aspect 2', () => {
  const radius = 10;
  const fov = 45;
  const d1 = fitDistance(radius, fov, 0.5);  // aspect estreito
  const d2 = fitDistance(radius, fov, 2);    // aspect largo
  assert.ok(d1 > d2, `d1=${d1} deveria ser > d2=${d2}`);
});

test('presetPose(anterior) coloca câmera em +Z do centro', () => {
  const center = [0, 0, 0];
  const radius = 10;
  const fov = 45;
  const aspect = 1;
  const pose = presetPose('anterior', center, radius, fov, aspect);

  // Câmera deveria estar adiante do target (maior Z)
  assert.ok(pose.position[2] > center[2], 'Z da câmera deveria ser > Z do centro');
  // X e Y deveriam estar próximos do centro
  assert.ok(Math.abs(pose.position[0] - center[0]) < 0.01);
  assert.ok(Math.abs(pose.position[1] - center[1]) < 0.01);
  // Target deveria ser o próprio centro
  assert.deepEqual(pose.target, center);
});

test('easeInOutCubic endpoints são 0 e 1, midpoint é 0.5', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(Math.abs(easeInOutCubic(0.5) - 0.5) < 0.001, 'midpoint deveria ser ~0.5');
});

test('easeInOutCubic clamp valores fora de [0,1]', () => {
  assert.equal(easeInOutCubic(-1), 0, 'valores negativos viram 0');
  assert.equal(easeInOutCubic(2), 1, 'valores > 1 viram 1');
});

test('freeRect com side=bottom subtrai heightPx da altura', () => {
  const viewport = { width: 800, height: 600 };
  const sheet = { side: 'bottom', heightPx: 150, widthPx: 0 };
  const rect = freeRect(viewport, sheet);

  assert.equal(rect.x, 0);
  assert.equal(rect.y, 0);
  assert.equal(rect.width, 800);
  assert.equal(rect.height, 450);
});

test('freeRect com side=right subtrai widthPx da largura', () => {
  const viewport = { width: 1000, height: 600 };
  const sheet = { side: 'right', heightPx: 0, widthPx: 250 };
  const rect = freeRect(viewport, sheet);

  assert.equal(rect.x, 0);
  assert.equal(rect.y, 0);
  assert.equal(rect.width, 750);
  assert.equal(rect.height, 600);
});

test('freeRect com side=none retorna viewport inteiro', () => {
  const viewport = { width: 500, height: 300 };
  const sheet = { side: 'none', heightPx: 0, widthPx: 0 };
  const rect = freeRect(viewport, sheet);

  assert.deepEqual(rect, { x: 0, y: 0, width: 500, height: 300 });
});

test('freeRect garante width e height >= 1', () => {
  const viewport = { width: 100, height: 100 };
  const sheet = { side: 'bottom', heightPx: 150, widthPx: 0 };
  const rect = freeRect(viewport, sheet);

  assert.ok(rect.width >= 1);
  assert.ok(rect.height >= 1);
});

test('viewOffsetFor com sheet bottom=half retorna y offset positivo', () => {
  // viewport 390x844, sheet bottom state=half heightPx=380
  // rect = {x:0, y:0, width:390, height:464}
  const viewport = { width: 390, height: 844 };
  const rect = { x: 0, y: 0, width: 390, height: 464 };
  const offset = viewOffsetFor(viewport, rect);

  assert.ok(offset !== null, 'deveria retornar offset (não null)');
  // viewport center y = 422, rect center y = 232
  // y = 422 - 232 = 190
  assert.equal(offset.y, 190);
  assert.equal(offset.fullWidth, 390);
  assert.equal(offset.fullHeight, 844);
});

test('viewOffsetFor retorna null quando rect é viewport inteiro', () => {
  const viewport = { width: 800, height: 600 };
  const rect = { x: 0, y: 0, width: 800, height: 600 };
  const offset = viewOffsetFor(viewport, rect);

  assert.equal(offset, null);
});

test('lerpPose interpola entre duas poses linear', () => {
  const a = { position: [0, 0, 0], target: [5, 5, 5] };
  const b = { position: [10, 10, 10], target: [15, 15, 15] };
  const mid = lerpPose(a, b, 0.5);

  assert.deepEqual(mid.position, [5, 5, 5]);
  assert.deepEqual(mid.target, [10, 10, 10]);
});

test('clampDistance limita entre radius*0.25 e radius*6', () => {
  const radius = 10;

  // Abaixo do mínimo
  const d1 = clampDistance(1, radius);
  assert.equal(d1, 2.5, 'valores abaixo de min deveriam ser clamped para min');

  // Acima do máximo
  const d2 = clampDistance(100, radius);
  assert.equal(d2, 60, 'valores acima de max deveriam ser clamped para max');

  // No meio
  const d3 = clampDistance(30, radius);
  assert.equal(d3, 30, 'valores dentro do range deveriam permanecer');
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
