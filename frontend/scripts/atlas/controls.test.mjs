#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * controls.test.mjs — teste dos controles de câmera (WP01)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/controls.test.mjs
 *
 * Testa as funções puras de controle: toNdc (conversão NDC) e orbitStep
 * (rotação orbital ao redor de um alvo). Sem dependência de DOM ou THREE.
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');

const { toNdc, orbitStep } = await import(
  path.join(engineDir, 'controls.js')
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

console.log('toNdc');

test('NDC canto superior-esquerdo', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  const ndc = toNdc(100, 50, rect);
  assert.strictEqual(ndc.x, -1, 'x deveria ser -1');
  assert.strictEqual(ndc.y, 1, 'y deveria ser 1');
});

test('NDC canto inferior-direito', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  const ndc = toNdc(900, 650, rect);
  assert.strictEqual(ndc.x, 1, 'x deveria ser 1');
  assert.strictEqual(ndc.y, -1, 'y deveria ser -1');
});

test('NDC centro', () => {
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  const ndc = toNdc(500, 350, rect);
  assert.strictEqual(ndc.x, 0, 'x deveria ser 0');
  assert.strictEqual(ndc.y, 0, 'y deveria ser 0');
});

test('NDC com diferentes dimensões', () => {
  const rect = { left: 0, top: 0, width: 1280, height: 720 };
  const ndc = toNdc(640, 360, rect);
  assert.strictEqual(ndc.x, 0, 'x do centro deveria ser 0');
  assert.strictEqual(ndc.y, 0, 'y do centro deveria ser 0');
});

console.log('orbitStep');

test('preserva a distância câmera-alvo', () => {
  const pos = [1, 0, 0];
  const target = [0, 0, 0];
  const distOrig = Math.sqrt(
    pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]
  );

  const newPos = orbitStep(pos, target, 0.5, 0.3);
  const distNew = Math.sqrt(
    (newPos[0] - target[0]) ** 2 +
    (newPos[1] - target[1]) ** 2 +
    (newPos[2] - target[2]) ** 2
  );

  assert.ok(
    Math.abs(distNew - distOrig) < 1e-10,
    `distância deveria ser preservada: ${distOrig} vs ${distNew}`
  );
});

test('polar é clamped em [0.05, π-0.05]', () => {
  const pos = [0, 0, 1]; // topo
  const target = [0, 0, 0];

  // Tenta rotação muito para cima (além do limite)
  const newPos = orbitStep(pos, target, 0, -10);

  // Nova posição deveria estar no limite inferior
  const distance = Math.sqrt(
    (newPos[0] - target[0]) ** 2 +
    (newPos[1] - target[1]) ** 2 +
    (newPos[2] - target[2]) ** 2
  );
  const polar = Math.acos((newPos[1] - target[1]) / distance);
  const eps = 1e-9;

  assert.ok(
    polar >= 0.05 - eps && polar <= Math.PI - 0.05 + eps,
    `polar deveria estar em [0.05, π-0.05], mas é ${polar}`
  );
});

test('rotação azimute de 90° de +Z vai para +X ou -X', () => {
  // Começa em +Z
  const pos = [0, 0, 1];
  const target = [0, 0, 0];
  const distOrig = 1;

  // Rotação azimute de 90° (π/2)
  const newPos = orbitStep(pos, target, Math.PI / 2, 0);

  // Esperamos estar em -X (porque atan2(0, 1) = 0, +π/2 = π/2, sin(π/2)=1)
  // sin(azimuth) * sin(polar) * r = sin(π/2) = 1 -> x = +r
  // Mas espera: sin(0 + π/2) = sin(π/2) = 1, cos(0 + π/2) = 0
  // Então: x = r * sin(polar) * sin(azimuth) = r * sin(π/2) * sin(π/2) = r
  // z = r * sin(polar) * cos(azimuth) = r * sin(π/2) * cos(π/2) = 0
  // Portanto deveria estar em [1, 0, 0] = +X

  assert.ok(
    Math.abs(newPos[0] - distOrig) < 1e-9,
    `x deveria ser ~${distOrig}, é ${newPos[0]}`
  );
  assert.ok(
    Math.abs(newPos[2]) < 1e-9,
    `z deveria ser ~0, é ${newPos[2]}`
  );
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
