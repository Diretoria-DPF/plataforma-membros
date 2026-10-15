/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Seção "Uso da plataforma" do painel admin (frontend/admin-usage.js, DAT-01): funções puras, estados
// carregando/erro/vazio, respostas fora de ordem, logout, registro no HTML/sw/build e higiene
// (sem innerHTML, sem handler inline, sem estilo inline, linhas ≤ 800).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);

function makeNode(tag) {
  const node = {
    tag,
    children: [],
    attrs: {},
    textContent: '',
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    focus() { doc.activeElement = node; },
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

function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined || value === false) return;
    if (key === 'className') node.attrs.class = value;
    else node.setAttribute(key, value);
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
const app = {
  getState() { return { sessionToken: 'tok-admin' }; },
  callApi(name, token) {
    calls.push({ name, token });
    return new Promise((resolve) => { pending.push({ name, resolve }); });
  },
};

globalThis.window = { LaiftDom };
globalThis.document = doc;
const Usage = require('../admin-usage.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const textOf = (node) => (node ? node.textContent + node.children.map(textOf).join('') : '');
function findAll(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  node.children.forEach((child) => findAll(child, predicate, out));
  return out;
}
const byTag = (node, tag) => findAll(node, (n) => n.tag === tag);
const box = () => doc.getElementById('admin-usage');
const lastPending = () => pending[pending.length - 1];

function stats(extra = {}) {
  return Object.assign({
    success: true,
    today: '2026-10-14',
    windowDays: 30,
    dau: [{ day: '2026-10-13', n: 4 }, { day: '2026-10-14', n: 2 }],
    wau: 5,
    mau: 9,
    retention: [{
      week: '2026-10-05', size: 4,
      d1: { eligible: 4, retained: 2 }, d7: { eligible: 2, retained: 1 }, d30: { eligible: 0, retained: 0 },
    }],
    funnel: {
      signup: 4, confirmed: 3, firstQuiz: 2,
      returnedD1: { eligible: 4, retained: 2 }, returnedD7: { eligible: 2, retained: 1 },
    },
    counters: { signup: 4, email_confirmed: 3, dau: 6, quiz_completed: 7, lia_message: 11 },
  }, extra);
}

beforeEach(() => {
  Usage.reset();
  calls.length = 0;
  pending.length = 0;
  doc.activeElement = null;
});

test('contador em pt-BR e porcentagem com traço quando ninguém foi medido', () => {
  assert.equal(Usage.plural(1, 'pessoa', 'pessoas'), '1 pessoa');
  assert.equal(Usage.plural(0, 'pessoa', 'pessoas'), '0 pessoas');
  assert.equal(Usage.plural(-3, 'pessoa', 'pessoas'), '0 pessoas');
  assert.equal(Usage.ratioLabel({ eligible: 4, retained: 2 }), '50% (2/4)');
  assert.equal(Usage.ratioLabel({ eligible: 0, retained: 0 }), '—');
  assert.equal(Usage.ratioLabel({ eligible: 2, retained: 9 }), '100% (2/2)');
  assert.equal(Usage.ratioLabel(null), '—');
});

test('dayLabel formata ISO e deixa o resto como texto', () => {
  assert.equal(Usage.dayLabel('2026-10-14'), '14/10');
  assert.equal(Usage.dayLabel('<b>x</b>'), '<b>x</b>');
  assert.equal(Usage.dayLabel(undefined), '');
});

test('normalizeStats aguenta resposta vazia e calcula o DAU de hoje', () => {
  const empty = Usage.normalizeStats(null);
  assert.equal(empty.mau, 0);
  assert.equal(empty.windowDays, 30);
  assert.equal(Usage.isEmptyStats(empty), true);
  const full = Usage.normalizeStats(stats());
  assert.equal(full.dauToday, 2);
  assert.equal(Usage.isEmptyStats(full), false);
  assert.deepEqual(full.counters.map((c) => c.key), ['signup', 'email_confirmed', 'dau', 'quiz_completed', 'lia_message']);
});

test('carregar: pede apiAdminUsageStats com o token, mostra "Carregando" com aria-busy e depois os números', async () => {
  Usage.load(app);
  assert.deepEqual(calls, [{ name: 'apiAdminUsageStats', token: 'tok-admin' }]);
  assert.equal(box().getAttribute('aria-busy'), 'true');
  lastPending().resolve(stats());
  await flush();
  assert.equal(box().getAttribute('aria-busy'), null);
  const text = textOf(box());
  assert.match(text, /2 pessoas ativas hoje/);
  assert.match(text, /5 pessoas ativas em 7 dias/);
  assert.match(text, /9 pessoas ativas em 30 dias/);
  assert.match(text, /Fez o primeiro simulado2 pessoas/);
  assert.match(text, /50% \(2\/4\)/);
  assert.match(text, /Simulados concluídos7/);
  assert.equal(byTag(box(), 'table').length, 1);
  assert.equal(byTag(box(), 'meter').length, 2);
});

test('sem token não pede nada', () => {
  const noToken = { getState: () => ({}), callApi: () => { throw new Error('não deveria chamar'); } };
  Usage.load(noToken);
  assert.equal(calls.length, 0);
});

test('erro da API vira mensagem com "Tentar de novo" (data-action permitido)', async () => {
  Usage.load(app);
  lastPending().resolve({ success: false, message: 'Acesso não autorizado para este recurso.' });
  await flush();
  const text = textOf(box());
  assert.match(text, /Não foi possível carregar o uso da plataforma/);
  assert.match(text, /Acesso não autorizado/);
  const retry = byTag(box(), 'button')[0];
  assert.equal(retry.attrs['data-action'], 'LaiftAdminUsage.reload');
  assert.ok(wiring.some((w) => w.allowList.includes('LaiftAdminUsage.reload')));
});

test('sem dados mostra o estado vazio', async () => {
  Usage.load(app);
  lastPending().resolve({ success: true, dau: [], wau: 0, mau: 0, retention: [], funnel: {}, counters: {} });
  await flush();
  assert.match(textOf(box()), /Ainda não há dados de uso/);
});

test('resposta antiga não sobrescreve a mais nova, e logout descarta tudo', async () => {
  Usage.load(app);
  const first = lastPending();
  Usage.reload();
  const second = lastPending();
  second.resolve(stats({ mau: 7 }));
  await flush();
  first.resolve(stats({ mau: 1 }));
  await flush();
  assert.match(textOf(box()), /7 pessoas ativas em 30 dias/);
  Usage.reset();
  assert.equal(box().children.length, 0);
  Usage.load(app);
  const third = lastPending();
  Usage.reset();
  third.resolve(stats());
  await flush();
  assert.equal(box().children.length, 0);
});

test('HTML vindo do servidor entra só como texto', async () => {
  Usage.load(app);
  lastPending().resolve(stats({ retention: [{ week: '<img src=x onerror=1>', size: 1, d1: {}, d7: {}, d30: {} }] }));
  await flush();
  assert.match(textOf(box()), /<img src=x onerror=1>/);
});

test('registro: index.html (card + script), sw.js, build.js e app.js (carga e reset)', () => {
  assert.match(read('index.html'), /id="admin-usage-card"/);
  assert.match(read('index.html'), /<script src="admin-usage\.js" defer><\/script>/);
  assert.match(read('sw.js'), /'admin-usage\.js'/);
  assert.match(read('scripts/build.js'), /'admin-usage\.js'/);
  const appJs = read('app.js');
  assert.match(appJs, /LaiftAdminUsage\.load\(window\.App\)/);
  assert.match(appJs, /LaiftAdminUsage\.reset\(\)/);
});

test('higiene: sem innerHTML, sem handler/estilo inline, até 800 linhas', () => {
  const full = read('admin-usage.js');
  const src = full.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(src, /\bon[a-z]+\s*=\s*['"]/);
  assert.doesNotMatch(src, /['"]style['"]\s*:|\.style\./);
  assert.ok(full.split('\n').length <= 800);
});
