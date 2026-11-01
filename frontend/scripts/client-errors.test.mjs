/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// OPS-08: coleta de erros do navegador (frontend/client-errors.js) e integração com build, sw e index.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const CE = createRequire(import.meta.url)('../client-errors.js');
const ctx = { pathname: '/app/index.html?email=a@b.c#x', userAgent: 'Mozilla/5.0 Chrome/120 Safari/537', appVersion: 'v20' };

test('relato só com mensagem curta, caminho sem query/hash, classe de navegador e versão', () => {
  CE._reset();
  const r = CE.buildReport('error', new Error('boom'), ctx);
  assert.deepEqual(r, { kind: 'error', message: 'boom', route: '/app/index.html', browser: 'chrome', appVersion: 'v20' });
  assert.deepEqual(Object.keys(r).sort(), ['appVersion', 'browser', 'kind', 'message', 'route']);
});

test('dedupe: o mesmo erro na mesma rota sai uma vez; kind rejection é preservado', () => {
  CE._reset();
  assert.ok(CE.buildReport('rejection', 'falhou', ctx));
  assert.equal(CE.buildReport('rejection', 'falhou', ctx), null);
  assert.ok(CE.buildReport('error', 'falhou', ctx));
});

test('ruído conhecido e vazio não são relatados; mensagem é truncada', () => {
  CE._reset();
  assert.equal(CE.buildReport('error', 'ResizeObserver loop limit exceeded', ctx), null);
  assert.equal(CE.buildReport('error', 'Script error.', ctx), null);
  assert.equal(CE.buildReport('error', '   ', ctx), null);
  assert.equal(CE.buildReport('error', 'x'.repeat(900), ctx).message.length, 200);
});

test('teto por sessão: no máximo MAX_PER_SESSION envios por aba', () => {
  CE._reset();
  const calls = [];
  globalThis.window = { location: { hostname: 'laift.com.br' } };
  globalThis.fetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({}); };
  for (let i = 0; i < 12; i++) CE._send(CE.buildReport('error', 'erro ' + i, ctx));
  assert.equal(calls.length, CE.MAX_PER_SESSION);
  assert.equal(calls[0].url, 'https://api.laift.com.br');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)), ['action', 'args']);
  assert.equal(JSON.parse(calls[0].init.body).action, 'apiLogClientError');
  delete globalThis.window; delete globalThis.fetch;
});

test('classe de navegador pertence à lista do servidor e nunca é o user agent', () => {
  const ok = ['chrome', 'safari', 'firefox', 'edge', 'samsung', 'opera', 'other'];
  for (const ua of ['Mozilla Firefox/118.0', 'Mozilla Edg/120 Chrome/120 Safari', 'SamsungBrowser/20 Chrome/110', 'curl/8', 'Mozilla Version/17 Safari/605']) {
    assert.ok(ok.includes(CE.browserClass(ua)), ua);
  }
  assert.equal(CE.browserClass('Mozilla Edg/120 Chrome/120 Safari'), 'edge');
});

test('integração: build, service worker e index carregam o módulo sem inline script; versão do app bate com o cache', () => {
  assert.match(read('scripts/build.js'), /'client-errors\.js'/);
  assert.match(read('sw.js'), /'client-errors\.js'/);
  const html = read('index.html');
  assert.match(html, /<script src="client-errors\.js"><\/script>/);
  const cache = /CACHE_PREFIX \+ '(v\d+)'/.exec(read('sw.js'))[1];
  assert.match(html, new RegExp('data-app-version="' + cache + '"'));
  assert.match(read('admin-usage.js'), /apiAdminClientErrors/);
  assert.match(html, /id="admin-client-errors"/);
});

test('a ação existe no Worker e a CSP já permite a API (connect-src)', () => {
  assert.match(fs.readFileSync(path.join(frontend, '..', 'worker', 'src', 'handlers.js'), 'utf8'), /apiLogClientError:/);
  assert.match(read('index.html'), /connect-src[^"]*api\.laift\.com\.br/);
});
