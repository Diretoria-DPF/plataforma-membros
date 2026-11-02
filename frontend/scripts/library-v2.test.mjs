/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Biblioteca v2 (library-v2.js, library-v2.css; flag library_v2_enabled): funções puras, fiação (pacote sob demanda, flag
// desligada por padrão, Biblioteca de sempre intacta) e regras do código e do CSS (sem innerHTML, sem estilo inline, tudo
// sob a flag, movimento reduzido, alvos de 44 px).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const l2 = require('../library-v2.js');
const SRC = ler('library-v2.js');
const CSS = ler('library-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('hasSummaryBadge: só com o selo "Com resumo" da lista de sempre', () => {
  assert.equal(l2.hasSummaryBadge(['Artigo', 'Com resumo']), true);
  assert.equal(l2.hasSummaryBadge(['Artigo', 'Acesso aberto']), false);
  assert.equal(l2.hasSummaryBadge(null), false);
});

test('noteId: só caracteres seguros; sealLabel cita o título', () => {
  assert.equal(l2.noteId('11111111-1111-4111'), 'lib2-nota-11111111-1111-4111');
  assert.equal(l2.noteId('a b"<c>'), 'lib2-nota-abc');
  assert.ok(l2.sealLabel('Dipirona').includes('"Dipirona"'));
  assert.ok(l2.sealLabel('').length > 10);
  assert.equal(l2.expandedValue(true), 'true');
  assert.equal(l2.expandedValue(false), 'false');
});

test('o selo usa o mesmo texto do selo de sempre e não promete o que a lista não sabe', () => {
  const lib = ler('library.js');
  assert.ok(lib.includes("'Com resumo'"), 'library.js ainda emite "Com resumo"');
  assert.equal(l2.SUMMARY_BADGE, 'Com resumo');
  assert.ok(/Diretoria Científica/.test(l2.SEAL_NOTE));
});

test('mount sem o painel não faz nada', () => {
  const doc = { getElementById: () => null };
  assert.equal(l2.mount(null, doc), false);
  assert.doesNotThrow(() => l2.reset());
});

test('o script não recria a tela: sem innerHTML, sem estilo inline, só DOM seguro', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(!/\bfetch\(|callApi|XMLHttpRequest/.test(SRC), 'sem API nova');
  assert.ok(SRC.includes('aria-expanded') && SRC.includes('aria-controls'));
});

test('textos: a Guia, sem diminutivos nem "grátis"', () => {
  for (const texto of [SRC, CSS, ler('../docs/biblioteca-v2.md')]) assert.ok(!/gr[áa]tis/i.test(texto));
});

test('CSS: toda regra sob a flag, movimento reduzido, foco visível e alvos de 44 px', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.replace(/@media[^{]*\{/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const seletor of seletores) {
    for (const parte of seletor.split(',')) assert.ok(parte.trim().startsWith(':root[data-flag-library-v2-enabled]'), `fora da flag: ${parte.trim()}`);
  }
  assert.ok(CSS.includes('prefers-reduced-motion: reduce'));
  assert.ok(CSS.includes('focus-visible'));
  assert.ok(/min-height: 44px/.test(CSS));
  assert.ok(!/font-size:\s*(1[01]|[0-9])px/.test(CSS), 'fontes de pelo menos 12 px');
  assert.ok(CSS.includes('[data-theme="dark"]'), 'tema escuro');
});

test('fiação: pacote sob demanda, flag no app.js, tela de sempre sem a flag e página pública intacta', () => {
  assertSobDemanda('biblioteca2', 'library-v2.js');
  assert.ok(ler('scripts/build.js').includes("'library-v2.css'"));
  assert.ok(APP.includes('data-flag-library-v2-enabled'));
  assert.ok(APP.includes("withBundle('biblioteca2'"));
  assert.ok(/if \(libraryV2On\(\)\) mountLibraryV2\(\);\s*else if \(window\.LaiftLibraryV2\) window\.LaiftLibraryV2\.reset/.test(APP));
  assert.ok(APP.includes('window.LaiftLibrary.loadPanel()'), 'a Biblioteca de sempre continua montando a tela');
  assert.ok(!HTML.includes('library-v2'), 'o index.html não carrega nada da Biblioteca v2');
  assert.ok(!ler('biblioteca.html').includes('library-v2'), 'a página pública /biblioteca não usa a v2');
});
