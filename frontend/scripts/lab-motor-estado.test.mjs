/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): estado imutável com semente, RNG reprodutível, balanço de massa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const E = require('../modulos/laboratorio/js/lab-motor-estado.js');
const { ESPECIES } = require('../modulos/laboratorio/js/lab-motor-especies.js');

const base = () => E.criarEstado({ semente: 42, recipientes: [{ id: 'bequer1', tipo: 'bequer', capMl: 250 }] });

test('criarEstado: estado congelado, serializável e com recipiente vazio a 25 °C', () => {
  const s = base();
  assert.equal(s.versao, E.VERSAO);
  assert.equal(s.semente, 42);
  assert.equal(s.t, 0);
  assert.ok(Object.isFrozen(s));
  assert.ok(Object.isFrozen(s.recipientes.bequer1));
  assert.ok(Object.isFrozen(s.recipientes.bequer1.liquido));
  assert.equal(s.recipientes.bequer1.tempC, 25);
  assert.deepEqual(s.recipientes.bequer1.liquido, {});
  assert.throws(() => { 'use strict'; s.t = 9; }, TypeError);
});

test('criarEstado: rejeita semente inválida e recipiente sem id ou capacidade', () => {
  assert.throws(() => E.criarEstado({ semente: 'x' }), /semente/);
  assert.throws(() => E.criarEstado({ semente: 1, recipientes: [{ tipo: 'bequer', capMl: 10 }] }), /id/);
  assert.throws(() => E.criarEstado({ semente: 1, recipientes: [{ id: 'a', capMl: 0 }] }), /capMl/);
  assert.throws(() => E.criarEstado({ semente: 1, recipientes: [{ id: 'a', capMl: 5 }, { id: 'a', capMl: 5 }] }), /duplicado/);
});

test('RNG: mesma semente dá a mesma sequência; sementes diferentes divergem', () => {
  const seq = (sem) => {
    let s = E.criarEstado({ semente: sem });
    const out = [];
    for (let i = 0; i < 50; i++) { const r = E.sortear(s); out.push(r.valor); s = r.estado; }
    return out;
  };
  assert.deepEqual(seq(7), seq(7));
  assert.notDeepEqual(seq(7), seq(8));
  for (const v of seq(123)) assert.ok(v >= 0 && v < 1);
});

test('RNG: sortear não altera o estado de origem (imutável)', () => {
  const s = base();
  const r1 = E.sortear(s);
  const r2 = E.sortear(s);
  assert.equal(r1.valor, r2.valor);
  assert.notEqual(r1.estado.rng, s.rng);
});

test('RNG: distribuição uniforme razoável (média ≈ 0,5) e normal com média e desvio', () => {
  let s = E.criarEstado({ semente: 99 });
  let soma = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) { const r = E.sortear(s); soma += r.valor; s = r.estado; }
  assert.ok(Math.abs(soma / n - 0.5) < 0.02);
  const xs = [];
  for (let i = 0; i < n; i++) { const r = E.sortearNormal(s, 10, 2); xs.push(r.valor); s = r.estado; }
  const media = xs.reduce((a, b) => a + b, 0) / n;
  const dp = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / n);
  assert.ok(Math.abs(media - 10) < 0.15, `média ${media}`);
  assert.ok(Math.abs(dp - 2) < 0.15, `desvio ${dp}`);
});

test('comRecipiente: devolve estado novo, preserva o antigo e os outros ramos (compartilhamento estrutural)', () => {
  const s = E.criarEstado({ semente: 1, recipientes: [{ id: 'a', capMl: 100 }, { id: 'b', capMl: 100 }] });
  const s2 = E.comRecipiente(s, 'a', (r) => ({ ...r, tempC: 60 }));
  assert.equal(s.recipientes.a.tempC, 25);
  assert.equal(s2.recipientes.a.tempC, 60);
  assert.equal(s2.recipientes.b, s.recipientes.b);
  assert.ok(Object.isFrozen(s2.recipientes.a));
  assert.throws(() => E.comRecipiente(s, 'zz', (r) => r), /recipiente/);
});

test('somarEspecie: adiciona e retira mmol sem negativos; zera resíduo numérico', () => {
  const c1 = E.somarEspecie({}, 'NaCl_s', 5);
  assert.deepEqual(c1, { NaCl_s: 5 });
  const c2 = E.somarEspecie(c1, 'NaCl_s', -5 + 1e-13);
  assert.deepEqual(c2, {});
  assert.throws(() => E.somarEspecie(c1, 'NaCl_s', -6), /negativ/);
  assert.ok(Object.isFrozen(c2));
});

test('massa: mmol × MM / 1000 por recipiente e no total; volume líquido pelo solvente', () => {
  let s = base();
  s = E.comRecipiente(s, 'bequer1', (r) => ({
    ...r,
    liquido: { H2O_l: E.mmolDeMassa(ESPECIES.H2O_l, 100), NaCl_s: E.mmolDeMassa(ESPECIES.NaCl_s, 0.9) },
  }));
  const rec = s.recipientes.bequer1;
  assert.ok(Math.abs(E.massaRecipiente(rec, ESPECIES) - 100.9) < 1e-9);
  assert.ok(Math.abs(E.massaTotal(s, ESPECIES) - 100.9) < 1e-9);
  // água a 0,997 g/mL: 100 g ≈ 100,3 mL; soluto não soma volume (aproximação declarada)
  assert.ok(Math.abs(E.volumeLiquidoMl(rec, ESPECIES) - 100 / ESPECIES.H2O_l.densidade) < 1e-9);
});

test('mmolDeMassa / massaDeMmol: ida e volta', () => {
  const m = 2.5;
  const n = E.mmolDeMassa(ESPECIES.NaCl_s, m);
  assert.ok(Math.abs(E.massaDeMmol(ESPECIES.NaCl_s, n) - m) < 1e-12);
  assert.throws(() => E.mmolDeMassa({}, 1), /massa molar/);
});

test('serializar / desserializar: ida e volta idêntica e congelada; versão errada é recusada', () => {
  const s = E.comRecipiente(base(), 'bequer1', (r) => ({ ...r, liquido: { H2O_l: 10 } }));
  const txt = E.serializar(s);
  const s2 = E.desserializar(txt);
  assert.deepEqual(s2, s);
  assert.ok(Object.isFrozen(s2.recipientes.bequer1.liquido));
  assert.throws(() => E.desserializar(JSON.stringify({ ...s, versao: 1 })), /versão/);
  assert.throws(() => E.desserializar('{'), /inválid/);
});

test('comBalanco: acumula parcelas do balanço sem mutar o estado anterior', () => {
  const s = base();
  const s2 = E.comBalanco(s, { entradas_g: 2, perdas_g: 0.1 });
  const s3 = E.comBalanco(s2, { perdas_g: 0.2 });
  assert.equal(s.balanco.entradas_g, 0);
  assert.equal(s3.balanco.entradas_g, 2);
  assert.ok(Math.abs(s3.balanco.perdas_g - 0.3) < 1e-12);
  assert.throws(() => E.comBalanco(s, { inventado_g: 1 }), /parcela/);
});
