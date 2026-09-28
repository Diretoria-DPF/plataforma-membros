#!/usr/bin/env node
/**
 * quality.test.mjs — teste de CI para lógica de qualidade adaptativa (WP08)
 * ---------------------------------------------------------------------------
 * Roda com: node frontend/scripts/atlas/quality.test.mjs
 *
 * Testa detectTier(), pixelRatioFor(), createFrameMonitor() e nextLowerTier()
 * da forma como qualquer módulo do Atlas importaria (ESM puro, caminho relativo,
 * zero dependências de npm).
 *
 * Segue o mesmo estilo de frontend/scripts/atlas/core.test.mjs:
 * `node:assert/strict` e contador de falhas que decide o `process.exitCode`.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const engineDir = path.resolve(here, '../../modulos/anatomia-3d/js/engine');

const {
  TIERS,
  detectTier,
  pixelRatioFor,
  createFrameMonitor,
  nextLowerTier,
} = await import(path.join(engineDir, 'quality.js'));

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

console.log('quality.js');

// ============================================================================
// Testes de detectTier()
// ============================================================================

test('detectTier: desktop com bom hardware retorna high', () => {
  const env = {
    isTouch: false,
    cores: 8,
    memoryGB: 8,
    width: 1920,
    height: 1080,
  };
  assert.equal(detectTier(env), 'high');
});

test('detectTier: telefone mid-range (isTouch, dpr 3, 8 cores, 4GB) retorna medium', () => {
  const env = {
    isTouch: true,
    dpr: 3,
    cores: 8,
    memoryGB: 4,
    width: 500,
    height: 800,
  };
  assert.equal(detectTier(env), 'medium');
});

test('detectTier: telefone fraco (2GB) retorna low', () => {
  const env = {
    isTouch: true,
    cores: 4,
    memoryGB: 2,
    width: 400,
    height: 600,
  };
  assert.equal(detectTier(env), 'low');
});

test('detectTier: padrão sem ambiente especificado retorna medium', () => {
  assert.equal(detectTier(), 'medium');
});

test('detectTier: device fraco por cores <= 4 retorna low', () => {
  const env = {
    isTouch: false,
    cores: 2,
    memoryGB: 8,
    width: 1920,
    height: 1080,
  };
  assert.equal(detectTier(env), 'low');
});

// ============================================================================
// Testes de pixelRatioFor()
// ============================================================================

test('pixelRatioFor: capa pixel ratio no máximo do tier', () => {
  const ratio = pixelRatioFor('low', 2, false);
  assert.equal(ratio, 1); // low tem maxPixelRatio 1
});

test('pixelRatioFor: limita a 1.5 para touch mesmo em high tier', () => {
  const ratio = pixelRatioFor('high', 3, true);
  assert.equal(ratio, 1.5); // capped por isTouch
});

test('pixelRatioFor: usa padrão dpr=1 quando undefined', () => {
  const ratio = pixelRatioFor('high', undefined, false);
  assert.equal(ratio, 1); // Math.min(1, 2, 2) = 1
});

test('pixelRatioFor: medium tier capa em 1.5 para desktop', () => {
  const ratio = pixelRatioFor('medium', 3, false);
  assert.equal(ratio, 1.5); // Math.min(3, 1.5, 2) = 1.5
});

// ============================================================================
// Testes de createFrameMonitor()
// ============================================================================

test('createFrameMonitor: 40ms frames por 2.1s dispara exatamente um downgrade', () => {
  let downgradeCount = 0;
  let currentTime = 0;

  const now = () => currentTime;

  const monitor = createFrameMonitor({
    onDowngrade: () => {
      downgradeCount += 1;
    },
    windowMs: 2000,
    thresholdMs: 33,
    now,
  });

  // Simula 40ms frames por 2.1 segundos
  // De 0 a 2100ms, cada frame demora 40ms
  // Vão haver ~52 frames
  for (let i = 0; i < 53; i++) {
    monitor.sample(40);
    currentTime += 40;
  }

  assert.equal(downgradeCount, 1);
});

test('createFrameMonitor: 16ms frames não dispara downgrade', () => {
  let downgradeCount = 0;
  let currentTime = 0;

  const now = () => currentTime;

  const monitor = createFrameMonitor({
    onDowngrade: () => {
      downgradeCount += 1;
    },
    windowMs: 2000,
    thresholdMs: 33,
    now,
  });

  // Simula 16ms frames por 3 segundos (frames rápidos)
  for (let i = 0; i < 200; i++) {
    monitor.sample(16);
    currentTime += 16;
  }

  assert.equal(downgradeCount, 0);
});

test('createFrameMonitor: cooldown funciona após downgrade', () => {
  let downgradeCount = 0;
  let currentTime = 0;

  const now = () => currentTime;

  const monitor = createFrameMonitor({
    onDowngrade: () => {
      downgradeCount += 1;
    },
    windowMs: 2000,
    thresholdMs: 33,
    now,
  });

  // Primeira sequência de 40ms frames para disparar downgrade
  for (let i = 0; i < 53; i++) {
    monitor.sample(40);
    currentTime += 40;
  }
  assert.equal(downgradeCount, 1, 'primeiro downgrade deveria ter disparado');

  // Continua com 40ms frames por menos de windowMs
  // Não deveria disparar de novo durante o cooldown
  for (let i = 0; i < 40; i++) {
    monitor.sample(40);
    currentTime += 40;
  }

  // Cooldown ainda ativo, não deveria ter disparado
  assert.equal(downgradeCount, 1, 'segundo downgrade não deveria disparar durante cooldown');
});

test('createFrameMonitor: reset() limpa tudo incluindo cooldown', () => {
  let downgradeCount = 0;
  let currentTime = 0;

  const now = () => currentTime;

  const monitor = createFrameMonitor({
    onDowngrade: () => {
      downgradeCount += 1;
    },
    windowMs: 2000,
    thresholdMs: 33,
    now,
  });

  // Primeira sequência de downgrade
  for (let i = 0; i < 53; i++) {
    monitor.sample(40);
    currentTime += 40;
  }
  assert.equal(downgradeCount, 1);

  // Reset limpa cooldown
  monitor.reset();

  // Agora outra sequência lenta deveria disparar novamente
  for (let i = 0; i < 53; i++) {
    monitor.sample(40);
    currentTime += 40;
  }
  assert.equal(downgradeCount, 2, 'reset() deveria ter permitido novo downgrade');
});

test('createFrameMonitor: currentMedian() retorna mediana correta', () => {
  let currentTime = 0;
  const now = () => currentTime;

  const monitor = createFrameMonitor({
    onDowngrade: () => {},
    windowMs: 5000,
    thresholdMs: 33,
    now,
  });

  // Adiciona alguns samples
  monitor.sample(10);
  currentTime += 10;
  monitor.sample(20);
  currentTime += 10;
  monitor.sample(30);
  currentTime += 10;
  monitor.sample(40);
  currentTime += 10;

  const median = monitor.currentMedian();
  assert.equal(median, 25); // mediana de [10, 20, 30, 40] é (20+30)/2 = 25
});

// ============================================================================
// Testes de nextLowerTier()
// ============================================================================

test('nextLowerTier: high baixa para medium', () => {
  assert.equal(nextLowerTier('high'), 'medium');
});

test('nextLowerTier: medium baixa para low', () => {
  assert.equal(nextLowerTier('medium'), 'low');
});

test('nextLowerTier: low fica em low', () => {
  assert.equal(nextLowerTier('low'), 'low');
});

// ============================================================================
// Testes de TIERS
// ============================================================================

test('TIERS está congelado', () => {
  assert.equal(Object.isFrozen(TIERS), true);
});

test('TIERS tem low, medium e high com propriedades esperadas', () => {
  assert.equal(TIERS.low.antialias, false);
  assert.equal(TIERS.low.maxPixelRatio, 1);
  assert.equal(TIERS.low.triangleBudget, 600000);
  assert.equal(TIERS.low.lod, 'lod1');
  assert.equal(TIERS.low.shadows, false);

  assert.equal(TIERS.medium.antialias, true);
  assert.equal(TIERS.medium.maxPixelRatio, 1.5);
  assert.equal(TIERS.medium.triangleBudget, 1500000);
  assert.equal(TIERS.medium.lod, 'lod1');
  assert.equal(TIERS.medium.shadows, false);

  assert.equal(TIERS.high.antialias, true);
  assert.equal(TIERS.high.maxPixelRatio, 2);
  assert.equal(TIERS.high.triangleBudget, 4000000);
  assert.equal(TIERS.high.lod, 'lod0');
  assert.equal(TIERS.high.shadows, false);
});

console.log('');
if (failures > 0) {
  console.error(`${failures} verificação(ões) falharam.`);
  process.exitCode = 1;
} else {
  console.log('Todas as verificações passaram.');
}
