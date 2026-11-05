/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): relógio de passo fixo, separado da tela, que pausa com a aba oculta.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../modulos/laboratorio/js/lab-motor-relogio.js');

test('acumular: o tempo simulado não depende de como o tempo real foi fatiado', () => {
  let a = R.criarRelogio({ dtS: 5 });
  let passosA = 0;
  for (let i = 0; i < 60; i++) { const r = R.acumular(a, 1000 / 60, 10); a = r.relogio; passosA += r.passos; }
  let b = R.criarRelogio({ dtS: 5 });
  const rb = R.acumular(b, 1000, 10);
  b = rb.relogio;
  assert.equal(passosA, rb.passos);
  assert.equal(passosA, 2); // 1 s real × 10 = 10 s simulados = 2 passos de 5 s
  assert.ok(Math.abs(a.acumuladoS - b.acumuladoS) < 1e-9);
});

test('acumular: a velocidade multiplica o tempo simulado, não o intervalo', () => {
  const r1 = R.acumular(R.criarRelogio({ dtS: 5 }), 10000, 1);
  const r4 = R.acumular(R.criarRelogio({ dtS: 5 }), 10000, 4);
  assert.equal(r1.passos, 2);
  assert.equal(r4.passos, 8);
});

test('acumular: limite de passos por quadro evita espiral após travamento; ms inválido é ignorado', () => {
  const r = R.acumular(R.criarRelogio({ dtS: 5, maxPassos: 10 }), 3_600_000, 1);
  assert.equal(r.passos, 10);
  assert.equal(r.relogio.acumuladoS, 0);
  assert.equal(R.acumular(R.criarRelogio(), -5, 1).passos, 0);
  assert.equal(R.acumular(R.criarRelogio(), NaN, 1).passos, 0);
  assert.throws(() => R.criarRelogio({ dtS: 0 }), /dtS/);
});

test('avancar: aplica a função de passo um número fixo de vezes, com passo final parcial', () => {
  const chamadas = [];
  const fim = R.avancar({ t: 0 }, 12, 5, (s, dt) => { chamadas.push(dt); return { t: s.t + dt }; });
  assert.deepEqual(chamadas, [5, 5, 2]);
  assert.equal(fim.t, 12);
  assert.equal(R.avancar({ t: 3 }, 0, 5, () => { throw new Error('não deve chamar'); }).t, 3);
});

test('avancar: determinístico — mesma entrada, mesma saída', () => {
  const passo = (s, dt) => ({ x: s.x * 0.9 + dt });
  assert.deepEqual(R.avancar({ x: 1 }, 600, 5, passo), R.avancar({ x: 1 }, 600, 5, passo));
});

function falsoAmbiente() {
  const filas = [];
  const ouvintes = {};
  const doc = {
    hidden: false,
    addEventListener: (ev, fn) => { ouvintes[ev] = fn; },
    removeEventListener: (ev) => { delete ouvintes[ev]; }
  };
  return {
    doc, ouvintes,
    raf: (fn) => { filas.push(fn); return filas.length; },
    caf: (id) => { filas[id - 1] = null; },
    quadro(ms) { const f = filas.splice(0); f.forEach((fn) => fn && fn(ms)); },
    pendentes: () => filas.filter(Boolean).length
  };
}

test('agendador: entrega passos a cada quadro e para com a aba oculta (visibilitychange)', () => {
  const amb = falsoAmbiente();
  const recebidos = [];
  const ag = R.criarAgendador({ raf: amb.raf, caf: amb.caf, documento: amb.doc, dtS: 5, aoPassos: (n, dt) => recebidos.push([n, dt]) });
  ag.iniciar();
  amb.quadro(0);
  amb.quadro(5000); // 5 s reais a velocidade 1 = 1 passo
  assert.deepEqual(recebidos, [[1, 5]]);
  amb.doc.hidden = true;
  amb.ouvintes.visibilitychange();
  assert.equal(ag.rodando(), false);
  assert.equal(amb.pendentes(), 0);
  amb.doc.hidden = false;
  amb.ouvintes.visibilitychange();
  amb.quadro(600000); // primeiro quadro após voltar: não conta o tempo oculto
  amb.quadro(605000);
  assert.deepEqual(recebidos, [[1, 5], [1, 5]]);
  ag.destruir();
  assert.equal(amb.ouvintes.visibilitychange, undefined);
});

test('agendador: velocidade ajustável e validada', () => {
  const amb = falsoAmbiente();
  const recebidos = [];
  const ag = R.criarAgendador({ raf: amb.raf, caf: amb.caf, documento: amb.doc, dtS: 5, aoPassos: (n) => recebidos.push(n) });
  ag.definirVelocidade(6);
  ag.iniciar();
  amb.quadro(0);
  amb.quadro(5000);
  assert.deepEqual(recebidos, [6]);
  assert.throws(() => ag.definirVelocidade(0), /velocidade/);
  assert.throws(() => R.criarAgendador({}), /raf/);
});
