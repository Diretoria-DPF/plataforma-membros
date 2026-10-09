/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Testes da lógica do botão Voltar (voltar-app.js). Sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { escopoDe, registrar, destinoDoVoltar } = require('../voltar-app.js');

test('escopoDe: painel admin começa com panel-admin-; o resto é membro', () => {
  assert.equal(escopoDe('panel-admin-users'), 'admin');
  assert.equal(escopoDe('panel-admin-dashboard'), 'admin');
  assert.equal(escopoDe('panel-events'), 'membro');
  assert.equal(escopoDe('panel-home'), 'membro');
  assert.equal(escopoDe(undefined), 'membro');
});

test('registrar: empilha painel novo do mesmo escopo', () => {
  const pilha = ['panel-home', 'panel-events'];
  const nova = registrar(pilha, 'panel-learn');
  assert.deepEqual(nova, ['panel-home', 'panel-events', 'panel-learn']);
  assert.notEqual(nova, pilha);
});

test('registrar: não muta a pilha recebida', () => {
  const pilha = ['panel-home', 'panel-events'];
  registrar(pilha, 'panel-learn');
  registrar(pilha, 'panel-admin-users');
  registrar(pilha, 'panel-events');
  assert.deepEqual(pilha, ['panel-home', 'panel-events']);
});

test('registrar: painel repetido no topo não entra de novo', () => {
  assert.deepEqual(registrar(['panel-home', 'panel-events'], 'panel-events'), ['panel-home', 'panel-events']);
});

test('registrar: pilha vazia começa com o painel', () => {
  assert.deepEqual(registrar([], 'panel-events'), ['panel-events']);
});

test('registrar: troca de escopo zera a pilha com o painel atual', () => {
  assert.deepEqual(registrar(['panel-home', 'panel-events'], 'panel-admin-dashboard'), ['panel-admin-dashboard']);
  assert.deepEqual(registrar(['panel-admin-dashboard', 'panel-admin-users'], 'panel-events'), ['panel-events']);
});

test('registrar: panel-home zera a pilha', () => {
  assert.deepEqual(registrar(['panel-home', 'panel-events', 'panel-learn'], 'panel-home'), ['panel-home']);
});

test('registrar: corta a pilha em 20 itens, descartando os mais antigos', () => {
  const pilha = [];
  for (let i = 0; i < 20; i += 1) pilha.push(i % 2 === 0 ? 'panel-events' : 'panel-learn');
  const nova = registrar(pilha, 'panel-proposals');
  assert.equal(nova.length, 20);
  assert.equal(nova[0], pilha[1]);
  assert.equal(nova[19], 'panel-proposals');
});

test('destinoDoVoltar: vai ao painel anterior da pilha', () => {
  assert.deepEqual(destinoDoVoltar(['panel-home', 'panel-events', 'panel-learn']), { painel: 'panel-events' });
  assert.deepEqual(destinoDoVoltar(['panel-admin-dashboard', 'panel-admin-users']), { painel: 'panel-admin-dashboard' });
});

test('destinoDoVoltar: sem anterior, membro vai para Início', () => {
  assert.deepEqual(destinoDoVoltar(['panel-events']), { painel: 'panel-home' });
  assert.deepEqual(destinoDoVoltar([]), { painel: 'panel-home' });
});

test('destinoDoVoltar: sem anterior, admin vai para o painel admin', () => {
  assert.deepEqual(destinoDoVoltar(['panel-admin-users']), { painel: 'panel-admin-dashboard' });
});

test('destinoDoVoltar: no dashboard admin sem anterior, sai do modo admin', () => {
  assert.deepEqual(destinoDoVoltar(['panel-admin-dashboard']), { sairDoAdmin: true });
});

test('voltar-app.js: sem atribuição de HTML a partir de string', () => {
  const src = fs.readFileSync(path.join(frontend, 'voltar-app.js'), 'utf8');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write/);
});
