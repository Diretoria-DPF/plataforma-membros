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
const read = (n) => readFileSync(join(ROOT, n), 'utf8');
const ORG = 'https://laift.com.br/#organization';
const NOME = 'Liga Acadêmica Interdisciplinar de Farmacologia e Toxicologia';

function jsonLd(html) {
  const blocos = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocos.length >= 1, 'falta JSON-LD');
  return blocos.map((m) => JSON.parse(m[1]));
}
const nos = (html) => jsonLd(html).flatMap((d) => d['@graph'] ?? [d]);

test('index: um só H1 na tela pública, com a marca e o nome completo', () => {
  const html = read('index.html');
  const ini = html.indexOf('<section id="screen-welcome"');
  const tela = html.slice(ini, html.indexOf('</section>', ini));
  const h1s = tela.match(/<h1[\s\S]*?<\/h1>/g) ?? [];
  assert.equal(h1s.length, 1);
  const texto = h1s[0].replace(/<[^>]+>/g, '');
  assert.match(texto, /LAIFT/);
  assert.ok(texto.includes(NOME));
});

test('index: bloco "O que é a LAIFT" com mais de 150 palavras e login preservado', () => {
  const html = read('index.html');
  const m = /<article class="auth-card marca-sobre"[\s\S]*?<\/article>/.exec(html);
  assert.ok(m, 'falta o bloco O que é a LAIFT');
  assert.match(m[0], /O que é a LAIFT/);
  const palavras = m[0].replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  assert.ok(palavras > 150, `só ${palavras} palavras`);
  for (const id of ['form-login', 'login-email', 'login-password', 'msg-login', 'welcome-title']) {
    assert.ok(html.includes(`id="${id}"`), `id ${id} sumiu`);
  }
  assert.ok(!/style="/.test(m[0]) && !/\son[a-z]+=/.test(m[0]));
});

test('JSON-LD: válido, com uma única Organization de @id canônico e @id sem repetição', () => {
  const todos = [...nos(read('index.html')), ...nos(read('liga.html'))];
  const orgs = todos.filter((n) => n['@type'] === 'Organization');
  assert.equal(orgs.length, 1, 'Organization duplicada');
  assert.equal(orgs[0]['@id'], ORG);
  assert.equal(orgs[0].url, 'https://laift.com.br/');
  const ids = todos.map((n) => n['@id']).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, '@id repetido');
});

test('liga referencia a Organization pelo @id e sameAs não diverge', () => {
  const liga = nos(read('liga.html'));
  assert.ok(liga.some((n) => n.about?.['@id'] === ORG));
  assert.deepEqual(liga.flatMap((n) => n.sameAs ?? []), [], 'sameAs fica só na Organization única');
  const org = nos(read('index.html')).find((n) => n['@type'] === 'Organization');
  assert.deepEqual(org.sameAs, ['https://www.instagram.com/laift.liga']);
});

test('WebSite: name LAIFT, alternateName completo e og:site_name coerente', () => {
  const site = nos(read('index.html')).find((n) => n['@type'] === 'WebSite');
  assert.equal(site.name, 'LAIFT');
  assert.deepEqual(site.alternateName, ['Liga Acadêmica LAIFT', NOME]);
  for (const f of ['index.html', 'liga.html']) {
    assert.match(read(f), /<meta property="og:site_name" content="LAIFT">/);
  }
});

test('links públicos usam a URL canônica, sem .html', () => {
  for (const f of ['index.html', 'liga.html', 'privacidade.html']) {
    const ruins = [...read(f).matchAll(/href="([^"#?]*\.html)"/g)].map((m) => m[1])
      .filter((h) => /^\/?(liga|blog|termos|privacidade|processo-seletivo|edital)\.html$/.test(h));
    assert.deepEqual(ruins, [], `${f}: ${ruins.join(', ')}`);
  }
});

test('cache: CACHE_NAME e data-app-version iguais', () => {
  const v = /CACHE_PREFIX \+ '(v\d+)'/.exec(read('sw.js'))?.[1];
  assert.equal(/data-app-version="(v\d+)"/.exec(read('index.html'))?.[1], v);
});
