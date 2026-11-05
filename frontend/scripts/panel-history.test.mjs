/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Botão Voltar do Android (frontend/panel-history.js, MOB-01): decisões puras de push e de popstate,
// ligação no app.js e registro no index.html, build.js e sw.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const H = createRequire(import.meta.url)('../panel-history.js');

const ctx = (over) => Object.assign({
  loggedIn: true, current: 'panel-events', canOpen: (id) => ['panel-home', 'panel-events', 'panel-learn'].includes(id),
}, over);

test('só estado de painel válido conta', () => {
  assert.equal(H.isPanelState(H.stateFor('panel-events')), true);
  assert.equal(H.isPanelState(null), false);
  assert.equal(H.isPanelState({ laift: 'outro', panel: 'panel-events' }), false);
  assert.equal(H.isPanelState({ laift: 'panel', panel: 'javascript:alert(1)' }), false);
  assert.equal(H.isPanelState({ laift: 'panel', panel: 'panel-' + 'x'.repeat(80) }), false);
});

test('pushOp: primeira tela só marca; troca empilha; repetir o mesmo painel não faz nada; nome inválido é ignorado', () => {
  assert.equal(H.pushOp(null, 'panel-home', true), 'replace');
  assert.equal(H.pushOp(H.stateFor('panel-home'), 'panel-events', false), 'push');
  assert.equal(H.pushOp(H.stateFor('panel-events'), 'panel-events', false), 'none');
  assert.equal(H.pushOp(null, 'x"; drop', false), 'none');
});

test('popDecision: voltar reabre o painel anterior', () => {
  assert.deepEqual(H.popDecision(H.stateFor('panel-learn'), ctx()), { type: 'show', panel: 'panel-learn', module: '' });
});

test('popDecision: mesmo painel, painel fechado para este modo e sessão encerrada são ignorados ou caem na Início', () => {
  assert.deepEqual(H.popDecision(H.stateFor('panel-events'), ctx()), { type: 'ignore' });
  assert.deepEqual(H.popDecision(H.stateFor('panel-admin-users'), ctx()), { type: 'show', panel: 'panel-home' });
  assert.deepEqual(H.popDecision(H.stateFor('panel-learn'), ctx({ loggedIn: false })), { type: 'ignore' });
});

test('popDecision: sem estado de painel leva à Início, mas não faz nada se já está nela ou se ela está fechada', () => {
  assert.deepEqual(H.popDecision(null, ctx()), { type: 'show', panel: 'panel-home' });
  assert.deepEqual(H.popDecision(null, ctx({ current: 'panel-home' })), { type: 'ignore' });
  assert.deepEqual(H.popDecision(null, ctx({ canOpen: () => false })), { type: 'ignore' });
});

test('onPopState chama show só quando há o que mostrar', () => {
  const shown = [];
  H.onPopState({ state: H.stateFor('panel-learn') }, ctx(), (id) => shown.push(id));
  H.onPopState({ state: H.stateFor('panel-events') }, ctx(), (id) => shown.push(id));
  assert.deepEqual(shown, ['panel-learn']);
});

test('a primeira tela mantém o hash da URL (link do Atlas e telas públicas dependem dele)', () => {
  const code = read('panel-history.js');
  assert.ok(code.includes("replaceState(stateFor(panelId, moduleId), '', window.location.pathname + window.location.search + window.location.hash)"));
  assert.equal(code.split('pushState(')[1].split(')')[0].includes('hash'), false);
});

test('app.js empilha ao trocar de painel, trata popstate sem empilhar de novo e reinicia no logout', () => {
  const app = read('app.js');
  assert.match(app, /LaiftPanelHistory\.push\(panelId, /);
  assert.match(app, /addEventListener\('popstate'/);
  assert.match(app, /showPanel\(panelId, \{ fromHistory: true \}\)/);
  assert.match(app, /LaiftPanelHistory\.reset\(\)/);
});

test('TRA-03: o módulo aberto entra no estado e o voltar fecha o módulo sem sair do Aprender', () => {
  assert.deepEqual(H.stateFor('panel-learn', 'farmaco'), { laift: 'panel', panel: 'panel-learn', module: 'farmaco' });
  assert.equal(H.stateFor('panel-learn', 'x"; y').module, undefined);
  assert.equal(H.isPanelState({ laift: 'panel', panel: 'panel-learn', module: '../x' }), false);
  assert.equal(H.moduleOf(H.stateFor('panel-learn', 'lab')), 'lab');
  assert.equal(H.pushOp(H.stateFor('panel-learn'), 'panel-learn', false, 'lab'), 'push');
  assert.equal(H.pushOp(H.stateFor('panel-learn', 'lab'), 'panel-learn', false, 'lab'), 'none');
  const c = ctx({ current: 'panel-learn', currentModule: 'lab' });
  assert.deepEqual(H.popDecision(H.stateFor('panel-learn'), c), { type: 'show', panel: 'panel-learn', module: '' });
  assert.deepEqual(H.popDecision(H.stateFor('panel-learn', 'lab'), c), { type: 'ignore' });
  assert.deepEqual(H.popDecision(H.stateFor('panel-learn', 'lab'), ctx({ current: 'panel-learn' })), { type: 'show', panel: 'panel-learn', module: 'lab' });
  const shown = [];
  H.onPopState({ state: H.stateFor('panel-learn', 'lab') }, ctx({ current: 'panel-learn' }), (id, mod) => shown.push([id, mod]));
  assert.deepEqual(shown, [['panel-learn', 'lab']]);
});

test('TRA-03: app.js e learning.js usam a pilha do histórico para abrir e fechar módulo', () => {
  const app = read('app.js');
  assert.match(app, /currentModule: /);
  assert.match(app, /closeModule\(\{ fromHistory: true \}\)/);
  const learning = read('learning.js');
  assert.match(learning, /LaiftPanelHistory\.push\('panel-learn', id\)/);
  assert.match(learning, /LaiftPanelHistory\.currentModule\(\)/);
  assert.match(learning, /'Escape'/);
});

test('está no index.html, no build e no cache do service worker', () => {
  assert.match(read('index.html'), /panel-history\.js/);
  assert.match(read('scripts/build.js'), /panel-history\.js/);
  assert.match(read('sw.js'), /panel-history\.js/);
});
