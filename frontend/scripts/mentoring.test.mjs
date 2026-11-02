/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mentoria (mentoring.js; ROL-04): funções puras, desenho da tela com um DOM mínimo (pedido, aceite, interruptores,
// resumo compartilhado) e a fiação (pacote sob demanda, menu por flag, index.html, build, sw). Sem innerHTML nem
// estilo inline.
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
const HTML = ler('index.html');

/** DOM mínimo: elementos persistentes por id, filhos, classList, atributos e ouvintes. */
function criarDom() {
  const porId = new Map();
  function make(tag) {
    const classes = new Set();
    const el = {
      tag, children: [], attrs: {}, className: '', textContent: '', listeners: {}, focused: false,
      get firstChild() { return this.children[0] || null; },
      appendChild(child) { this.children.push(child); return child; },
      removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector() { return null; },
      focus() { this.focused = true; },
      classList: {
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
        toggle: (c, force) => { if (force === undefined ? !classes.has(c) : force) classes.add(c); else classes.delete(c); },
      },
    };
    return el;
  }
  const doc = {
    head: null,
    createElement: make,
    getElementById(id) { if (!porId.has(id)) porId.set(id, make('div')); return porId.get(id); },
    querySelector() { return null; },
  };
  doc.getElementById('btn-mentoring-available').setAttribute('aria-checked', 'false');
  doc.getElementById('mentoring-request-share').setAttribute('aria-checked', 'false');
  doc.getElementById('mentoring-body').classList.add('hidden');
  return doc;
}
const todos = (el) => [el].concat(...el.children.map(todos));
const textOf = (el) => [el.textContent].concat(el.children.map(textOf)).join('|');
const acao = (raizEl, nome) => todos(raizEl).find((n) => n.attrs && n.attrs['data-action'] === nome);

const PEER = { id: 'p1', fullName: 'Bia Mentora', username: 'bia', avatarUrl: null };
const link = (over) => ({ id: 'l1', myRole: 'mentee', status: 'pending', shareProgress: false, requestedByMe: true, peer: PEER, connected: false, ...over });

function ambiente({ overview, mentors = [], respostas = {} }) {
  const doc = criarDom();
  const chamadas = [];
  const status = [];
  const confirmacoes = [];
  const conversas = [];
  const App = {
    getState: () => ({ sessionToken: 'tok' }),
    setStatus: (id, msg, kind) => { doc.getElementById(id).textContent = msg; doc.getElementById(id).attrs['data-kind'] = kind || ''; status.push([msg, kind]); },
    openConfirm: (msg, cb) => { confirmacoes.push(msg); cb(); },
    callApi: async (action, tokenValue, input) => {
      chamadas.push([action, input]);
      if (respostas[action]) return respostas[action](input);
      if (action === 'apiMentoringOverview') return { success: true, enabled: true, available: false, hasMentorRole: false, asMentee: [], asMentor: [], ...overview };
      if (action === 'apiMentoringListMentors') return { success: true, enabled: true, mentors };
      return { success: true, message: 'ok' };
    },
  };
  globalThis.self = { document: doc, App, LaiftMessaging: { openConversationWithPeer: (p) => conversas.push(p) } };
  return { doc, App, chamadas, status, confirmacoes, conversas };
}

// O módulo guarda `root` na carga; cada teste precisa de um DOM novo, então recarrega o módulo.
function carregar() {
  const caminho = require.resolve('../mentoring.js');
  delete require.cache[caminho];
  return require('../mentoring.js');
}

test('statusText: frase por papel e estado; estado desconhecido não quebra', () => {
  const m = carregar();
  assert.equal(m.statusText(link({ status: 'pending' })), 'Aguardando resposta');
  assert.equal(m.statusText(link({ myRole: 'mentor', status: 'pending' })), 'Pedido recebido');
  assert.equal(m.statusText(link({ status: 'active' })), 'Mentoria ativa');
  assert.equal(m.statusText(link({ status: 'declined' })), 'Pedido recusado');
  assert.equal(m.statusText(link({ status: 'constructor' })), 'Situação desconhecida');
  assert.equal(m.statusText(null), 'Situação desconhecida');
});

test('summaryLines: só agregados legíveis; módulo desconhecido e entrada vazia são ignorados', () => {
  const m = carregar();
  const linhas = m.summaryLines({
    accuracyPct: 63, questionsAnswered: 30, totalActivities: 3, streak: { current: 1, best: 5 },
    modules: [{ module: 'farmacologia', attempts: 2, accuracyPct: 70 }, { module: 'anatomia', attempts: 0, accuracyPct: null }, { module: '<img>', attempts: 9, accuracyPct: 1 }],
  });
  assert.deepEqual(linhas, [
    'Acerto geral: 63%', 'Questões respondidas: 30', 'Atividades concluídas: 3', 'Sequência: 1 dia (melhor: 5 dias)',
    'Farmacologia: 2 atividades, 70% de acerto', 'Anatomia: 0 atividades, sem nota ainda',
  ]);
  assert.deepEqual(m.summaryLines(null), []);
});

test('tela: pedido pendente do mentorado mostra situação, interruptor de compartilhar e cancelar (com confirmação)', async () => {
  const env = ambiente({ overview: { asMentee: [link()] } });
  const m = carregar();
  await m.load(env.App);
  const lista = env.doc.getElementById('mentoring-as-mentee');
  assert.equal(lista.children.length, 1);
  assert.match(textOf(lista), /Aguardando resposta/);
  assert.match(textOf(lista), /você não compartilha o progresso/);
  const share = acao(lista, 'share');
  assert.equal(share.attrs.role, 'switch');
  assert.equal(share.attrs['aria-checked'], 'false');
  assert.match(share.attrs['aria-label'], /Bia Mentora/);
  share.listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(env.chamadas.find((c) => c[0] === 'apiMentoringSetShare'), ['apiMentoringSetShare', { id: 'l1', share: true }]);
  acao(lista, 'end').listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.equal(env.confirmacoes.length, 1);
  assert.deepEqual(env.chamadas.find((c) => c[0] === 'apiMentoringEnd'), ['apiMentoringEnd', { id: 'l1' }]);
  assert.equal(env.doc.getElementById('mentoring-body').classList.contains('hidden'), false);
});

test('tela: escolher mentor envia o pedido com a escolha de compartilhar; mentor com vínculo mostra a situação', async () => {
  const env = ambiente({ overview: {}, mentors: [PEER, { id: 'p2', fullName: 'Caio', username: null, avatarUrl: null, linkStatus: 'pending' }] });
  const m = carregar();
  await m.load(env.App);
  const lista = env.doc.getElementById('mentoring-mentors');
  assert.equal(lista.children.length, 2);
  assert.equal(acao(lista.children[1], 'request'), undefined);
  assert.match(textOf(lista.children[1]), /Pedido enviado/);
  env.doc.getElementById('mentoring-request-share').listeners.click();
  assert.equal(env.doc.getElementById('mentoring-request-share').attrs['aria-checked'], 'true');
  acao(lista.children[0], 'request').listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(env.chamadas.find((c) => c[0] === 'apiMentoringRequest'), ['apiMentoringRequest', { mentorId: 'p1', shareProgress: true }]);
});

test('tela: o mentor aceita e recusa; só vê "Ver resumo" com compartilhamento ligado, e o resumo é só agregado', async () => {
  const pendente = link({ id: 'a', myRole: 'mentor', status: 'pending', requestedByMe: false });
  const comShare = link({ id: 'b', myRole: 'mentor', status: 'active', shareProgress: true, requestedByMe: false, connected: true });
  const semShare = link({ id: 'c', myRole: 'mentor', status: 'active', shareProgress: false, requestedByMe: false });
  const env = ambiente({
    overview: { available: true, asMentor: [pendente, comShare, semShare] },
    respostas: { apiMentoringGetMenteeProgress: async () => ({ success: true, summary: { accuracyPct: 80, questionsAnswered: 10, totalActivities: 1, streak: { current: 2, best: 2 }, modules: [{ module: 'toxicologia', attempts: 1, accuracyPct: 80 }] } }) },
  });
  const m = carregar();
  await m.load(env.App);
  const lista = env.doc.getElementById('mentoring-as-mentor');
  assert.equal(env.doc.getElementById('mentoring-mentor-card').classList.contains('hidden'), false);
  assert.ok(acao(lista.children[0], 'accept') && acao(lista.children[0], 'decline'));
  assert.equal(acao(lista.children[1], 'summary').attrs['aria-expanded'], 'false');
  assert.equal(acao(lista.children[2], 'summary'), undefined);
  assert.match(textOf(lista.children[2]), /não compartilha o progresso/);
  assert.ok(acao(lista.children[1], 'chat'), 'com conexão aceita há botão Enviar mensagem');
  assert.equal(acao(lista.children[2], 'chat'), undefined);
  assert.match(textOf(lista.children[2]), /conecte-se/);
  acao(lista.children[1], 'chat').listeners.click();
  assert.deepEqual(env.conversas, [{ id: 'p1', fullName: 'Bia Mentora', username: 'bia', avatarUrl: null }]);
  acao(lista.children[0], 'decline').listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(env.chamadas.find((c) => c[0] === 'apiMentoringRespond'), ['apiMentoringRespond', { id: 'a', accept: false }]);
  acao(lista.children[1], 'summary').listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(env.chamadas.find((c) => c[0] === 'apiMentoringGetMenteeProgress'), ['apiMentoringGetMenteeProgress', { id: 'b' }]);
  const aberto = env.doc.getElementById('mentoring-as-mentor').children[1];
  assert.match(textOf(aberto), /Acerto geral: 80%/);
  assert.match(textOf(aberto), /Toxicologia: 1 atividade, 80% de acerto/);
  assert.match(textOf(aberto), /sem respostas individuais/);
  assert.equal(acao(aberto, 'summary').attrs['aria-expanded'], 'true');
});

test('tela: disponibilidade alterna pelo interruptor e o cartão de mentorados aparece só para quem mentora', async () => {
  const env = ambiente({ overview: { available: false, hasMentorRole: false } });
  const m = carregar();
  await m.load(env.App);
  const sw = env.doc.getElementById('btn-mentoring-available');
  assert.equal(sw.attrs['aria-checked'], 'false');
  assert.equal(env.doc.getElementById('mentoring-mentor-card').classList.contains('hidden'), true);
  sw.listeners.click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(env.chamadas.find((c) => c[0] === 'apiMentoringSetAvailability'), ['apiMentoringSetAvailability', { available: true }]);
});

test('tela: flag desligada esconde o corpo e mostra o aviso; banco sem a migração mostra o aviso próprio', async () => {
  const off = ambiente({ overview: { enabled: false } });
  await carregar().load(off.App);
  assert.equal(off.doc.getElementById('mentoring-off').classList.contains('hidden'), false);
  assert.equal(off.doc.getElementById('mentoring-body').classList.contains('hidden'), true);
  const semTabela = ambiente({ overview: { tableMissing: true } });
  await carregar().load(semTabela.App);
  assert.equal(semTabela.doc.getElementById('mentoring-missing').classList.contains('hidden'), false);
  assert.equal(semTabela.doc.getElementById('mentoring-body').classList.contains('hidden'), true);
});

test('tela: erro da Worker aparece como mensagem e a tela não quebra', async () => {
  const env = ambiente({ overview: {}, respostas: { apiMentoringOverview: async () => ({ success: false, message: 'Sessão inválida.' }) } });
  await carregar().load(env.App);
  assert.ok(env.status.some(([msg, kind]) => msg === 'Sessão inválida.' && kind === 'error'));
});

test('fiação: pacote sob demanda, fora do shell e do precache, publicado pelo build', () => {
  assertSobDemanda('mentoria', 'mentoring.js');
  assert.ok(ler('scripts/build.js').includes("'mentoring.css'"));
  assert.ok(!ler('index.html').includes('mentoring.css'), 'o CSS entra com o pacote, não no shell');
  assert.ok(!ler('sw.js').includes("'mentoring.css'"));
});

test('index.html: item do menu Participação com portão da flag, painel acessível e sem estilo inline', () => {
  const item = /<li class="app-menu__flag-mentoring">[\s\S]*?<\/li>/.exec(HTML)[0];
  assert.match(item, /data-panel="panel-mentoring" data-scope="member"/);
  assert.match(ler('app-menu.css'), /:root:not\(\[data-flag-mentoring-enabled\]\) #app-menu \.app-menu__flag-mentoring \{\s*display: none;/);
  const participacao = HTML.slice(HTML.indexOf('data-grupo="participacao"'), HTML.indexOf('data-grupo="comunicacao"'));
  assert.ok(participacao.includes('panel-mentoring'), 'Mentoria fica no grupo Participação');
  const painel = /<section id="panel-mentoring"[\s\S]*?<\/section>/.exec(HTML)[0];
  assert.match(painel, /id="msg-mentoring" class="status-msg" role="status" aria-live="polite"/);
  assert.match(painel, /id="btn-mentoring-available"[^>]*role="switch" aria-checked="false"/);
  assert.match(painel, /id="mentoring-request-share"[^>]*role="switch" aria-checked="false"/);
  for (const lista of ['mentoring-as-mentee', 'mentoring-mentors', 'mentoring-as-mentor']) assert.match(painel, new RegExp(`<ul id="${lista}"[^>]*aria-label=`));
  assert.doesNotMatch(painel, /\sstyle=|\sonclick=/);
});

test('app.js: a tela pede o pacote sob demanda e o logout solta o estado', () => {
  const app = ler('app.js');
  assert.match(app, /'panel-mentoring': function \(\) \{ withBundle\('mentoria', function \(\) \{ if \(window\.LaiftMentoring\) window\.LaiftMentoring\.load/);
  assert.ok((app.match(/window\.LaiftMentoring\.reset\(\)/g) || []).length >= 2);
});

test('sem innerHTML, estilo inline, eval nem script inline em mentoring.js', () => {
  assert.doesNotMatch(ler('mentoring.js'), /\.innerHTML|\.outerHTML|insertAdjacentHTML|\.style\.|document\.write|eval\(/);
});

test('CSS: alvos de 44 px, foco visível, sem !important', () => {
  const css = ler('mentoring.css');
  assert.match(css, /\.mt-btn,\s*\.mt-switch \{[^}]*min-height: 44px/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /!important/);
});
