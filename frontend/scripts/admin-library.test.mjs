/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aba "Artigos" da curadoria da Biblioteca (frontend/admin-library.js, B2-H7, CONTRATO-B2 §6):
// funções puras, subabas, cadastro por DOI/PMID, edição com versão, transições só as permitidas,
// motivo obrigatório, aviso de publicação, papel "Equipe", respostas fora de ordem, reset e higiene.
import { test, beforeEach } from 'node:test';
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
    value: '',
    checked: false,
    disabled: false,
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    addEventListener(type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn); },
    focus() { doc.activeElement = node; },
    querySelector(selector) { return findAll(node, (n) => n.attrs.id === selector.replace(/^#/, ''))[0] || null; },
    contains(target) { return node === target || node.children.some((child) => child.contains && child.contains(target)); },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}

const elements = new Map();
const doc = {
  activeElement: null,
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  },
};

/** Mesma regra de LaiftDom.h: string vira nó de texto; value/checked/disabled/selected viram propriedade. */
function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (/^on[A-Z]/.test(key) && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'className') node.attrs.class = value;
    else if (key === 'value') { node.value = String(value); node.setAttribute('value', value); }
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

const wiring = [];
const LaiftDom = {
  h,
  clear(node) { node.children = []; return node; },
  delegateActions(root, allowList) { wiring.push({ root, allowList }); },
};

const calls = [];
const pending = [];
const confirms = [];
let role = 'admin';
let token = 'tok-admin';
const app = {
  getState() { return { sessionToken: token }; },
  getIdentity() { return { fullName: 'Curadora', role }; },
  callApi(name, sessionToken, input) {
    calls.push({ name, token: sessionToken, input });
    return new Promise((resolve) => { pending.push({ name, resolve }); });
  },
  formatDate(iso) { return 'em ' + iso; },
  openConfirm(message, fn) { confirms.push({ message, fn }); },
};

const extrasCalls = [];
globalThis.window = {
  LaiftDom,
  LaiftLibraryCite: require('../library-cite.js'),
  LaiftAdminLibraryExtras: {
    render(tab, container) { extrasCalls.push({ tab, container }); },
    reset() {},
  },
};
globalThis.document = doc;
const Lib = require('../admin-library.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const root = () => doc.getElementById('admin-library-root');
const lastPending = () => pending[pending.length - 1];

function textOf(node) {
  if (!node) return '';
  return node.textContent + node.children.map(textOf).join('');
}
function findAll(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  node.children.forEach((child) => findAll(child, predicate, out));
  return out;
}
const byTag = (node, tag) => findAll(node, (n) => n.tag === tag);
const byId = (node, id) => findAll(node, (n) => n.attrs.id === id)[0];
const buttonNamed = (node, label) => byTag(node, 'button').find((b) => textOf(b) === label);
/** Abre o primeiro artigo da fila (botão do título com data-args ["open", id]). */
const openFirst = () => press(findAll(root(), (n) => n.attrs['data-args'] === JSON.stringify(['open', ID]))[0]);
const dataArgs = (node) => JSON.parse(node.attrs['data-args'] || '[]');

/** Clique: passa pela mesma ação que LaiftDom.delegateActions chamaria. */
function press(node) {
  assert.equal(node.attrs['data-action'], 'LaiftAdminLibrary.act', 'botão precisa usar a ação da curadoria');
  const [kind, payload] = dataArgs(node);
  Lib.act(kind, payload);
}
/** Digitação ou troca: atualiza o valor e dispara os ouvintes, como o navegador faria. */
function type(node, value, eventName = 'input') {
  node.value = value;
  (node.listeners[eventName] || []).forEach((fn) => fn({ target: node }));
}

const ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const ARTICLE = {
  id: ID, version: 4, doi: '10.1000/xyz', pmid: null, pmcid: null,
  title: 'Efeitos da cafeína', journal: 'Revista Teste', journalAbbrev: 'Rev Teste', pubYear: 2021,
  volume: '12', issue: '3', pages: '45-67', language: 'pt', articleType: 'artigo', topics: ['farmacologia'],
  license: 'cc-by', oaStatus: 'gold', isClinical: false, summaryText: null, sourceAbstract: 'Resumo original do editor.',
  metadataSources: ['crossref'], metadataFetchedAt: '2026-10-01T10:00:00Z', status: 'em_triagem',
  licenseConflict: false, clinicalReviewedAt: null,
};
const TOPICS = [{ slug: 'farmacologia', name: 'Farmacologia' }, { slug: 'toxicologia', name: 'Toxicologia' }];
const QUEUE = {
  success: true,
  items: [{ id: ID, title: 'Efeitos da cafeína', doi: '10.1000/xyz', pmid: null, pubYear: 2021, license: 'cc-by', licenseConflict: false, isClinical: true, clinicalReviewedAt: null }],
  counts: { em_triagem: 3, aprovado: 1, publicado: 5, rejeitado: 0, removido: 0 },
  topics: TOPICS, page: 1, total: 1,
};
const articleRes = (extra = {}) => Object.assign({ success: true, article: ARTICLE, allowedTransitions: ['aprovado', 'rejeitado'], favoriteCount: 0 }, extra);
const CLINICAL_ARTICLE = Object.assign({}, ARTICLE, { isClinical: true, summaryText: 'Dose de 500 mg ao dia.' });
const CLINICAL_ID = 'adm-lib-clinico';
const REASON_ID = 'adm-lib-motivo-clinico';
const REASON_LABEL = 'Motivo para desmarcar (3 a 300 caracteres)';
const SERVER_CLINICAL_MSG = 'Este resumo fala de conduta, dose ou interação: precisa de revisor clínico. Para desmarcar, informe o motivo (3 a 300 caracteres).';

beforeEach(() => {
  Lib.reset();
  calls.length = 0;
  pending.length = 0;
  confirms.length = 0;
  extrasCalls.length = 0;
  role = 'admin';
  token = 'tok-admin';
  doc.activeElement = null;
});

// ---------- Funções puras ----------

test('motivo de rejeição ou remoção: 3 a 300 caracteres depois de aparar', () => {
  assert.match(Lib.reasonError(''), /3 a 300 caracteres/);
  assert.match(Lib.reasonError('  ab  '), /3 a 300 caracteres/);
  assert.equal(Lib.reasonError('abc'), '');
  assert.equal(Lib.reasonError('x'.repeat(300)), '');
  assert.match(Lib.reasonError('x'.repeat(301)), /3 a 300 caracteres/);
  assert.match(Lib.reasonError(undefined), /3 a 300 caracteres/);
});

test('draftFromArticle usa os nomes de UpdateArticle (year, type), não os de coluna', () => {
  const draft = Lib.draftFromArticle(ARTICLE);
  assert.equal(draft.year, 2021);
  assert.equal(draft.type, 'artigo');
  assert.deepEqual(draft.topics, ['farmacologia']);
  assert.equal('pubYear' in draft, false);
  assert.equal('articleType' in draft, false);
});

test('changedFields manda só o que mudou; ano vazio vira null', () => {
  const base = Lib.draftFromArticle(ARTICLE);
  assert.deepEqual(Lib.changedFields(base, Object.assign({}, base)), {});
  assert.deepEqual(Lib.changedFields(base, Object.assign({}, base, { title: 'Outro' })), { title: 'Outro' });
  assert.deepEqual(Lib.changedFields(base, Object.assign({}, base, { topics: ['farmacologia', 'toxicologia'] })), { topics: ['farmacologia', 'toxicologia'] });
  assert.deepEqual(Lib.changedFields(base, Object.assign({}, base, { topics: ['farmacologia'] })), {});
  assert.deepEqual(Lib.changedFields(base, Object.assign({}, base, { year: null })), { year: null });
  assert.deepEqual(Lib.changedFields(base, Object.assign({}, base, { isClinical: true })), { isClinical: true });
});

test('importOutcome: sucesso, duplicata com articleId e erro comum', () => {
  assert.equal(Lib.importOutcome({ success: true, article: ARTICLE, warnings: ['aviso'] }).kind, 'ok');
  const dup = Lib.importOutcome({ success: false, message: 'Este artigo já está na Biblioteca.', articleId: ID });
  assert.equal(dup.kind, 'duplicate');
  assert.equal(dup.articleId, ID);
  assert.equal(Lib.importOutcome({ success: false, message: 'Falha' }).kind, 'error');
});

test('statusFilters: rótulo com contagem e zero quando a contagem falta', () => {
  const filters = Lib.statusFilters({ em_triagem: 3, aprovado: 1 });
  assert.deepEqual(filters.map((f) => f.label), ['Em triagem (3)', 'Aprovados (1)', 'Publicados (0)', 'Rejeitados (0)', 'Removidos (0)']);
  assert.equal(filters[0].status, 'em_triagem');
});

test('rótulos de tipo e licença vêm de LaiftLibraryCite (um dono só)', () => {
  const types = Lib.typeOptions();
  assert.equal(types.length, 8);
  assert.deepEqual(types[0], { value: 'artigo', label: 'Artigo original' });
  assert.equal(Lib.licenseOptions().find((o) => o.value === 'cc-by').label, 'CC BY');
});

test('rótulo de cada transição; "Equipe" só para admin', () => {
  assert.equal(Lib.transitionLabel('publicado'), 'Publicar');
  assert.equal(Lib.transitionLabel('removido'), 'Remover do catálogo');
  assert.equal(Lib.isAdminIdentity({ role: 'admin' }), true);
  assert.equal(Lib.isAdminIdentity({ role: 'member' }), false);
  assert.equal(Lib.isAdminIdentity(null), false);
});

/** A curadoria abre em 'Para revisar' (admin-library-publicar.js); estes testes cobrem a aba 'Editar artigos'. */
function loadArticles() {
  Lib.load(app);
  Lib.act('tab', 'artigos');
}

// ---------- Estados e subabas ----------

test('load: monta subabas e a fila "Em triagem" com contagens; aria-busy enquanto carrega', async () => {
  loadArticles();
  assert.equal(root().getAttribute('aria-busy'), 'true');
  assert.deepEqual(calls[0], { name: 'apiAdminLearnLibraryListQueue', token: 'tok-admin', input: { status: 'em_triagem' } });
  lastPending().resolve(QUEUE);
  await flush();
  assert.equal(root().getAttribute('aria-busy'), null);
  const all = textOf(root());
  ['Editar artigos', 'Sugestões', 'Coleções', 'Áreas', 'Equipe'].forEach((tab) => assert.match(all, new RegExp(tab)));
  assert.ok(buttonNamed(root(), 'Em triagem (3)'));
  assert.ok(buttonNamed(root(), 'Publicados (5)'));
  assert.match(textOf(root()), /Efeitos da cafeína/);
  assert.match(textOf(root()), /Clínico: aguarda revisor/);
});

test('sem sessão, load não chama a API', () => {
  token = null;
  loadArticles();
  assert.equal(calls.length, 0);
});

test('"Equipe" some para quem não é admin', async () => {
  role = 'curador';
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  assert.equal(buttonNamed(root(), 'Equipe'), undefined);
  assert.ok(buttonNamed(root(), 'Editar artigos'));
});

test('subaba Sugestões entrega o corpo ao módulo de extras (sem chamar a fila)', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  calls.length = 0;
  extrasCalls.length = 0;
  press(buttonNamed(root(), 'Sugestões'));
  assert.equal(calls.length, 0);
  assert.equal(extrasCalls.length, 1);
  assert.equal(extrasCalls[0].tab, 'sugestoes');
});

// ---------- Cadastro ----------

test('cadastro: envia o identificador e abre a edição do artigo criado', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  const field = byId(root(), 'adm-lib-id');
  type(field, '10.1000/xyz');
  press(buttonNamed(root(), 'Buscar dados'));
  assert.equal(lastPending().name, 'apiAdminLearnLibraryImport');
  assert.deepEqual(calls[calls.length - 1].input, { identifier: '10.1000/xyz' });
  assert.match(textOf(root()), /Consultando Crossref, Europe PMC e OpenAlex/);
  lastPending().resolve({ success: true, article: ARTICLE, warnings: [] });
  await flush();
  assert.equal(byId(root(), 'adm-lib-title').value, 'Efeitos da cafeína');
});

test('duplicata: mostra a mensagem e "Abrir o já cadastrado" leva ao artigo existente', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  type(byId(root(), 'adm-lib-id'), '10.1000/xyz');
  press(buttonNamed(root(), 'Buscar dados'));
  lastPending().resolve({ success: false, message: 'Este artigo já está na Biblioteca.', articleId: ID });
  await flush();
  assert.match(textOf(root()), /Este artigo já está na Biblioteca\./);
  press(buttonNamed(root(), 'Abrir o já cadastrado'));
  assert.equal(lastPending().name, 'apiAdminLearnLibraryGetArticle');
  assert.deepEqual(calls[calls.length - 1].input, { id: ID });
});

test('avisos do cadastro (warnings) aparecem em lista', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  type(byId(root(), 'adm-lib-id'), '10.1000/xyz');
  press(buttonNamed(root(), 'Buscar dados'));
  lastPending().resolve({ success: true, article: ARTICLE, warnings: ['Europe PMC não respondeu; resumo e tipo podem faltar.'] });
  await flush();
  const items = byTag(root(), 'li').map(textOf);
  assert.ok(items.includes('Europe PMC não respondeu; resumo e tipo podem faltar.'));
});

// ---------- Edição ----------

test('salvar envia version e só os campos alterados; depois recarrega o artigo', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes());
  await flush();
  type(byId(root(), 'adm-lib-title'), 'Efeitos da cafeína em adultos');
  press(buttonNamed(root(), 'Salvar alterações'));
  const sent = calls[calls.length - 1];
  assert.equal(sent.name, 'apiAdminLearnLibraryUpdateArticle');
  assert.deepEqual(sent.input, { id: ID, version: 4, fields: { title: 'Efeitos da cafeína em adultos' } });
});

test('edição: o resumo tem contador de caracteres e limite de 1200', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes());
  await flush();
  const area = byId(root(), 'adm-lib-resumo');
  assert.equal(area.attrs.maxlength, '1200');
  type(area, 'abc');
  assert.match(textOf(root()), /3\/1200/);
});

test('conflito de versão: mostra a mensagem do servidor e "Recarregar"; o texto digitado fica', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes());
  await flush();
  type(byId(root(), 'adm-lib-title'), 'Meu texto');
  press(buttonNamed(root(), 'Salvar alterações'));
  lastPending().resolve({ success: false, message: 'Outra pessoa alterou este artigo. Recarregue para ver a versão nova.' });
  await flush();
  const alert = findAll(root(), (n) => n.attrs.role === 'alert')[0];
  assert.match(textOf(alert), /Outra pessoa alterou este artigo\. Recarregue/);
  assert.equal(byId(root(), 'adm-lib-title').value, 'Meu texto');
  press(buttonNamed(alert, 'Recarregar'));
  assert.equal(lastPending().name, 'apiAdminLearnLibraryGetArticle');
});

test('só aparecem os botões de allowedTransitions', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes({ allowedTransitions: ['aprovado', 'rejeitado'] }));
  await flush();
  assert.ok(buttonNamed(root(), 'Aprovar referência'));
  assert.ok(buttonNamed(root(), 'Rejeitar'));
  assert.equal(buttonNamed(root(), 'Publicar'), undefined);
  assert.equal(buttonNamed(root(), 'Remover do catálogo'), undefined);
});

test('rejeitar com motivo curto não chama a API; com motivo válido confirma e envia version e reason', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes());
  await flush();
  press(buttonNamed(root(), 'Rejeitar'));
  assert.equal(calls.filter((c) => c.name === 'apiAdminLearnLibrarySetStatus').length, 0);
  type(byId(root(), 'adm-lib-motivo'), 'ab');
  press(buttonNamed(root(), 'Confirmar rejeição'));
  assert.match(textOf(root()), /3 a 300 caracteres/);
  assert.equal(confirms.length, 0);
  type(byId(root(), 'adm-lib-motivo'), 'Duplicado de outro cadastro');
  press(buttonNamed(root(), 'Confirmar rejeição'));
  assert.equal(confirms.length, 1);
  confirms[0].fn();
  const sent = calls[calls.length - 1];
  assert.equal(sent.name, 'apiAdminLearnLibrarySetStatus');
  assert.deepEqual(sent.input, { id: ID, version: 4, to: 'rejeitado', reason: 'Duplicado de outro cadastro' });
});

// ---------- Desmarcar "clínico" pede motivo ----------

/** Marca ou desmarca a caixa, como o navegador dispara o evento change. */
function check(node, checked) {
  node.checked = checked;
  (node.listeners.change || []).forEach((fn) => fn({ target: node }));
}

async function openClinical() {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes({ article: CLINICAL_ARTICLE }));
  await flush();
}

const lastSave = () => calls.filter((c) => c.name === 'apiAdminLearnLibraryUpdateArticle').pop();

test('desmarcar "clínico" mostra o campo de motivo (label visível, 300 caracteres); some ao marcar de novo', async () => {
  await openClinical();
  assert.equal(byId(root(), REASON_ID), undefined);
  check(byId(root(), CLINICAL_ID), false);
  const field = byId(root(), REASON_ID);
  assert.ok(field, 'campo de motivo aparece ao desmarcar');
  assert.equal(field.tag, 'input');
  assert.equal(field.attrs.maxlength, '300');
  const label = byTag(root(), 'label').find((l) => l.attrs.for === REASON_ID);
  assert.equal(textOf(label), REASON_LABEL);
  check(byId(root(), CLINICAL_ID), true);
  assert.equal(byId(root(), REASON_ID), undefined);
});

test('sem desmarcar "clínico", nenhum reason é enviado', async () => {
  await openClinical();
  type(byId(root(), 'adm-lib-title'), 'Efeitos da cafeína em adultos');
  press(buttonNamed(root(), 'Salvar alterações'));
  assert.deepEqual(lastSave().input, { id: ID, version: 4, fields: { title: 'Efeitos da cafeína em adultos' } });
  assert.equal('reason' in lastSave().input, false);
});

test('desmarcar envia reason (aparado) junto de version e fields', async () => {
  await openClinical();
  check(byId(root(), CLINICAL_ID), false);
  type(byId(root(), REASON_ID), '  Texto só descreve o estudo.  ');
  press(buttonNamed(root(), 'Salvar alterações'));
  assert.deepEqual(lastSave().input, {
    id: ID, version: 4, fields: { isClinical: false }, reason: 'Texto só descreve o estudo.',
  });
});

test('recusa por falta de motivo: a mensagem do servidor fica junto ao campo e o foco vai para ele', async () => {
  await openClinical();
  check(byId(root(), CLINICAL_ID), false);
  press(buttonNamed(root(), 'Salvar alterações'));
  assert.equal(lastSave().input.reason, undefined);
  lastPending().resolve({ success: false, message: SERVER_CLINICAL_MSG });
  await flush();
  const field = byId(root(), REASON_ID);
  assert.ok(field, 'o campo continua na tela');
  assert.match(textOf(root()), /precisa de revisor clínico/);
  assert.equal(doc.activeElement, field);
});

test('outra falha ao salvar (conflito de versão) segue no aviso geral com "Recarregar"', async () => {
  await openClinical();
  check(byId(root(), CLINICAL_ID), false);
  press(buttonNamed(root(), 'Salvar alterações'));
  lastPending().resolve({ success: false, message: 'Outra pessoa alterou este artigo. Recarregue para ver a versão nova.' });
  await flush();
  assert.ok(buttonNamed(root(), 'Recarregar'));
  assert.match(textOf(root()), /Outra pessoa alterou/);
});

test('publicar: depois do sucesso o aviso diz que o artigo aparece em /biblioteca em até 1 minuto', async () => {
  loadArticles();
  lastPending().resolve(QUEUE);
  await flush();
  openFirst();
  lastPending().resolve(articleRes({ allowedTransitions: ['publicado'] }));
  await flush();
  press(buttonNamed(root(), 'Publicar'));
  assert.equal(confirms.length, 1);
  confirms[0].fn();
  assert.deepEqual(calls[calls.length - 1].input, { id: ID, version: 4, to: 'publicado' });
  lastPending().resolve({ success: true, article: Object.assign({}, ARTICLE, { status: 'publicado' }) });
  await flush();
  lastPending().resolve(articleRes({ article: Object.assign({}, ARTICLE, { status: 'publicado' }), allowedTransitions: [] }));
  await flush();
  assert.match(textOf(root()), /O artigo aparece no catálogo público \(\/biblioteca\) em até 1 minuto/);
  assert.doesNotMatch(textOf(root()), /Run workflow/);
});

// ---------- Ordem das respostas, reset e ligação ----------

test('resposta de um pedido antigo é ignorada quando outro mais novo já chegou', async () => {
  loadArticles();
  Lib.act('status', 'aprovado');
  assert.equal(pending.length, 2);
  pending[1].resolve({ success: true, items: [{ id: 'n', title: 'NOVO' }], counts: {}, topics: [] });
  await flush();
  pending[0].resolve({ success: true, items: [{ id: 'v', title: 'VELHO' }], counts: {}, topics: [] });
  await flush();
  assert.match(textOf(root()), /NOVO/);
  assert.doesNotMatch(textOf(root()), /VELHO/);
});

test('reset: esvazia a seção, tira aria-busy e a resposta que chega depois não reaparece', async () => {
  loadArticles();
  assert.equal(root().getAttribute('aria-busy'), 'true');
  Lib.reset();
  assert.equal(root().children.length, 0);
  assert.equal(root().getAttribute('aria-busy'), null);
  lastPending().resolve(QUEUE);
  await flush();
  assert.equal(root().children.length, 0);
});

test('depois do reset, uma ação não chama a API sem sessão', () => {
  loadArticles();
  Lib.reset();
  token = null;
  calls.length = 0;
  Lib.act('reload');
  assert.equal(calls.length, 0);
});

test('a delegação de ações é ligada uma vez, com a lista fechada da curadoria', () => {
  loadArticles();
  loadArticles();
  assert.equal(wiring.length, 1);
  assert.deepEqual(wiring[0].allowList, ['LaiftAdminLibrary.act']);
  assert.equal(wiring[0].root, root());
});

// ---------- Higiene ----------

test('higiene: sem innerHTML, sem .style., sem on*= no HTML; só ações apiAdminLearnLibrary*', () => {
  const src = read('admin-library.js');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.doesNotMatch(src, /\.style\./);
  assert.doesNotMatch(src, /\bstyle\s*=/);
  assert.doesNotMatch(src, /\bon[a-z]+\s*=/);
  const names = [...src.matchAll(/'(apiAdmin\w+)'/g)].map((m) => m[1]);
  assert.ok(names.length >= 5);
  names.forEach((name) => assert.match(name, /^apiAdminLearnLibrary/));
});

test('interface pública: load, reset e act (a ação da delegação)', () => {
  assert.equal(typeof Lib.load, 'function');
  assert.equal(typeof Lib.reset, 'function');
  assert.equal(typeof Lib.act, 'function');
});
