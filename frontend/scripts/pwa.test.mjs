/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// PWA: manifest, ícones, meta tags de iOS/Android, CSP e service worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);

/** Largura, altura e tipo de cor lidos do cabeçalho IHDR de um PNG. */
function pngInfo(rel) {
  const buf = fs.readFileSync(path.join(root, rel));
  assert.equal(buf.toString('latin1', 1, 4), 'PNG', rel + ' não é PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

const manifest = JSON.parse(read('frontend/manifest.webmanifest'));

test('manifest: identidade e modo de exibição', () => {
  assert.equal(manifest.name, 'LAIFT – Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia');
  assert.ok(manifest.short_name.length <= 12, 'short_name precisa caber embaixo do ícone');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'pt-BR');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);
});

test('manifest: start_url e scope relativos (o site roda em / e em /plataforma-membros/)', () => {
  for (const key of ['start_url', 'scope', 'id']) {
    assert.ok(!/^(https?:)?\/\//.test(manifest[key]) && !manifest[key].startsWith('/'), key + ' deve ser relativo: ' + manifest[key]);
  }
  assert.equal(manifest.scope, './');
});

test('manifest: ícones 192 e 512 (any) e 512 maskable existem com o tamanho declarado', () => {
  const find = (size, purpose) => manifest.icons.find((i) => i.sizes === size && (i.purpose || 'any') === purpose);
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const icon = find(size, purpose);
    assert.ok(icon, 'falta ícone ' + size + ' ' + purpose);
    assert.equal(icon.type, 'image/png');
    const info = pngInfo('frontend/' + icon.src);
    assert.equal(info.width + 'x' + info.height, size);
  }
});

test('ícone do iOS: 180x180 e SEM transparência (o iOS pinta fundo preto em PNG com alfa)', () => {
  const info = pngInfo('frontend/icons/apple-touch-icon.png');
  assert.equal(info.width, 180);
  assert.equal(info.height, 180);
  assert.equal(info.colorType, 2, 'colorType 2 = RGB sem canal alfa');
});

test('index.html: manifest, ícones, theme-color e meta tags de iOS/Android', () => {
  const html = read('frontend/index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="icons\/apple-touch-icon\.png">/);
  assert.match(html, /<link rel="icon" type="image\/png" sizes="32x32" href="icons\/favicon-32\.png">/);
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}">/i);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
  assert.match(html, /<meta name="apple-mobile-web-app-status-bar-style" content="[^"]+">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="LAIFT">/);
  assert.match(html, /<meta name="viewport" content="[^"]*viewport-fit=cover/);
});

test('index.html: CSP libera worker-src só para o próprio site', () => {
  const html = read('frontend/index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy"[^>]*content="([^"]+)"/)[1];
  const worker = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('worker-src'));
  assert.equal(worker, "worker-src 'self'");
});

test('index.html carrega pwa.js e build.js publica manifest, sw, pwa.js e icons/', () => {
  assert.match(read('frontend/index.html'), /<script src="pwa\.js" defer><\/script>/);
  const build = read('frontend/scripts/build.js');
  for (const name of ["'manifest.webmanifest'", "'sw.js'", "'pwa.js'", "'icons'"]) assert.ok(build.includes(name), 'build.js não publica ' + name);
});

test('registro do service worker: só com suporte, fora de automação e em https/localhost', () => {
  const Pwa = require('../pwa.js');
  const ok = { serviceWorker: true, webdriver: false, protocol: 'https:', hostname: 'laift.com.br' };
  assert.equal(Pwa.shouldRegister(ok), true);
  assert.equal(Pwa.shouldRegister({ ...ok, protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(Pwa.shouldRegister({ ...ok, serviceWorker: false }), false);
  assert.equal(Pwa.shouldRegister({ ...ok, webdriver: true }), false);
  assert.equal(Pwa.shouldRegister({ ...ok, protocol: 'http:', hostname: 'laift.com.br' }), false);
});

test('sw.js: só trata GET do próprio site; nunca a API nem o Atlas (que tem o seu SW)', () => {
  const Sw = require('../sw.js');
  const origin = 'https://laift.com.br';
  const req = (url, extra) => ({ method: 'GET', url, headers: { has: () => false }, ...extra });
  assert.equal(Sw.shouldHandle(req(origin + '/styles.css'), origin), true);
  assert.equal(Sw.shouldHandle(req(origin + '/'), origin), true);
  assert.equal(Sw.shouldHandle(req('https://api.laift.com.br/'), origin), false, 'API é outra origem');
  assert.equal(Sw.shouldHandle(req('https://plataforma-membros-api.diretoria-dpf.workers.dev/'), origin), false);
  assert.equal(Sw.shouldHandle(req(origin + '/modulos/anatomia-3d/index.html'), origin), false, 'Atlas tem service worker próprio');
  assert.equal(Sw.shouldHandle(req(origin + '/sw.js'), origin), false, 'o SW nunca guarda a si mesmo');
  assert.equal(Sw.shouldHandle(req(origin + '/styles.css', { method: 'POST' }), origin), false);
  assert.equal(Sw.shouldHandle(req(origin + '/video.mp4', { headers: { has: (h) => h.toLowerCase() === 'range' } }), origin), false, 'Range não é cacheável');
});

test('sw.js: só guarda resposta 200 do próprio site (basic), nunca erro nem opaca', () => {
  const Sw = require('../sw.js');
  assert.equal(Sw.shouldStore({ ok: true, type: 'basic' }), true);
  assert.equal(Sw.shouldStore({ ok: false, type: 'basic' }), false);
  assert.equal(Sw.shouldStore({ ok: true, type: 'opaque' }), false);
  assert.equal(Sw.shouldStore(null), false);
});

test('sw.js: cache versionado com prefixo; versões antigas são identificadas para limpeza', () => {
  const Sw = require('../sw.js');
  assert.ok(Sw.CACHE_NAME.startsWith(Sw.CACHE_PREFIX));
  assert.equal(Sw.isStaleCache(Sw.CACHE_PREFIX + 'v0'), true);
  assert.equal(Sw.isStaleCache(Sw.CACHE_NAME), false);
  assert.equal(Sw.isStaleCache('outro-app-cache'), false, 'nunca apaga cache que não é nosso (ex.: o do Atlas)');
});
