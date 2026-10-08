/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Hierarquia de títulos (WCAG 1.3.1 e 2.4.6): cada tela visível tem exatamente um h1 e
// nenhum salto de nível dentro dela. Telas: login/cadastro/redefinição (públicas) e
// cada painel do app autenticado, sempre junto do cabeçalho do app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const HTML = read('frontend/index.html');

const PUBLIC_SCREENS = ['screen-welcome', 'screen-register', 'screen-forgot', 'screen-reset'];

/** Trecho completo de <section id="..."> com o fechamento balanceado (seções podem aninhar). */
function sectionBlock(id) {
  const open = HTML.indexOf(`<section id="${id}"`);
  assert.ok(open >= 0, `<section id="${id}"> não encontrado em index.html`);
  const tags = /<\/?section\b[^>]*>/g;
  tags.lastIndex = open;
  let depth = 0;
  let match;
  while ((match = tags.exec(HTML))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return HTML.slice(open, match.index + match[0].length);
  }
  assert.fail(`<section id="${id}"> sem fechamento`);
  return '';
}

/** Níveis dos títulos na ordem do documento: [1, 2, 2, 3, ...]. */
function headingLevels(markup) {
  return [...markup.matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
}

function h1Tags(markup) {
  return [...markup.matchAll(/<h1\b[^>]*>/g)].map((m) => m[0]);
}

function panelIds() {
  return [...HTML.matchAll(/<section id="(panel-[\w-]+)"/g)].map((m) => m[1]);
}

/** Não pode haver salto para baixo (h1 -> h3) nem começar em nível diferente de 1. */
function assertNoLevelSkip(levels, label) {
  assert.equal(levels[0], 1, `${label}: o primeiro título precisa ser h1`);
  for (let i = 1; i < levels.length; i += 1) {
    assert.ok(levels[i] <= levels[i - 1] + 1, `${label}: salto de h${levels[i - 1]} para h${levels[i]}`);
  }
}

test('cada tela pública (login, cadastro, redefinição) tem exatamente um h1', () => {
  for (const id of PUBLIC_SCREENS) {
    const block = sectionBlock(id);
    assert.equal(h1Tags(block).length, 1, `${id} deve ter exatamente um h1`);
  }
});

test('telas públicas não têm salto de nível dentro de si', () => {
  for (const id of PUBLIC_SCREENS) {
    assertNoLevelSkip(headingLevels(sectionBlock(id)), id);
  }
});

test('títulos de cadastro, redefinição e esqueci-senha são h1 visíveis com a classe auth-heading (sem style inline)', () => {
  for (const titleId of ['register-title', 'forgot-title', 'reset-title']) {
    const tag = h1Tags(HTML).find((t) => t.includes(`id="${titleId}"`));
    assert.ok(tag, `${titleId} deveria ser h1`);
    assert.match(tag, /class="auth-heading"/, `${titleId} usa a classe auth-heading (tamanho no design system)`);
    assert.doesNotMatch(tag, /style=/, `${titleId} não pode usar style inline (CSP)`);
    assert.doesNotMatch(tag, /sr-only|visually-hidden/, `${titleId} é título visível, não pode ficar oculto`);
  }
});

test('cada painel do app autenticado tem exatamente um h1 oculto (sr-only) e nenhum salto de nível', () => {
  const ids = panelIds();
  assert.ok(ids.length >= 15, `painéis encontrados demais poucos: ${ids.length}`);
  for (const id of ids) {
    const block = sectionBlock(id);
    const tags = h1Tags(block);
    assert.equal(tags.length, 1, `${id} deve ter exatamente um h1`);
    assert.match(tags[0], /class="[^"]*\bsr-only\b[^"]*"/, `${id}: o h1 de painel deve ser sr-only para não mudar o visual`);
    assertNoLevelSkip(headingLevels(block), id);
  }
});

test('o cabeçalho do app não tem h1, para que a tela visível tenha só o h1 do painel', () => {
  const start = HTML.indexOf('<header class="app-header">');
  const end = HTML.indexOf('</header>', start);
  assert.ok(start >= 0 && end > start, 'cabeçalho .app-header não encontrado');
  assert.equal(h1Tags(HTML.slice(start, end)).length, 0);
});

test('classe sr-only existe e está carregada pelo index.html (charts.css)', () => {
  assert.match(read('frontend/modulos/shared/charts.css'), /\.sr-only\s*\{/);
  assert.match(HTML, /href="modulos\/shared\/charts\.css"/);
});
