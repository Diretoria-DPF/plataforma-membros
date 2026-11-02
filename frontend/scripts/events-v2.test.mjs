/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Eventos v2 (events-v2.js, events-v2.css; flag events_v2_enabled): funções puras (data, vagas, filtros, próximo evento,
// ação do cartão), desenho com um DOM mínimo (sem innerHTML), ações ligadas ao app e a fiação (pacote sob demanda,
// tela de sempre intacta, CSS atrás da flag).
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
const ev = require('../events-v2.js');
const SRC = ler('events-v2.js');
const CSS = ler('events-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

const item = (over) => Object.assign({ id: 'e1', title: 'Aula aberta', description: 'Casos reais', eventDate: '2026-11-07T22:00:00Z', location: 'Auditório B', capacity: 20, spotsLeft: 12, isRegistered: false, status: 'open' }, over);

/** DOM mínimo com busca por atributo e classList. */
function fakeDoc() {
  const ids = new Map();
  function make(tag) {
    const classes = new Set();
    const el = {
      tagName: tag.toUpperCase(), children: [], attrs: {}, listeners: {}, textContent: '', _id: '', parentNode: null, disabled: false,
      get firstChild() { return this.children[0] || null; },
      get firstElementChild() { return this.children[0] || null; },
      get nextSibling() { return null; },
      get id() { return this._id; },
      set id(v) { this._id = v; ids.set(v, el); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
      insertBefore(child) { child.parentNode = el; el.children.unshift(child); return child; },
      removeChild(child) { el.children.splice(el.children.indexOf(child), 1); return child; },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      removeAttribute(k) { delete el.attrs[k]; },
      addEventListener(type, fn) { el.listeners[type] = fn; },
      contains(n) { return n === el || el.children.some((c) => c.contains && c.contains(n)); },
      focus() {}, querySelector: () => null,
    };
    el.classList = {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle(c, force) { const on = force === undefined ? !classes.has(c) : force; if (on) classes.add(c); else classes.delete(c); return on; },
    };
    return el;
  }
  const panel = make('section'); panel.id = 'panel-events';
  const h1 = make('h1'); panel.appendChild(h1);
  return { panel, createElement: make, createElementNS: (ns, tag) => make(tag), head: null, activeElement: null, getElementById: (id) => ids.get(id) || null };
}
const all = (el, test) => (test(el) ? [el] : []).concat(...el.children.map((c) => all(c, test)));
const textOf = (el) => [el.textContent].concat(el.children.map(textOf)).join('|');
const buttons = (el) => all(el, (n) => n.tagName === 'BUTTON');

// ---------- Funções puras ----------

test('dayParts e whenText: dia, mês abreviado e "dia da semana · hora"', () => {
  const d = new Date(2026, 10, 7, 19, 0).toISOString();
  assert.deepEqual(ev.dayParts(d), { day: '07', month: 'nov' });
  assert.equal(ev.whenText(d), 'sáb · 19h');
  assert.equal(ev.whenText(new Date(2026, 10, 7, 9, 5).toISOString()), 'sáb · 9h05');
  assert.deepEqual(ev.dayParts('lixo'), { day: '--', month: '---' });
  assert.equal(ev.whenText(null), '');
});

test('spotsText: só números reais; ilimitado e lotado', () => {
  assert.equal(ev.spotsText(item({ spotsLeft: 12 })), '12 vagas restantes');
  assert.equal(ev.spotsText(item({ spotsLeft: 1 })), '1 vaga restante');
  assert.equal(ev.spotsText(item({ spotsLeft: 0 })), 'Sem vagas');
  assert.equal(ev.spotsText(item({ capacity: null, spotsLeft: null })), 'Vagas ilimitadas');
});

test('eventState e filtros: Todos, Minhas inscrições e Com vagas', () => {
  const list = [item({ id: 'a' }), item({ id: 'b', isRegistered: true }), item({ id: 'c', spotsLeft: 0 }), item({ id: 'd', capacity: null, spotsLeft: null })];
  assert.deepEqual(list.map(ev.eventState), ['open', 'registered', 'full', 'open']);
  assert.deepEqual(ev.filterEvents(list, 'all').map((i) => i.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ev.filterEvents(list, 'mine').map((i) => i.id), ['b']);
  assert.deepEqual(ev.filterEvents(list, 'open').map((i) => i.id), ['a', 'b', 'd']);
  assert.deepEqual(ev.filterEvents(null, 'all'), []);
});

test('pickNext: o primeiro por data com vaga (ou inscrito); só lotados, o primeiro; vazio, null', () => {
  const list = [item({ id: 'c', eventDate: '2026-11-21T10:00:00Z', spotsLeft: 0 }), item({ id: 'a', eventDate: '2026-11-07T22:00:00Z' }), item({ id: 'b', eventDate: '2026-11-14T22:00:00Z' })];
  assert.equal(ev.pickNext(list).id, 'a');
  assert.equal(ev.pickNext([list[0], item({ id: 'z', eventDate: '2026-11-22T10:00:00Z', spotsLeft: 0 })]).id, 'c');
  assert.equal(ev.pickNext([item({ id: 'f', spotsLeft: 0, isRegistered: true })]).id, 'f');
  assert.equal(ev.pickNext([]), null);
  assert.equal(list[0].id, 'c', 'não muda a lista recebida');
});

test('actionKind: mesmas regras de visibilidade da tela de sempre', () => {
  assert.equal(ev.actionKind(item(), false, false), 'login');
  assert.equal(ev.actionKind(item(), true, false), 'register');
  assert.equal(ev.actionKind(item({ spotsLeft: 0 }), true, false), 'full');
  assert.equal(ev.actionKind(item({ isRegistered: true }), true, true), 'cancel');
  assert.equal(ev.actionKind(item({ isRegistered: true }), true, false), 'none');
  assert.equal(ev.actionKind(item({ isRegistered: true, spotsLeft: 0 }), true, true), 'cancel');
});

// ---------- Desenho ----------

function ctxFor(doc, over) {
  const calls = [];
  const ctx = Object.assign({
    doc, loggedIn: true, formatDate: (iso) => 'DATA ' + iso.slice(0, 10), canCancel: () => true,
    onRegister: (id) => calls.push(['register', id]), onCancel: (id) => calls.push(['cancel', id]), imageButton: null,
  }, over || {});
  return { ctx, calls };
}

test('renderEvents: destaque, três filtros, cartões e ações ligadas ao app', () => {
  const doc = fakeDoc();
  const { ctx, calls } = ctxFor(doc);
  ev.renderEvents(ctx, [item({ id: 'a' }), item({ id: 'b', title: 'Oficina', isRegistered: true, eventDate: '2026-11-14T22:00:00Z' }), item({ id: 'c', title: 'Encontro', spotsLeft: 0, eventDate: '2026-11-21T10:00:00Z' })]);
  const host = doc.getElementById('events-v2');
  assert.ok(host);
  assert.equal(doc.panel.getAttribute('data-v2'), '1');
  assert.deepEqual(all(host, (n) => n.className === 'ev2-chip' || /\bev2-chip\b/.test(n.className)).map((n) => n.textContent), ['Todos', 'Minhas inscrições', 'Com vagas']);
  assert.equal(all(host, (n) => /\bev2-next__card\b/.test(n.className)).length, 1);
  assert.equal(all(host, (n) => n.className === 'ev2-card').length + all(host, (n) => n.className === 'ev2-card is-full').length, 3);
  const disabled = buttons(host).filter((b) => b.disabled);
  assert.equal(disabled.length, 1);
  assert.equal(disabled[0].textContent, 'Sem vagas');
  assert.equal(disabled[0].getAttribute('aria-disabled'), 'true');
  const register = buttons(host).filter((b) => b.textContent === 'Inscrever-se');
  assert.ok(register.length >= 1);
  register[0].listeners.click();
  const cancel = buttons(host).filter((b) => b.textContent === 'Cancelar inscrição');
  assert.equal(cancel.length, 1);
  cancel[0].listeners.click();
  assert.deepEqual(calls, [['register', 'a'], ['cancel', 'b']]);
  assert.match(textOf(host), /Inscrição confirmada/);
  assert.match(textOf(host), /DATA 2026-11-07/);
});

test('renderEvents: sem sessão pede login e esconde "Minhas inscrições"; inscrito que não pode cancelar não tem botão', () => {
  const doc = fakeDoc();
  const { ctx } = ctxFor(doc, { loggedIn: false });
  ev.renderEvents(ctx, [item()]);
  const host = doc.getElementById('events-v2');
  assert.match(textOf(host), /Faça login para se inscrever\./);
  assert.equal(buttons(host).filter((b) => /Inscrever|Cancelar/.test(b.textContent)).length, 0);
  const mine = all(host, (n) => n.getAttribute && n.getAttribute('data-filter') === 'mine')[0];
  assert.ok(mine.classList.contains('hidden'));

  const doc2 = fakeDoc();
  const { ctx: ctx2 } = ctxFor(doc2, { canCancel: () => false });
  ev.renderEvents(ctx2, [item({ isRegistered: true })]);
  assert.equal(buttons(doc2.getElementById('events-v2')).filter((b) => /Inscrever|Cancelar/.test(b.textContent)).length, 0);
});

test('estados: vazio, erro com nova tentativa e histórico (lista, vazio, erro)', () => {
  const doc = fakeDoc();
  const { ctx } = ctxFor(doc);
  ev.renderEvents(ctx, []);
  assert.match(textOf(doc.getElementById('events-v2')), /Não há eventos publicados no momento\./);
  let retried = 0;
  ev.renderEventsError(doc, { success: false, message: 'Sem rede' }, () => { retried += 1; });
  assert.match(textOf(doc.getElementById('events-v2')), /Sem rede/);
  const again = buttons(doc.getElementById('events-v2')).filter((b) => b.textContent === 'Tentar de novo');
  assert.equal(again.length, 0, 'sem LaiftStates, só a mensagem');
  ev.renderHistory(doc, { success: true, events: [{ title: 'Aula de PK', eventDate: '2026-10-24T22:00:00Z', location: 'Sala 3', description: 'x' }] }, (i) => i, () => {});
  assert.match(textOf(doc.getElementById('events-v2')), /Aula de PK/);
  assert.match(textOf(doc.getElementById('events-v2')), /Concluído/);
  ev.renderHistory(doc, { success: true, events: [] }, (i) => i, () => {});
  assert.match(textOf(doc.getElementById('events-v2')), /Ainda não há eventos concluídos/);
  ev.renderHistory(doc, { success: false, message: 'Falhou' }, (i) => i, () => {});
  assert.match(textOf(doc.getElementById('events-v2')), /Não foi possível carregar o histórico/);
  assert.equal(retried, 0);
});

test('reset devolve a tela de sempre: tira o contêiner e a marca do painel', () => {
  const doc = fakeDoc();
  const { ctx } = ctxFor(doc);
  ev.renderEvents(ctx, [item()]);
  doc.panel.removeChild = (c) => { doc.panel.children.splice(doc.panel.children.indexOf(c), 1); };
  ev.reset(doc);
  assert.equal(doc.panel.getAttribute('data-v2'), null);
  assert.equal(doc.panel.children.length, 1);
});

// ---------- Fiação e regras do projeto ----------

test('sem innerHTML, sem estilo inline, sem emoji, sem "grátis" nem "Lia" em texto', () => {
  assert.doesNotMatch(SRC, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(SRC, /setAttribute\('style'|\.style\./);
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.doesNotMatch(SRC, emoji);
  assert.doesNotMatch(CSS, emoji);
  assert.doesNotMatch(SRC, /gr[aá]tis/i);
  assert.doesNotMatch(SRC.replace(/'lia'|LaiftAssistant|Lazy/g, ''), /'[^']*\bLia\b[^']*'/);
  assert.match(SRC, /Falar com a Guia/);
  assert.match(SRC, /createElementNS/);
});

test('pacote sob demanda eventos2: fora do shell, no lazy-bundles, copiado no build', () => {
  assertSobDemanda('eventos2', 'events-v2.js');
  assert.doesNotMatch(HTML, /<(?:script|link)[^>]*events-v2/);
  const build = ler('scripts/build.js');
  assert.ok(build.includes("'events-v2.js'") && build.includes("'events-v2.css'"));
  assert.ok(!ler('sw.js').includes('events-v2'), 'sob demanda: fora do precache');
});

test('app.js: v2 só com a flag; com ela desligada vale a tela de sempre; mesmas APIs e ações', () => {
  assert.match(APP, /function eventsV2On\(\) \{ return document\.documentElement\.hasAttribute\('data-flag-events-v2-enabled'\); \}/);
  assert.match(APP, /withBundle\('eventos2'/);
  assert.match(APP, /renderList\('events-list', res\.events, renderEventItem/);
  for (const nome of ['apiListEvents', 'apiRegisterForEvent', 'apiCancelEventRegistration', 'apiListRecentCompletedEvents']) assert.ok(APP.includes(`'${nome}'`), nome);
  assert.match(APP, /function renderEventItem\(/);
  assert.match(APP, /function canCancelRegistration\(/);
  assert.match(APP, /events_v2_enabled === true/);
});

test('CSS: tudo atrás da flag; alvos de 44 px; foco; movimento reduzido; temas claro e escuro', () => {
  assert.match(CSS, /:root\[data-flag-events-v2-enabled\] #panel-events\[data-v2\] > \.card \{ display: none; \}/);
  assert.match(CSS, /prefers-reduced-motion: no-preference/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /\[data-theme="dark"\]/);
  assert.match(CSS, /\.ev2-btn \{[^}]*min-height: 44px/);
  assert.match(CSS, /\.ev2-chip \{[^}]*min-height: 44px/);
  assert.match(CSS, /\.ev2-icon-btn \{[^}]*width: 44px; height: 44px/);
  assert.doesNotMatch(CSS, /font-size: (?:[0-9]|1[01])px/);
});
