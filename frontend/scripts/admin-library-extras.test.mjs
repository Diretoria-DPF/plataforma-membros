/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Subabas "Sugestões", "Coleções", "Áreas" e "Equipe" do admin da Biblioteca (frontend/admin-library-extras.js,
// CONTRATO-B2 §6): funções puras, estados e recarga, editor de coleção, papéis, respostas fora de ordem,
// reset e higiene (sem innerHTML, sem handler inline, sem estilo inline).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);

const doc = { activeElement: null };

/** Nó mínimo; innerHTML lança. Comportamento igual ao de LaiftDom.h (safe-dom.js). */
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
    hidden: false,
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    addEventListener(type, fn) { (node.listeners[type] = node.listeners[type] || []).push(fn); },
    focus() { doc.activeElement = node; },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}

/** Mesma forma de LaiftDom.h: string vira nó de texto, on<Evento> vira listener, boolean vira propriedade. */
function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') node.attrs.class = value;
    else if (/^on[A-Z]/.test(key) && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') node.value = String(value);
    else if (typeof value === 'boolean') node[key] = value;
    else node.setAttribute(key, value);
  });
  [].concat(children === undefined ? [] : children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'object') node.appendChild(child);
    else {
      const text = makeNode('#text');
      text.textContent = String(child);
      node.appendChild(text);
    }
  });
  // Como no DOM real: um select sem value marcado vale a primeira opção.
  if (tag === 'select' && !node.value && node.children.length) node.value = node.children[0].value;
  return node;
}

const LaiftDom = {
  h,
  clear(node) { node.children = []; return node; },
  delegateActions() {},
};

globalThis.window = { LaiftDom };
globalThis.document = { createElement: makeNode };
const Ext = require('../admin-library-extras.js');

// ---------- Ajudantes de teste ----------

const flush = () => new Promise((resolve) => setImmediate(resolve));

function allNodes(node, out = []) {
  out.push(node);
  node.children.forEach((child) => allNodes(child, out));
  return out;
}
function textOf(node) {
  if (!node) return '';
  return node.textContent + node.children.map(textOf).join('');
}
function fire(node, type) {
  if (node.disabled) return;
  (node.listeners[type] || []).forEach((fn) => fn({ target: node }));
}
const byId = (root, id) => allNodes(root).find((n) => n.attrs.id === id);
const buttonNamed = (root, label) => allNodes(root).find((n) => n.tag === 'button' && textOf(n).trim() === label);
function clickButton(root, label) {
  const button = buttonNamed(root, label);
  assert.ok(button, `botão "${label}" existe`);
  fire(button, 'click');
}
function makeApp({ role = 'admin', token = 'tok-admin' } = {}) {
  const app = {
    calls: [],
    pending: [],
    getState() { return { sessionToken: token }; },
    getIdentity() { return { fullName: 'Dani', role }; },
    formatDate(iso) { return iso; },
    callApi(name, sessionToken, input) {
      app.calls.push({ name, token: sessionToken, input });
      return new Promise((resolve) => { app.pending.push({ name, done: false, resolve }); });
    },
  };
  return app;
}
function respondAt(app, index, res) {
  const entry = app.pending[index];
  entry.done = true;
  entry.resolve(res);
  return flush();
}
function respond(app, res, name) {
  const index = app.pending.findIndex((p) => !p.done && (!name || p.name === name));
  assert.ok(index >= 0, `há pedido pendente${name ? ' de ' + name : ''}`);
  return respondAt(app, index, res);
}

const S1 = '5d1f0c2e-1111-4a2b-8c3d-000000000001';
const C1 = '7a9e2b4c-2222-4d3e-9f1a-000000000002';
const A1 = '3f2b8c1a-3333-4f60-a7b5-000000000003';
const A2 = '3f2b8c1a-4444-4f60-a7b5-000000000004';
const A3 = '3f2b8c1a-5555-4f60-a7b5-000000000005';

let box;
beforeEach(() => {
  Ext.reset();
  box = makeNode('section');
  doc.activeElement = null;
});

// ---------- Funções puras ----------

test('slug: só minúsculas, números e hífens entre trechos (regra do CONTRATO-B2 §6)', () => {
  assert.equal(Ext.isValidSlug('anatomia-basica'), true);
  assert.equal(Ext.isValidSlug('toxicologia2'), true);
  assert.equal(Ext.isValidSlug('Anatomia'), false);
  assert.equal(Ext.isValidSlug('-x'), false);
  assert.equal(Ext.isValidSlug('x--y'), false);
  assert.equal(Ext.isValidSlug('x y'), false);
  assert.equal(Ext.isValidSlug('x-'), false);
  assert.equal(Ext.isValidSlug(''), false);
  assert.equal(Ext.isValidSlug(undefined), false);
});

test('motivo da recusa: 3 a 300 caracteres depois de aparar espaços', () => {
  assert.equal(Ext.isValidReason('  ab  '), false);
  assert.equal(Ext.isValidReason('abc'), true);
  assert.equal(Ext.isValidReason('a'.repeat(300)), true);
  assert.equal(Ext.isValidReason('a'.repeat(301)), false);
  assert.equal(Ext.isValidReason(null), false);
});

test('e-mail e ordem: formatos aceitos e recusados antes de enviar', () => {
  assert.equal(Ext.isValidEmail('pessoa@exemplo.com.br'), true);
  assert.equal(Ext.isValidEmail('sem-arroba.com'), false);
  assert.equal(Ext.isValidEmail(''), false);
  assert.equal(Ext.parseSortOrder(''), 0);
  assert.equal(Ext.parseSortOrder('3'), 3);
  assert.equal(Ext.parseSortOrder('-1'), null);
  assert.equal(Ext.parseSortOrder('1.5'), null);
  assert.equal(Ext.parseSortOrder('abc'), null);
});

test('normalizeSuggestion: copia só os campos do contrato; nome e e-mail de quem sugeriu não passam', () => {
  const out = Ext.normalizeSuggestion({
    id: S1, identifierKind: 'doi', identifier: '10.1000/xyz', note: 'Bom', status: 'sugerido',
    createdAt: '2026-10-09T10:00:00Z', decidedAt: null, articleId: null,
    requestedByName: 'Ana Souza', requestedByEmail: 'ana@example.com',
  });
  assert.equal(out.identifierKind, 'DOI');
  assert.equal('requestedByName' in out, false);
  assert.equal('requestedByEmail' in out, false);
  assert.doesNotMatch(JSON.stringify(out), /Ana Souza|ana@example/);
});

test('decisionNotice: duplicado, aceite comum e recusa têm textos diferentes', () => {
  assert.match(Ext.decisionNotice('aceitar', { suggestion: { status: 'duplicado' } }), /já estava na Biblioteca/);
  assert.match(Ext.decisionNotice('aceitar', { suggestion: { status: 'aceito' } }), /Sugestão aceita/);
  assert.equal(Ext.decisionNotice('recusar', {}), 'Sugestão recusada.');
});

test('validateCollection: avisa slug, título, quantidade de artigos e estado antes de enviar', () => {
  const ok = { slug: 'anatomia-basica', title: 'Anatomia', description: '', status: 'rascunho', sortOrder: 0, articleIds: [A1] };
  assert.equal(Ext.validateCollection(ok), null);
  assert.match(Ext.validateCollection({ ...ok, slug: 'Anatomia Básica' }), /letras minúsculas/);
  assert.match(Ext.validateCollection({ ...ok, title: '' }), /título/);
  assert.match(Ext.validateCollection({ ...ok, status: 'arquivada' }), /rascunho ou publicada/);
  assert.match(Ext.validateCollection({ ...ok, articleIds: Array.from({ length: 201 }, (_, i) => `id-${i}`) }), /até 200 artigos/);
});

test('collectionPayload: inclui id e version só ao editar; articleIds na ordem recebida', () => {
  const draft = { slug: 'a-b', title: 'T', description: '', status: 'publicada', sortOrder: 2, articleIds: [A2, A1] };
  assert.deepEqual(Ext.collectionPayload(draft, null), { slug: 'a-b', title: 'T', description: '', status: 'publicada', sortOrder: 2, articleIds: [A2, A1] });
  assert.deepEqual(Ext.collectionPayload(draft, { id: C1, version: 4 }).version, 4);
  assert.equal(Ext.collectionPayload(draft, { id: C1, version: 4 }).id, C1);
});

test('toggleSelection é imutável, não duplica e mantém a ordem de marcação', () => {
  const original = [A1];
  const added = Ext.toggleSelection(original, A2, true);
  assert.deepEqual(added, [A1, A2]);
  assert.deepEqual(original, [A1], 'a lista original não muda');
  assert.deepEqual(Ext.toggleSelection([A1, A2], A1, false), [A2]);
  assert.deepEqual(Ext.toggleSelection([A1], A1, true), [A1]);
});

test('matchesQuery: sem acento, sem caixa, todos os termos (AND)', () => {
  const item = { title: 'Anatomia Básica do Fígado', journal: 'Revista Médica', year: 2021 };
  assert.equal(Ext.matchesQuery(item, ''), true);
  assert.equal(Ext.matchesQuery(item, 'ANATOMIA basica'), true);
  assert.equal(Ext.matchesQuery(item, 'figado revista'), true);
  assert.equal(Ext.matchesQuery(item, 'figado cardiologia'), false);
});

test('validateArea: slug, nome e ordem', () => {
  assert.equal(Ext.validateArea({ slug: 'toxicologia', name: 'Toxicologia', sortOrder: 3 }), null);
  assert.match(Ext.validateArea({ slug: 'Tox', name: 'Toxicologia', sortOrder: 3 }), /letras minúsculas/);
  assert.match(Ext.validateArea({ slug: 'tox', name: '', sortOrder: 3 }), /nome/);
  assert.match(Ext.validateArea({ slug: 'tox', name: 'Tox', sortOrder: null }), /inteiro/);
});

// ---------- Sugestões ----------

test('sugestões: lista pendentes sem nome nem e-mail de quem sugeriu, mesmo que o payload traga', async () => {
  const app = makeApp();
  Ext.render('sugestoes', box, app);
  assert.equal(app.calls[0].name, 'apiAdminLearnLibraryListSuggestions');
  assert.deepEqual(app.calls[0].input, { status: 'sugerido' });
  await respond(app, {
    success: true,
    total: 1,
    items: [{
      id: S1, identifierKind: 'doi', identifier: '10.1000/xyz', note: 'Muito citado', status: 'sugerido',
      createdAt: '2026-10-09T10:00:00Z', decidedAt: null, articleId: null,
      requestedByName: 'Ana Souza', requestedByEmail: 'ana@example.com',
    }],
  });
  const text = textOf(box);
  assert.match(text, /10\.1000\/xyz/);
  assert.match(text, /Muito citado/);
  assert.doesNotMatch(text, /Ana Souza|ana@example\.com/);
});

test('"Aceitar e buscar dados" chama DecideSuggestion com decision aceitar e sem motivo; depois recarrega', async () => {
  const app = makeApp();
  Ext.render('sugestoes', box, app);
  await respond(app, { success: true, items: [{ id: S1, identifierKind: 'pmid', identifier: '123456', status: 'sugerido' }] });
  clickButton(box, 'Aceitar e buscar dados');
  assert.deepEqual(app.calls[1], {
    name: 'apiAdminLearnLibraryDecideSuggestion',
    token: 'tok-admin',
    input: { id: S1, decision: 'aceitar' },
  });
  await respond(app, { success: true, suggestion: { status: 'aceito' }, article: { id: 'x' } });
  assert.equal(app.calls[2].name, 'apiAdminLearnLibraryListSuggestions');
  await respond(app, { success: true, items: [] });
  assert.match(textOf(box), /Sugestão aceita/);
});

test('"Recusar" exige motivo: sem motivo não envia; com motivo envia decision recusar e reason', async () => {
  const app = makeApp();
  Ext.render('sugestoes', box, app);
  await respond(app, { success: true, items: [{ id: S1, identifierKind: 'doi', identifier: '10.1000/xyz', status: 'sugerido' }] });
  clickButton(box, 'Recusar');
  const reasonInput = allNodes(box).find((n) => n.tag === 'input' && (n.attrs.id || '').startsWith('adm-lib-motivo-'));
  assert.ok(reasonInput, 'campo de motivo existe');
  clickButton(box, 'Confirmar recusa');
  assert.equal(app.calls.length, 1, 'sem motivo não chama a API');
  assert.match(textOf(box), /Informe o motivo da recusa/);
  reasonInput.value = 'Duplicada de outro cadastro';
  clickButton(box, 'Confirmar recusa');
  assert.deepEqual(app.calls[1].input, { id: S1, decision: 'recusar', reason: 'Duplicada de outro cadastro' });
});

// ---------- Coleções ----------

const COLLECTION_ROW = {
  id: C1, slug: 'anatomia-basica', title: 'Anatomia básica', description: '', status: 'rascunho',
  sortOrder: 1, version: 3, articleIds: [A1, A2],
};

test('coleções: lista com título, estado e contagem', async () => {
  const app = makeApp();
  Ext.render('colecoes', box, app);
  assert.equal(app.calls[0].name, 'apiAdminLearnLibraryListCollections');
  await respond(app, {
    success: true,
    collections: [COLLECTION_ROW, { ...COLLECTION_ROW, id: 'c2', title: 'Publicada agora', status: 'publicada', articleIds: [] }],
  });
  const text = textOf(box);
  assert.match(text, /Anatomia básica/);
  assert.match(text, /2 artigos/);
  assert.match(text, /Rascunho/);
  assert.match(text, /Publicada/);
  assert.match(text, /0 artigos/);
});

test('editor: envia articleIds na ordem em que foram marcados e a version da coleção', async () => {
  const app = makeApp();
  Ext.render('colecoes', box, app);
  await respond(app, { success: true, collections: [{ ...COLLECTION_ROW, articleIds: [A1] }] });
  clickButton(box, 'Editar');
  assert.equal(app.calls[1].name, 'apiAdminLearnLibraryListQueue');
  assert.deepEqual(app.calls[1].input, { status: 'publicado' });
  await respond(app, {
    success: true,
    items: [
      { id: A1, title: 'Artigo um', journal: 'Revista A', year: 2021 },
      { id: A2, title: 'Artigo dois', journal: 'Revista B', year: 2020 },
      { id: A3, title: 'Artigo três', journal: 'Revista C', year: 2019 },
    ],
  });
  const checkboxFor = (title) => allNodes(box).find((n) => n.tag === 'label' && textOf(n).includes(title)).children.find((c) => c.tag === 'input');
  checkboxFor('Artigo três').checked = true;
  fire(checkboxFor('Artigo três'), 'change');
  checkboxFor('Artigo dois').checked = true;
  fire(checkboxFor('Artigo dois'), 'change');
  clickButton(box, 'Salvar coleção');
  assert.deepEqual(app.calls[2], {
    name: 'apiAdminLearnLibrarySaveCollection',
    token: 'tok-admin',
    input: {
      id: C1, version: 3, slug: 'anatomia-basica', title: 'Anatomia básica', description: '',
      status: 'rascunho', sortOrder: 1, articleIds: [A1, A3, A2],
    },
  });
});

test('slug inválido é avisado antes de enviar e nada vai para a API', async () => {
  const app = makeApp();
  Ext.render('colecoes', box, app);
  await respond(app, { success: true, collections: [] });
  clickButton(box, 'Nova coleção');
  await respond(app, { success: true, items: [] }, 'apiAdminLearnLibraryListQueue');
  byId(box, 'adm-col-slug').value = 'Anatomia Básica!';
  byId(box, 'adm-col-titulo').value = 'Nova';
  clickButton(box, 'Salvar coleção');
  assert.equal(app.calls.filter((c) => c.name === 'apiAdminLearnLibrarySaveCollection').length, 0);
  assert.match(textOf(box), /letras minúsculas/);
});

// ---------- Áreas ----------

test('áreas: lista as áreas e salva por slug (SaveTopic com slug, name e sortOrder)', async () => {
  const app = makeApp();
  Ext.render('areas', box, app);
  assert.equal(app.calls[0].name, 'apiAdminLearnLibraryListQueue');
  await respond(app, {
    success: true,
    items: [], counts: {}, total: 0,
    topics: [{ slug: 'farmacocinetica', name: 'Farmacocinética', sortOrder: 2 }],
  });
  assert.match(textOf(box), /Farmacocinética/);
  byId(box, 'adm-area-slug').value = 'toxicologia';
  byId(box, 'adm-area-nome').value = 'Toxicologia';
  byId(box, 'adm-area-ordem').value = '3';
  clickButton(box, 'Salvar área');
  assert.deepEqual(app.calls[1], {
    name: 'apiAdminLearnLibrarySaveTopic',
    token: 'tok-admin',
    input: { slug: 'toxicologia', name: 'Toxicologia', sortOrder: 3 },
  });
});

test('área com slug inválido não é enviada', async () => {
  const app = makeApp();
  Ext.render('areas', box, app);
  await respond(app, { success: true, topics: [] });
  byId(box, 'adm-area-slug').value = 'Tox Clínica';
  byId(box, 'adm-area-nome').value = 'Toxicologia';
  clickButton(box, 'Salvar área');
  assert.equal(app.calls.filter((c) => c.name === 'apiAdminLearnLibrarySaveTopic').length, 0);
  assert.match(textOf(box), /letras minúsculas/);
});

// ---------- Equipe ----------

test('equipe: só para admin; curador não chama a API e vê o aviso', () => {
  const app = makeApp({ role: 'curador' });
  Ext.render('equipe', box, app);
  assert.equal(app.calls.length, 0);
  assert.match(textOf(box), /Só administradores/);
});

test('equipe (admin): lista quem tem papel e "Dar acesso" envia { email, role, grant: true }', async () => {
  const app = makeApp();
  Ext.render('equipe', box, app);
  assert.equal(app.calls[0].name, 'apiAdminLearnLibraryListStaff');
  const staff = [{ profileId: 'p1', fullName: 'Ana Souza', role: 'curador', grantedAt: '2026-10-01T00:00:00Z' }];
  await respond(app, { success: true, staff });
  assert.match(textOf(box), /Ana Souza/);
  assert.match(textOf(box), /Curador/);
  byId(box, 'adm-equipe-email').value = 'novo@exemplo.com.br';
  byId(box, 'adm-equipe-papel').value = 'revisor_clinico';
  clickButton(box, 'Dar acesso');
  assert.deepEqual(app.calls[1], {
    name: 'apiAdminLearnLibrarySetStaff',
    token: 'tok-admin',
    input: { email: 'novo@exemplo.com.br', role: 'revisor_clinico', grant: true },
  });
  await respond(app, { success: true, staff: [...staff, { profileId: 'p2', fullName: 'Novo', role: 'revisor_clinico' }] });
  assert.match(textOf(box), /Acesso dado\./);
});

test('equipe: e-mail inválido não é enviado; "Tirar acesso" manda grant false', async () => {
  const app = makeApp();
  Ext.render('equipe', box, app);
  await respond(app, { success: true, staff: [] });
  byId(box, 'adm-equipe-email').value = 'nao-e-email';
  clickButton(box, 'Tirar acesso');
  assert.equal(app.calls.filter((c) => c.name === 'apiAdminLearnLibrarySetStaff').length, 0);
  assert.match(textOf(box), /Informe o e-mail/);
  byId(box, 'adm-equipe-email').value = 'saida@exemplo.com.br';
  clickButton(box, 'Tirar acesso');
  assert.deepEqual(app.calls[1].input, { email: 'saida@exemplo.com.br', role: 'curador', grant: false });
});

// ---------- Estados, respostas fora de ordem e reset ----------

test('erro ao carregar: mensagem da API como texto, aviso em role="alert" e "Tentar de novo" que repete o pedido', async () => {
  const app = makeApp();
  Ext.render('sugestoes', box, app);
  await respond(app, { success: false, message: 'Você não tem acesso a esta lista.' });
  const alert = allNodes(box).find((n) => n.attrs.role === 'alert');
  assert.ok(alert, 'há um alerta');
  assert.match(textOf(box), /Você não tem acesso a esta lista\./);
  clickButton(box, 'Tentar de novo');
  assert.equal(app.calls[1].name, 'apiAdminLearnLibraryListSuggestions');
});

test('respostas fora de ordem: a lista de uma aba anterior não aparece depois de trocar de aba', async () => {
  const app = makeApp();
  Ext.render('sugestoes', box, app);
  Ext.render('colecoes', box, app);
  await respondAt(app, 1, { success: true, collections: [{ ...COLLECTION_ROW, title: 'Coleção nova' }] });
  await respondAt(app, 0, { success: true, items: [{ id: S1, identifierKind: 'doi', identifier: '10.9999/velha', status: 'sugerido' }] });
  assert.match(textOf(box), /Coleção nova/);
  assert.doesNotMatch(textOf(box), /10\.9999\/velha/);
});

test('reset: a resposta que chega depois não reaparece, a caixa esvazia e aria-busy sai', async () => {
  const app = makeApp();
  Ext.render('sugestoes', box, app);
  assert.equal(box.attrs['aria-busy'], 'true');
  Ext.reset();
  await respond(app, { success: true, items: [{ id: S1, identifierKind: 'doi', identifier: '10.1/x', status: 'sugerido' }] });
  assert.equal(textOf(box), '');
  assert.equal(box.attrs['aria-busy'], undefined);
});

test('sem sessão, nada é chamado e o erro de sessão aparece', () => {
  const app = makeApp({ token: '' });
  Ext.render('sugestoes', box, app);
  assert.equal(app.calls.length, 0);
  return flush().then(() => {
    assert.match(textOf(box), /Sua sessão expirou/);
  });
});

test('o módulo exporta render e reset para o admin-library.js (window.LaiftAdminLibraryExtras)', () => {
  assert.equal(typeof Ext.render, 'function');
  assert.equal(typeof Ext.reset, 'function');
});

// ---------- Higiene ----------

test('higiene: sem innerHTML, outerHTML, insertAdjacentHTML, style inline, on*= no HTML, console ou @media próprio', () => {
  const src = read('admin-library-extras.js');
  assert.doesNotMatch(src, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(src, /\.style\.|style\s*=\s*["'{]/);
  assert.doesNotMatch(src, /\bon[a-z]+\s*=\s*["']/);
  assert.doesNotMatch(src, /console\.(log|warn|error)/);
  assert.doesNotMatch(src, /@media/);
  assert.ok(src.split('\n').length < 800, 'arquivo abaixo do teto de 800 linhas');
});
