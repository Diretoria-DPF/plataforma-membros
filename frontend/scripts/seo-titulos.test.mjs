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
const CR = String.fromCharCode(13);
const SITE = 'https://laift.com.br';
const read = (name) => readFileSync(join(ROOT, name), 'utf8').split(CR).join('');

const INDEXABLE = ['blog.html', 'processo-seletivo.html', 'edital.html'];
const ALL = [...INDEXABLE, '404.html'];
const TITLE_MAX = 60;
const DESC_MAX = 155;

function titleOf(html) {
  return /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
}

function metaContent(html, attr, key) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`, 'i');
  return re.exec(html)?.[1];
}

test('títulos das 4 páginas alvo têm no máximo 60 caracteres', () => {
  for (const file of ALL) {
    const title = titleOf(read(file));
    assert.ok(title.length > 0, `${file}: sem <title>`);
    assert.ok(title.length <= TITLE_MAX, `${file}: título com ${title.length} caracteres`);
  }
});

test('títulos são únicos entre as páginas e diferentes de liga.html e index.html', () => {
  const titles = [...ALL, 'liga.html', 'index.html'].map((file) => [file, titleOf(read(file))]);
  const seen = new Map();
  for (const [file, title] of titles) {
    assert.ok(!seen.has(title), `${file} repete o título de ${seen.get(title)}: "${title}"`);
    seen.set(title, file);
  }
});

test('blog, processo seletivo e edital têm descrição com no máximo 155 caracteres e canonical', () => {
  for (const file of INDEXABLE) {
    const html = read(file);
    const description = metaContent(html, 'name', 'description') ?? '';
    assert.ok(description.length > 0, `${file}: sem meta description`);
    assert.ok(description.length <= DESC_MAX, `${file}: descrição com ${description.length} caracteres`);
    assert.ok(/<link\s+rel="canonical"\s+href="[^"]+"/i.test(html), `${file}: sem canonical`);
  }
});

test('og:title das páginas indexáveis é igual ao <title>', () => {
  for (const file of INDEXABLE) {
    const html = read(file);
    assert.equal(metaContent(html, 'property', 'og:title'), titleOf(html), `${file}: og:title divergente`);
  }
});

test('og:description das páginas indexáveis é igual à meta description', () => {
  for (const file of INDEXABLE) {
    const html = read(file);
    assert.equal(
      metaContent(html, 'property', 'og:description'),
      metaContent(html, 'name', 'description'),
      `${file}: og:description divergente`,
    );
  }
});

test('canonical das páginas indexáveis aponta para o domínio principal', () => {
  for (const file of INDEXABLE) {
    const canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/i.exec(read(file))?.[1] ?? '';
    assert.ok(canonical.startsWith(`${SITE}/`), `${file}: canonical ${canonical}`);
  }
});

test('404: título com a marca LAIFT e noindex', () => {
  const html = read('404.html');
  assert.equal(titleOf(html), 'Página não encontrada · LAIFT');
  assert.match(titleOf(html), /LAIFT/);
  assert.equal(metaContent(html, 'name', 'robots'), 'noindex');
});
