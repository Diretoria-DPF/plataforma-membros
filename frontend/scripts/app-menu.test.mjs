/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Menu (hambúrguer) do app logado: contagem do aviso, textos, marcação em index.html e registro no build e no sw.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8');
const menu = require('../app-menu.js');
const HTML = ler('index.html');

/** Elemento mínimo: classes, texto e atributos, o bastante para `atualizar`. */
function elemento(classes = [], filhos = {}) {
  const conjunto = new Set(classes);
  return {
    textContent: '',
    atributos: {},
    classList: {
      contains: (c) => conjunto.has(c),
      toggle(c, forca) { if (forca) conjunto.add(c); else conjunto.delete(c); },
    },
    setAttribute(nome, valor) { this.atributos[nome] = valor; },
    querySelectorAll: (seletor) => filhos[seletor] || [],
  };
}

function documento({ voting = false, tasks = 0, messages = 0, connections = 0, admin = false } = {}) {
  const badge = (ativo, texto = '') => { const e = elemento(ativo ? [] : ['hidden']); e.textContent = texto; return e; };
  const itemVisivel = elemento();
  const itemOculto = elemento(['hidden']);
  const grupoComItem = elemento([], { '[data-panel]': [itemVisivel] });
  const grupoSemItem = elemento([], { '[data-panel]': [itemOculto] });
  const ids = {
    'nav-badge-voting': badge(voting),
    'nav-badge-tasks': badge(tasks > 0, String(tasks)),
    'nav-badge-messages': badge(messages > 0, String(messages)),
    'nav-badge-connections': badge(connections > 0, String(connections)),
    'app-menu-btn': elemento(),
    'app-menu-badge': elemento(['hidden']),
    'app-menu-info-voting': elemento(),
    'app-menu-info-tasks': elemento(),
    'app-menu-info-messages': elemento(),
    'app-menu-info-connections': elemento(),
    'nav-group-admin': elemento(admin ? [] : ['hidden']),
  };
  return {
    ids,
    grupoComItem,
    grupoSemItem,
    getElementById: (id) => ids[id] || null,
    querySelectorAll: (seletor) => (seletor === '#app-menu [data-grupo]' ? [grupoComItem, grupoSemItem] : []),
  };
}

test('a votação vale 1 e só conta quando o aviso está visível', () => {
  assert.equal(menu.contagem('voting', true, '!'), 1);
  assert.equal(menu.contagem('voting', false, '!'), 0);
});

test('tarefas, mensagens e solicitações valem o número mostrado; texto inválido vale 0', () => {
  assert.equal(menu.contagem('tasks', true, '3'), 3);
  assert.equal(menu.contagem('messages', true, ''), 0);
  assert.equal(menu.contagem('connections', true, 'x'), 0);
  assert.equal(menu.contagem('tasks', false, '5'), 0);
});

test('o total soma votação, tarefas, mensagens e solicitações', () => {
  assert.equal(menu.totalPendencias({ voting: 1, tasks: 2, messages: 3, connections: 1 }), 7);
  assert.equal(menu.totalPendencias({}), 0);
  assert.equal(menu.totalPendencias({ voting: -4, tasks: 'abc' }), 0);
});

test('o aviso do botão fica vazio sem pendência e mostra 9+ acima de nove', () => {
  assert.equal(menu.rotuloTotal(0), '');
  assert.equal(menu.rotuloTotal(1), '1');
  assert.equal(menu.rotuloTotal(9), '9');
  assert.equal(menu.rotuloTotal(10), '9+');
});

test('o nome acessível do botão traz o total por extenso, no singular e no plural', () => {
  assert.equal(menu.nomeDoBotao(0), 'Menu');
  assert.equal(menu.nomeDoBotao(1), 'Menu, 1 pendência');
  assert.equal(menu.nomeDoBotao(4), 'Menu, 4 pendências');
});

test('cada item diz o que está esperando, em português e no plural certo', () => {
  assert.equal(menu.textoDoItem('voting', 1), 'Votação aberta');
  assert.equal(menu.textoDoItem('tasks', 1), '1 tarefa em aberto');
  assert.equal(menu.textoDoItem('tasks', 3), '3 tarefas em aberto');
  assert.equal(menu.textoDoItem('messages', 2), '2 mensagens não lidas');
  assert.equal(menu.textoDoItem('connections', 1), '1 solicitação de conexão');
  assert.equal(menu.textoDoItem('tasks', 0), '');
  assert.equal(menu.textoDoItem('desconhecido', 5), '');
});

test('atualizar mostra o total no botão, escreve os textos dos itens e esconde o grupo vazio', () => {
  const doc = documento({ voting: true, tasks: 2, messages: 3 });
  menu.atualizar(doc);
  assert.equal(doc.ids['app-menu-badge'].textContent, '6');
  assert.equal(doc.ids['app-menu-badge'].classList.contains('hidden'), false);
  assert.equal(doc.ids['app-menu-btn'].atributos['aria-label'], 'Menu, 6 pendências');
  assert.equal(doc.ids['app-menu-info-voting'].textContent, 'Votação aberta');
  assert.equal(doc.ids['app-menu-info-tasks'].textContent, '2 tarefas em aberto');
  assert.equal(doc.ids['app-menu-info-messages'].textContent, '3 mensagens não lidas');
  assert.equal(doc.grupoComItem.classList.contains('hidden'), false);
  assert.equal(doc.grupoSemItem.classList.contains('hidden'), true);
});

test('atualizar sem pendência esconde o aviso e volta o nome para "Menu"', () => {
  const doc = documento();
  menu.atualizar(doc);
  assert.equal(doc.ids['app-menu-badge'].classList.contains('hidden'), true);
  assert.equal(doc.ids['app-menu-badge'].textContent, '');
  assert.equal(doc.ids['app-menu-btn'].atributos['aria-label'], 'Menu');
});

test('no modo admin o botão do menu do membro fica escondido', () => {
  const doc = documento({ admin: true });
  menu.atualizar(doc);
  assert.equal(doc.ids['app-menu-btn'].classList.contains('hidden'), true);
  const normal = documento();
  menu.atualizar(normal);
  assert.equal(normal.ids['app-menu-btn'].classList.contains('hidden'), false);
});

test('index.html: a barra do membro tem só Início, Aprender, Eventos e Perfil (mais o Admin)', () => {
  const inicio = HTML.indexOf('id="nav-group-member"');
  const bloco = HTML.slice(inicio, HTML.indexOf('id="nav-group-admin"'));
  const paineis = [...bloco.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(paineis, ['panel-home', 'panel-learn', 'panel-events', 'panel-profile']);
  assert.ok(bloco.includes('id="btn-enter-admin-mode"'), 'o botão do admin continua na barra');
});

test('index.html: Propostas, Tarefas, Mensagens e Equipe moram no menu, com os mesmos contadores', () => {
  const inicio = HTML.indexOf('<dialog id="app-menu"');
  assert.ok(inicio > 0, 'dialog #app-menu ausente');
  const bloco = HTML.slice(inicio, HTML.indexOf('</dialog>', inicio));
  const paineis = [...bloco.matchAll(/data-panel="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(paineis, ['panel-proposals', 'panel-tasks', 'panel-messages', 'panel-orgchart']);
  for (const id of Object.values(menu.BADGE_IDS)) {
    assert.ok(bloco.includes(`id="${id}"`), `contador ${id} fora do menu`);
    assert.ok(bloco.includes(`id="${id}-sr"`), `texto oculto ${id}-sr fora do menu`);
  }
  assert.match(bloco, /aria-labelledby="app-menu-titulo"/);
});

test('index.html: o botão dos três tracinhos tem aviso decorativo e nome acessível', () => {
  const botao = /<button[^>]*id="app-menu-btn"[^>]*>/.exec(HTML)?.[0];
  assert.ok(botao, 'botão #app-menu-btn ausente');
  assert.match(botao, /aria-haspopup="dialog"/);
  assert.match(botao, /aria-controls="app-menu"/);
  assert.match(botao, /aria-label="Menu"/);
  assert.match(HTML, /<span id="app-menu-badge" class="app-menu-btn__badge hidden" aria-hidden="true"><\/span>/);
});

test('app-menu.js e app-menu.css entram no index.html, no build e no precache do sw', () => {
  assert.match(HTML, /<link rel="stylesheet" href="app-menu\.css">/);
  assert.match(HTML, /<script src="app-menu\.js" defer><\/script>/);
  assert.match(ler('scripts/build.js'), /'app-menu\.js'/);
  assert.match(ler('scripts/build.js'), /'app-menu\.css'/);
  assert.match(ler('sw.js'), /'app-menu\.js'/);
  assert.match(ler('sw.js'), /'app-menu\.css'/);
});

test('app-menu.js não monta HTML por texto nem usa estilo inline, e o CSS não anima layout', () => {
  const js = ler('app-menu.js').split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.style\./);
  const css = ler('app-menu.css');
  assert.doesNotMatch(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /transition:[^;]*\b(width|height|top|left|margin|padding)\b/);
});
