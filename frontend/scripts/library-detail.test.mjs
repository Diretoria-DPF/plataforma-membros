/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Ficha do artigo no painel da Biblioteca (frontend/library-detail.js, CONTRATO-B2 §4.1 e §4.2):
// funções puras, abertura e foco, voltar, origem do resumo, links validados, favorito, citação
// (ABNT e Vancouver) com cópia, estados de erro, respostas fora de ordem, reset e higiene.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);

/** DOM mínimo; innerHTML lança. textContent como no DOM real: lê o texto dos filhos e, ao escrever, troca os filhos. */
function makeNode(tag, value) {
  const node = {
    tag,
    value: value || '',
    children: [],
    attrs: {},
    parentNode: null,
    appendChild(child) { child.parentNode = node; node.children.push(child); return child; },
    setAttribute(key, val) { node.attrs[key] = String(val); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    focus() { doc.activeElement = node; },
    contains(target) { return node === target || node.children.some((child) => child.contains(target)); },
    querySelector(selector) {
      const m = /^\[([\w-]+)="([^"]*)"\]$/.exec(selector);
      if (!m) return null;
      return findAll(node, (n) => n.attrs[m[1]] === m[2])[0] || null;
    },
  };
  Object.defineProperty(node, 'textContent', {
    get() { return node.tag === '#text' ? node.value : node.children.map((c) => c.textContent).join(''); },
    set(v) {
      if (node.tag === '#text') { node.value = String(v); return; }
      node.children = [];
      if (v !== '') node.appendChild(makeNode('#text', String(v)));
    },
  });
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
const field = (id) => doc.getElementById(id);
const root = () => field('library-root');

/** Mesma regra de LaiftDom.h: string vira nó de texto; atributos por setAttribute; false/null somem. */
function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') node.attrs.class = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  [].concat(children === undefined ? [] : children).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.appendChild(typeof child === 'object' ? child : makeNode('#text', String(child)));
  });
  return node;
}

const wiring = [];
const LaiftDom = {
  h,
  clear(node) { node.children = []; return node; },
  delegateActions(rootNode, allowList) { wiring.push({ root: rootNode, allowList }); },
};

const scrolls = [];
globalThis.window = {
  LaiftDom,
  scrollY: 0,
  scrollTo(x, y) { scrolls.push([x, y]); },
  navigator: undefined,
};
globalThis.document = doc;
const Detail = require('../library-detail.js');

const ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const OTHER_ID = 'a1b2c3d4-0000-4000-8000-000000000002';
const TOKEN = 'tok-membro';

const calls = [];
const pending = [];
const app = {
  getState() { return { sessionToken: TOKEN }; },
  callApi(name, token, input) {
    calls.push({ name, token, input });
    return new Promise((resolve) => { pending.push({ name, resolve }); });
  },
  formatDate(iso) { return String(iso).split('-').reverse().join('/'); },
};

const flush = () => new Promise((resolve) => setImmediate(resolve));
const lastPending = () => pending[pending.length - 1];

function findAll(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  node.children.forEach((child) => findAll(child, predicate, out));
  return out;
}
const textOf = (node) => (node ? node.textContent : '');
const byTag = (node, tag) => findAll(node, (n) => n.tag === tag);
const byAttr = (node, name) => findAll(node, (n) => n.attrs[name] !== undefined);
const byClass = (node, cls) => findAll(node, (n) => (n.attrs.class || '').split(/\s+/).includes(cls));
const actionNode = (name) => findAll(root(), (n) => n.attrs['data-action'] === name)[0];
const argNode = (arg) => findAll(root(), (n) => n.attrs['data-arg'] === arg)[0];
const statusNode = () => findAll(root(), (n) => n.attrs.role === 'status')[0];
const citationNode = () => byClass(root(), 'library-citacao')[0];

/** Artigo-base no formato ArticleDetail (CONTRATO-B1 §4.1). Nada aqui é mutado pela ficha. */
function article(extra = {}) {
  return Object.assign({
    id: ID,
    title: 'Efeitos do treinamento',
    authors: [{ family: 'Silva', given: 'Ana Maria' }, { family: 'Souza', given: 'Carlos' }],
    authorCount: 2,
    journal: 'Revista Brasileira de Teste',
    journalAbbrev: 'Rev Bras Teste',
    year: 2021,
    volume: '12',
    issue: '3',
    pages: '45-67',
    doi: '10.1000/xyz',
    pmid: '12345',
    type: 'artigo',
    topics: ['farmacologia'],
    openAccess: true,
    license: 'cc-by',
    landingUrl: 'https://doi.org/10.1000/xyz',
    pmcUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/',
    isFavorite: false,
    membersOnly: false,
    summary: { text: 'Resumo da curadoria.', origin: 'curador', reviewerName: null, reviewedAt: null },
    clinicalReview: null,
    abstract: null,
    collections: [],
  }, extra);
}

/** Abre a ficha e responde à chamada da API com o payload dado. */
async function abrir(payload, options, onBack) {
  Detail.open(app, ID, onBack || (() => {}), options);
  lastPending().resolve(payload);
  await flush();
}

beforeEach(() => {
  Detail.reset();
  calls.length = 0;
  pending.length = 0;
  scrolls.length = 0;
  wiring.length = 0;
  doc.activeElement = null;
  window.navigator = undefined;
  window.scrollY = 0;
});

// ---------- Funções puras ----------

test('autores: sobrenome, nome, até os da lista e "e mais N" pelo total declarado', () => {
  assert.equal(Detail.authorsLine(article()), 'Silva, Ana Maria; Souza, Carlos');
  const many = article({ authorCount: 35, authors: Array.from({ length: 30 }, (_, i) => ({ family: 'Autor' + i, given: 'X' })) });
  assert.match(Detail.authorsLine(many), /; Autor29, X e mais 5$/);
  assert.equal(Detail.authorsLine(article({ authors: [] })), '');
});

test('safeHref: só doi.org, PubMed (landing) e o padrão de PMC; o resto vira texto', () => {
  assert.equal(Detail.safeHref('https://doi.org/10.1000/xyz'), 'https://doi.org/10.1000/xyz');
  assert.equal(Detail.safeHref('https://pubmed.ncbi.nlm.nih.gov/12345/'), 'https://pubmed.ncbi.nlm.nih.gov/12345/');
  assert.equal(Detail.safeHref('https://evil.example/doi.org/x'), '');
  assert.equal(Detail.safeHref('https://doi.org.evil.example/x'), '');
  assert.equal(Detail.safeHref('http://doi.org/10.1/x'), '');
  assert.equal(Detail.safeHref('javascript:alert(1)'), '');
  assert.equal(Detail.safeHref(undefined), '');
});

test('safeHref com o padrão de PMC: só /articles/PMC<n>/', () => {
  assert.equal(Detail.safeHref('https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/', Detail.PMC_RE), 'https://pmc.ncbi.nlm.nih.gov/articles/PMC123456/');
  assert.equal(Detail.safeHref('https://pmc.ncbi.nlm.nih.gov/articles/123/', Detail.PMC_RE), '');
  assert.equal(Detail.safeHref('https://pmc.ncbi.nlm.nih.gov/articles/PMC1/?x=1', Detail.PMC_RE), '');
});

test('nota de origem do resumo: curadoria, IA revisada ou nada', () => {
  const fmt = (iso) => 'data ' + iso;
  assert.equal(Detail.pickSummaryNote({ origin: 'curador' }, fmt), 'Escrito pela curadoria.');
  assert.equal(
    Detail.pickSummaryNote({ origin: 'ia', reviewerName: 'Dra. Lima', reviewedAt: '2026-10-08' }, fmt),
    'Gerado por IA e revisado por Dra. Lima em data 2026-10-08.',
  );
  assert.equal(Detail.pickSummaryNote({ origin: 'ia_editado', reviewerName: 'Dra. Lima', reviewedAt: '2026-10-08' }, fmt).startsWith('Gerado por IA'), true);
  assert.equal(Detail.pickSummaryNote({ origin: 'outra' }, fmt), '');
  assert.equal(Detail.pickSummaryNote(null, fmt), '');
});

test('revisão clínica: nome e data; sem revisão, nada', () => {
  const fmt = (iso) => 'data ' + iso;
  assert.equal(Detail.clinicalNote({ reviewerName: 'Dr. Souza', reviewedAt: '2026-10-09' }, fmt), 'Revisão clínica: Dr. Souza, data 2026-10-09.');
  assert.equal(Detail.clinicalNote(null, fmt), '');
});

test('licença em texto: "Licença CC BY", "Domínio público" e o aviso quando não há licença', () => {
  assert.equal(Detail.licenseText('cc-by'), 'Licença CC BY');
  assert.equal(Detail.licenseText('pd'), 'Domínio público');
  assert.equal(Detail.licenseText('desconhecida'), 'Licença não informada pelo editor');
  assert.equal(Detail.licenseText(undefined), 'Licença não informada pelo editor');
});

test('assunto: nome vindo da lista; sem nome, o slug legível', () => {
  assert.equal(Detail.topicName('farmacologia', [{ slug: 'farmacologia', name: 'Farmacologia clínica' }]), 'Farmacologia clínica');
  assert.equal(Detail.topicName('toxico-logia', []), 'Toxico logia');
});

test('dia de acesso no formato da citação (AAAA-MM-DD, hora local)', () => {
  assert.equal(Detail.isoDay(new Date(2026, 9, 10)), '2026-10-10');
  assert.equal(Detail.isoDay(new Date(2026, 0, 3)), '2026-01-03');
});

// ---------- Abertura, foco e voltar ----------

test('open chama apiLearnLibraryGetArticle com o id e a sessão; mostra carregando com aria-busy', () => {
  Detail.open(app, ID, () => {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, 'apiLearnLibraryGetArticle');
  assert.equal(calls[0].token, TOKEN);
  assert.deepEqual(calls[0].input, { id: ID });
  assert.match(textOf(root()), /Carregando artigo…/);
  assert.equal(byAttr(root(), 'aria-busy').length, 1);
});

test('ao chegar o artigo, o título (h2 com tabindex -1) recebe o foco', async () => {
  await abrir({ success: true, article: article() });
  const heading = byTag(root(), 'h2')[0];
  assert.equal(heading.textContent, 'Efeitos do treinamento');
  assert.equal(heading.attrs.tabindex, '-1');
  assert.equal(doc.activeElement, heading);
  assert.equal(byAttr(root(), 'aria-busy').length, 0);
});

test('"Voltar à lista" chama onBack, restaura a rolagem e devolve o foco ao item da lista', async () => {
  let backs = 0;
  window.scrollY = 240;
  const onBack = () => {
    backs += 1;
    root().appendChild(h('button', { type: 'button', 'data-action': 'LaiftLibrary.open', 'data-id': ID }, ['Efeitos do treinamento']));
  };
  await abrir({ success: true, article: article() }, undefined, onBack);
  assert.ok(actionNode('LaiftLibraryDetail.back'), 'botão Voltar existe');
  Detail.back();
  assert.equal(backs, 1);
  assert.deepEqual(scrolls.at(-1), [0, 240]);
  assert.equal(doc.activeElement.attrs['data-id'], ID);
  assert.equal(byTag(root(), 'h2').length, 0, 'a ficha saiu da tela');
});

test('resposta de um pedido antigo que chega depois é descartada', async () => {
  Detail.open(app, OTHER_ID, () => {});
  Detail.open(app, ID, () => {});
  pending[1].resolve({ success: true, article: article({ title: 'Artigo novo' }) });
  await flush();
  pending[0].resolve({ success: true, article: article({ title: 'Artigo antigo' }) });
  await flush();
  assert.match(textOf(root()), /Artigo novo/);
  assert.doesNotMatch(textOf(root()), /Artigo antigo/);
});

test('NotFound mostra a mensagem do servidor, com o título de erro e foco no título', async () => {
  await abrir({ success: false, message: 'Artigo não encontrado.' });
  assert.match(textOf(root()), /Não foi possível abrir o artigo\./);
  assert.match(textOf(root()), /Artigo não encontrado\./);
  assert.equal(byAttr(root(), 'role').find((n) => n.attrs.role === 'alert').textContent, 'Artigo não encontrado.');
  assert.equal(doc.activeElement.tag, 'h2');
});

// ---------- Conteúdo e origem do resumo ----------

test('resumo da curadoria: "Escrito pela curadoria."', async () => {
  await abrir({ success: true, article: article() });
  assert.match(textOf(root()), /Resumo da LAIFT[\s\S]*Resumo da curadoria\.[\s\S]*Escrito pela curadoria\./);
});

test('resumo por IA revisado mostra quem revisou e quando', async () => {
  await abrir({ success: true, article: article({ summary: { text: 'Texto IA.', origin: 'ia', reviewerName: 'Dra. Lima', reviewedAt: '2026-10-08' } }) });
  assert.match(textOf(root()), /Gerado por IA e revisado por Dra\. Lima em 08\/10\/2026\./);
});

test('revisão clínica aparece com nome e data', async () => {
  await abrir({ success: true, article: article({ clinicalReview: { reviewerName: 'Dr. Souza', reviewedAt: '2026-10-09' } }) });
  assert.match(textOf(root()), /Revisão clínica: Dr\. Souza, 09\/10\/2026\./);
});

test('sem resumo, diz isso; membersOnly mostra o aviso e esconde favorito e coleções', async () => {
  await abrir({ success: true, article: article({ summary: null }) });
  assert.match(textOf(root()), /Este artigo ainda não tem resumo da LAIFT\./);

  await abrir({ success: true, article: article({ membersOnly: true, summary: null, collections: [{ id: 'c1', title: 'Coleção X' }] }) });
  assert.match(textOf(root()), /O resumo é exclusivo para membros\./);
  assert.equal(actionNode('LaiftLibraryDetail.toggleFavorite'), undefined);
  assert.doesNotMatch(textOf(root()), /Faz parte de/);
});

test('resumo original só aparece quando vem, com a licença', async () => {
  await abrir({ success: true, article: article() });
  assert.doesNotMatch(textOf(root()), /Resumo original/);
  await abrir({ success: true, article: article({ abstract: 'Texto original do editor.' }) });
  assert.match(textOf(root()), /Resumo original[\s\S]*Texto original do editor\.[\s\S]*Publicado sob licença CC BY\./);
});

test('selos de tipo e assunto, com texto; licença e acesso em texto', async () => {
  await abrir({ success: true, article: article({ topics: ['farmacologia'] }) }, { topics: [{ slug: 'farmacologia', name: 'Farmacologia clínica' }] });
  const badges = byClass(root(), 'badge').map(textOf);
  assert.deepEqual(badges, ['Artigo original', 'Farmacologia clínica']);
  assert.match(textOf(root()), /Licença CC BY · Acesso aberto/);
});

test('autores, DOI e PMID aparecem como texto (DOI não vira link)', async () => {
  await abrir({ success: true, article: article() });
  assert.match(textOf(root()), /Silva, Ana Maria; Souza, Carlos/);
  assert.match(textOf(root()), /DOI: 10\.1000\/xyz/);
  assert.match(textOf(root()), /PMID: 12345/);
});

// ---------- Links ----------

test('links externos: rel seguro e aviso de nova aba', async () => {
  await abrir({ success: true, article: article({ landingUrl: 'https://pubmed.ncbi.nlm.nih.gov/12345/' }) });
  const links = byTag(root(), 'a');
  assert.equal(links.length, 2, 'site oficial e PMC');
  links.forEach((link) => {
    assert.equal(link.attrs.target, '_blank');
    assert.equal(link.attrs.rel, 'noopener noreferrer');
    assert.match(textOf(link), /\(abre em nova aba\)/);
  });
  assert.equal(links[0].attrs.href, 'https://pubmed.ncbi.nlm.nih.gov/12345/');
});

test('URL fora da lista não vira link (landing e PMC tortos)', async () => {
  await abrir({
    success: true,
    article: article({ landingUrl: 'https://evil.example/x', pmcUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/123/' }),
  });
  assert.equal(byTag(root(), 'a').length, 0);
});

// ---------- Favorito ----------

test('favorito: aria-pressed só muda com a resposta do servidor; falha mantém e avisa', async () => {
  await abrir({ success: true, article: article() });
  const fav = actionNode('LaiftLibraryDetail.toggleFavorite');
  assert.equal(fav.attrs['aria-pressed'], 'false');
  assert.equal(textOf(fav), 'Salvar nos favoritos');

  Detail.toggleFavorite();
  assert.deepEqual(calls.at(-1), { name: 'apiLearnLibrarySetFavorite', token: TOKEN, input: { id: ID, favorite: true } });
  assert.equal(fav.attrs['aria-pressed'], 'false', 'ainda sem resposta');

  lastPending().resolve({ success: false, message: 'Limite de favoritos atingido.' });
  await flush();
  assert.equal(fav.attrs['aria-pressed'], 'false');
  assert.equal(textOf(statusNode()), 'Limite de favoritos atingido.');

  Detail.toggleFavorite();
  lastPending().resolve({ success: true, favorite: true });
  await flush();
  assert.equal(fav.attrs['aria-pressed'], 'true');
  assert.equal(textOf(fav), 'Remover dos favoritos');
  assert.equal(textOf(statusNode()), 'Salvo nos favoritos.');
});

test('favorito: um clique por vez (sem segundo pedido enquanto o primeiro não volta)', async () => {
  await abrir({ success: true, article: article() });
  Detail.toggleFavorite();
  Detail.toggleFavorite();
  assert.equal(calls.filter((c) => c.name === 'apiLearnLibrarySetFavorite').length, 1);
});

// ---------- Citação ----------

test('Citar: ABNT por padrão com o nome da revista em <strong>; Vancouver troca o texto e aria-pressed', async () => {
  await abrir({ success: true, article: article() });
  const abnt = argNode('abnt');
  const vanc = argNode('vancouver');
  assert.equal(abnt.attrs['aria-pressed'], 'true');
  assert.equal(vanc.attrs['aria-pressed'], 'false');
  assert.equal(textOf(byTag(citationNode(), 'strong')[0]), 'Revista Brasileira de Teste');

  Detail.setStyle('vancouver');
  assert.equal(abnt.attrs['aria-pressed'], 'false');
  assert.equal(vanc.attrs['aria-pressed'], 'true');
  assert.equal(
    textOf(citationNode()),
    'Silva AM, Souza C. Efeitos do treinamento. Rev Bras Teste. 2021;12(3):45-67. doi: 10.1000/xyz',
  );
  assert.equal(byTag(citationNode(), 'strong').length, 0);
});

test('Citar: estilo desconhecido é ignorado', async () => {
  await abrir({ success: true, article: article() });
  const before = textOf(citationNode());
  Detail.setStyle('mla');
  assert.equal(textOf(citationNode()), before);
  assert.equal(argNode('abnt').attrs['aria-pressed'], 'true');
});

test('copiar citação: usa a área de transferência do texto sem marcação e anuncia', async () => {
  const copied = [];
  window.navigator = { clipboard: { writeText(t) { copied.push(t); return Promise.resolve(); } } };
  await abrir({ success: true, article: article() });
  Detail.copyCitation();
  await flush();
  assert.equal(copied.length, 1);
  assert.match(
    copied[0],
    /^SILVA, A\. M\.; SOUZA, C\. Efeitos do treinamento\. Revista Brasileira de Teste, v\. 12, n\. 3, p\. 45-67, 2021\. DOI: 10\.1000\/xyz\. Disponível em: https:\/\/doi\.org\/10\.1000\/xyz\. Acesso em: \d{1,2} [a-zç.]+ \d{4}\.$/,
  );
  assert.equal(textOf(statusNode()), 'Citação copiada.');
});

test('copiar citação sem permissão do navegador pede para selecionar o texto', async () => {
  window.navigator = {};
  await abrir({ success: true, article: article() });
  Detail.copyCitation();
  assert.equal(textOf(statusNode()), 'Selecione e copie o texto acima.');
});

test('copiar citação com a permissão negada pede para selecionar o texto', async () => {
  window.navigator = { clipboard: { writeText() { return Promise.reject(new Error('negado')); } } };
  await abrir({ success: true, article: article() });
  Detail.copyCitation();
  await flush();
  assert.equal(textOf(statusNode()), 'Selecione e copie o texto acima.');
});

// ---------- Coleções ----------

test('"Faz parte de": botão que chama onCollection com o id; sem a opção, é só texto', async () => {
  const opened = [];
  const withCollections = article({ collections: [{ id: 'c1', title: 'Coleção X' }] });
  await abrir({ success: true, article: withCollections }, { onCollection: (id) => opened.push(id) });
  assert.match(textOf(root()), /Faz parte de: Coleção X/);
  assert.ok(argNode('c1'), 'botão com data-arg do id');
  Detail.openCollection('c1');
  assert.deepEqual(opened, ['c1']);

  await abrir({ success: true, article: withCollections });
  assert.match(textOf(root()), /Faz parte de: Coleção X/);
  assert.equal(argNode('c1'), undefined);
});

// ---------- Reset, ações e fiação ----------

test('reset() tira a ficha da tela, descarta resposta pendente e não aceita favorito', async () => {
  Detail.open(app, ID, () => {});
  Detail.reset();
  assert.equal(root().children.length, 0);
  lastPending().resolve({ success: true, article: article() });
  await flush();
  assert.equal(root().children.length, 0, 'dados de uma abertura encerrada não aparecem');
  Detail.toggleFavorite();
  assert.equal(calls.filter((c) => c.name === 'apiLearnLibrarySetFavorite').length, 0);
});

test('cada data-action da ficha é uma função exportada e está na lista permitida da delegação', async () => {
  await abrir({ success: true, article: article({ collections: [{ id: 'c1', title: 'Coleção X' }] }) }, { onCollection: () => {} });
  const wrap = root().children[0];
  const names = [...new Set(byAttr(root(), 'data-action').map((n) => n.attrs['data-action']))];
  assert.ok(names.length >= 4);
  names.forEach((name) => {
    const [owner, method] = name.split('.');
    assert.equal(owner, 'LaiftLibraryDetail');
    assert.equal(typeof Detail[method], 'function', name);
  });
  const own = wiring.find((w) => w.root === wrap);
  assert.ok(own, 'delegação ligada ao contêiner da ficha');
  assert.deepEqual([...own.allowList].sort(), [...names].sort());
});

test('a ficha não usa handler inline nem HTML por string, nem estilo ou media query próprios', () => {
  const src = read('library-detail.js');
  assert.doesNotMatch(src, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(src, /\.style\.|\bstyle\s*=|\bon[a-z]+\s*=/);
  assert.doesNotMatch(src, /@media|prefers-reduced-motion/);
  assert.doesNotMatch(src, /console\./);
  assert.ok(src.split('\n').length < 800, 'arquivo abaixo do teto de 800 linhas');
});

test('a ficha só chama as actions de leitura e de favorito do membro (CONTRATO-B1 §4.1)', () => {
  const src = read('library-detail.js');
  const names = [...new Set([...src.matchAll(/'(apiLearn\w+)'/g)].map((m) => m[1]))].sort();
  assert.deepEqual(names, ['apiLearnLibraryGetArticle', 'apiLearnLibrarySetFavorite']);
});

test('index.html e library-cite.js: a ficha depende só do que a página já carrega (window.LaiftLibraryCite no navegador)', () => {
  const src = read('library-detail.js');
  assert.match(src, /window\.LaiftLibraryCite/);
  assert.match(src, /window\.LaiftLibraryDetail = api/);
});
