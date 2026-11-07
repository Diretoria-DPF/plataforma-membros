/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CR = String.fromCharCode(13);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').split(CR).join('');
const O = require('../modulos/fiscal/fiscal-overview.js');
const HTML = read('modulos/fiscal/index.html');
const ENGINE = read('modulos/fiscal/fiscal-engine.js');
const JS = read('modulos/fiscal/fiscal-overview.js');

test('periodLabel: 30, 90 e tudo; valor estranho cai em 90 dias', () => {
  assert.equal(O.periodLabel(30), 'últimos 30 dias');
  assert.equal(O.periodLabel(0), 'todo o período');
  assert.equal(O.periodLabel(7), 'últimos 90 dias');
});

test('formatPct: número vira percentual e ausência de dado vira travessão', () => {
  assert.equal(O.formatPct(75), '75%');
  assert.equal(O.formatPct(0), '0%');
  assert.equal(O.formatPct(null), '—');
  assert.equal(O.formatPct(undefined), '—');
});

test('sortMembers: por nome (acentos em pt-BR) ou por presença; não altera a lista original', () => {
  const rows = [
    { fullName: 'Zeca', pct: 40, present: 2 },
    { fullName: 'Ágata', pct: 100, present: 3 },
    { fullName: 'Bia', pct: null, present: 0 },
    { fullName: 'Caio', pct: 100, present: 5 },
  ];
  const copy = rows.slice();
  assert.deepEqual(O.sortMembers(rows, 'nome').map((r) => r.fullName), ['Ágata', 'Bia', 'Caio', 'Zeca']);
  assert.deepEqual(O.sortMembers(rows, 'presenca').map((r) => r.fullName), ['Caio', 'Ágata', 'Zeca', 'Bia']);
  assert.deepEqual(rows, copy);
  assert.deepEqual(O.sortMembers(null, 'nome'), []);
});

test('taskSummary: singular, plural e comparecimento só quando a tarefa está ligada a evento', () => {
  assert.equal(O.taskSummary({ signups: 1, linked: false, signupsPresent: null }), '1 inscrito');
  assert.equal(O.taskSummary({ signups: 3, linked: true, signupsPresent: 2 }), '3 inscritos · 2 no evento ligado');
  assert.equal(O.taskSummary({ signups: 3, linked: true, signupsPresent: null }), '3 inscritos');
});

test('tela: terceira aba, painel, filtros, botões de PDF e a ficha no relatório da aba Presença', () => {
  for (const id of ['tabVisao', 'paneOverview', 'ovPeriod', 'ovSort', 'ovRefresh', 'ovMetrics', 'ovMembers', 'ovEvents', 'ovTasks', 'ovPdf', 'sheetPdf', 'printArea']) {
    assert.ok(HTML.includes('id="' + id + '"'), 'falta #' + id);
  }
  assert.match(HTML, /aria-controls="paneOverview"/);
  assert.match(HTML, /<script src="fiscal-overview\.js"><\/script>/);
});

test('motor: as três abas, atalhos de teclado e a visão geral carrega ao abrir a aba', () => {
  assert.match(ENGINE, /\['overview', 'tabVisao', 'paneOverview'\]/);
  assert.match(ENGINE, /current === 'overview' && window\.FiscalOverview/);
  assert.match(ENGINE, /FiscalEngine = \{ init: init, printArea: printArea, setStatus: setStatus \}/);
});

test('módulo: só nome, cargo e contagens; PDF por impressão; sem innerHTML; consulta antiga é descartada', () => {
  assert.ok(!/\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML|document\.write\(/.test(JS));
  const code = JS.replace(/\/\*[\s\S]*?\*\//g, '').split(String.fromCharCode(10)).map((l) => l.replace(/\/\/.*$/, '')).join(String.fromCharCode(10));
  assert.ok(!/email|e-mail|telefone|phone/i.test(code), 'o código do módulo não toca em contato');
  assert.match(JS, /forExport: true/);
  assert.match(JS, /apiAdminAttendanceSheet/);
  assert.match(JS, /if \(seq !== state\.seq\) return;/);
  assert.match(JS, /Salvar como PDF/);
});
