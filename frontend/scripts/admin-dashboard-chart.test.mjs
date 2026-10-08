/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel "Administração — dashboard": o gráfico é o groupedBars de LaiftCharts (SVG próprio),
// não mais o Chart.js do jsDelivr. Cobre as linhas do gráfico (app.js), o desenho com valores
// sempre visíveis e tabela alternativa, e a higiene da CSP/HTML (nenhum script de terceiro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const require = createRequire(import.meta.url);
const Charts = require('../modulos/shared/charts.js');

const APP = read('app.js');
const HTML = read('index.html');

// app.js é um IIFE sem exports; a parte pura fica entre estes marcadores e é avaliada isoladamente.
const BLOCK_START = '// >>> admin-dashboard-chart (puro)';
const BLOCK_END = '// <<< admin-dashboard-chart (puro)';
function pureHelpers() {
  const start = APP.indexOf(BLOCK_START);
  const end = APP.indexOf(BLOCK_END);
  assert.ok(start >= 0 && end > start, 'bloco "admin-dashboard-chart (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn { adminDashboardRows, ADMIN_CHART_LABELS };`)();
}

const INDICATORS = {
  active_members: 12, active_admins: 2, banned_accounts: 1, published_events: 3,
  proposals_pending: 1, proposals_voting: 4, tasks_open: 2,
};

/** DOM mínimo para o charts.js (mesmo recorte de charts.test.mjs). */
function fakeNode(tag) {
  return {
    tag,
    attrs: {},
    children: [],
    textContent: '',
    style: { props: {}, setProperty(key, value) { this.props[key] = value; } },
    get firstChild() { return this.children[0] || null; },
    appendChild(child) { this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); return child; },
    setAttribute(key, value) { this.attrs[key] = String(value); },
  };
}
const doc = { createElement: fakeNode, createElementNS: (_ns, tag) => fakeNode(tag) };

function mountPoint() {
  const container = fakeNode('div');
  container.ownerDocument = doc;
  return container;
}

function walk(node, out = []) {
  out.push(node);
  node.children.forEach((child) => walk(child, out));
  return out;
}
const byTag = (node, tag) => walk(node).filter((n) => n.tag === tag);
const classesOf = (node) => (node.attrs.class || '').split(/\s+/).filter(Boolean);
const byClass = (node, cls) => walk(node).filter((n) => classesOf(n).includes(cls));
const persistentValues = (node) => byClass(node, 'laift-chart__value').filter((n) => !classesOf(n).includes('laift-chart__value--hover'));

function drawDashboard(indicators) {
  const { adminDashboardRows } = pureHelpers();
  const container = mountPoint();
  const chart = Charts.groupedBars(container, adminDashboardRows(indicators), {
    title: 'Indicadores administrativos', series: ['Indicadores'], width: 320, height: 220, fluid: true, reducedMotion: true,
  });
  return { container, chart };
}

test('linhas do gráfico: um grupo por indicador, na ordem dos cartões, com série única', () => {
  const { adminDashboardRows, ADMIN_CHART_LABELS } = pureHelpers();
  const rows = adminDashboardRows(INDICATORS);
  assert.deepEqual(Object.keys(ADMIN_CHART_LABELS), [
    'active_members', 'active_admins', 'banned_accounts', 'published_events',
    'proposals_pending', 'proposals_voting', 'tasks_open',
  ]);
  assert.equal(rows.length, 7);
  assert.deepEqual(rows.map((r) => r.values), [[12], [2], [1], [3], [1], [4], [2]]);
  assert.ok(rows.every((r) => typeof r.label === 'string' && r.label.length > 0 && r.label.length <= 7), 'rótulos curtos cabem no celular');
});

test('linhas do gráfico: valor ausente, negativo, texto ou NaN vira 0; entrada vazia não quebra', () => {
  const { adminDashboardRows } = pureHelpers();
  const rows = adminDashboardRows({ active_members: -3, active_admins: 'abc', banned_accounts: NaN, published_events: '5', tasks_open: null });
  assert.deepEqual(rows.map((r) => r.values[0]), [0, 0, 0, 5, 0, 0, 0]);
  assert.equal(adminDashboardRows(undefined).length, 7);
  assert.equal(adminDashboardRows(null).every((r) => r.values[0] === 0), true);
});

test('groupedBars desenha SVG com os 7 valores sempre visíveis (sem depender de hover)', () => {
  const { container } = drawDashboard(INDICATORS);
  const svg = byTag(container, 'svg')[0];
  assert.equal(svg.attrs.role, 'img');
  assert.equal(persistentValues(container).length, 7, 'os 7 valores aparecem sem hover');
  assert.deepEqual(persistentValues(container).map((n) => n.textContent), ['12', '2', '1', '3', '1', '4', '2']);
  assert.equal(byClass(container, 'laift-chart__value--hover').length, 0);
  assert.equal(byClass(container, 'laift-chart__bar').length, 7);
});

test('groupedBars entrega a tabela alternativa sr-only com todos os indicadores', () => {
  const { container } = drawDashboard(INDICATORS);
  const table = byTag(container, 'table')[0];
  assert.ok(table, 'tabela alternativa existe');
  assert.equal(table.attrs.class, 'sr-only');
  assert.deepEqual(byTag(table, 'th').filter((n) => n.attrs.scope === 'col').map((n) => n.textContent), ['Grupo', 'Indicadores']);
  const rows = byTag(table, 'tr').slice(1);
  assert.equal(rows.length, 7);
  assert.equal(byTag(rows[0], 'td')[0].textContent, '12');
  assert.match(byTag(container, 'title')[0].textContent, /Indicadores administrativos/);
});

test('todos os indicadores em zero: continua desenhando e mostra "0" em cada coluna', () => {
  const { container } = drawDashboard({});
  assert.equal(persistentValues(container).length, 7);
  assert.ok(persistentValues(container).every((n) => n.textContent === '0'));
});

test('update() troca os dados no mesmo contêiner, sem empilhar gráficos', () => {
  const { adminDashboardRows } = pureHelpers();
  const { container, chart } = drawDashboard(INDICATORS);
  chart.update(adminDashboardRows({ active_members: 99 }));
  assert.equal(container.children.length, 1);
  assert.equal(persistentValues(container)[0].textContent, '99');
  chart.destroy();
  assert.equal(container.children.length, 0);
});

test('index.html: o contêiner do gráfico é um <div> (não <canvas>) e não há script de terceiro', () => {
  assert.match(HTML, /<div id="admin-dashboard-chart"><\/div>/);
  assert.doesNotMatch(HTML, /<canvas\b/);
  assert.doesNotMatch(HTML, /<script\b[^>]*\bsrc="https?:/i, 'nenhum <script src> externo na plataforma');
  assert.doesNotMatch(HTML, /chart\.umd|chart\.js@/i);
});

test('CSP da plataforma: script-src só com \'self\' (sem jsDelivr)', () => {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(HTML);
  assert.ok(meta, 'CSP por <meta> encontrada');
  const policy = Object.fromEntries(meta[1].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...values] = d.split(/\s+/);
    return [name, values];
  }));
  assert.deepEqual(policy['script-src'], ["'self'"]);
  assert.doesNotMatch(meta[1], /jsdelivr/i);
});

test('app.js não usa mais window.Chart nem "new Chart", e só desenha por LaiftCharts.groupedBars', () => {
  assert.doesNotMatch(APP, /window\.Chart\b|new\s+Chart\s*\(/);
  assert.match(APP, /charts\.groupedBars\(container, rows,/);
  assert.match(APP, /function resetAdminDashboardChart\(\)/);
});
