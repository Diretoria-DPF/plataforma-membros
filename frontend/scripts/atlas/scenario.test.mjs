#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * scripts/atlas/scenario.test.mjs — aba Clínica (PR 3.2, Bloco C.3).
 * Estado do cenário por minuto e antídoto (ui/scenario-panel.js) e
 * conferência do cenário real da crise colinérgica, quando existir.
 * Uso: node --test scripts/atlas/scenario.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarioState, scenarioEnd } from '../../modulos/anatomia-3d/js/ui/scenario-panel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REAL = path.join(__dirname, '..', '..', 'modulos', 'anatomia-3d', 'data', 'atlas', 'scenarios', 'crise-colinergica.json');

const FIX = {
  fases: [
    { id: 'a', inicioMin: 0, fimMin: 10, sinais: [{ nome: 'Miose', receptor: 'muscarinico' }] },
    { id: 'b', inicioMin: 5, fimMin: 30, sinais: [{ nome: 'Fasciculações', receptor: 'nicotinico-muscular' }, { nome: 'Convulsão', receptor: 'snc' }] },
  ],
  antidotos: [
    { id: 'atropina', nome: 'Atropina', reverte: ['muscarinico', 'snc'], naoReverte: ['nicotinico-muscular'] },
    { id: 'oxima', nome: 'Pralidoxima', reverte: ['nicotinico-muscular'], naoReverte: [] },
  ],
};

test('fases ativas por minuto (sobreposição e fim inclusivo da última)', () => {
  assert.deepEqual(scenarioState(FIX, 2).phases.map((p) => p.id), ['a']);
  assert.deepEqual(scenarioState(FIX, 7).phases.map((p) => p.id), ['a', 'b']);
  assert.deepEqual(scenarioState(FIX, 30).phases.map((p) => p.id), ['b']);
  assert.equal(scenarioEnd(FIX), 30);
});

test('antídoto risca só os sinais do receptor que ele reverte', () => {
  const st = scenarioState(FIX, 7, ['atropina']);
  const by = Object.fromEntries(st.signs.map((s) => [s.nome, s.reverted]));
  assert.deepEqual(by, { Miose: true, 'Fasciculações': false, 'Convulsão': true });
  const both = scenarioState(FIX, 7, ['atropina', 'oxima']);
  assert.ok(both.signs.every((s) => s.reverted));
});

test('crise colinérgica real: 6 fases em ordem, atropina não reverte a placa motora', (t) => {
  if (!fs.existsSync(REAL)) { t.skip('scenarios/crise-colinergica.json ainda não existe'); return; }
  const sc = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  assert.equal(sc.fases.length, 6);
  for (let i = 0; i < sc.fases.length; i++) {
    assert.ok(sc.fases[i].fimMin > sc.fases[i].inicioMin, `${sc.fases[i].id}: fim > início`);
    if (i) assert.ok(sc.fases[i].inicioMin >= sc.fases[i - 1].inicioMin, 'fases em ordem de início');
  }
  const atr = sc.antidotos.find((a) => a.id === 'atropina');
  assert.ok(atr && atr.reverte.includes('muscarinico') && atr.naoReverte.includes('nicotinico-muscular'));
  const receptors = new Set(sc.fases.flatMap((f) => f.sinais.map((s) => s.receptor)));
  for (const r of ['muscarinico', 'nicotinico-muscular', 'snc']) assert.ok(receptors.has(r), `sinais ${r}`);
});
