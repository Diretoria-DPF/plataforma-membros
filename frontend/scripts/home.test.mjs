/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Painel Início (frontend/home.js): saudação, cartões do resumo e renderização segura.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Home = require('../home.js');

/** DOM mínimo; innerHTML lança, como em shared-states.test.mjs. */
function fakeDoc() {
  const make = (tag) => {
    const node = {
      tag, children: [], attrs: {}, className: '', textContent: '', listeners: {},
      appendChild(c) { this.children.push(c); return c; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      addEventListener(t, fn) { this.listeners[t] = fn; },
    };
    Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
    return node;
  };
  return { createElement: make };
}
const flat = (n) => [n, ...n.children.flatMap(flat)];
const allText = (n) => flat(n).map((x) => x.textContent).filter(Boolean);

const NOW = new Date('2026-10-10T15:00:00Z');
const SUMMARY = {
  nextEvents: [
    { id: 'e1', title: 'Aula de Toxicologia', eventDate: '2026-10-11T15:00:00Z', location: 'Sala 2', isRegistered: true, spotsLeft: 3 },
    { id: 'e2', title: 'Simpósio', eventDate: '2026-10-20T15:00:00Z', location: null, isRegistered: false, spotsLeft: null },
  ],
  tasks: { myPendingCount: 2, availableCount: 1, next: { id: 't1', title: 'Revisar casos', dueDate: '2026-10-13T15:00:00Z' } },
  voting: { openCount: 2, pendingCount: 1, nextClosesAt: '2026-10-12T15:00:00Z' },
  learning: { accuracyPct: 72, questionsAnswered: 40, totalActivities: 9, unlockedBadges: 2, totalBadges: 5 },
  inbox: { unreadMessages: 3, pendingConnectionRequests: 1 },
};

test('saudação conforme a hora e só o primeiro nome', () => {
  const at = (h) => new Date(2026, 9, 10, h, 0, 0);
  assert.equal(Home.greeting('Maria da Silva Souza', at(8)), 'Bom dia, Maria');
  assert.equal(Home.greeting('Maria da Silva Souza', at(14)), 'Boa tarde, Maria');
  assert.equal(Home.greeting('Maria da Silva Souza', at(21)), 'Boa noite, Maria');
  assert.equal(Home.greeting('', at(8)), 'Bom dia');
  assert.equal(Home.greeting(undefined, at(8)), 'Bom dia');
});

test('dia relativo: hoje, amanhã, em N dias, ontem e há N dias', () => {
  const base = new Date(2026, 9, 10, 12, 0, 0);
  const day = (offset) => new Date(2026, 9, 10 + offset, 18, 0, 0).toISOString();
  assert.equal(Home.relativeDay(day(0), base), 'hoje');
  assert.equal(Home.relativeDay(day(1), base), 'amanhã');
  assert.equal(Home.relativeDay(day(5), base), 'em 5 dias');
  assert.equal(Home.relativeDay(day(-1), base), 'ontem');
  assert.equal(Home.relativeDay(day(-4), base), 'há 4 dias');
  assert.equal(Home.relativeDay(null, base), '');
  assert.equal(Home.relativeDay('lixo', base), '');
});

test('membro recebe os 5 cartões, na ordem da tela', () => {
  const cards = Home.buildCards(SUMMARY, NOW);
  assert.deepEqual(cards.map((c) => c.id), ['events', 'tasks', 'voting', 'learning', 'inbox']);
});

test('visitante só recebe eventos e aprendizado', () => {
  const cards = Home.buildCards({ ...SUMMARY, tasks: null, voting: null, inbox: null }, NOW);
  assert.deepEqual(cards.map((c) => c.id), ['events', 'learning']);
});

test('cartão de eventos: itens com o selo "Inscrito" e local opcional', () => {
  const events = Home.buildCards(SUMMARY, NOW).find((c) => c.id === 'events');
  assert.equal(events.kind, 'list');
  assert.equal(events.items.length, 2);
  assert.deepEqual(events.items[0], { title: 'Aula de Toxicologia', whenIso: '2026-10-11T15:00:00Z', place: 'Sala 2', badge: 'Inscrito' });
  assert.equal(events.items[1].place, '');
  assert.equal(events.items[1].badge, null);
  assert.deepEqual(events.action, { label: 'Ver eventos', panel: 'panel-events' });
});

test('cartão de eventos vazio mostra texto de vazio', () => {
  const events = Home.buildCards({ ...SUMMARY, nextEvents: [] }, NOW).find((c) => c.id === 'events');
  assert.equal(events.items.length, 0);
  assert.match(events.emptyText, /Nenhum evento/);
});

test('cartão de tarefas: número, rótulo no plural/singular e a próxima a vencer', () => {
  const tasks = Home.buildCards(SUMMARY, NOW).find((c) => c.id === 'tasks');
  assert.equal(tasks.metric, '2');
  assert.equal(tasks.metricLabel, 'pendentes');
  assert.match(tasks.detail, /Revisar casos/);
  assert.deepEqual(tasks.action, { label: 'Ver tarefas', panel: 'panel-tasks' });
  const one = Home.buildCards({ ...SUMMARY, tasks: { myPendingCount: 1, availableCount: 0, next: null } }, NOW).find((c) => c.id === 'tasks');
  assert.equal(one.metricLabel, 'pendente');
});

test('cartão de tarefas sem pendências: avisa o que está disponível', () => {
  const none = Home.buildCards({ ...SUMMARY, tasks: { myPendingCount: 0, availableCount: 2, next: null } }, NOW).find((c) => c.id === 'tasks');
  assert.equal(none.metric, '0');
  assert.match(none.detail, /2 tarefas disponíveis/);
  const empty = Home.buildCards({ ...SUMMARY, tasks: { myPendingCount: 0, availableCount: 0, next: null } }, NOW).find((c) => c.id === 'tasks');
  assert.match(empty.detail, /Nenhuma tarefa/);
});

test('cartão de votações: pendentes e prazo; sem pendência, diz que está em dia', () => {
  const voting = Home.buildCards(SUMMARY, NOW).find((c) => c.id === 'voting');
  assert.equal(voting.metric, '1');
  assert.equal(voting.metricLabel, 'para votar');
  assert.match(voting.detail, /Encerra/);
  assert.deepEqual(voting.action, { label: 'Votar', panel: 'panel-proposals' });
  const done = Home.buildCards({ ...SUMMARY, voting: { openCount: 2, pendingCount: 0, nextClosesAt: null } }, NOW).find((c) => c.id === 'voting');
  assert.match(done.detail, /já votou/);
  const closed = Home.buildCards({ ...SUMMARY, voting: { openCount: 0, pendingCount: 0, nextClosesAt: null } }, NOW).find((c) => c.id === 'voting');
  assert.match(closed.detail, /Nenhuma votação/);
});

test('cartão de aprendizado: acerto, questões e selos; sem dados mostra traço', () => {
  const learning = Home.buildCards(SUMMARY, NOW).find((c) => c.id === 'learning');
  assert.equal(learning.metric, '72%');
  assert.match(learning.detail, /40 questões/);
  assert.match(learning.detail, /2 de 5 selos/);
  assert.deepEqual(learning.action, { label: 'Estudar', panel: 'panel-learn' });
  const none = Home.buildCards({ ...SUMMARY, learning: { accuracyPct: null, questionsAnswered: 0, totalActivities: 0, unlockedBadges: 0, totalBadges: 5 } }, NOW).find((c) => c.id === 'learning');
  assert.equal(none.metric, '—');
});

test('cartão da caixa de entrada: mensagens novas e pedidos de conexão', () => {
  const inbox = Home.buildCards(SUMMARY, NOW).find((c) => c.id === 'inbox');
  assert.equal(inbox.metric, '3');
  assert.equal(inbox.metricLabel, 'mensagens novas');
  assert.match(inbox.detail, /1 pedido de conexão/);
  const calm = Home.buildCards({ ...SUMMARY, inbox: { unreadMessages: 0, pendingConnectionRequests: 0 } }, NOW).find((c) => c.id === 'inbox');
  assert.match(calm.detail, /Tudo em dia/);
});

test('toda ação aponta para um painel que existe na navegação', () => {
  const html = read('frontend/index.html');
  for (const card of Home.buildCards(SUMMARY, NOW)) {
    assert.ok(html.includes('id="' + card.action.panel + '"'), card.action.panel + ' não existe no index.html');
  }
});

test('renderCards monta o DOM só com textContent e o botão navega para o painel', () => {
  const doc = fakeDoc();
  const host = doc.createElement('div');
  const visited = [];
  const evil = { ...SUMMARY, nextEvents: [{ id: 'x', title: '<img src=x onerror=alert(1)>', eventDate: '2026-10-11T15:00:00Z', location: '<b>l</b>', isRegistered: false, spotsLeft: 1 }] };
  Home.renderCards(doc, host, Home.buildCards(evil, NOW), (panel) => visited.push(panel), NOW);
  assert.ok(allText(host).includes('<img src=x onerror=alert(1)>'));
  const buttons = flat(host).filter((n) => n.tag === 'button');
  assert.equal(buttons.length, 5);
  buttons[0].listeners.click();
  buttons[3].listeners.click();
  assert.deepEqual(visited, ['panel-events', 'panel-learn']);
});

test('index.html: contêiner do Início, script home.js antes do app.js; build publica home.js; app.js carrega o painel', () => {
  const html = read('frontend/index.html');
  assert.match(html, /<section id="panel-home">[\s\S]*id="home-dashboard"/);
  const home = html.indexOf('<script src="home.js" defer></script>');
  const app = html.indexOf('<script src="app.js" defer></script>');
  assert.ok(home > 0 && home < app, 'home.js precisa vir antes do app.js');
  assert.match(read('frontend/scripts/build.js'), /'home\.js'/);
  assert.match(read('frontend/app.js'), /'panel-home':\s*function/);
});
