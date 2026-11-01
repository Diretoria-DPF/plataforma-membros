/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Abas simples da curadoria (frontend/admin-library-publicar.js): funções puras, higiene (sem innerHTML,
// sem handler ou estilo inline) e registro no index.html, build.js e sw.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda, assertAntes } from './lazy-wiring.mjs';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const pub = createRequire(import.meta.url)('../admin-library-publicar.js');

test('motivo vale de 3 a 300 caracteres sem contar espaços das pontas', () => {
  assert.equal(pub.isValidReason('ab'), false);
  assert.equal(pub.isValidReason('  abc  '), true);
  assert.equal(pub.isValidReason('x'.repeat(300)), true);
  assert.equal(pub.isValidReason('x'.repeat(301)), false);
  assert.equal(pub.isValidReason(null), false);
});

test('só remover e rejeitar pedem motivo', () => {
  assert.deepEqual(['removido', 'rejeitado', 'aprovado', 'em_triagem'].map(pub.needsReason), [true, true, false, false]);
});

test('chunk divide a lista em blocos de no máximo o tamanho pedido', () => {
  assert.deepEqual(pub.chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(pub.chunk([], 50), []);
});

test('avisos do item: sem área, resumo clínico e resumo de IA', () => {
  assert.deepEqual(pub.flagsOf({ topics: [] }), ['Sem área']);
  assert.deepEqual(pub.flagsOf({ topics: ['a'], isClinical: true, summaryText: 'x' }), ['Resumo clínico']);
  assert.deepEqual(pub.flagsOf({ topics: ['a'], summaryOrigin: 'ia' }), ['Resumo de IA']);
  assert.deepEqual(pub.flagsOf({ topics: ['a'], summaryOrigin: 'curador' }), []);
});

test('resultado do lote soma publicados e lista cada falha com o motivo', () => {
  const summary = pub.summarizeResults([
    { results: [{ ok: true }, { ok: false, title: 'A', message: 'Escolha ao menos uma área antes de aprovar.' }] },
    { results: [{ ok: true }, { ok: false }] },
  ]);
  assert.equal(summary.published, 2);
  assert.equal(summary.failed, 2);
  assert.equal(summary.failures[0], 'A: Escolha ao menos uma área antes de aprovar.');
  assert.match(summary.failures[1], /^Artigo: /);
  assert.match(pub.publishNotice(summary), /2 publicado\(s\) e 2 não saíram/);
  assert.match(pub.publishNotice({ published: 3, failed: 0, failures: [] }), /^3 publicado\(s\)\. Aparecem/);
});

test('selectedIds devolve só os marcados', () => {
  assert.deepEqual(pub.selectedIds({ a: true, b: false, c: true }).sort(), ['a', 'c']);
  assert.deepEqual(pub.selectedIds(null), []);
});

test('mensagem de erro da API ou a padrão', () => {
  assert.equal(pub.errorMessage({ message: ' Falhou ' }), 'Falhou');
  assert.match(pub.errorMessage({}), /Tente de novo/);
});

test('expõe as três abas e não usa innerHTML, handler inline nem estilo inline', () => {
  assert.deepEqual(pub.tabs, ['revisar', 'ar', 'pedidos']);
  const code = read('admin-library-publicar.js');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(code, /\bon[a-z]+=["']/);
  assert.doesNotMatch(code, /style\s*[:=]/);
});

test('está no pacote admin (sob demanda) e no build; fora do index.html e do precache', () => {
  assertSobDemanda('admin', 'admin-library-publicar.js');
});

test('as caixas de seleção da curadoria ficam ao lado do texto (classe pub-check) e a lista não tem marcadores', () => {
  const code = read('admin-library-publicar.js');
  assert.equal((code.match(/className: 'pub-check'/g) || []).length, 4);
  const css = read('library.css');
  assert.match(css, /label\.pub-check \{ display: flex;/);
  assert.match(css, /#admin-library-root \.card-list \{ list-style: none;/);
});
