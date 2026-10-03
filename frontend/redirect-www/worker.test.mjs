import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

function call(url, method = 'GET') {
  return worker.fetch(new Request(url, { method }));
}

test('www redireciona para o domínio principal com 301', async () => {
  const res = await call('https://www.laift.com.br/');
  assert.equal(res.status, 301);
  assert.equal(res.headers.get('Location'), 'https://laift.com.br/');
});

test('preserva caminho e parâmetros de consulta', async () => {
  const res = await call('https://www.laift.com.br/termos?utm=1#x');
  assert.equal(res.headers.get('Location'), 'https://laift.com.br/termos?utm=1');
});

test('sempre aponta para https, mesmo se a requisição chegou como http', async () => {
  const res = await call('http://www.laift.com.br/privacidade');
  assert.equal(res.headers.get('Location'), 'https://laift.com.br/privacidade');
});

test('métodos que não são GET/HEAD usam 308 para não virarem GET', async () => {
  const res = await call('https://www.laift.com.br/', 'POST');
  assert.equal(res.status, 308);
});

test('HEAD também recebe 301', async () => {
  const res = await call('https://www.laift.com.br/', 'HEAD');
  assert.equal(res.status, 301);
});
