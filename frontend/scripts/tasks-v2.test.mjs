/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tarefas v2 (tasks-v2.js, tasks-v2.css): funções puras, fiação (pacote sob demanda, tela de sempre intacta sem a flag) e regras do código e do CSS.
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
const mod = require('../tasks-v2.js');
const SRC = ler('tasks-v2.js');
const CSS = ler('tasks-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('código: sem innerHTML, sem estilo inline, só DOM seguro', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(/aria-/.test(SRC));
});

test('textos: a Guia, sem diminutivos nem "grátis"', () => {
  for (const texto of [SRC, CSS, ler('../docs/tarefas-v2.md')]) assert.ok(!/gr[áa]tis/i.test(texto));
});

test('CSS: toda regra sob a flag, movimento reduzido, foco visível e tamanhos mínimos', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.replace(/@media[^{]*\{/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const seletor of seletores) {
    for (const parte of seletor.split(',')) assert.ok(parte.trim().startsWith(':root[data-flag-tasks-v2-enabled]'), `fora da flag: ${parte.trim()}`);
  }
  assert.ok(CSS.includes('focus-visible'));
  assert.ok(/min-height: 44px/.test(CSS));
  assert.ok(!/font-size:\s*(1[01]|[0-9])px/.test(CSS), 'fontes de pelo menos 12 px');
});

test('fiação: pacote sob demanda, flag no app.js e tela de sempre sem a flag', () => {
  assertSobDemanda('tarefas2', 'tasks-v2.js');
  assert.ok(ler('scripts/build.js').includes("'tasks-v2.css'"));
  assert.ok(APP.includes('data-flag-tasks-v2-enabled'));
  assert.ok(APP.includes("withBundle('tarefas2'"));
  assert.ok(APP.includes('else if (window.LaiftTasksV2) window.LaiftTasksV2.reset(document)'));
  assert.ok(!HTML.includes('tasks-v2'), 'o index.html não carrega nada da v2');
});

test('mount sem o painel não faz nada', () => {
  assert.equal(mod.mount(null, { getElementById: () => null }), null);
  assert.doesNotThrow(() => mod.reset());
});

test('taskCounts e tasksSummary', () => {
  assert.deepEqual(mod.taskCounts(['open', 'mine', 'done', 'open']), { total: 4, open: 2, mine: 1, done: 1 });
  assert.equal(mod.tasksSummary({ total: 4, open: 2, mine: 1, done: 1 }, false, false).title, '1 tarefa em curso');
  assert.equal(mod.tasksSummary({ total: 4, open: 2, mine: 1, done: 1 }, false, false).sub, '2 disponíveis para você aderir');
  assert.equal(mod.tasksSummary({ total: 1, open: 0, mine: 0, done: 1 }, false, false).title, 'Nenhuma tarefa em curso');
  assert.equal(mod.tasksSummary({ total: 0 }, true, false).title, 'Carregando tarefas');
  assert.match(mod.tasksSummary({ total: 0 }, false, true, 'Falhou').title, /Não foi possível/);
  assert.equal(mod.tasksSummary({ total: 0 }, false, false).title, 'Nenhuma tarefa publicada');
});

test('isVisible: Disponíveis, Minhas tarefas e seus filtros', () => {
  assert.ok(mod.isVisible('open', 'open', 'all') && !mod.isVisible('mine', 'open', 'all'));
  assert.ok(mod.isVisible('mine', 'mine', 'all') && mod.isVisible('done', 'mine', 'all') && !mod.isVisible('open', 'mine', 'all'));
  assert.ok(mod.isVisible('mine', 'mine', 'mine') && !mod.isVisible('done', 'mine', 'mine'));
  assert.ok(mod.isVisible('done', 'mine', 'done') && !mod.isVisible('mine', 'mine', 'done'));
});

test('emptyMessage: só quando a lista escolhida está vazia', () => {
  const c = { total: 2, open: 0, mine: 2, done: 0 };
  assert.equal(mod.emptyMessage(c, 'open', 'all').title, 'Nenhuma tarefa disponível agora');
  assert.equal(mod.emptyMessage(c, 'mine', 'all'), null);
  assert.equal(mod.emptyMessage(c, 'mine', 'done').title, 'Nenhuma tarefa nesta situação');
  assert.equal(mod.emptyMessage({ total: 1, open: 1, mine: 0, done: 0 }, 'mine', 'all').title, 'Você ainda não tem tarefas');
  assert.equal(mod.emptyMessage({ total: 1, open: 1, mine: 0, done: 0 }, 'open', 'all'), null);
});

test('as ações de sempre continuam em app.js (Aderir, concluir) e o estado vem de data-task-state', () => {
  assert.ok(APP.includes('data-task-state') && APP.includes("['Aderir']") && APP.includes('Marcar como concluída'));
  assert.ok(!/\.id\s*=\s*'(tasks-)/.test(SRC), 'nenhum id de sempre é reatribuído');
});
