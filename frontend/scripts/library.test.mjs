/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel da Biblioteca do membro (frontend/library.js, CONTRATO-B2 §3): funções puras,
// montagem em #library-root, busca com espera (2 caracteres, 400 ms), respostas fora de
// ordem, estados (vazio, erro, rede, desligada), favorito só depois do success:true,
// visitante sem favoritos nem coleções, sugestão com flag, reset e higiene.
import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);

/** DOM mínimo; innerHTML lança, como em admin-moderation.test.mjs. */
function makeNode(tag) {
  const node = {
    tag,
    children: [],
    attrs: {},
    listeners: {},
    textContent: '',
    appendChild(child) { node.children.push(child); return child; },
    addEventListener(type, fn) { node.listeners[type] = fn; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    focus() { doc.activeElement = node; },
    contains(target) { return node === target || node.children.some((c) => c.contains && c.contains(target)); },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}

/** Mesma regra de LaiftDom.h: strings viram nós de texto; "text" vira textContent. */
function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') node.attrs.class = value;
    else if (key === 'text') node.textContent = String(value);
    else if (/^on[A-Z]/.test(key)) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'hidden' || key === 'open') node[key] = value === true;
    else node.setAttribute(key, value === true ? '' : value);
  });
  [].concat(children === undefined ? [] : children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'object') node.appendChild(child);
    else {
      const t = makeNode('#text');
      t.textContent = String(child);
      node.appendChild(t);
    }
  });
  return node;
}

const wiring = [];
const LaiftDom = {
  h,
  clear(node) { node.children = []; node.textContent = ''; return node; },
  delegateActions(root, allowList) { wiring.push({ root, allowList }); },
};

const elements = new Map();
const doc = {
  activeElement: null,
  documentElement: {
    attrs: {},
    hasAttribute(key) { return Object.prototype.hasOwnProperty.call(this.attrs, key); },
  },
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  },
};

const calls = [];
const pending = [];
let identity = { role: 'member' };
const detailCalls = [];
const app = {
  getState() { return { sessionToken: 'tok-membro' }; },
  getIdentity() { return identity; },
  callApi(name, token, input) {
    calls.push({ name, token, input });
    return new Promise((resolve) => {
      const entry = {
        name,
        input,
        resolve: (res) => {
          const i = pending.indexOf(entry);
          if (i >= 0) pending.splice(i, 1);
          resolve(res);
        },
      };
      pending.push(entry);
    });
  },
};

globalThis.window = {
  LaiftDom,
  App: app,
  LaiftLibraryCite: require('../library-cite.js'),
  LaiftLibraryDetail: { open(a, id, onBack) { detailCalls.push({ id, onBack }); } },
};
globalThis.document = doc;
const Library = require('../library.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const root = () => doc.getElementById('library-root');
const textOf = (node) => (node ? node.textContent + node.children.map(textOf).join('') : '');
function findAll(node, pred, out = []) {
  if (pred(node)) out.push(node);
  node.children.forEach((c) => findAll(c, pred, out));
  return out;
}
const byAction = (action) => findAll(root(), (n) => n.attrs['data-action'] === action);
const buttonsWith = (text) => findAll(root(), (n) => n.tag === 'button' && textOf(n) === text);
const statusNode = () => findAll(root(), (n) => n.attrs.id === 'library-status')[0];
const pendingOf = (name) => pending.filter((p) => p.name === name);
const searchCalls = () => calls.filter((c) => c.name === 'apiLearnLibrarySearch');

function item(id, title, extra = {}) {
  return Object.assign({
    id,
    title,
    authors: [{ family: 'Silva', given: 'Ana Maria' }],
    authorCount: 1,
    journal: 'Revista X',
    year: 2021,
    type: 'artigo',
    topics: [],
    openAccess: true,
    hasSummary: true,
    isFavorite: false,
  }, extra);
}

/** Abre o painel e responde a primeira busca (catálogo sem filtros). */
async function openCatalog(items = [], extra = {}) {
  Library.loadPanel();
  await flush();
  const [first] = pendingOf('apiLearnLibrarySearch');
  first.resolve(Object.assign({
    success: true, items, total: items.length, page: 1, pageSize: 20,
    topics: [{ slug: 'farmacologia', name: 'Farmacologia' }],
  }, extra));
  await flush();
}

beforeEach(() => {
  Library.reset();
  calls.length = 0;
  pending.length = 0;
  detailCalls.length = 0;
  identity = { role: 'member' };
  doc.documentElement.attrs = {};
  doc.activeElement = null;
});

afterEach(() => {
  mock.timers.reset();
});

// ---------- Funções puras ----------

test('cleanQuery tira espaços extras e limita a 120 caracteres', () => {
  assert.equal(Library.cleanQuery('  dose   letal  '), 'dose letal');
  assert.equal(Library.cleanQuery('a'.repeat(200)).length, 120);
});

test('statusLabel: singular só para 1 e pt-BR para o resto', () => {
  assert.equal(Library.statusLabel(1), '1 artigo');
  assert.equal(Library.statusLabel(0), '0 artigos');
  assert.equal(Library.statusLabel(12), '12 artigos');
});

test('filtros ativos entram no rótulo do resumo', () => {
  assert.equal(Library.filterSummaryLabel(0), 'Filtros');
  assert.equal(Library.filterSummaryLabel(2), 'Filtros (2)');
  const query = { q: '', topic: 'farmacologia', type: '', yearFrom: '2020', yearTo: '', openAccess: true };
  assert.equal(Library.activeFilterCount(query), 3);
});

test('buildSearchInput envia só o que foi preenchido, com 20 por página', () => {
  const empty = { q: '', topic: '', type: '', yearFrom: '', yearTo: '', openAccess: false };
  assert.deepEqual(Library.buildSearchInput(empty, 1), { page: 1, pageSize: 20 });
  const filled = { q: 'dose', topic: 'toxicologia', type: 'revisao', yearFrom: '2020', yearTo: 'x', openAccess: true };
  assert.deepEqual(Library.buildSearchInput(filled, 2), {
    q: 'dose', topic: 'toxicologia', type: 'revisao', yearFrom: 2020, openAccess: true, page: 2, pageSize: 20,
  });
});

test('authorsLine usa sobrenome e iniciais e põe "et al." quando há mais autores', () => {
  const two = item('a', 'T', {
    authorCount: 2,
    authors: [{ family: 'Silva', given: 'Ana Maria' }, { family: 'Souza', given: 'Jean-Paul' }],
  });
  assert.equal(Library.authorsLine(two), 'Silva AM, Souza JP');
  const many = item('b', 'T', { authorCount: 5, authors: [{ family: 'Silva', given: 'Ana' }] });
  assert.equal(Library.authorsLine(many), 'Silva A et al.');
});

test('failureOf separa desligada, rede e erro comum', () => {
  assert.equal(Library.failureOf({ success: false, disabled: true }).kind, 'disabled');
  assert.equal(Library.failureOf({ success: false, disabled: true }).message, 'A Biblioteca ainda não está disponível.');
  assert.equal(Library.failureOf({ success: false, networkUnavailable: true }).kind, 'network');
  assert.equal(Library.failureOf({ success: false, message: '  Limite atingido.  ' }).message, 'Limite atingido.');
  assert.equal(Library.failureOf(null).message, 'Tente novamente em instantes.');
});

test('canSuggest exige a flag e um papel que não seja visitante', () => {
  assert.equal(Library.canSuggest('member', true), true);
  assert.equal(Library.canSuggest('admin', true), true);
  assert.equal(Library.canSuggest('visitor', true), false);
  assert.equal(Library.canSuggest('member', false), false);
});

test('suggestionPayload exige identificador e limita a nota a 300', () => {
  assert.equal(Library.suggestionPayload('   ', 'x'), null);
  assert.deepEqual(Library.suggestionPayload(' 10.1000/xyz ', ''), { identifier: '10.1000/xyz' });
  assert.equal(Library.suggestionPayload('10.1/a', 'n'.repeat(400)).note.length, 300);
});

test('favoriteLabel e badgesOf montam rótulos e selos em texto', () => {
  assert.equal(Library.favoriteLabel(true), 'Remover dos favoritos');
  assert.equal(Library.favoriteLabel(false), 'Salvar nos favoritos');
  const article = item('a', 'T', { type: 'revisao', topics: ['farmacologia', 'x'], openAccess: false });
  assert.deepEqual(Library.badgesOf(article, [{ slug: 'farmacologia', name: 'Farmacologia' }]),
    ['Revisão', 'Farmacologia', 'Com resumo']);
});

test('idioma: filtro entra na contagem e na busca; só pt, en e outros seguem', () => {
  const base = { q: '', topic: '', type: '', yearFrom: '', yearTo: '', openAccess: false, language: '' };
  assert.equal(Library.activeFilterCount(base), 0);
  assert.equal(Library.activeFilterCount({ ...base, language: 'pt' }), 1);
  assert.deepEqual(Library.buildSearchInput(base, 1), { page: 1, pageSize: 20 });
  assert.deepEqual(Library.buildSearchInput({ ...base, language: 'pt' }, 1), { page: 1, pageSize: 20, language: 'pt' });
  assert.deepEqual(Library.buildSearchInput({ ...base, language: 'outros' }, 1), { page: 1, pageSize: 20, language: 'outros' });
  assert.deepEqual(Library.buildSearchInput({ ...base, language: 'fr' }, 1), { page: 1, pageSize: 20 });
});

test('selo de idioma em texto: Português, English; sem idioma, sem selo', () => {
  const pt = item('a', 'T', { type: 'artigo', language: 'pt', openAccess: false, hasSummary: false });
  const en = item('b', 'T', { type: 'artigo', language: 'en', openAccess: false, hasSummary: false });
  const none = item('c', 'T', { type: 'artigo', language: null, openAccess: false, hasSummary: false });
  assert.deepEqual(Library.badgesOf(pt, []), ['Artigo original', 'Português']);
  assert.deepEqual(Library.badgesOf(en, []), ['Artigo original', 'English']);
  assert.deepEqual(Library.badgesOf(none, []), ['Artigo original']);
});

test('hasMore compara o total com o que já foi carregado', () => {
  assert.equal(Library.hasMore(25, 20), true);
  assert.equal(Library.hasMore(20, 20), false);
});

// ---------- Painel ----------

test('loadPanel monta o cabeçalho e as abas dentro de #library-root', async () => {
  await openCatalog([item('A1', 'Dose letal')]);
  assert.ok(root().children.length > 0);
  assert.equal(findAll(root(), (n) => n.tag === 'h2' && textOf(n) === 'Biblioteca LAIFT').length, 1);
  assert.equal(buttonsWith('Catálogo').length, 1);
});

test('busca com 1 caractere não chama a API', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  await openCatalog();
  const before = searchCalls().length;
  Library.searchInput('a');
  mock.timers.tick(1000);
  assert.equal(searchCalls().length, before);
});

test('busca com 2 caracteres chama a API só depois de 400 ms de espera', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  await openCatalog();
  const before = searchCalls().length;
  Library.searchInput('do');
  mock.timers.tick(399);
  assert.equal(searchCalls().length, before);
  mock.timers.tick(1);
  assert.equal(searchCalls().length, before + 1);
  const last = searchCalls().at(-1);
  assert.equal(last.input.q, 'do');
  assert.equal(last.input.page, 1);
  assert.equal(last.token, 'tok-membro');
});

test('resposta de busca antiga que chega depois é ignorada', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  await openCatalog();
  Library.searchInput('ab');
  mock.timers.tick(400);
  Library.searchInput('abc');
  mock.timers.tick(400);
  const [older, newer] = pendingOf('apiLearnLibrarySearch').slice(-2);
  newer.resolve({ success: true, items: [item('B1', 'Titulo novo')], total: 1, topics: [] });
  await flush();
  older.resolve({ success: true, items: [item('A1', 'Titulo antigo')], total: 1, topics: [] });
  await flush();
  const text = textOf(root());
  assert.ok(text.includes('Titulo novo'));
  assert.ok(!text.includes('Titulo antigo'));
});

test('contagem vai para o role="status" da lista', async () => {
  await openCatalog([item('A1', 'Dose letal')], { total: 12 });
  assert.equal(statusNode().attrs.role, 'status');
  assert.equal(statusNode().textContent, '12 artigos');
});

test('Biblioteca desligada mostra o aviso e nenhum botão de nova tentativa', async () => {
  Library.loadPanel();
  await flush();
  pendingOf('apiLearnLibrarySearch')[0].resolve({ success: false, disabled: true, message: 'x' });
  await flush();
  assert.ok(textOf(root()).includes('A Biblioteca ainda não está disponível.'));
  assert.equal(byAction('LaiftLibrary.reload').length, 0);
});

test('filtro Idioma: rótulo visível, três opções, padrão Todos e busca com language', async () => {
  await openCatalog([item('A1', 'Dose letal', { language: 'pt' })]);
  const label = findAll(root(), (n) => n.tag === 'label' && n.attrs.for === 'library-idioma');
  assert.equal(label.length, 1);
  assert.equal(textOf(label[0]), 'Idioma');
  const select = findAll(root(), (n) => n.tag === 'select' && n.attrs.id === 'library-idioma')[0];
  assert.ok(select);
  const options = select.children.map((o) => [o.attrs.value, textOf(o)]);
  assert.deepEqual(options, [['', 'Todos'], ['pt', 'Português'], ['outros', 'Inglês e outros']]);
  assert.equal(select.children[0].attrs.selected, '');
  assert.equal(searchCalls()[0].input.language, undefined);
  Library.filterChange('language', 'pt');
  assert.equal(searchCalls().length, 2);
  assert.equal(searchCalls()[1].input.language, 'pt');
  Library.filterChange('language', 'zz');
  assert.equal(searchCalls()[2].input.language, undefined);
});

test('o selo de idioma aparece em cada item da lista', async () => {
  await openCatalog([item('A1', 'Em português', { language: 'pt' }), item('A2', 'In English', { language: 'en' })]);
  const selos = findAll(root(), (n) => n.attrs.class === 'badge').map(textOf);
  assert.equal(selos.includes('Português'), true);
  assert.equal(selos.includes('English'), true);
});

test('lista vazia mostra a mensagem e a ação de limpar filtros', async () => {
  await openCatalog([]);
  assert.ok(textOf(root()).includes('Nenhum artigo encontrado.'));
  assert.equal(byAction('LaiftLibrary.clearFilters').length >= 1, true);
});

test('erro mostra a mensagem da API e "Tentar de novo" que refaz a busca', async () => {
  Library.loadPanel();
  await flush();
  pendingOf('apiLearnLibrarySearch')[0].resolve({ success: false, message: 'Falha ao consultar.' });
  await flush();
  assert.ok(textOf(root()).includes('Falha ao consultar.'));
  const retry = byAction('LaiftLibrary.reload');
  assert.equal(retry.length, 1);
  assert.equal(textOf(retry[0]), 'Tentar de novo');
  const before = searchCalls().length;
  Library.reload();
  assert.equal(searchCalls().length, before + 1);
});

test('erro de rede traz o link para o catálogo público', async () => {
  Library.loadPanel();
  await flush();
  pendingOf('apiLearnLibrarySearch')[0].resolve({ success: false, networkUnavailable: true, message: 'Failed to fetch' });
  await flush();
  const links = findAll(root(), (n) => n.tag === 'a' && n.attrs.href === '/biblioteca');
  assert.equal(links.length, 1);
});

test('visitante não vê favoritos nem as abas Favoritos e Coleções', async () => {
  identity = { role: 'visitor' };
  await openCatalog([item('A1', 'Dose letal')]);
  assert.equal(byAction('LaiftLibrary.toggleFavorite').length, 0);
  assert.equal(buttonsWith('Favoritos').length, 0);
  assert.equal(buttonsWith('Coleções').length, 0);
  assert.ok(textOf(root()).includes('Resumo, favoritos e coleções são para membros.'));
});

test('favorito chama apiLearnLibrarySetFavorite e troca aria-pressed só depois do success:true', async () => {
  await openCatalog([item('A1', 'Dose letal')]);
  const button = byAction('LaiftLibrary.toggleFavorite')[0];
  assert.equal(button.attrs['aria-pressed'], 'false');
  Library.toggleFavorite('A1');
  const [call] = pendingOf('apiLearnLibrarySetFavorite');
  assert.deepEqual(call.input, { id: 'A1', favorite: true });
  assert.equal(button.attrs['aria-pressed'], 'false');
  call.resolve({ success: true, favorite: true });
  await flush();
  assert.equal(button.attrs['aria-pressed'], 'true');
});

test('favorito recusado pelo servidor mantém aria-pressed e mostra a mensagem', async () => {
  await openCatalog([item('A1', 'Dose letal')]);
  const button = byAction('LaiftLibrary.toggleFavorite')[0];
  Library.toggleFavorite('A1');
  pendingOf('apiLearnLibrarySetFavorite')[0].resolve({ success: false, message: 'Limite de favoritos atingido.' });
  await flush();
  assert.equal(button.attrs['aria-pressed'], 'false');
  assert.ok(textOf(root()).includes('Limite de favoritos atingido.'));
});

test('Sugerir artigo aparece só com a flag e papel que não seja visitante', async () => {
  await openCatalog();
  assert.equal(buttonsWith('Sugerir artigo').length, 0);
  doc.documentElement.attrs['data-flag-library-member-suggest'] = '1';
  Library.loadPanel();
  assert.equal(buttonsWith('Sugerir artigo').length, 1);
  identity = { role: 'visitor' };
  Library.loadPanel();
  assert.equal(buttonsWith('Sugerir artigo').length, 0);
});

test('aba Coleções lista as coleções publicadas com a contagem', async () => {
  await openCatalog();
  Library.setTab('colecoes');
  const [list] = pendingOf('apiLearnLibraryListCollections');
  list.resolve({
    success: true,
    collections: [{ id: 'c1', slug: 'cardio', title: 'Cardiologia', description: 'Artigos de cardio', count: 3 }],
  });
  await flush();
  const text = textOf(root());
  assert.ok(text.includes('Cardiologia'));
  assert.ok(text.includes('3 artigos'));
});

test('Carregar mais pede a página seguinte e acrescenta os itens', async () => {
  const first = Array.from({ length: 20 }, (_, i) => item(`i${i}`, `Artigo ${i}`));
  await openCatalog(first, { total: 25 });
  assert.equal(buttonsWith('Carregar mais').length, 1);
  Library.loadMore();
  assert.equal(searchCalls().at(-1).input.page, 2);
  pendingOf('apiLearnLibrarySearch')[0].resolve({ success: true, items: [item('i20', 'Artigo 20')], total: 25, topics: [] });
  await flush();
  assert.equal(findAll(root(), (n) => n.tag === 'li').length, 21);
});

test('reset limpa o painel e descarta a resposta que ainda estava em voo', async () => {
  Library.loadPanel();
  await flush();
  const [inFlight] = pendingOf('apiLearnLibrarySearch');
  Library.reset();
  inFlight.resolve({ success: true, items: [item('A1', 'Titulo')], total: 1, topics: [] });
  await flush();
  assert.equal(root().children.length, 0);
  assert.equal(root().attrs['aria-busy'], undefined);
});

test('delegação registra só as ações do painel', async () => {
  await openCatalog();
  const last = wiring.at(-1);
  assert.equal(last.root, root());
  assert.ok(last.allowList.includes('LaiftLibrary.open'));
  assert.ok(last.allowList.includes('LaiftLibrary.toggleFavorite'));
  assert.ok(last.allowList.includes('LaiftLibrary.reload'));
});

test('higiene: sem innerHTML, estilo inline nem handler inline; só actions apiLearnLibrary*', () => {
  const src = read('library.js');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(src, /\.style\./);
  assert.doesNotMatch(src, /style\s*=/);
  assert.doesNotMatch(src, /\bon[a-z]+\s*=/i);
  const names = [...src.matchAll(/'(apiLearn\w*)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 6);
  assert.ok(names.every((n) => n.startsWith('apiLearnLibrary')));
});
