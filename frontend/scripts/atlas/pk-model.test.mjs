#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * scripts/atlas/pk-model.test.mjs — modelo PK/PD (PR 3.2, Bloco C).
 *
 * 1. Propriedades do modelo: IV, Bateman, Tmax analítico, limite ka → ke,
 *    Emax/Hill e a grade da simulação.
 * 2. Casos canônicos (C.5): para AAS, propranolol e diazepam, quando o
 *    composto já está em v2 em data/atlas/compounds.json, o Tmax (e o Cmax,
 *    se houver cmaxRef) simulado fica a até 25% do valor CITADO no próprio
 *    dado — o número de referência vem de pk.tmax/pk.cmaxRef com fonte em
 *    sources[] (field "pk.tmax"/"pk.cmaxRef"), nunca deste teste.
 *    Todo composto v2 passa pela mesma conferência.
 *
 * Uso: node --test scripts/atlas/pk-model.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  eliminationRate, pkParams, concentration, analyticTmax, effect, simulate, relativeError, defaultDuration,
} from '../../modulos/anatomia-3d/js/core/pk-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOUNDS = path.join(__dirname, '..', '..', 'modulos', 'anatomia-3d', 'data', 'atlas', 'compounds.json');
const TOLERANCE = 0.25;
const CANONICAL = [
  { id: /^(aas|acido-acetilsalicilico|aspirina)$/, label: 'AAS' },
  { id: /^propranolol$/, label: 'propranolol' },
  { id: /^diazepam$/, label: 'diazepam' },
];

const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

test('ke = ln2 / t½', () => {
  assert.ok(close(eliminationRate(4), Math.LN2 / 4));
  assert.equal(eliminationRate(0), 0);
});

test('IV em bolus: C0 = D/Vd e cai à metade em uma meia-vida; F e ka ignorados', () => {
  const p = pkParams({ route: 'IV', dose: 500, vd: 50, halfLife: 2, ka: 9, F: 0.1 });
  assert.equal(p.F, 1);
  assert.equal(p.ka, 0);
  assert.ok(close(concentration(0, p), 10));
  assert.ok(close(concentration(2, p), 5));
  assert.equal(analyticTmax(p), 0);
});

test('Bateman: começa em zero, Tmax analítico é o pico e F escala a curva', () => {
  const p = pkParams({ route: 'ORAL', dose: 100, vd: 40, halfLife: 4, ka: 1.5, F: 0.8 });
  const tm = analyticTmax(p);
  assert.ok(close(tm, Math.log(1.5 / p.ke) / (1.5 - p.ke)));
  assert.equal(concentration(0, p), 0);
  const cm = concentration(tm, p);
  assert.ok(cm > concentration(tm - 0.05, p) && cm > concentration(tm + 0.05, p), 'pico no Tmax analítico');
  const half = pkParams({ route: 'ORAL', dose: 100, vd: 40, halfLife: 4, ka: 1.5, F: 0.4 });
  assert.ok(close(concentration(tm, half), cm / 2));
});

test('limite ka → ke é contínuo (sem divisão por zero)', () => {
  const ke = eliminationRate(3);
  const p = pkParams({ route: 'ORAL', dose: 100, vd: 20, halfLife: 3, ka: ke, F: 1 });
  const q = pkParams({ route: 'ORAL', dose: 100, vd: 20, halfLife: 3, ka: ke * 1.0001, F: 1 });
  assert.ok(Number.isFinite(concentration(2, p)));
  assert.ok(Math.abs(concentration(2, p) - concentration(2, q)) / concentration(2, q) < 1e-3);
  assert.ok(close(analyticTmax(p), 1 / ke));
});

test('Emax/Hill: E(EC50) = Emax/2, monotônico e saturável', () => {
  const pd = { emax: 80, ec50: 2, hill: 1.5 };
  assert.ok(close(effect(2, pd), 40));
  assert.equal(effect(0, pd), 0);
  assert.ok(effect(4, pd) > effect(3, pd));
  assert.ok(effect(1e6, pd) < 80 && effect(1e6, pd) > 79.9);
});

test('simulate: grade, Cmax/Tmax exatos, efeito e AUC ≈ F·D/(Vd·ke)', () => {
  const c = { pk: { route: 'ORAL', dose: 200, vd: 30, halfLife: 2, ka: 2, F: 0.9 }, pd: { emax: 100, ec50: 1, hill: 1 } };
  const r = simulate(c, { duration: 40, points: 4001 });
  assert.equal(r.t.length, 4001);
  assert.equal(r.t[0], 0);
  assert.equal(r.t[r.t.length - 1], 40);
  assert.ok(Math.max(...r.cp) <= r.cmax + 1e-9, 'nenhum ponto da grade passa do Cmax analítico');
  assert.ok(r.e.every((x) => x >= 0 && x <= 100));
  const ke = Math.LN2 / 2;
  assert.ok(relativeError(r.auc, (0.9 * 200) / (30 * ke)) < 0.01);
  assert.equal(defaultDuration({ halfLife: 0.5 }), 6);
  assert.equal(defaultDuration({ halfLife: 40 }), 72);
});

// ---- Casos canônicos e conferência de todo composto v2 ----
const compounds = JSON.parse(fs.readFileSync(COMPOUNDS, 'utf8'));
const v2 = compounds.filter((c) => c && c.pd && Array.isArray(c.sources) && c.review && c.review.status !== 'legacy-unverified');

function citedFields(c) {
  return new Set((c.sources || []).map((s) => s.field));
}

test('compostos v2: Tmax (e Cmax de referência) simulados a até 25% do valor citado', (t) => {
  if (!v2.length) {
    t.skip('compounds.json ainda sem compostos v2 (Bloco C.1)');
    return;
  }
  const fails = [];
  for (const c of v2) {
    const sim = simulate(c);
    const cited = citedFields(c);
    if (c.pk.route !== 'IV') {
      assert.ok(cited.has('pk.tmax'), `${c.id}: pk.tmax sem fonte em sources[]`);
      const err = relativeError(sim.tmax, c.pk.tmax);
      if (err > TOLERANCE) fails.push(`${c.id}: Tmax simulado ${sim.tmax.toFixed(2)} h × citado ${c.pk.tmax} h (${(err * 100).toFixed(0)}%)`);
    }
    if (c.pk.cmaxRef != null) {
      assert.ok(cited.has('pk.cmaxRef'), `${c.id}: pk.cmaxRef sem fonte em sources[]`);
      const err = relativeError(sim.cmax, c.pk.cmaxRef);
      if (err > TOLERANCE) fails.push(`${c.id}: Cmax simulado ${sim.cmax.toFixed(3)} × citado ${c.pk.cmaxRef} ${c.pk.concUnit || 'mg/L'} (${(err * 100).toFixed(0)}%)`);
    }
  }
  assert.deepEqual(fails, []);
});

test('casos canônicos (AAS, propranolol, diazepam) presentes quando o catálogo v2 estiver completo', (t) => {
  if (v2.length < 30) {
    t.skip(`catálogo v2 incompleto (${v2.length}/30) — a exigência vale a partir de 30`);
    return;
  }
  for (const k of CANONICAL) {
    const c = v2.find((x) => k.id.test(x.id));
    assert.ok(c, `${k.label}: composto canônico ausente do catálogo v2`);
    assert.ok(c.pk.cmaxRef != null || c.pk.tmax != null, `${k.label}: sem valor de referência citado`);
  }
});
