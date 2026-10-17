/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalUrl, injectPagesMeta, processDir } from './pages-noindex.mjs';

test('canonicalUrl: raiz, página, subpasta e post', () => {
  assert.equal(canonicalUrl('index.html'), 'https://laift.com.br/');
  assert.equal(canonicalUrl('liga.html'), 'https://laift.com.br/liga');
  assert.equal(canonicalUrl(join('blog', 'post-x.html')), 'https://laift.com.br/blog/post-x');
  assert.equal(canonicalUrl(join('modulos', 'a', 'index.html')), 'https://laift.com.br/modulos/a/');
});

test('injectPagesMeta: acrescenta noindex e canonical antes de </head>', () => {
  const out = injectPagesMeta('<html><head>\n  <title>x</title>\n</head><body></body></html>', 'termos.html');
  assert.match(out, /<meta name="robots" content="noindex">/);
  assert.match(out, /<link rel="canonical" href="https:\/\/laift\.com\.br\/termos">/);
  assert.ok(out.indexOf('noindex') < out.indexOf('</head>'));
});

test('injectPagesMeta: substitui robots e canonical existentes, sem duplicar', () => {
  const html = '<head>\n<meta name="robots" content="index,follow">\n<link rel="canonical" href="https://outro.com/x">\n</head>';
  const out = injectPagesMeta(html, 'liga.html');
  assert.equal(out.match(/name="robots"/g).length, 1);
  assert.equal(out.match(/rel="canonical"/g).length, 1);
  assert.ok(!out.includes('outro.com') && !out.includes('index,follow'));
});

test('injectPagesMeta: idempotente e ignora arquivo sem </head>', () => {
  const html = '<head><title>t</title></head>';
  const uma = injectPagesMeta(html, 'a.html');
  assert.equal(injectPagesMeta(uma, 'a.html'), uma);
  assert.equal(injectPagesMeta('<p>fragmento</p>', 'a.html'), '<p>fragmento</p>');
});

test('processDir: percorre subpastas e conta só arquivos alterados', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pages-'));
  try {
    mkdirSync(join(dir, 'blog'));
    writeFileSync(join(dir, 'index.html'), '<head></head>');
    writeFileSync(join(dir, 'blog', 'p.html'), '<head></head>');
    writeFileSync(join(dir, 'frag.html'), '<p>x</p>');
    writeFileSync(join(dir, 'a.js'), 'x');
    assert.equal(processDir(dir), 2);
    assert.match(readFileSync(join(dir, 'blog', 'p.html'), 'utf8'), /laift\.com\.br\/blog\/p"/);
    assert.equal(readFileSync(join(dir, 'a.js'), 'utf8'), 'x');
    assert.equal(processDir(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
