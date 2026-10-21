/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Direitos do titular (frontend/privacy.js) e fila de exclusões (frontend/privacy-admin.js): funções puras e fiação no app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const P = require('../privacy.js');
const PA = require('../privacy-admin.js');
const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8');
const NOW = '2026-10-20T12:00:00Z';

test('nome do arquivo de download usa a data UTC de geração', () => {
  assert.equal(P.downloadFileName('2026-10-05T23:30:00Z'), 'meus-dados-laift-2026-10-05.json');
  assert.equal(P.downloadFileName('lixo', '2026-01-02T00:00:00Z'), 'meus-dados-laift-2026-01-02.json');
  assert.match(P.downloadFileName(undefined), /^meus-dados-laift-\d{4}-\d{2}-\d{2}\.json$/);
});

test('conteúdo do arquivo é JSON legível com generatedAt e data', () => {
  const out = JSON.parse(P.exportContent({ success: true, generatedAt: NOW, data: { profile: { fullName: 'Ana' } }, notes: ['x'] }));
  assert.deepEqual(out, { generatedAt: NOW, data: { profile: { fullName: 'Ana' } } });
  assert.deepEqual(JSON.parse(P.exportContent(null)), { generatedAt: null, data: {} });
});

test('contagem de dias até o prazo e destaque', () => {
  assert.equal(P.daysLeft('2026-11-19T12:00:00Z', NOW), 30);
  assert.equal(P.daysLeft('2026-10-20T18:00:00Z', NOW), 1);
  assert.equal(P.daysLeft('2026-10-17T12:00:00Z', NOW), -3);
  assert.equal(P.daysLeft('lixo', NOW), null);
  assert.equal(P.urgency('2027-03-01T00:00:00Z', NOW), 'ok');
  assert.equal(P.urgency('2026-11-18T12:00:00Z', NOW), 'soon');
  assert.equal(P.urgency('2026-11-19T12:00:00Z', NOW), 'ok');
  assert.equal(P.urgency('2026-10-19T12:00:00Z', NOW), 'overdue');
  assert.equal(P.urgency(null, NOW), 'ok');
});

test('textos de dias: plural, hoje e vencido', () => {
  assert.equal(P.daysText('2026-11-01T12:00:00Z', NOW), 'faltam 12 dias');
  assert.equal(P.daysText('2026-10-21T12:00:00Z', NOW), 'falta 1 dia');
  assert.equal(P.daysText(NOW, NOW), 'vence hoje');
  assert.equal(P.daysText('2026-10-19T12:00:00Z', NOW), 'venceu há 1 dia');
  assert.equal(P.daysText('2026-10-10T12:00:00Z', NOW), 'venceu há 10 dias');
  assert.equal(P.daysText('', NOW), '');
});

test('estado do pedido do titular', () => {
  assert.match(P.requestSummary(null), /não tem pedido/);
  const text = P.requestSummary({ status: 'requested', requestedAt: '2026-10-01T10:00:00Z', dueAt: '2027-03-30T10:00:00Z' }, NOW);
  assert.match(text, /Pedido feito em 01\/10\/2026/);
  assert.match(text, /até 30\/03\/2027 \(faltam \d+ dias\)/);
  assert.match(text, /você pode cancelar/);
  assert.equal(P.statusLabel('requested'), 'Em andamento');
  assert.equal(P.statusLabel('completed'), 'Concluída');
  assert.equal(P.statusLabel('cancelled'), 'Cancelada');
});

test('motivo opcional: vazio vira carga vazia, limite de 500', () => {
  assert.deepEqual(P.reasonPayload('   '), { ok: true, payload: {} });
  assert.deepEqual(P.reasonPayload(undefined), { ok: true, payload: {} });
  assert.deepEqual(P.reasonPayload(' não uso mais '), { ok: true, payload: { reason: 'não uso mais' } });
  assert.equal(P.reasonPayload('a'.repeat(500)).ok, true);
  assert.equal(P.reasonPayload('a'.repeat(501)).ok, false);
  assert.equal(P.remainingText('abc'), 'Restam 497 caracteres.');
  assert.match(P.remainingText('a'.repeat(503)), /Passou 3/);
});

test('fila do admin: textos, destaque e contagem', () => {
  assert.equal(PA.countText(0), 'Nenhum pedido neste filtro.');
  assert.equal(PA.countText(1), '1 pedido');
  assert.equal(PA.countText(3), '3 pedidos');
  assert.deepEqual(PA.TABS.map((t) => t.status), ['requested', 'completed', 'cancelled']);
  assert.match(PA.emptyText('completed'), /Nenhuma exclusão concluída/);
  assert.match(PA.confirmText({ label: 'Maria' }), /"Maria".*apaga a conta de forma definitiva e não pode ser desfeito/);
  const open = { status: 'requested', requestedAt: '2026-10-01T10:00:00Z', dueAt: '2026-11-01T10:00:00Z' };
  assert.equal(PA.dateLine(open, NOW), 'Pedido em 01/10/2026 · prazo 01/11/2026 (faltam 12 dias)');
  assert.equal(PA.dateLine({ status: 'completed', requestedAt: open.requestedAt, dueAt: open.dueAt }, NOW), 'Pedido em 01/10/2026 · prazo 01/11/2026');
  assert.equal(PA.itemUrgency(open, NOW), 'soon');
  assert.equal(PA.itemUrgency({ status: 'completed', dueAt: '2020-01-01T00:00:00Z' }, NOW), 'ok');
  const late = { status: 'requested', dueAt: '2026-10-01T00:00:00Z' };
  assert.equal(PA.urgentCount([open, late, { status: 'requested', dueAt: '2027-06-01T00:00:00Z' }], NOW), 2);
});

test('fiação: index.html, app.js, build e service worker', () => {
  const html = read('index.html');
  assert.match(html, /<div id="privacy-root"><\/div>/);
  assert.match(html, /<div id="privacy-admin-root"><\/div>/);
  assert.match(html, /<button type="button" data-panel="panel-admin-privacy" data-scope="admin">/);
  assert.match(html, /href="privacy\.css"/);
  assert.ok(html.indexOf('<script src="privacy.js"') < html.indexOf('<script src="privacy-admin.js"'));
  const app = read('app.js');
  assert.match(app, /'panel-admin-privacy': function \(\) \{ if \(window\.LaiftPrivacyAdmin\) window\.LaiftPrivacyAdmin\.load\(/);
  assert.match(app, /window\.LaiftPrivacy\.load\(window\.App, document\)/);
  assert.equal((app.match(/window\.LaiftPrivacy\.reset\(\)/g) || []).length, 2);
  assert.equal((app.match(/window\.LaiftPrivacyAdmin\.reset\(\)/g) || []).length, 2);
  for (const f of ['scripts/build.js', 'sw.js']) {
    for (const asset of ['privacy.js', 'privacy-admin.js', 'privacy.css']) assert.ok(read(f).includes(`'${asset}'`), `${f} lista ${asset}`);
  }
});

test('concluir exclusão pede reautenticação (senha e 2º fator) pela janela padrão do app (B-05)', () => {
  const app = read('app.js');
  assert.match(app, /openStepUp: openStepUp,/);
  const js = read('privacy-admin.js');
  assert.match(js, /ui\.app\.openStepUp\(/);
  assert.match(js, /call\('apiAdminCompleteDeletion', \{ id: item\.id, password: stepUp\.password, code: stepUp\.code \}\)/);
});

test('higiene: sem innerHTML, sem estilo inline, sem armazenamento no navegador', () => {
  for (const f of ['privacy.js', 'privacy-admin.js']) {
    const js = read(f);
    assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML|\.style\.|localStorage|sessionStorage|document\.cookie/, f);
    assert.match(js, /Todos os direitos reservados/, f);
  }
  assert.match(read('privacy.css'), /Todos os direitos reservados/);
});
