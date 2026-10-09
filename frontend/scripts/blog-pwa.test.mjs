/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Blog instalável: manifest do blog, service worker do blog (blog-sw.js),
// botão de instalação e instrução para iPhone/iPad (blog/instalar.js).
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

const manifest = JSON.parse(read('frontend/blog/manifest.webmanifest'));
const Sw = require('../blog-sw.js');
const Instalar = require('../blog/instalar.js');

test('manifest do blog: id, start_url e scope em /blog, modo app', () => {
  assert.equal(manifest.id, '/blog');
  assert.equal(manifest.start_url, '/blog');
  assert.equal(manifest.scope, '/blog');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'pt-BR');
  assert.ok(manifest.short_name.length <= 12, 'short_name precisa caber embaixo do ícone');
});

test('manifest do blog: ícones 192 e 512 (any) e 512 maskable existem com o tamanho declarado', () => {
  const find = (size, purpose) => manifest.icons.find((i) => i.sizes === size && (i.purpose || 'any') === purpose);
  for (const [size, purpose] of [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]) {
    const icon = find(size, purpose);
    assert.ok(icon, 'falta ícone ' + size + ' ' + purpose);
    assert.equal(icon.type, 'image/png');
    const info = pngInfo('frontend' + icon.src);
    assert.equal(info.width + 'x' + info.height, size);
  }
});

test('blog-sw.js: chave ignora ".html" (/blog.html e /blog são a mesma entrada)', () => {
  assert.equal(Sw.chaveDe('/blog.html'), Sw.chaveDe('/blog'));
  assert.equal(Sw.chaveDe('/blog.html'), '/blog');
  assert.equal(Sw.chaveDe('/blog/404.html'), '/blog/404');
});

test('blog-sw.js: shouldHandle recusa outra origem, POST, Range e o próprio /blog-sw.js', () => {
  const origin = 'https://laift.com.br';
  const req = (url, extra) => ({ method: 'GET', url, headers: { has: () => false }, ...extra });
  assert.equal(Sw.shouldHandle(req(origin + '/blog'), origin), true);
  assert.equal(Sw.shouldHandle(req('https://api.laift.com.br/'), origin), false, 'API é outra origem');
  assert.equal(Sw.shouldHandle(req(origin + '/blog', { method: 'POST' }), origin), false);
  assert.equal(Sw.shouldHandle(req(origin + '/blog/video.mp4', { headers: { has: (h) => h.toLowerCase() === 'range' } }), origin), false, 'Range não é cacheável');
  assert.equal(Sw.shouldHandle(req(origin + '/blog-sw.js'), origin), false, 'o SW nunca guarda a si mesmo');
});

test('blog-sw.js: shouldStore só guarda resposta ok e basic', () => {
  assert.equal(Sw.shouldStore({ ok: true, type: 'basic' }), true);
  assert.equal(Sw.shouldStore({ ok: true, type: 'opaqueredirect' }), false, 'redirecionamento não é guardado');
  assert.equal(Sw.shouldStore({ ok: false, type: 'basic' }), false);
  assert.equal(Sw.shouldStore(null), false);
});

test('blog-sw.js: isStaleCache só aponta caches laift-blog-* antigos', () => {
  assert.ok(Sw.CACHE_NAME.startsWith(Sw.CACHE_PREFIX));
  assert.equal(Sw.CACHE_NAME, 'laift-blog-v1');
  assert.equal(Sw.isStaleCache('laift-blog-v0'), true);
  assert.equal(Sw.isStaleCache(Sw.CACHE_NAME), false);
  assert.equal(Sw.isStaleCache('laift-shell-v3'), false, 'nunca apaga o shell da plataforma');
  assert.equal(Sw.isStaleCache('atlas-anatomia-v2'), false, 'nunca apaga o cache do Atlas');
});

test('blog-sw.js: PRECACHE contém o blog, a página offline e o script de instalação', () => {
  assert.ok(Sw.PRECACHE.includes('/blog'));
  assert.ok(Sw.PRECACHE.includes('/blog/404.html'));
  assert.ok(Sw.PRECACHE.includes('/blog/instalar.js'));
  assert.ok(Sw.PRECACHE.every((url) => url.startsWith('/')), 'todo item do precache é caminho absoluto');
});

test('instalar.js ehIos: reconhece iPhone, iPad e iPad com identificação de Mac', () => {
  const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', maxTouchPoints: 5 };
  const ipad = { userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', platform: 'iPad', maxTouchPoints: 5 };
  const ipadMac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 };
  assert.equal(Instalar.ehIos(iphone), true);
  assert.equal(Instalar.ehIos(ipad), true);
  assert.equal(Instalar.ehIos(ipadMac), true, 'iPadOS com MacIntel e toque');
});

test('instalar.js ehIos: Mac sem toque e Windows não são iOS', () => {
  const mac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 };
  const windows = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 0 };
  assert.equal(Instalar.ehIos(mac), false);
  assert.equal(Instalar.ehIos(windows), false);
});

test('instalar.js estaInstalado: modo app ou navigator.standalone contam como instalado', () => {
  const standalone = { matchMedia: () => ({ matches: true }), navigator: {} };
  const iosApp = { matchMedia: () => ({ matches: false }), navigator: { standalone: true } };
  const navegador = { matchMedia: () => ({ matches: false }), navigator: {} };
  assert.equal(Instalar.estaInstalado(standalone), true);
  assert.equal(Instalar.estaInstalado(iosApp), true);
  assert.equal(Instalar.estaInstalado(navegador), false);
});

test('instalar.js deveRegistrar: falso sob webdriver e em http fora de localhost', () => {
  const ok = { serviceWorker: true, webdriver: false, protocol: 'https:', hostname: 'laift.com.br' };
  assert.equal(Instalar.deveRegistrar(ok), true);
  assert.equal(Instalar.deveRegistrar({ ...ok, protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(Instalar.deveRegistrar({ ...ok, webdriver: true }), false, 'sob automação não registra');
  assert.equal(Instalar.deveRegistrar({ ...ok, protocol: 'http:', hostname: 'laift.com.br' }), false);
  assert.equal(Instalar.deveRegistrar({ ...ok, serviceWorker: false }), false);
});

test('build.js publica o service worker do blog', () => {
  const build = read('frontend/scripts/build.js');
  assert.ok(build.includes("'blog-sw.js'"), "build.js não contém 'blog-sw.js'");
});
