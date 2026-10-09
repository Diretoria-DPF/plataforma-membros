/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Infra do blog: cache em _headers, entrada no llms.txt e robots.txt sem bloqueio de /blog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Normaliza CRLF para que os testes valham em qualquer checkout (Windows ou Linux).
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Blocos do _headers: caminho na coluna 0 e linhas indentadas abaixo; comentários e linhas em branco são ignorados. */
function headerBlocks(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (/^\s/.test(line)) {
      blocks[blocks.length - 1].lines.push(line.trim());
    } else {
      blocks.push({ path: line.trim(), lines: [] });
    }
  }
  return blocks;
}

const cacheControlOf = (block) => block.lines.filter((line) => /cache-control/i.test(line));

test('_headers: /blog/* tem exatamente o Cache-Control pedido', () => {
  const block = headerBlocks(read('_headers')).find((b) => b.path === '/blog/*');
  assert.ok(block, 'falta o bloco /blog/*');
  assert.deepEqual(cacheControlOf(block), [
    'Cache-Control: public, max-age=3600, stale-while-revalidate=86400',
  ]);
});

test('_headers: /blog.css tem exatamente o Cache-Control pedido', () => {
  const block = headerBlocks(read('_headers')).find((b) => b.path === '/blog.css');
  assert.ok(block, 'falta o bloco /blog.css');
  assert.deepEqual(cacheControlOf(block), [
    'Cache-Control: public, max-age=3600, stale-while-revalidate=86400',
  ]);
});

test('_headers: /blog/index.json remove o Cache-Control herdado antes de definir o seu, e vem depois de /blog/*', () => {
  const blocks = headerBlocks(read('_headers'));
  const indice = blocks.findIndex((b) => b.path === '/blog/index.json');
  const geral = blocks.findIndex((b) => b.path === '/blog/*');
  assert.ok(indice >= 0, 'falta o bloco /blog/index.json');
  assert.ok(geral >= 0, 'falta o bloco /blog/*');
  assert.ok(indice > geral, '/blog/index.json deve vir depois de /blog/*');
  const linhas = blocks[indice].lines;
  const remocao = linhas.indexOf('! Cache-Control');
  const definicao = linhas.indexOf('Cache-Control: public, max-age=300');
  assert.ok(remocao >= 0, 'falta "! Cache-Control" no bloco /blog/index.json');
  assert.ok(definicao > remocao, '"Cache-Control: public, max-age=300" deve vir depois de "! Cache-Control"');
});

test('_headers: nenhum X-Robots-Tag depois do bloco /*', () => {
  const headers = read('_headers');
  const inicio = /^\/\*$/m.exec(headers);
  assert.ok(inicio, 'bloco /* ausente');
  assert.doesNotMatch(headers.slice(inicio.index), /X-Robots-Tag/);
});

test('llms.txt: lista o blog pelo link público', () => {
  assert.ok(read('llms.txt').includes('https://laift.com.br/blog'));
});

test('robots.txt: não bloqueia /blog', () => {
  assert.doesNotMatch(read('robots.txt'), /^Disallow:\s*\/blog/m);
});
