/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): física com regras rotuladas (exata, aproximação didática, regra de jogo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const F = require('../modulos/laboratorio/js/lab-motor-fisica.js');
const E = require('../modulos/laboratorio/js/lab-motor-estado.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');

const aprox = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} obtido ${a}, esperado ${b} ±${tol}`);

function recAgua(gAgua, extra) {
  const r = E.criarRecipiente({ id: 'r', tipo: 'bequer', capMl: 500, massaVazio_g: 0 }, 25);
  return E.congelar({ ...r, liquido: { H2O_l: E.mmolDeMassa(ESPECIES.H2O_l, gAgua) }, ...(extra || {}) });
}

test('REGRAS: toda regra tem nível válido, texto e rótulo legível', () => {
  assert.deepEqual(F.NIVEIS, ['exata', 'aproximacao_didatica', 'regra_de_jogo']);
  for (const [id, r] of Object.entries(F.REGRAS)) {
    assert.ok(F.NIVEIS.includes(r.nivel), id);
    assert.ok(r.texto && r.texto.length > 10, id);
    assert.ok(F.rotuloNivel(r.nivel).length > 3);
  }
  assert.equal(F.rotuloNivel('aproximacao_didatica'), 'aproximação didática');
  assert.equal(F.rotuloNivel('regra_de_jogo'), 'regra de jogo');
  assert.throws(() => F.regra('inexistente'), /regra/);
});

test('térmica: 100 g de água + 1.000 J ≈ +2,39 K (Q = m·c·ΔT, sem perdas)', () => {
  const r = F.passoTermico(recAgua(100), { dtS: 10, potenciaW: 100, kAmbienteWK: 0 }, ESPECIES);
  aprox(r.rec.tempC - 25, 1000 / (100 * 4.18), 1e-6);
  assert.equal(r.regra, 'termica_newton');
});

test('térmica: o mesmo calor aquece 10 g mais que 250 g (massa térmica)', () => {
  const p = { dtS: 60, potenciaW: 50, kAmbienteWK: 0 };
  const pequeno = F.passoTermico(recAgua(10), p, ESPECIES).rec.tempC;
  const grande = F.passoTermico(recAgua(250), p, ESPECIES).rec.tempC;
  assert.ok(pequeno - 25 > 20 * (grande - 25));
});

test('térmica: sem fonte, perde calor para o ambiente e tende à temperatura ambiente', () => {
  let rec = E.congelar({ ...recAgua(50), tempC: 80 });
  for (let i = 0; i < 2000; i++) rec = F.passoTermico(rec, { dtS: 5, tempAmbienteC: 25 }, ESPECIES).rec;
  aprox(rec.tempC, 25, 0.5);
});

test('térmica: termostato não passa do alvo', () => {
  let rec = recAgua(100);
  for (let i = 0; i < 400; i++) rec = F.passoTermico(rec, { dtS: 5, potenciaW: 500, alvoC: 60 }, ESPECIES).rec;
  aprox(rec.tempC, 60, 1e-9);
});

test('banho de gelo: água morna tende ao equilíbrio entre banho e ambiente (Newton, solução exata do passo)', () => {
  let rec = E.congelar({ ...recAgua(50), tempC: 60 });
  for (let i = 0; i < 400; i++) rec = F.passoTermico(rec, { dtS: 5, banhoC: 0, kBanhoWK: 5 }, ESPECIES).rec;
  aprox(rec.tempC, (5 * 0 + 0.3 * 25) / 5.3, 0.05);
});

test('ebulição: água aberta não passa de 100 °C; o excesso de energia evapora m = Q/ΔHvap', () => {
  let rec = E.congelar({ ...recAgua(100), tempC: 99.9 });
  const r = F.passoTermico(rec, { dtS: 60, potenciaW: 1000, kAmbienteWK: 0 }, ESPECIES);
  assert.equal(r.rec.tempC, 100);
  const evapG = E.massaDeMmol(ESPECIES.H2O_l, r.evaporado.H2O_l);
  const esperadoG = (60 * 1000 - 0.1 * 100 * 4.18) / 2257;
  aprox(evapG, esperadoG, 0.05);
  aprox(E.massaRecipiente(r.rec, ESPECIES) + evapG, 100, 1e-9, 'massa conservada');
  assert.ok(r.eventos.some((e) => e.tipo === 'ebulicao'));
});

test('ebulição: em mistura, o líquido de menor ponto de ebulição define o patamar', () => {
  const r0 = recAgua(50);
  const rec = E.congelar({ ...r0, tempC: 78, liquido: { ...r0.liquido, Etanol_l: E.mmolDeMassa(ESPECIES.Etanol_l, 20) } });
  const r = F.passoTermico(rec, { dtS: 30, potenciaW: 500, kAmbienteWK: 0 }, ESPECIES);
  assert.equal(r.rec.tempC, ESPECIES.Etanol_l.teb);
  assert.ok(r.evaporado.Etanol_l > 0);
  assert.equal(r.evaporado.H2O_l, undefined);
});

test('refluxo: com condensador, a temperatura fica no patamar e nada se perde', () => {
  const rec = E.congelar({ ...recAgua(100), tempC: 100, condensador: true });
  const r = F.passoTermico(rec, { dtS: 60, potenciaW: 800, kAmbienteWK: 0 }, ESPECIES);
  assert.equal(r.rec.tempC, 100);
  assert.deepEqual(r.evaporado, {});
  aprox(E.massaRecipiente(r.rec, ESPECIES), 100, 1e-9);
  assert.ok(r.eventos.some((e) => e.tipo === 'refluxo' && e.regra === 'refluxo'));
});

test('solubilidade: interpolação linear entre pontos tabelados e limitada nas pontas', () => {
  aprox(F.solubilidadeG100(ESPECIES.NaCl_s, 'H2O_l', 12.5), 35.85, 1e-9);
  aprox(F.solubilidadeG100(ESPECIES.NaCl_s, 'H2O_l', -10), 35.7, 1e-9);
  aprox(F.solubilidadeG100(ESPECIES.NaCl_s, 'H2O_l', 150), 39.1, 1e-9);
  assert.equal(F.solubilidadeG100(ESPECIES.NaCl_s, 'Etanol_l', 25), null);
});

test('saturação: 50 g de NaCl em 100 g de água a 25 °C dissolvem 36 g e sobram 14 g de sólido', () => {
  const rec = E.congelar({ ...recAgua(100), solido: { NaCl_s: E.mmolDeMassa(ESPECIES.NaCl_s, 50) } });
  const r = F.equilibrarSolubilidade(rec, ESPECIES);
  aprox(E.massaDeMmol(ESPECIES.NaCl_s, r.rec.liquido.NaCl_s), 36, 1e-9);
  aprox(E.massaDeMmol(ESPECIES.NaCl_s, r.rec.solido.NaCl_s), 14, 1e-9);
  assert.ok(r.eventos.some((e) => e.tipo === 'saturada'));
});

test('cristalização: solução saturada a quente deposita sólido ao esfriar (recristalização)', () => {
  const quente = E.congelar({ ...recAgua(100), tempC: 100, liquido: { H2O_l: E.mmolDeMassa(ESPECIES.H2O_l, 100), AcidoBenzoico_s: E.mmolDeMassa(ESPECIES.AcidoBenzoico_s, 5) } });
  const frio = E.congelar({ ...quente, tempC: 0 });
  const r = F.equilibrarSolubilidade(frio, ESPECIES);
  aprox(E.massaDeMmol(ESPECIES.AcidoBenzoico_s, r.rec.liquido.AcidoBenzoico_s), 0.17, 1e-9);
  aprox(E.massaDeMmol(ESPECIES.AcidoBenzoico_s, r.rec.solido.AcidoBenzoico_s), 4.83, 1e-9);
  assert.ok(r.eventos.some((e) => e.tipo === 'cristalizacao'));
});

test('dissolução parcial: fração < 1 dissolve só parte do que cabe (sem agitação)', () => {
  const rec = E.congelar({ ...recAgua(100), solido: { NaCl_s: E.mmolDeMassa(ESPECIES.NaCl_s, 10) } });
  const r = F.equilibrarSolubilidade(rec, ESPECIES, { fracaoDissolucao: 0.5 });
  aprox(E.massaDeMmol(ESPECIES.NaCl_s, r.rec.liquido.NaCl_s), 5, 1e-9);
});

test('Ksp: PbI2 precipita até Q = Ksp (modelo ideal)', () => {
  const vol = 100; // mL
  const x = F.precipitarKsp({ cationMmol: 1, anionMmol: 2, a: 1, b: 2, ksp: 9.8e-9, volMl: vol });
  const pb = (1 - x) / vol;
  const i = (2 - 2 * x) / vol;
  aprox(pb * i * i, 9.8e-9, 1e-11);
  assert.ok(x > 0.8 && x < 0.9, `x = ${x}`); // sobra ≈ 1,35 mmol/L de Pb2+ em solução
  assert.equal(F.precipitarKsp({ cationMmol: 1e-6, anionMmol: 2e-6, a: 1, b: 2, ksp: 9.8e-9, volMl: vol }), 0);
});

test('cinética: fator 2 a cada 10 °C (regra prática declarada)', () => {
  aprox(F.fatorCinetico(35, 25), 2, 1e-12);
  aprox(F.fatorCinetico(15, 25), 0.5, 1e-12);
  assert.equal(F.REGRAS.cinetica_fator2.nivel, 'aproximacao_didatica');
});

test('ponto de fusão: impureza abaixa o início e alarga a faixa', () => {
  const puro = F.pontoFusaoObservado(135, 0);
  const impuro = F.pontoFusaoObservado(135, 0.05);
  assert.equal(puro.fimC, 135);
  aprox(puro.fimC - puro.inicioC, 1, 1e-9);
  assert.ok(impuro.fimC < puro.fimC);
  assert.ok(impuro.fimC - impuro.inicioC > puro.fimC - puro.inicioC);
});

test('CCD: uma mancha por espécie acima de 2 % da amostra, com Rf ilustrativo', () => {
  const m = F.manchasCCD({ AAS_s: 0.97, AcidoSalicilico_s: 0.03 }, { AAS_s: 0.5, AcidoSalicilico_s: 0.35 });
  assert.deepEqual(m.map((x) => x.especie).sort(), ['AAS_s', 'AcidoSalicilico_s']);
  const so = F.manchasCCD({ AAS_s: 0.99, AcidoSalicilico_s: 0.01 }, { AAS_s: 0.5, AcidoSalicilico_s: 0.35 });
  assert.equal(so.length, 1);
  assert.equal(F.manchasCCD({ X: 1 }, {})[0].rf, null);
});

test('gás ideal: 1 mol a 0 °C em 22,414 L ≈ 1 atm', () => {
  aprox(F.pressaoGasIdealAtm(1, 0, 22.414), 1, 1e-3);
});

test('partição: ácido fraco vai para o orgânico em pH baixo e fica na água em pH alto', () => {
  const baixo = F.fracaoOrganica({ kd: 50, pKa: 4.2, pH: 2, volOrgMl: 50, volAqMl: 50 });
  const alto = F.fracaoOrganica({ kd: 50, pKa: 4.2, pH: 9, volOrgMl: 50, volAqMl: 50 });
  assert.ok(baixo > 0.97);
  assert.ok(alto < 0.01);
  aprox(F.fracaoOrganica({ kd: 1, volOrgMl: 10, volAqMl: 10 }), 0.5, 1e-12);
});
