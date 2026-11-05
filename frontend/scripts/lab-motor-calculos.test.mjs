/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): cálculos farmacêuticos (tabela de casos) e conferência de resposta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const C = require('../modulos/laboratorio/js/lab-motor-calculos.js');

const aprox = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} obtido ${a}, esperado ${b} ±${tol}`);

test('massa para solução % p/v: 0,9 % em 100 mL = 0,90 g; com pureza 99 % = 0,909 g', () => {
  aprox(C.massaParaPV(0.9, 100), 0.9, 1e-12);
  aprox(C.massaParaPV(0.9, 100, 0.99), 0.9 / 0.99, 1e-12);
  aprox(C.massaParaPV(85, 100), 85, 1e-12);
  assert.throws(() => C.massaParaPV(1, 0), /volume/);
  assert.throws(() => C.massaParaPV(1, 10, 1.2), /pureza/);
});

test('mmol e molaridade: 2,00 g de ácido salicílico = 14,48 mmol; 0,9 g NaCl em 100 mL = 0,154 mol/L', () => {
  aprox(C.mmol(2, 138.12), 14.48, 0.005);
  aprox(C.molaridade(0.9, 58.44, 100), 0.154, 0.0005);
  aprox(C.mmolDeVolume(5, 1.08, 102.09), 52.9, 0.05);
});

test('diluição C1·V1 = C2·V2 (tabela)', () => {
  const casos = [
    [{ c1: 1, v1: 10, c2: 0.1 }, 100],
    [{ c1: 70, v1: 100, c2: 35 }, 200],
    [{ c1: 0.5, c2: 0.05, v2: 250 }, 25]
  ];
  for (const [p, esperado] of casos) aprox(C.diluir(p), esperado, 1e-9, JSON.stringify(p));
  assert.throws(() => C.diluir({ c1: 1, c2: 2, v1: 10 }), /concentração/);
});

test('osmolaridade ideal: NaCl 0,9 % ≈ 308 mOsm/L (i = 2)', () => {
  aprox(C.osmolaridade([{ concMolL: C.molaridade(0.9, 58.44, 100), i: 2 }]), 308, 1);
  aprox(C.osmolaridade([{ concMolL: 0.278, i: 1 }]), 278, 1e-9);
});

test('fator de correção pelo teor e rendimento percentual', () => {
  aprox(C.fatorCorrecao(98), 100 / 98, 1e-12);
  aprox(C.rendimentoPct(1.8, 2.61), 68.97, 0.01);
  aprox(C.rendimentoTeoricoG(14.48, 1, 1, 180.16), 2.61, 0.005);
  assert.throws(() => C.fatorCorrecao(0), /teor/);
});

test('dose em mL para exercício (com aviso de uso didático)', () => {
  const r = C.doseMl({ mgPorKg: 10, pesoKg: 20, concMgPorMl: 50 });
  aprox(r.ml, 4, 1e-12);
  assert.match(r.aviso, /didátic/);
});

test('conferirResposta: aceita vírgula decimal e tolerância; mostra a conta', () => {
  const calc = { pergunta: 'Massa?', formula: 'm = C·V/100', resposta: 0.9, tolerancia: 0.01, unidade: 'g' };
  assert.equal(C.conferirResposta(calc, '0,90').ok, true);
  assert.equal(C.conferirResposta(calc, 0.905).ok, true);
  const errado = C.conferirResposta(calc, '9');
  assert.equal(errado.ok, false);
  assert.match(errado.texto, /0,9/);
  assert.equal(C.conferirResposta(calc, 'abc').ok, false);
  assert.equal(C.conferirResposta(calc, undefined).respondida, false);
});

test('formatarNumero: vírgula decimal pt-BR', () => {
  assert.equal(C.formatarNumero(0.9, 2), '0,90');
  assert.equal(C.formatarNumero(1234.5, 1), '1234,5');
});
