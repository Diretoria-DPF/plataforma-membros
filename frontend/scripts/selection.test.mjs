/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Processo seletivo na plataforma (frontend/selection.js): funções puras e fiação no app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Sel = require('../selection.js');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-20T12:00:00Z');

test('etapas: ordem e índices', () => {
  assert.deepEqual(Sel.STEPS.map((s) => s.id), ['intro', 'profile', 'scenario', 'thinking', 'conduct', 'review']);
  assert.equal(Sel.stepIndex('scenario'), 2);
  assert.equal(Sel.stepIndex('nada'), -1);
});

test('prazo: dias que faltam e o texto para a pessoa', () => {
  const in5 = new Date(NOW + 5 * DAY).toISOString();
  assert.equal(Sel.daysLeft(in5, NOW), 5);
  assert.equal(Sel.deadlineText(in5, NOW), 'Você tem 5 dias para concluir (até 25/10).');
  assert.match(Sel.deadlineText(new Date(NOW + 0.5 * DAY).toISOString(), NOW), /Último dia/);
  assert.equal(Sel.deadlineText(new Date(NOW - DAY).toISOString(), NOW), 'O prazo desta inscrição terminou.');
  assert.equal(Sel.daysLeft('lixo', NOW), 0);
});

test('contador de caracteres do cenário', () => {
  assert.deepEqual(Sel.charInfo(100, 2000), { state: 'ok', text: '100 de 2000 caracteres' });
  assert.equal(Sel.charInfo(0, 2000).state, 'ok');
  assert.equal(Sel.charInfo(2100, 2000).state, 'long');
});

test('data da próxima análise vira dd/mm; formato estranho vira vazio', () => {
  assert.equal(Sel.formatReviewDate('2026-11-05'), '05/11');
  assert.equal(Sel.formatReviewDate('amanhã'), '');
  assert.equal(Sel.formatReviewDate(null), '');
});

test('linha do tempo do status', () => {
  assert.deepEqual(Sel.timeline('submitted').map((t) => t.state), ['current', 'todo', 'todo', 'todo']);
  assert.deepEqual(Sel.timeline('in_review').map((t) => t.state), ['done', 'current', 'todo', 'todo']);
  assert.deepEqual(Sel.timeline('approved').map((t) => t.state), ['done', 'done', 'done', 'current']);
});

test('tela inicial: sem inscrição vai à apresentação; rascunho, à etapa em que parou; o resto, ao andamento', () => {
  assert.equal(Sel.initialView(null), 'welcome');
  assert.equal(Sel.initialView({ status: 'draft', step: 'scenario' }), 'scenario');
  assert.equal(Sel.initialView({ status: 'submitted', step: 'done' }), 'status');
  assert.equal(Sel.initialView({ status: 'expired', step: 'profile' }), 'status');
});

test('passo a passo: só abre o que já foi alcançado; revisão só com tudo preenchido; nada depois do envio', () => {
  const draft = { status: 'draft', step: 'scenario', data: { intro: {}, profile: {} } };
  assert.equal(Sel.canVisit('intro', draft), true);
  assert.equal(Sel.canVisit('scenario', draft), true);
  assert.equal(Sel.canVisit('thinking', draft), false);
  assert.equal(Sel.canVisit('review', draft), false);
  const full = { status: 'draft', step: 'review', data: { intro: 1, profile: 1, scenario: 1, thinking: 1, conduct: 1 } };
  assert.equal(Sel.canVisit('review', full), true);
  assert.equal(Sel.canVisit('intro', { ...full, status: 'submitted' }), false);
  assert.equal(Sel.canVisit('intro', null), false);
});

test('selection.js: sem innerHTML, eval nem style inline; não guarda nada no navegador', () => {
  const code = read('selection.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function|setAttribute\('style'|\.style\./);
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test('fiação: index.html, build.js, sw.js, menu e carregador do painel', () => {
  const html = read('index.html');
  assert.match(html, /<link rel="stylesheet" href="selection\.css">/);
  assert.match(html, /<script src="selection\.js" defer><\/script>/);
  assert.match(html, /<section id="panel-selection" class="hidden">[\s\S]*?id="selection-root"/);
  assert.match(html, /data-panel="panel-selection" data-scope="candidate"/);
  for (const file of ['scripts/build.js', 'sw.js']) {
    const src = read(file);
    assert.ok(src.includes("'selection.js'") && src.includes("'selection.css'"), file);
  }
  assert.match(read('app.js'), /'panel-selection': function \(\) \{ if \(window\.LaiftSelection\)/);
  assert.match(read('app-menu.css'), /:root:not\(\[data-flag-selection-enabled\]\) #app-menu \[data-grupo="liga"\]/);
});

test('páginas públicas: o botão leva à jornada (#inscricao) e as datas do fluxo contínuo saem do servidor', () => {
  const liga = read('liga.js');
  assert.match(liga, /apiSelectionOverview/);
  assert.match(liga, /\.\/#inscricao/);
  assert.match(read('app.js'), /'#inscricao': 'screen-welcome'/);
});
