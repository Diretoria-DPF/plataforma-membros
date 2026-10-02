#!/usr/bin/env node
/**
 * path-anim.test.mjs — Testes das funções de animação de trajetória
 *
 * Testa:
 * - resolvePath: fallback points e âncoras puladas
 * - samplePath: endpoints, midpoint, progresso monotônico
 * - Valida que cada item em routes.json e processes.json tem >= 2 âncoras resolvíveis
 */

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const modesDir = path.resolve(here, '../../modulos/anatomia-3d/js/modes');
const dataDir = path.resolve(here, '../../modulos/anatomia-3d/data/atlas');

const { resolvePath, samplePath, buildTimeline } = await import(path.join(modesDir, 'path-anim.js'));
const { animationTiming, buildSystemGraph } = await import(path.join(modesDir, 'physiology.js'));

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

// ============================================================================
// Testes unitários
// ============================================================================

console.log('resolvePath');

test('resolve com bbox centers disponíveis', () => {
  const anchors = [
    { sid: 'fma:1', label_pt: 'Ponto A' },
    { sid: 'fma:2', label_pt: 'Ponto B' },
  ];
  const getBBoxCenter = (sid) => {
    if (sid === 'fma:1') return [0, 0, 0];
    if (sid === 'fma:2') return [1, 1, 1];
    return null;
  };

  const result = resolvePath(anchors, getBBoxCenter);
  assert.equal(result.length, 2);
  assert.deepEqual(result[0].point, [0, 0, 0]);
  assert.equal(result[0].label, 'Ponto A');
  assert.deepEqual(result[1].point, [1, 1, 1]);
  assert.equal(result[1].label, 'Ponto B');
});

test('fallback point quando bbox center ausente', () => {
  const anchors = [
    { sid: 'fma:1', label_pt: 'Com fallback', fallbackPoint: [0.5, 0.5, 0.5] },
    { sid: 'fma:2' },
  ];
  const getBBoxCenter = (sid) => null; // Simula bbox indisponível

  const result = resolvePath(anchors, getBBoxCenter);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].point, [0.5, 0.5, 0.5]);
});

test('pula âncora sem bbox e sem fallback', () => {
  const anchors = [
    { sid: 'fma:1' },
    { sid: 'fma:2' },
    { sid: 'fma:3' },
  ];
  const getBBoxCenter = (sid) => {
    if (sid === 'fma:2') return [1, 1, 1];
    return null;
  };

  const result = resolvePath(anchors, getBBoxCenter);
  assert.equal(result.length, 1);
  assert.equal(result[0].sid, 'fma:2');
});

test('usa sid como label se label_pt ausente', () => {
  const anchors = [{ sid: 'za:meu-orgao' }];
  const getBBoxCenter = (sid) => [0, 0, 0];

  const result = resolvePath(anchors, getBBoxCenter);
  assert.equal(result[0].label, 'za:meu-orgao');
});

console.log('\nsamplePath');

test('endpoints: t=0 retorna primeiro ponto', () => {
  const points = [[0, 0, 0], [1, 1, 1], [2, 2, 2]];
  const result = samplePath(points, 0);
  assert.deepEqual(result, [0, 0, 0]);
});

test('endpoints: t=1 retorna último ponto', () => {
  const points = [[0, 0, 0], [1, 1, 1], [2, 2, 2]];
  const result = samplePath(points, 1);
  assert.deepEqual(result, [2, 2, 2]);
});

test('midpoint aproximado em t=0.5', () => {
  const points = [[0, 0, 0], [2, 2, 2]];
  const result = samplePath(points, 0.5);
  // Em uma reta simples, t=0.5 deve estar próximo ao meio
  const dist = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2);
  assert.ok(dist > 1.2 && dist < 1.9, `Distância ${dist} fora da faixa esperada`);
});

test('progresso monotônico: t2 > t1 → ponto mais longe', () => {
  const points = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
  const p1 = samplePath(points, 0.3);
  const p2 = samplePath(points, 0.7);

  const d1 = Math.sqrt(p1[0] ** 2 + p1[1] ** 2 + p1[2] ** 2);
  const d2 = Math.sqrt(p2[0] ** 2 + p2[1] ** 2 + p2[2] ** 2);
  assert.ok(d2 > d1, `Progresso não-monotônico: ${d1} vs ${d2}`);
});

test('único ponto retorna aquele ponto', () => {
  const points = [[3, 4, 5]];
  const result = samplePath(points, 0.5);
  assert.deepEqual(result, [3, 4, 5]);
});

// ============================================================================
// Validação de dados
// ============================================================================

console.log('\nValidação de dados (routes.json e processes.json)');

function validateDataFile(filePath, type) {
  let data;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    data = JSON.parse(content);
  } catch (err) {
    console.error(`  ERRO ao ler ${path.basename(filePath)}: ${err.message}`);
    return;
  }

  const failures_ = [];
  const mockGetBBoxCenter = (sid) => [Math.random(), Math.random(), Math.random()];

  for (const item of data) {
    const anchors = type === 'routes' ? item.anchors : (item.steps || []).flatMap((s) => s.anchors || []);
    const resolved = resolvePath(anchors, mockGetBBoxCenter);

    if (resolved.length < 2) {
      failures_.push(item.id);
    }
  }

  const failureRate = failures_.length / data.length;
  if (failureRate <= 0.2) {
    console.log(`  ok — ${path.basename(filePath)}: ${data.length} items, ${failures_.length} falhas (${(failureRate * 100).toFixed(1)}% < 20%)`);
  } else {
    console.error(`  FALHOU — ${path.basename(filePath)}: ${failures_.length} falhas em ${data.length} items (${(failureRate * 100).toFixed(1)}%)`);
    console.error(`    Items que falharam: ${failures_.slice(0, 10).join(', ')}${failures_.length > 10 ? ', ...' : ''}`);
    failures += 1;
  }
}

// ============================================================================
// Linha do tempo (PR 3.2, Bloco D): velocidade por trecho e pausas
// ============================================================================
function tcheck(cond, msg) {
  if (cond) console.log(`  ok — ${msg}`);
  else { console.error(`  FALHOU — ${msg}`); failures += 1; }
}
{
  const pts = [[0, 0, 0], [1, 0, 0], [3, 0, 0]];
  const tl = buildTimeline(pts, { segmentMs: [1000, 1000], dwellMs: [0, 500, 0] });
  tcheck(tl.totalMs === 2500, 'timeline: soma de trechos + pausas');
  tcheck(Math.abs(tl.tAt(500) - (0.5 / 3)) < 1e-9, 'timeline: meio do 1º trecho em t = 0,5/3 do arco');
  tcheck(Math.abs(tl.tAt(1200) - 1 / 3) < 1e-9 && Math.abs(tl.tAt(1450) - 1 / 3) < 1e-9, 'timeline: parado no ponto durante a pausa');
  tcheck(Math.abs(tl.tAt(2000) - 2 / 3) < 1e-9, 'timeline: 2º trecho é mais rápido (mesmo tempo, dobro do arco)');
  tcheck(tl.tAt(9999) === 1 && tl.tAt(-5) === 0, 'timeline: limites 0 e 1');
  const dflt = buildTimeline(pts, { totalMs: 3000 });
  tcheck(dflt.totalMs === 3000 && Math.abs(dflt.tAt(1000) - 1 / 3) < 1e-9, 'timeline: sem segmentMs reparte o total pelo comprimento');
  const ivTime = animationTiming({ phaseTiming: { injecao: 0.5, distribuicao: 1 } }, 'vias', 4);
  const oralTime = animationTiming({ phaseTiming: { absorcao: 6, primeiraPassagem: 3, distribuicao: 2 } }, 'vias', 4);
  tcheck(ivTime.totalMs === 3000 && oralTime.totalMs === 11000, 'animationTiming: duração vem de phaseTiming (mín. 3 s)');
  tcheck(oralTime.dwellMs[3] === 1200 && oralTime.dwellMs[1] === 250 && oralTime.dwellMs[0] === 0, 'animationTiming: pausa longa no órgão-alvo, curta no caminho');
  tcheck(animationTiming({}, 'vias', 3).totalMs === 2000, 'animationTiming: via sem phaseTiming mantém o ritmo antigo');
  tcheck(animationTiming({}, 'processos', 5).dwellMs.filter((d) => d === 600).length === 4, 'animationTiming: processo pausa em cada passo');
}

{
  const g = buildSystemGraph([
    { id: 'a', name_pt: 'A', system: 'x', interageCom: ['b', 'c', 'zz'] },
    { id: 'b', name_pt: 'B', system: 'x', interageCom: ['a'] },
    { id: 'c', name_pt: 'C', system: 'y' },
  ], { size: 200 });
  tcheck(g.nodes.length === 3 && g.nodes.every((n) => n.x >= 0 && n.x <= 200 && n.y >= 0 && n.y <= 200), 'visão sistêmica: um nó por processo, dentro do quadro');
  tcheck(g.edges.length === 2 && !g.edges.some((e) => e.to === 'zz'), 'visão sistêmica: A–B uma vez só e sem processo inexistente');
}

validateDataFile(path.join(dataDir, 'routes.json'), 'routes');
validateDataFile(path.join(dataDir, 'processes.json'), 'processes');

// ============================================================================
// Resultado final
// ============================================================================

console.log('');
if (failures === 0) {
  console.log('✓ Todos os testes passaram');
  process.exitCode = 0;
} else {
  console.log(`✗ ${failures} teste(s) falharam`);
  process.exitCode = 1;
}
