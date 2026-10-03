import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SITE = 'https://laift.com.br';
const read = (name) => readFileSync(join(ROOT, name), 'utf8');

function metaContent(html, attr, key) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i');
  return re.exec(html)?.[1];
}

test('index.html: título com a marca LAIFT logo no início', () => {
  const title = /<title>([^<]*)<\/title>/i.exec(read('index.html'))?.[1] ?? '';
  assert.match(title, /^LAIFT/);
  assert.ok(title.length <= 75, `título longo demais (${title.length})`);
});

test('index.html: meta description entre 70 e 160 caracteres e com a marca', () => {
  const description = metaContent(read('index.html'), 'name', 'description') ?? '';
  assert.ok(description.length >= 70 && description.length <= 160, `tamanho ${description.length}`);
  assert.match(description, /LAIFT/);
});

test('index.html: canonical aponta para o domínio principal', () => {
  assert.match(read('index.html'), new RegExp(`<link\\s+rel="canonical"\\s+href="${SITE}/"`));
});

test('index.html: Open Graph e Twitter completos', () => {
  const html = read('index.html');
  for (const key of ['og:title', 'og:description', 'og:url', 'og:type', 'og:locale', 'og:site_name', 'og:image']) {
    assert.ok(metaContent(html, 'property', key), `falta ${key}`);
  }
  assert.equal(metaContent(html, 'property', 'og:url'), `${SITE}/`);
  assert.equal(metaContent(html, 'property', 'og:locale'), 'pt_BR');
  assert.ok(metaContent(html, 'name', 'twitter:card'), 'falta twitter:card');
});

test('index.html: JSON-LD válido com Organization e WebSite', () => {
  const html = read('index.html');
  const match = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(html);
  assert.ok(match, 'falta o bloco JSON-LD');
  const data = JSON.parse(match[1]);
  const types = data['@graph'].map((node) => node['@type']);
  assert.ok(types.includes('Organization') && types.includes('WebSite'));
  const org = data['@graph'].find((node) => node['@type'] === 'Organization');
  assert.equal(org.name, 'LAIFT');
  assert.equal(org.url, `${SITE}/`);
  assert.match(org.alternateName, /Farmacologia e Toxicologia/);
});

test('index.html: o texto público menciona o nome completo da liga', () => {
  assert.match(read('index.html'), /Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia/);
});

test('termos e privacidade: description e canonical sem a extensão .html', () => {
  for (const [file, path] of [['termos.html', 'termos'], ['privacidade.html', 'privacidade']]) {
    const html = read(file);
    assert.ok(metaContent(html, 'name', 'description'), `${file}: falta description`);
    assert.match(html, new RegExp(`<link\\s+rel="canonical"\\s+href="${SITE}/${path}"`));
  }
});

test('robots.txt: permite tudo, bloqueia páginas de desenvolvimento e aponta o sitemap', () => {
  assert.ok(existsSync(join(ROOT, 'robots.txt')), 'robots.txt ausente');
  const robots = read('robots.txt');
  assert.match(robots, /User-agent: \*/);
  assert.match(robots, /Disallow: \/modulos\/anatomia-3d\/dev\//);
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  for (const bot of ['GPTBot', 'ClaudeBot', 'PerplexityBot']) {
    assert.match(robots, new RegExp(`User-agent: ${bot}`));
  }
});

test('sitemap.xml: XML com as páginas públicas no domínio principal', () => {
  assert.ok(existsSync(join(ROOT, 'sitemap.xml')), 'sitemap.xml ausente');
  const sitemap = read('sitemap.xml');
  assert.match(sitemap, /<urlset[^>]+sitemaps\.org/);
  for (const url of [`${SITE}/`, `${SITE}/termos`, `${SITE}/privacidade`]) {
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `falta ${url}`);
  }
  assert.ok(!sitemap.includes('.html'), 'sitemap não deve listar URLs .html');
});

test('llms.txt: descreve a LAIFT e aponta para o site', () => {
  assert.ok(existsSync(join(ROOT, 'llms.txt')), 'llms.txt ausente');
  const llms = read('llms.txt');
  assert.match(llms, /^# LAIFT/);
  assert.match(llms, /Farmacologia e Toxicologia/);
  assert.ok(llms.includes(`${SITE}/`));
});

test('build.js copia robots.txt, sitemap.xml e llms.txt para o dist', () => {
  const build = read('scripts/build.js');
  for (const name of ['robots.txt', 'sitemap.xml', 'llms.txt']) {
    assert.ok(build.includes(name), `build.js não copia ${name}`);
  }
});
