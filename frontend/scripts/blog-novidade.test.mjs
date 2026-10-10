/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aviso do blog: escolha das publicações, janela de "nova" e segurança do link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  escolherNovidades, ehNova, hrefValido, rotuloSerie, iconeDe, ICONES,
} = require(path.join(frontend, 'blog-novidade.js'));

const AGORA = Date.UTC(2026, 9, 9); // 9 de outubro de 2026, UTC

const post = (extra) => ({
  slug: 'post-a',
  titulo: 'Título',
  resumo: 'Resumo',
  data: '2026-10-01',
  serie: 'liga',
  href: 'blog/post-a.html',
  ...extra,
});

const slugs = (lista) => lista.map((p) => p.slug);

test('escolherNovidades: ordena por data, da mais nova para a mais antiga', () => {
  const posts = [
    post({ slug: 'antiga', data: '2026-09-01' }),
    post({ slug: 'recente', data: '2026-10-05' }),
    post({ slug: 'meio', data: '2026-09-20' }),
  ];
  assert.deepEqual(slugs(escolherNovidades(posts, 3)), ['recente', 'meio', 'antiga']);
});

test('escolherNovidades: empate na data favorece a série campanhas', () => {
  const posts = [
    post({ slug: 'liga-do-dia', data: '2026-10-05', serie: 'liga' }),
    post({ slug: 'campanha-do-dia', data: '2026-10-05', serie: 'campanhas' }),
  ];
  assert.equal(escolherNovidades(posts, 1)[0].slug, 'campanha-do-dia');
});

test('escolherNovidades: sem campanha no empate, mantém a ordem do índice', () => {
  const posts = [
    post({ slug: 'primeiro', data: '2026-10-05', serie: 'modulos' }),
    post({ slug: 'segundo', data: '2026-10-05', serie: 'plataforma' }),
  ];
  assert.deepEqual(slugs(escolherNovidades(posts, 2)), ['primeiro', 'segundo']);
});

test('escolherNovidades: respeita n', () => {
  const posts = [
    post({ slug: 'a', data: '2026-10-03' }),
    post({ slug: 'b', data: '2026-10-02' }),
    post({ slug: 'c', data: '2026-10-01' }),
  ];
  assert.equal(escolherNovidades(posts, 0).length, 0);
  assert.equal(escolherNovidades(posts, 1).length, 1);
  assert.equal(escolherNovidades(posts, 2).length, 2);
});

test('escolherNovidades: descarta href javascript:, https:// e ../', () => {
  const posts = [
    post({ slug: 'script', data: '2026-10-09', href: 'javascript:alert(1)' }),
    post({ slug: 'externo', data: '2026-10-08', href: 'https://exemplo.com/x.html' }),
    post({ slug: 'subindo', data: '2026-10-07', href: '../segredo.html' }),
    post({ slug: 'valido', data: '2026-10-01', href: 'blog/valido.html' }),
  ];
  assert.deepEqual(slugs(escolherNovidades(posts, 4)), ['valido']);
});

test('escolherNovidades: descarta item sem titulo texto ou com data inválida', () => {
  const posts = [
    post({ slug: 'sem-titulo', titulo: undefined }),
    post({ slug: 'data-numero', data: 20261005 }),
    post({ slug: 'data-inexistente', data: '2026-02-31' }),
    post({ slug: 'valido' }),
  ];
  assert.deepEqual(slugs(escolherNovidades(posts, 4)), ['valido']);
});

test('escolherNovidades: lista vazia ou inválida devolve lista vazia', () => {
  assert.deepEqual(escolherNovidades([], 3), []);
  assert.deepEqual(escolherNovidades(null, 3), []);
});

test('hrefValido: aceita só blog/<slug>.html em minúsculas', () => {
  assert.equal(hrefValido('blog/conheca-a-laift.html'), true);
  assert.equal(hrefValido('blog/Maiuscula.html'), false);
  assert.equal(hrefValido('blog/sub/pagina.html'), false);
  assert.equal(hrefValido('blog/pagina.html?x=1'), false);
});

test('ehNova: verdadeiro com 3 dias e no limite de 14 dias', () => {
  assert.equal(ehNova(post({ data: '2026-10-06' }), AGORA, null), true);
  assert.equal(ehNova(post({ data: '2026-09-25' }), AGORA, null), true);
});

test('ehNova: falso com 20 dias ou quando o slug já foi visto', () => {
  assert.equal(ehNova(post({ data: '2026-09-19' }), AGORA, null), false);
  assert.equal(ehNova(post({ slug: 'post-a', data: '2026-10-06' }), AGORA, 'post-a'), false);
});

test('rotuloSerie: traduz as séries conhecidas e ignora as desconhecidas', () => {
  assert.equal(rotuloSerie('campanhas'), 'Publicações');
  assert.equal(rotuloSerie('liga'), 'A Liga');
  assert.equal(rotuloSerie('modulos'), 'Módulos');
  assert.equal(rotuloSerie('plataforma'), 'Plataforma');
  assert.equal(rotuloSerie('constructor'), '');
});

test('iconeDe: mantém ícone válido do sprite', () => {
  assert.equal(iconeDe({ serie: 'liga', icone: 'laco' }), 'laco');
});

test('iconeDe: campanhas sem ícone válido cai no laço; módulos cai em aprender', () => {
  assert.equal(iconeDe({ serie: 'campanhas', icone: 'x' }), 'laco');
  assert.equal(iconeDe({ serie: 'modulos', icone: 'x' }), 'aprender');
});

test('iconeDe: série e ícone desconhecidos, série herdada ou post nulo caem em novidades', () => {
  assert.equal(iconeDe({ serie: 'outra', icone: 'x' }), 'novidades');
  assert.equal(iconeDe({ serie: 'constructor' }), 'novidades');
  assert.equal(iconeDe(null), 'novidades');
});

test('ICONES: cópia igual à de scripts/build-blog.js', () => {
  assert.deepEqual(ICONES, require('./build-blog.js').ICONES);
});

// Confere só o código: os comentários do arquivo citam innerHTML de propósito.
const fonte = fs.readFileSync(path.join(frontend, 'blog-novidade.js'), 'utf8');
const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('blog-novidade.js: nada de innerHTML, outerHTML, insertAdjacentHTML ou document.write', () => {
  assert.doesNotMatch(codigo, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('blog-novidade.js: ícones criados com createElementNS do SVG', () => {
  assert.match(codigo, /createElementNS\(SVG_NS/);
});

test('blog-novidade.js: sem o selo "Do blog"', () => {
  assert.doesNotMatch(codigo, /'Do blog'/);
});
