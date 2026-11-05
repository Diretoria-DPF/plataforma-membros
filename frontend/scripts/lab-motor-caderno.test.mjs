/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Motor do Laboratório (O3): caderno automático — entradas estruturadas, imutáveis e em texto puro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const K = require('../modulos/laboratorio/js/lab-motor-caderno.js');

test('registrar: numera, congela e não altera o caderno anterior', () => {
  const c0 = K.criarCaderno({ titulo: 'NaCl 0,9 %', processoId: 'p1' });
  const c1 = K.registrar(c0, { tipo: 'acao', t: 30, etapa: 'e1', texto: 'Vestiu EPI.' });
  assert.equal(c0.entradas.length, 0);
  assert.equal(c1.entradas[0].seq, 1);
  assert.ok(Object.isFrozen(c1.entradas));
  assert.ok(Object.isFrozen(c1.entradas[0]));
  assert.throws(() => K.registrar(c0, { tipo: 'fofoca', texto: 'x' }), /tipo/);
  assert.throws(() => K.registrar(c0, { tipo: 'acao', texto: '   ' }), /texto/);
});

test('registrarEventos: desvio vira desvio/incidente, leitura vira leitura, com nível do modelo', () => {
  const c = K.registrarEventos(K.criarCaderno(), [
    { tipo: 'pesagem', operacao: 'pesar', texto: 'Pesados 0,90 g.', leitura: 0.9, unidade: 'g', regra: 'ruido_balanca' },
    { tipo: 'transferencia', operacao: 'transferir', texto: 'Sem enxágue.', desvio: { codigo: 'sem_enxague', gravidade: 'aviso' } },
    { tipo: 'incidente', operacao: 'aquecer', texto: 'Chama com inflamável.', desvio: { codigo: 'chama_com_inflamavel', gravidade: 'incidente' } },
    { tipo: 'paramentacao', operacao: 'paramentar', texto: 'EPI.' }
  ], { t: 60, etapa: 'e2' });
  assert.deepEqual(c.entradas.map((e) => e.tipo), ['leitura', 'desvio', 'incidente', 'acao']);
  assert.equal(c.entradas[0].nivelModelo, 'regra_de_jogo');
  assert.equal(K.pesagens(c).length, 1);
  assert.equal(K.desvios(c).length, 2);
  const r = K.resumo(c);
  assert.equal(r.porGravidade.aviso, 1);
  assert.equal(r.porGravidade.incidente, 1);
  assert.deepEqual(r.etapas, ['e2']);
});

test('observação do aluno: texto puro, sem caracteres de controle e limitado a 500', () => {
  const c = K.observacao(K.criarCaderno(), `Cristais\u0007 brancos <b>finos</b>${'x'.repeat(900)}`, { t: 0 });
  const t = c.entradas[0].texto;
  assert.equal(t.length, K.MAX_TEXTO);
  assert.ok(!t.includes('\u0007'));
  assert.ok(t.includes('<b>'), 'texto preservado como texto (a interface usa textContent)');
});

test('paraTexto: linha do tempo legível com nível do modelo e resumo final', () => {
  let c = K.criarCaderno({ titulo: 'Caderno — teste' });
  c = K.registrar(c, { tipo: 'leitura', t: 3725, etapa: 'e3', texto: 'pH 7,01.', regra: 'medida_ph_instrumento' });
  c = K.registrar(c, { tipo: 'calculo', t: 3730, etapa: 'e3', texto: 'Certo: 0,90 g.', ok: true });
  const txt = K.paraTexto(c);
  assert.match(txt, /^Caderno — teste/);
  assert.match(txt, /01:02:05 {2}e3 {2}pH 7,01\. \[regra de jogo\]/);
  assert.match(txt, /Cálculos certos: 1/);
  assert.equal(K.relogio(59), '00:00:59');
});
