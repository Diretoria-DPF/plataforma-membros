/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel admin de IA (frontend/admin-ai.js): textos puros, aria-pressed, aria-busy,
// role de status, rótulos únicos por avaliação, respostas fora de ordem e plurais.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** DOM mínimo; innerHTML lança, como em home.test.mjs. */
function makeNode(tag) {
  const node = {
    tag,
    children: [],
    attrs: {},
    className: '',
    textContent: '',
    value: '',
    style: {},
    listeners: {},
    classList: { toggle() {}, add() {}, remove() {} },
    appendChild(child) { node.children.push(child); return child; },
    setAttribute(key, value) { node.attrs[key] = String(value); },
    getAttribute(key) { return Object.prototype.hasOwnProperty.call(node.attrs, key) ? node.attrs[key] : null; },
    removeAttribute(key) { delete node.attrs[key]; },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}

const elements = new Map();
const doc = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, makeNode(id));
    return elements.get(id);
  },
};
const field = (id) => doc.getElementById(id);

function textNode(value) {
  const node = makeNode('#text');
  node.textContent = String(value);
  return node;
}

function h(tag, attrs, children) {
  const node = makeNode(tag);
  Object.keys(attrs || {}).forEach((key) => {
    const value = attrs[key];
    if (value === null || value === undefined) return;
    if (key === 'className') node.className = value;
    else if (typeof value !== 'function') node.setAttribute(key, value);
  });
  (children || []).forEach((child) => {
    if (child === null || child === undefined) return;
    node.appendChild(typeof child === 'string' ? textNode(child) : child);
  });
  return node;
}

const text = (tag, value, attrs) => h(tag, attrs, [String(value ?? '')]);

function textOf(node) {
  if (!node) return '';
  if (node.tag === '#text') return node.textContent;
  return node.textContent + node.children.map(textOf).join('');
}

function findAll(node, tag, out = []) {
  if (node.tag === tag) out.push(node);
  node.children.forEach((child) => findAll(child, tag, out));
  return out;
}

const calls = [];
const pending = [];

const app = {
  h,
  text,
  clearEl(node) { node.children = []; },
  getState() { return { sessionToken: 'tok-admin' }; },
  setStatus(id, message, kind) {
    const el = doc.getElementById(id);
    el.textContent = message || '';
    if (kind) el.setAttribute('data-kind', kind);
    else el.removeAttribute('data-kind');
  },
  callApi(name, token, params) {
    calls.push({ name, params });
    return new Promise((resolve) => { pending.push({ name, params, resolve }); });
  },
  formatDate() { return '08/10/2026, 10:00'; },
  openConfirm(_question, onYes) { onYes(); },
  renderList(id, items, render, empty) {
    const container = doc.getElementById(id);
    app.clearEl(container);
    if (!items.length) container.appendChild(text('p', empty));
    items.forEach((item) => container.appendChild(render(item)));
  },
};

globalThis.window = { App: app };
globalThis.document = doc;
const Admin = require('../admin-ai.js');

const flush = () => new Promise((resolve) => setImmediate(resolve));
const requests = (name, days) => pending.filter((p) => p.name === name && p.params.days === days);
const lastRequest = (name) => pending.filter((p) => p.name === name).pop();
const lastCall = (name) => calls.filter((c) => c.name === name).pop();

function satStats({ total, up, down, day }) {
  return {
    success: true,
    totals: { total, up, down, utilityRate: total ? up / total : null },
    byCategory: [{ category: 'incorreta', up, down }],
    byDay: [{ day, up, down }],
  };
}

function metricsRes(used) {
  return { success: true, budget: { budget: 500, used, pct: Math.round((used / 500) * 100), exceeded: false }, rows: [], totals: [] };
}

function feedbackItem(id, username, comment) {
  return {
    id,
    status: 'new',
    rating: 'down',
    category: 'incorreta',
    createdAt: '2026-10-08T10:00:00Z',
    author: { username },
    comment,
    answer: { topic: 'dose', text: 'resposta da Lia' },
  };
}

beforeEach(() => {
  calls.length = 0;
  pending.length = 0;
  Admin.reset();
});

test('contadores em pt-BR: singular só para exatamente 1', () => {
  assert.equal(Admin.countLabel(1, 'útil', 'úteis'), '1 útil');
  assert.equal(Admin.countLabel(0, 'útil', 'úteis'), '0 úteis');
  assert.equal(Admin.countLabel(2, 'útil', 'úteis'), '2 úteis');
  assert.equal(Admin.countLabel(undefined, 'chamada', 'chamadas'), '0 chamadas');
});

test('dia do gráfico sai em dd/mm, sem depender de fuso', () => {
  assert.equal(Admin.shortDayLabel('2026-10-08'), '08/10');
  assert.equal(Admin.shortDayLabel('2026-01-31'), '31/01');
  assert.equal(Admin.shortDayLabel('data estranha'), 'data estranha');
});

test('aria-pressed só fica true no período ativo', () => {
  assert.equal(Admin.periodPressed(7, 7), 'true');
  assert.equal(Admin.periodPressed(30, 7), 'false');
  assert.equal(Admin.periodPressed('30', 30), 'true');
});

test('rótulo de Marcar revisado/Descartar: único por avaliação e sem o comentário', () => {
  const ana = { author: { username: 'ana' }, comment: 'texto privado do membro' };
  const bruno = { author: { username: 'bruno' }, comment: 'outro texto' };
  const removed = { author: null, comment: 'x' };
  const when = '08/10/2026, 10:00';
  assert.equal(Admin.satActionAriaLabel('Marcar revisado', ana, when), 'Marcar revisado: avaliação de ana em 08/10/2026, 10:00');
  assert.equal(Admin.satActionAriaLabel('Descartar', removed, when), 'Descartar: avaliação de conta removida em 08/10/2026, 10:00');
  assert.notEqual(Admin.satActionAriaLabel('Descartar', ana, when), Admin.satActionAriaLabel('Descartar', bruno, when));
  assert.doesNotMatch(Admin.satActionAriaLabel('Descartar', ana, when), /privado/);
});

test('role de status: "alert" só para erro real', () => {
  assert.equal(Admin.panelStatusRole('error'), 'alert');
  assert.equal(Admin.panelStatusRole('info'), 'status');
  assert.equal(Admin.panelStatusRole('success'), 'status');
  assert.equal(Admin.panelStatusRole(null), 'status');
});

test('Satisfação: resposta de 7 dias que chega depois da de 30 é descartada', async () => {
  Admin.loadSatisfaction(7);
  Admin.loadSatisfaction(30);
  requests('apiAdminAssistantStats', 30)[0].resolve(satStats({ total: 4, up: 3, down: 1, day: '2026-10-08' }));
  await flush();
  requests('apiAdminAssistantStats', 7)[0].resolve(satStats({ total: 99, up: 90, down: 9, day: '2026-09-01' }));
  await flush();
  const totals = textOf(field('admin-ai-sat-totals'));
  assert.match(totals, /4 avaliações nos últimos 30 dias/);
  assert.doesNotMatch(totals, /99|7 dias/);
  const days = textOf(field('admin-ai-sat-days'));
  assert.match(days, /08\/10/);
  assert.doesNotMatch(days, /01\/09/);
  assert.equal(field('admin-ai-sat-totals').getAttribute('aria-busy'), null);
});

test('Métricas: resposta antiga de 7 dias não sobrescreve a de 30', async () => {
  Admin.loadMetrics(7);
  Admin.loadMetrics(30);
  requests('apiAdminAiMetrics', 30)[0].resolve(metricsRes(50));
  await flush();
  requests('apiAdminAiMetrics', 7)[0].resolve(metricsRes(499));
  await flush();
  const rendered = textOf(field('admin-ai-metrics'));
  assert.match(rendered, /50 de 500 tokens/);
  assert.doesNotMatch(rendered, /499/);
});

test('Métricas: resposta de 7 dias que chega antes (ordem inversa) não é desenhada; a de 30 dias segue e libera o estado de busy', async () => {
  Admin.loadMetrics(7);
  Admin.loadMetrics(30);
  requests('apiAdminAiMetrics', 7)[0].resolve(metricsRes(499));
  await flush();
  assert.doesNotMatch(textOf(field('admin-ai-metrics')), /499/);
  assert.equal(field('admin-ai-metrics').getAttribute('aria-busy'), 'true');
  requests('apiAdminAiMetrics', 30)[0].resolve(metricsRes(50));
  await flush();
  const rendered = textOf(field('admin-ai-metrics'));
  assert.match(rendered, /50 de 500 tokens/);
  assert.doesNotMatch(rendered, /499/);
  assert.equal(field('admin-ai-metrics').getAttribute('aria-busy'), null);
  assert.equal(field('btn-admin-ai-metrics-30').getAttribute('aria-pressed'), 'true');
});

test('Satisfação: contagens no singular e dia em dd/mm', async () => {
  Admin.loadSatisfaction(7);
  requests('apiAdminAssistantStats', 7)[0].resolve({
    success: true,
    totals: { total: 1, up: 1, down: 0, utilityRate: 1 },
    byCategory: [{ category: 'incorreta', up: 1, down: 0 }],
    byDay: [{ day: '2026-10-08', up: 1, down: 0 }],
  });
  await flush();
  assert.match(textOf(field('admin-ai-sat-totals')), /1 útil · 0 não úteis · 1 avaliação nos últimos 7 dias/);
  const categories = textOf(field('admin-ai-sat-categories'));
  assert.match(categories, /1 útil/);
  assert.match(categories, /0 não úteis/);
  const days = textOf(field('admin-ai-sat-days'));
  assert.match(days, /08\/10/);
  assert.match(days, /1 útil · 0 não/);
});

test('botões 7/30 dias: aria-pressed acompanha o período pedido', () => {
  Admin.loadSatisfaction(30);
  assert.equal(field('btn-admin-ai-sat-30').getAttribute('aria-pressed'), 'true');
  assert.equal(field('btn-admin-ai-sat-7').getAttribute('aria-pressed'), 'false');
  Admin.loadAtlasUsage(30);
  assert.equal(field('btn-admin-ai-atlas-30').getAttribute('aria-pressed'), 'true');
  assert.equal(field('btn-admin-ai-atlas-7').getAttribute('aria-pressed'), 'false');
  Admin.loadMetrics(7);
  assert.equal(field('btn-admin-ai-metrics-7').getAttribute('aria-pressed'), 'true');
  assert.equal(field('btn-admin-ai-metrics-30').getAttribute('aria-pressed'), 'false');
});

test('Satisfação: aria-busy no contêiner durante a busca e removido ao terminar', async () => {
  Admin.loadSatisfaction(7);
  assert.equal(field('admin-ai-sat-totals').getAttribute('aria-busy'), 'true');
  assert.equal(field('admin-ai-sat-days').getAttribute('aria-busy'), 'true');
  requests('apiAdminAssistantStats', 7)[0].resolve(satStats({ total: 1, up: 1, down: 0, day: '2026-10-08' }));
  await flush();
  assert.equal(field('admin-ai-sat-totals').getAttribute('aria-busy'), null);
  Admin.loadSatList(true, false);
  assert.equal(field('admin-ai-sat-list').getAttribute('aria-busy'), 'true');
  lastRequest('apiAdminListAssistantFeedback').resolve({ success: true, items: [], nextCursor: null });
  await flush();
  assert.equal(field('admin-ai-sat-list').getAttribute('aria-busy'), null);
});

test('Satisfação: erro real vira role="alert"; carregando fica em role="status"', async () => {
  Admin.loadSatisfaction(7);
  assert.equal(field('msg-admin-ai-sat').getAttribute('role'), 'status');
  requests('apiAdminAssistantStats', 7)[0].resolve({ success: false, message: 'Servidor ocupado.' });
  await flush();
  assert.equal(field('msg-admin-ai-sat').getAttribute('role'), 'alert');
  assert.equal(textOf(field('msg-admin-ai-sat')), 'Servidor ocupado.');
  Admin.loadSatisfaction(7);
  assert.equal(field('msg-admin-ai-sat').getAttribute('role'), 'status');
});

test('lista da Satisfação: Marcar revisado e Descartar têm rótulo único por avaliação', async () => {
  Admin.loadSatList(true, false);
  lastRequest('apiAdminListAssistantFeedback').resolve({
    success: true,
    items: [feedbackItem(1, 'ana', 'texto privado 1'), feedbackItem(2, 'bruno', 'texto privado 2')],
    nextCursor: null,
  });
  await flush();
  const labels = findAll(field('admin-ai-sat-list'), 'button').map((b) => b.getAttribute('aria-label'));
  assert.deepEqual(labels, [
    'Marcar revisado: avaliação de ana em 08/10/2026, 10:00',
    'Descartar: avaliação de ana em 08/10/2026, 10:00',
    'Marcar revisado: avaliação de bruno em 08/10/2026, 10:00',
    'Descartar: avaliação de bruno em 08/10/2026, 10:00',
  ]);
  assert.equal(new Set(labels).size, labels.length);
  assert.ok(labels.every((label) => !/texto privado/.test(label)));
});

test('painel: abrir a aba não chama o teste de chaves; só o botão chama', () => {
  Admin.loadPanel();
  assert.equal(calls.some((c) => c.name === 'apiAdminAiHealth'), false);
  field('btn-admin-ai-health').listeners.click.forEach((fn) => fn());
  assert.equal(calls.some((c) => c.name === 'apiAdminAiHealth'), true);
});

test('logout (reset) limpa filtros e controles da Satisfação', () => {
  Admin.loadPanel();
  const status = field('admin-ai-sat-status');
  status.value = 'dismissed';
  status.listeners.change.forEach((fn) => fn());
  assert.equal(lastCall('apiAdminListAssistantFeedback').params.status, 'dismissed');
  Admin.reset();
  assert.equal(status.value, '');
  calls.length = 0;
  Admin.loadSatList(true, false);
  assert.equal(lastCall('apiAdminListAssistantFeedback').params.status, undefined);
});
