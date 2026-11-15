/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SITE = 'https://laift.com.br';
const read = (name) => readFileSync(join(ROOT, name), 'utf8');
const html = () => read('como-entrar.html');
const meta = (h, attr, key) => new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i').exec(h)?.[1];
const texto = (h) => h.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');

test('como-entrar: um só H1 e hierarquia com H2', () => {
  const h = html();
  assert.equal((h.match(/<h1[\s>]/gi) ?? []).length, 1);
  assert.ok((h.match(/<h2[\s>]/gi) ?? []).length >= 5);
});

test('como-entrar: título até 60 e descrição até 155 caracteres', () => {
  const h = html();
  const title = /<title>([^<]*)<\/title>/i.exec(h)?.[1] ?? '';
  const desc = meta(h, 'name', 'description') ?? '';
  assert.ok(title.length > 0 && title.length <= 60, `título ${title.length}`);
  assert.ok(desc.length >= 70 && desc.length <= 155, `descrição ${desc.length}`);
  assert.match(title, /liga acadêmica/i);
});

test('como-entrar: canonical, Open Graph e Twitter corretos', () => {
  const h = html();
  assert.match(h, new RegExp(`<link\\s+rel="canonical"\\s+href="${SITE}/como-entrar"`));
  assert.equal(meta(h, 'property', 'og:url'), `${SITE}/como-entrar`);
  for (const k of ['og:title', 'og:description', 'og:image', 'og:type']) assert.ok(meta(h, 'property', k), k);
  assert.ok(meta(h, 'name', 'twitter:card'));
  assert.ok(meta(h, 'name', 'twitter:title'));
});

test('como-entrar: JSON-LD válido com WebPage (about organização) e BreadcrumbList', () => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i.exec(html());
  assert.ok(m, 'falta JSON-LD');
  const nodes = JSON.parse(m[1])['@graph'];
  const page = nodes.find((n) => n['@type'] === 'WebPage');
  assert.equal(page.url, `${SITE}/como-entrar`);
  assert.deepEqual(page.about, { '@id': `${SITE}/#organization` });
  const bc = nodes.find((n) => n['@type'] === 'BreadcrumbList');
  assert.ok(bc.itemListElement.length >= 2);
  assert.equal(bc.itemListElement.at(-1).item, `${SITE}/como-entrar`);
});

test('como-entrar: está no sitemap (sem .html) e no build', () => {
  assert.ok(read('sitemap.xml').includes(`<loc>${SITE}/como-entrar</loc>`));
  assert.match(read('scripts/build.js'), /'como-entrar\.html'/);
});

test('como-entrar: sem rótulos internos (revisado, rascunho, [NV], por IA)', () => {
  const t = texto(html());
  assert.ok(!/revisad|rascunho|\[NV\]|por IA|gerado por/i.test(t), 'rótulo interno no texto');
});

test('como-entrar: links internos sem .html e para as páginas esperadas', () => {
  const h = html();
  const ruins = [...h.matchAll(/href="([^"#?]*\.html)"/g)].map((m) => m[1]);
  assert.deepEqual(ruins, []);
  for (const l of ['/liga', '/edital', '/processo-seletivo', '/blog', '/biblioteca']) {
    assert.ok(h.includes(`href="${l}"`), `falta link ${l}`);
  }
});

test('como-entrar: tem autoria e data de atualização', () => {
  const t = texto(html());
  assert.match(t, /Atualizado em\s+2026-11-15/);
  assert.match(t, /Por\s+Diretoria da LAIFT/);
});

test('como-entrar: sem diminutivos comuns', () => {
  const ok = new Set(['caminho', 'caminhos', 'minha', 'minhas', 'tinha', 'vinha', 'rainha', 'linha', 'linhas', 'sozinho', 'sozinha', 'vizinho', 'vizinha']);
  const achados = (texto(html()).toLowerCase().match(/[a-zà-ú]{4,}inh[oa]s?\b/g) ?? []).filter((w) => !ok.has(w));
  assert.deepEqual(achados, []);
});

test('liga e processo-seletivo linkam /como-entrar', () => {
  for (const f of ['liga.html', 'processo-seletivo.html']) assert.ok(read(f).includes('href="/como-entrar"'), f);
});
