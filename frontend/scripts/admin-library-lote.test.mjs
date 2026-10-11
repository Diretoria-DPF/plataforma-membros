/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Trabalho em lote da curadoria da Biblioteca (frontend/admin-library-lote.js, B3 enxuta):
// importar lista de DOIs uma por vez, gerar resumos por IA, aprovar e publicar selecionados,
// painel de progresso (pausa no limite, cancelar, tentar de novo), edição e higiene.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');
const require = createRequire(import.meta.url);

function makeNode(tag) {
  const node = {
    tag, children: [], attrs: {}, listeners: {}, textContent: '', value: '', checked: false, disabled: false,
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    addEventListener(type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn); },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}

function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (/^on[A-Z]/.test(key) && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.attrs.class = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') node[key] = value === true;
    else node.setAttribute(key, value === true ? '' : String(value));
  });
  [].concat(children === undefined ? [] : children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'object') node.appendChild(child);
    else { const t = makeNode('#text'); t.textContent = String(child); node.appendChild(t); }
  });
  return node;
}

const calls = [];
const pending = [];
const confirms = [];
const opened = [];
let refreshes = 0;
let token = 'tok-admin';
const app = {
  getState() { return { sessionToken: token }; },
  callApi(name, sessionToken, input) {
    calls.push({ name, token: sessionToken, input });
    return new Promise((resolve) => { pending.push({ name, input, resolve }); });
  },
  openConfirm(message, fn) { confirms.push({ message, fn }); },
};

globalThis.window = { LaiftDom: { h, clear(node) { node.children = []; return node; } } };
const Lote = require('../admin-library-lote.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));
function textOf(node) { return node ? node.textContent + node.children.map(textOf).join('') : ''; }
function findAll(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  node.children.forEach((child) => findAll(child, predicate, out));
  return out;
}
const buttonNamed = (node, label) => findAll(node, (n) => n.tag === 'button' && textOf(n) === label)[0];
const buttonStarting = (node, prefix) => findAll(node, (n) => n.tag === 'button' && textOf(n).startsWith(prefix))[0];
const fire = (node, type, value) => {
  if (value !== undefined) { node.value = value; node.checked = value; }
  (node.listeners[type] || []).forEach((fn) => fn({ target: node }));
};
const click = (node) => { assert.ok(node, 'botão existe'); assert.ok(!node.disabled, 'botão habilitado'); fire(node, 'click'); };
async function answer(res) {
  const next = pending.shift();
  assert.ok(next, 'há um pedido pendente');
  next.resolve(res);
  await flush();
  await flush();
  return next;
}

const TOPICS = [{ slug: 'toxicologia', name: 'Toxicologia' }];
let items = [];
const ctx = () => ({
  app, items, topics: TOPICS,
  refresh() { refreshes += 1; },
  rerender() {},
  open(id, notice) { opened.push({ id, notice }); },
});
let panel;
const mount = () => { panel = Lote.queuePanel(null, ctx()); return panel; };
const statusText = () => findAll(panel, (n) => n.attrs.role === 'status').map(textOf).join(' ');

const uuid = (n) => `a1b2c3d4-0000-4000-8000-${String(n).padStart(12, '0')}`;
const item = (n, over = {}) => Object.assign({
  id: uuid(n), title: `Artigo ${n}`, status: 'em_triagem', version: 1, topics: ['toxicologia'],
  isClinical: false, summaryText: null, summaryOrigin: null, summaryReviewedAt: null, sourceAbstract: 'Resumo do editor.',
}, over);

beforeEach(() => {
  Lote.reset();
  calls.length = 0;
  pending.length = 0;
  confirms.length = 0;
  opened.length = 0;
  refreshes = 0;
  token = 'tok-admin';
  items = [];
});

// ---------- Funções puras ----------

test('parseIdentifierList: apara, tira vazias e repetidas; até 150 linhas', () => {
  assert.deepEqual(Lote.parseIdentifierList(' 10.1000/A \r\n\n10.1000/a\n12345678\n').items, ['10.1000/A', '12345678']);
  assert.match(Lote.parseIdentifierList('  \n ').error, /ao menos um/);
  const many = Array.from({ length: 151 }, (_v, i) => String(i + 1)).join('\n');
  assert.match(Lote.parseIdentifierList(many).error, /Até 150 linhas/);
  assert.equal(Lote.parseIdentifierList(Array.from({ length: 150 }, (_v, i) => String(i + 1)).join('\n')).items.length, 150);
  assert.match(Lote.parseIdentifierList('x'.repeat(301)).error, /300 caracteres/);
});

test('classify: ok, já existia, limite (code ou texto), desligado e falha', () => {
  assert.deepEqual(Lote.classify({ success: true }), { kind: 'ok' });
  assert.deepEqual(Lote.classify({ success: false, message: 'Este artigo já está na Biblioteca.', articleId: 'x' }), { kind: 'dup' });
  assert.deepEqual(Lote.classify({ success: false, message: 'x', code: 'rate_limited' }), { kind: 'rate' });
  assert.deepEqual(Lote.classify({ success: false, message: 'Muitas tentativas. Aguarde.' }), { kind: 'rate' });
  assert.deepEqual(Lote.classify({ success: false, disabled: true, message: 'Desligado.' }), { kind: 'disabled', message: 'Desligado.' });
  assert.deepEqual(Lote.classify({ success: false, message: 'DOI inválido.' }), { kind: 'fail', message: 'DOI inválido.' });
  assert.equal(Lote.classify(null).kind, 'fail');
});

test('publishPlan: clínico e sem área ficam de fora; área escolhida e revisão do resumo de IA entram na sequência', () => {
  assert.deepEqual(Lote.publishPlan(item(1, { isClinical: true }), ''), { skip: 'aguarda revisor clínico' });
  assert.match(Lote.publishPlan(item(1, { topics: [] }), '').skip, /sem área/);
  assert.match(Lote.publishPlan(item(1, { status: 'aprovado' }), '').skip, /triagem/);
  assert.deepEqual(Lote.publishPlan(item(1), ''), { steps: ['aprovado', 'publicado'] });
  assert.deepEqual(Lote.publishPlan(item(1, { topics: [] }), 'toxicologia'), { steps: ['area', 'aprovado', 'publicado'] });
  assert.deepEqual(Lote.publishPlan(item(1, { summaryText: 'R.', summaryOrigin: 'ia' }), ''), { steps: ['aprovado', 'revisar', 'publicado'] });
  assert.deepEqual(Lote.publishPlan(item(1, { summaryText: 'R.', summaryOrigin: 'ia', summaryReviewedAt: '2026-10-01' }), ''), { steps: ['aprovado', 'publicado'] });
});

test('summaryTargets: só triagem sem resumo; sem resumo original fica de fora', () => {
  const out = Lote.summaryTargets([item(1), item(2, { summaryText: 'Já tem.' }), item(3, { sourceAbstract: null }), item(4, { status: 'aprovado' })]);
  assert.deepEqual(out.run.map((i) => i.title), ['Artigo 1']);
  assert.deepEqual(out.skip.map((i) => i.title), ['Artigo 3']);
});

test('progressText: processados, importados, já existiam e falhas', () => {
  const text = Lote.progressText({ kind: 'import', total: 5, done: 4, ok: 2, dup: 1, failed: [{}], skipped: [] });
  assert.equal(text, '4 de 5 processados · 2 importados · 1 já existia · 1 falhou');
});

// ---------- Importar lista ----------

async function startImport(lines) {
  mount();
  fire(findAll(panel, (n) => n.attrs.id === 'adm-lib-lote-lista')[0], 'input', lines.join('\n'));
  click(buttonNamed(panel, 'Importar'));
  await flush();
}

test('importa UMA por vez, conta já existia, lista falhas com motivo e tenta de novo só as que falharam', async () => {
  await startImport(['10.1000/a', '10.1000/b', '10.1000/c']);
  assert.equal(pending.length, 1, 'só um pedido por vez');
  assert.deepEqual(calls[0], { name: 'apiAdminLearnLibraryImport', token: 'tok-admin', input: { identifier: '10.1000/a' } });
  await answer({ success: true, article: { id: uuid(1) } });
  assert.equal(pending.length, 1);
  await answer({ success: false, message: 'Este artigo já está na Biblioteca.', articleId: uuid(9) });
  await answer({ success: false, message: 'Informe um DOI (ex.: 10.1000/xyz) ou um PMID (só números).' });
  assert.equal(pending.length, 0);
  assert.match(statusText(), /Concluído\. 3 de 3 processados · 1 importados · 1 já existia · 1 falhou/);
  assert.match(textOf(panel), /10\.1000\/c: Informe um DOI/);
  assert.equal(refreshes, 1, 'a fila é recarregada no fim');
  click(buttonNamed(panel, 'Tentar de novo as que falharam'));
  await flush();
  assert.deepEqual(pending.map((p) => p.input), [{ identifier: '10.1000/c' }]);
});

test('lista inválida não chama a API e mostra o erro', async () => {
  await startImport(['   ']);
  assert.equal(calls.length, 0);
  assert.match(textOf(panel), /ao menos um/);
});

test('limite do servidor: pausa com mensagem e "Continuar" repete o mesmo item', async () => {
  await startImport(['10.1000/a', '10.1000/b']);
  await answer({ success: false, message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.', code: 'rate_limited' });
  assert.equal(pending.length, 0, 'pausado: nada novo é pedido');
  assert.match(statusText(), /limite de importações por hora/);
  click(buttonNamed(panel, 'Continuar'));
  await flush();
  assert.deepEqual(pending.map((p) => p.input), [{ identifier: '10.1000/a' }]);
});

test('cancelar: a resposta que chega depois é ignorada e nada mais é pedido', async () => {
  await startImport(['10.1000/a', '10.1000/b']);
  click(buttonNamed(panel, 'Cancelar'));
  await answer({ success: true, article: { id: uuid(1) } });
  assert.equal(pending.length, 0);
  assert.match(statusText(), /Lote cancelado/);
  assert.equal(calls.length, 1);
});

// ---------- Gerar resumos ----------

test('gerar resumos: lê todas as páginas da triagem e pede um resumo por artigo sem resumo', async () => {
  mount();
  click(buttonNamed(panel, 'Gerar resumos'));
  await flush();
  assert.deepEqual(calls[0], { name: 'apiAdminLearnLibraryListQueue', token: 'tok-admin', input: { status: 'em_triagem', page: 1 } });
  await answer({ success: true, total: 3, items: [item(1), item(2, { summaryText: 'Feito.', summaryOrigin: 'curador' })] });
  assert.deepEqual(pending[0].input, { status: 'em_triagem', page: 2 });
  await answer({ success: true, total: 3, items: [item(3, { sourceAbstract: null })] });
  assert.deepEqual(pending.map((p) => [p.name, p.input]), [['apiAdminLearnLibraryGenerateSummary', { id: uuid(1) }]]);
  await answer({ success: true, article: item(1), clinical: false });
  assert.match(statusText(), /1 de 1 processados · 1 resumos gerados/);
  assert.match(textOf(panel), /Artigo 3: sem resumo original/);
});

test('gerar resumos com a flag desligada: para e mostra a mensagem do servidor', async () => {
  mount();
  click(buttonNamed(panel, 'Gerar resumos'));
  await flush();
  await answer({ success: true, total: 2, items: [item(1), item(2)] });
  await answer({ success: false, disabled: true, message: 'O resumo por IA está desligado.' });
  assert.equal(pending.length, 0);
  assert.match(statusText(), /desligado/);
});

// ---------- Aprovar e publicar ----------

test('aprovar e publicar: a mesma sequência do curador, com a versão de cada resposta; clínico fica de fora', async () => {
  const ai = item(1, { summaryText: 'Resumo IA.', summaryOrigin: 'ia', version: 3 });
  const clinical = item(2, { isClinical: true });
  const noTopic = item(3, { topics: [], version: 7 });
  items = [ai, clinical, noTopic];
  mount();
  [ai, clinical, noTopic].forEach((it) => fire(Lote.itemSelector(it, ctx()).children[0], 'change', true));
  fire(findAll(panel, (n) => n.attrs.id === 'adm-lib-lote-area')[0], 'change', 'toxicologia');
  click(buttonNamed(panel, 'Aprovar e publicar selecionados (3)'));
  assert.equal(confirms.length, 1);
  confirms[0].fn();
  await flush();
  await answer({ success: true, article: { version: 4 } });
  await answer({ success: true, article: { version: 5 } });
  await answer({ success: true, article: { version: 6, status: 'publicado' } });
  await answer({ success: true, article: { version: 8 } });
  await answer({ success: true, article: { version: 9 } });
  await answer({ success: true, article: { version: 10 } });
  assert.deepEqual(calls.map((c) => [c.name, c.input]), [
    ['apiAdminLearnLibrarySetStatus', { id: ai.id, version: 3, to: 'aprovado' }],
    ['apiAdminLearnLibraryReviewSummary', { id: ai.id, version: 4 }],
    ['apiAdminLearnLibrarySetStatus', { id: ai.id, version: 5, to: 'publicado' }],
    ['apiAdminLearnLibraryUpdateArticle', { id: noTopic.id, version: 7, fields: { topics: ['toxicologia'] } }],
    ['apiAdminLearnLibrarySetStatus', { id: noTopic.id, version: 8, to: 'aprovado' }],
    ['apiAdminLearnLibrarySetStatus', { id: noTopic.id, version: 9, to: 'publicado' }],
  ]);
  assert.match(statusText(), /2 publicados/);
  assert.match(statusText(), /atualizado à mão/);
  assert.match(textOf(panel), /Artigo 2: aguarda revisor clínico/);
  assert.ok(buttonStarting(panel, 'Aprovar e publicar selecionados (1)'), 'só o clínico continua marcado');
});

test('falha num passo: o motivo diz em qual passo e o lote segue para o próximo', async () => {
  items = [item(1), item(2)];
  mount();
  items.forEach((it) => fire(Lote.itemSelector(it, ctx()).children[0], 'change', true));
  click(buttonStarting(panel, 'Aprovar e publicar selecionados'));
  confirms[0].fn();
  await flush();
  await answer({ success: false, message: 'Outra pessoa alterou este artigo. Recarregue para ver a versão nova.' });
  assert.equal(pending[0].input.id, uuid(2));
  await answer({ success: true, article: { version: 2 } });
  await answer({ success: true, article: { version: 3 } });
  assert.match(textOf(panel), /Artigo 1: ao aprovar: Outra pessoa alterou/);
});

test('sem seleção o botão fica desabilitado; item fora da triagem não tem caixa', () => {
  mount();
  assert.equal(buttonStarting(panel, 'Aprovar e publicar selecionados (0)').disabled, true);
  assert.equal(Lote.itemSelector(item(1, { status: 'publicado' }), ctx()), null);
  const box = Lote.itemSelector(item(1), ctx());
  const input = box.children[0];
  const label = box.children[1];
  assert.equal(input.attrs.type, 'checkbox');
  assert.equal(label.attrs.for, input.attrs.id);
});

// ---------- Edição ----------

test('edição: "Gerar resumo" envia id e versão e reabre o artigo com o aviso; "Aprovar resumo de IA" registra a revisão', async () => {
  const article = item(1, { version: 5 });
  let box = Lote.editPanel(article, ctx());
  click(buttonNamed(box, 'Gerar resumo'));
  await flush();
  assert.deepEqual(calls[0], { name: 'apiAdminLearnLibraryGenerateSummary', token: 'tok-admin', input: { id: article.id, version: 5 } });
  await answer({ success: true, article, clinical: true });
  assert.equal(opened[0].id, article.id);
  assert.match(opened[0].notice, /revisor clínico/);

  const aiArticle = item(1, { version: 6, summaryText: 'Resumo IA.', summaryOrigin: 'ia' });
  box = Lote.editPanel(aiArticle, ctx());
  assert.match(textOf(box), /Resumo gerado por IA ainda não aprovado/);
  click(buttonNamed(box, 'Aprovar resumo de IA'));
  await flush();
  assert.deepEqual(calls[1].input, { id: aiArticle.id, version: 6 });
  await answer({ success: true, article: aiArticle });
  assert.match(opened[1].notice, /pode ser publicado/);
});

test('edição: erro do servidor fica no painel; resumo da curadoria não oferece "Gerar resumo"', async () => {
  const article = item(1);
  const box = Lote.editPanel(article, ctx());
  click(buttonNamed(box, 'Gerar resumo'));
  await flush();
  await answer({ success: false, message: 'Resumo original insuficiente' });
  assert.match(textOf(box), /Resumo original insuficiente/);
  const human = Lote.editPanel(item(2, { summaryText: 'Humano.', summaryOrigin: 'curador' }), ctx());
  assert.equal(buttonNamed(human, 'Gerar resumo'), undefined);
});

test('reset: o lote em andamento para e a resposta atrasada não muda nada', async () => {
  await startImport(['10.1000/a', '10.1000/b']);
  Lote.reset();
  await answer({ success: true, article: { id: uuid(1) } });
  assert.equal(pending.length, 0);
  assert.equal(calls.length, 1);
});

// ---------- Higiene e registro ----------

test('higiene: sem innerHTML, sem style, sem on*= no HTML; só ações apiAdminLearnLibrary*', () => {
  const src = read('admin-library-lote.js');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(src, /\.style\./);
  assert.doesNotMatch(src, /\bstyle\s*[=:]/);
  assert.doesNotMatch(src, /\bon[a-z]+\s*=/);
  const names = [...src.matchAll(/'(api\w+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 6);
  names.forEach((name) => assert.match(name, /^apiAdminLearnLibrary/));
});

test('registrado no index (antes de admin-library.js), no build e no service worker', () => {
  const html = read('index.html');
  const lote = html.indexOf('<script src="admin-library-lote.js" defer></script>');
  assert.ok(lote > 0);
  assert.ok(lote < html.indexOf('<script src="admin-library.js" defer></script>'));
  assert.match(read('scripts/build.js'), /'admin-library-lote\.js'/);
  assert.match(read('sw.js'), /'admin-library-lote\.js'/);
});

test('admin-library.js monta o lote: painel na fila, caixa por item, painel na edição e reset', () => {
  const src = read('admin-library.js');
  assert.match(src, /LaiftAdminLibraryLote/);
  ["loteNode('queuePanel')", "loteNode('itemSelector', item)", "loteNode('editPanel', article)", 'lote().reset()']
    .forEach((hook) => assert.ok(src.includes(hook), hook));
});
