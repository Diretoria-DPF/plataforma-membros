/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Início v3 (home-v3.js, home-v3.css; flag home_v2_enabled): funções puras (pontos da semana, anel, foco, "Para hoje",
// assuntos), desenho com um DOM mínimo (sem innerHTML), carga com dados reais e a fiação (pacote sob demanda, flag
// desligada por padrão, Início antiga intacta, "Meu desempenho" no Perfil, navegação responsiva no CSS).
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
const v3 = require('../home-v3.js');
const engagement = require('../engagement.js');
const home = require('../home.js');
const HTML = ler('index.html');
const SRC = ler('home-v3.js');
const CSS = ler('home-v3.css');
const APP = ler('app.js');

const NOW = new Date('2026-11-04T15:00:00-03:00');

/** DOM mínimo: elementos HTML e SVG, classList, style.setProperty, atributos e busca por id. */
function fakeDoc() {
  const ids = new Map();
  function make(tag) {
    const classes = new Set();
    const el = {
      tag, children: [], attrs: {}, listeners: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      textContent: '', _id: '', parentNode: null,
      get firstChild() { return this.children[0] || null; },
      get id() { return this._id; },
      set id(v) { this._id = v; ids.set(v, el); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
      removeChild(child) { el.children.splice(el.children.indexOf(child), 1); return child; },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      removeAttribute(k) { delete el.attrs[k]; },
      hasAttribute: (k) => k in el.attrs,
      addEventListener(type, fn) { el.listeners[type] = fn; },
      setAttributeNS() {},
    };
    el.classList = {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle(c, force) { const on = force === undefined ? !classes.has(c) : force; if (on) classes.add(c); else classes.delete(c); return on; },
    };
    return el;
  }
  const host = make('div'); host.id = 'home-v3'; host.classList.add('hidden');
  const panel = make('section'); panel.id = 'panel-home';
  return {
    host, panel, createElement: make, createElementNS: (ns, tag) => make(tag), head: null,
    getElementById: (id) => ids.get(id) || null, querySelector: () => null,
  };
}
const all = (el, test) => (test(el) ? [el] : []).concat(...el.children.map((c) => all(c, test)));
const textOf = (el) => [el.textContent].concat(el.children.map(textOf)).join('|');
const hasClass = (el, c) => el.classList.contains(c);

// ---------- Funções puras ----------

test('weekDots: sete pontos; acesos são os últimos dias da sequência, terminando em hoje ou ontem', () => {
  const on = (s) => v3.weekDots(s).map((d) => (d.on ? 1 : 0)).join('');
  assert.equal(on({ current: 4, activeToday: true }), '0001111');
  assert.equal(on({ current: 4, activeToday: false }), '0011110');
  assert.equal(on({ current: 0, activeToday: false }), '0000000');
  assert.equal(on({ current: 12, activeToday: true }), '1111111');
  assert.equal(on(null), '0000000');
  assert.equal(v3.weekDots({ current: 1, activeToday: true }).filter((d) => d.today).length, 1);
  assert.equal(v3.weekDots({ current: 1, activeToday: true })[6].today, true);
});

test('anel: porcentagem limitada de 0 a 100 e textos de meta', () => {
  assert.equal(v3.ringPercent(3, 10), 30);
  assert.equal(v3.ringPercent(15, 10), 100);
  assert.equal(v3.ringPercent(0, 0), 0);
  assert.equal(v3.ringPercent(-2, 10), 0);
  assert.equal(v3.ringLabel(3, 10), '3 de 10 questões hoje');
  assert.equal(v3.ringHint(3, 10), 'Faltam 7 questões');
  assert.equal(v3.ringHint(9, 10), 'Faltam 1 questão');
  assert.match(v3.ringHint(10, 10), /cumprida/);
  assert.equal(v3.streakLabel({ current: 1 }), '1 dia seguido');
  assert.equal(v3.streakLabel({ current: 4 }), '4 dias seguidos');
  assert.equal(v3.streakLabel(null), '0 dias seguidos');
});

test('focusModel: título do módulo, atividade e quando; sem último módulo, nada (o cartão some)', () => {
  const last = { id: 'farmaco', activity: 'quiz_estudo', at: '2026-11-03T12:00:00Z' };
  assert.deepEqual(v3.focusModel(last, NOW), { id: 'farmaco', title: 'Farmacologia', detail: 'simulado · ontem' });
  assert.equal(v3.focusModel(null, NOW), null);
  assert.equal(v3.focusModel({ id: 'inexistente', at: '2026-11-03T12:00:00Z' }, NOW), null);
  assert.equal(v3.focusModel({ id: 'lab', activity: null, at: null }, NOW).detail, 'Retome de onde parou');
});

test('todayItems: quiz do dia, próximo evento e votação aberta; só entra o que existe', () => {
  const summary = {
    nextEvents: [{ title: 'Aula de Toxicologia', eventDate: '2026-11-05T22:00:00Z', location: 'Sala 2', isRegistered: false }],
    voting: { openCount: 2, pendingCount: 2, nextClosesAt: '2026-11-07T22:00:00Z' },
  };
  const items = v3.todayItems(summary, { dailyQuizDone: false }, NOW);
  assert.deepEqual(items.map((i) => i.kind), ['quiz', 'event', 'voting']);
  assert.match(items[0].sub, /5 questões/);
  assert.match(items[1].sub, /Sala 2/);
  assert.equal(items[2].title, '2 votações abertas');
  assert.match(items[2].sub, /^Encerra em 3 dias$/);
  assert.match(v3.todayItems(null, { dailyQuizDone: true }, NOW)[0].sub, /Feito hoje/);
  assert.deepEqual(v3.todayItems({ nextEvents: [], voting: { pendingCount: 0 } }, null, NOW), []);
  assert.equal(v3.todayItems({ voting: { pendingCount: 1, nextClosesAt: null } }, null, NOW)[0].title, 'Votação aberta');
  assert.match(v3.todayItems({ nextEvents: [{ title: 'X', eventDate: '2026-11-05T22:00:00Z', isRegistered: true }] }, null, NOW)[0].sub, /Inscrição confirmada/);
});

test('subjectCards: cinco assuntos com cor, arte e aproveitamento real; sem dado, convite', () => {
  const cards = v3.subjectCards({ farmacologia: { attempts: 5, accuracyPct: 72 }, toxicologia: { attempts: 2, accuracyPct: null }, clinica: { attempts: 0, accuracyPct: null } });
  assert.deepEqual(cards.map((c) => c.id), ['farmaco', 'toxico', 'clinica', 'lab', 'anatomia']);
  assert.equal(cards[0].pct, 72);
  assert.equal(cards[0].text, '72% de acerto');
  assert.equal(cards[1].pct, null);
  assert.equal(cards[1].text, '2 atividades');
  assert.equal(cards[2].text, 'Comece por aqui');
  assert.ok(cards.every((c) => /^#[0-9a-f]{6}$/.test(c.c1) && /^#[0-9a-f]{6}$/.test(c.c2) && c.art));
  assert.equal(v3.subjectCards(null).every((c) => c.pct === null), true);
  assert.equal(v3.subjectCards({ laboratorio: { attempts: 1, accuracyPct: 140 } })[3].pct, 100);
});

// ---------- Desenho ----------

function ctxFor(doc, over = {}) {
  const calls = [];
  const app = {
    showPanel: (p) => calls.push(['panel', p]),
    getState: () => ({ sessionToken: 'tk', profile: { fullName: 'Maria Souza' } }),
  };
  const eng = { today: '2026-11-04', streak: { current: 4, best: 6, activeToday: true }, goal: { target: 10, todayQuestions: 3, reached: false, persisted: true }, dailyQuizDone: false, last: { module: 'farmacologia', activity: 'quiz_estudo', at: '2026-11-04T12:00:00Z' } };
  const ctx = {
    doc, app, now: NOW, token: 'tk', name: 'Maria Souza', summary: { inbox: { unreadMessages: 2, pendingConnectionRequests: 0 } },
    stats: null, data: engagement.assemble(eng), openGuia() { calls.push(['guia']); }, changeGoal(v) { calls.push(['goal', v]); },
    refreshEngagement() { calls.push(['refresh']); }, ...over,
  };
  ctx.data.eng = over.eng === undefined ? eng : over.eng;
  return { ctx, calls };
}

test('topo: saudação com o primeiro nome e três atalhos (Guia, crachá, avisos) com rótulo acessível', () => {
  const { ctx, calls } = ctxFor(fakeDoc());
  const top = v3.buildTop(ctx);
  assert.match(textOf(top), /Maria/);
  assert.doesNotMatch(textOf(top), /Souza/);
  const buttons = all(top, (n) => n.tag === 'button');
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => b.attrs['aria-label']), ['Falar com a Guia', 'Abrir meu crachá virtual', 'Mensagens e avisos']);
  assert.equal('data-open-credential' in buttons[1].attrs, true);
  buttons[0].listeners.click();
  buttons[2].listeners.click();
  assert.deepEqual(calls, [['guia'], ['panel', 'panel-messages']]);
  assert.ok(buttons.every((b) => all(b, (n) => n.tag === 'svg').length === 1), 'ícones SVG, não emoji');
});

test('cartão de foco: UM cartão, "Continuar de onde parou"; sem último módulo, some', () => {
  const doc = fakeDoc();
  const { ctx } = ctxFor(doc);
  const card = v3.buildFocus(ctx);
  assert.match(textOf(card), /Continuar de onde parou/);
  assert.match(textOf(card), /Farmacologia/);
  const go = all(card, (n) => n.tag === 'button');
  assert.equal(go.length, 1);
  assert.match(textOf(go[0]), /Continuar/);
  assert.equal(all(card, (n) => hasClass(n, 'v3-focus')).length, 1);
  const none = ctxFor(fakeDoc());
  none.ctx.data.last = null;
  assert.equal(v3.buildFocus(none.ctx), null);
});

test('resumo do dia: anel com a porcentagem, sete pontos, sequência e escolha da meta', () => {
  const doc = fakeDoc();
  const { ctx, calls } = ctxFor(doc);
  const day = v3.buildDay(ctx);
  const ring = all(day, (n) => hasClass(n, 'v3-ring'))[0];
  assert.equal(ring.style.props['--p'], '30');
  assert.equal(ring.attrs['aria-label'], '3 de 10 questões hoje');
  assert.equal(ring.attrs.role, 'img');
  const dots = all(day, (n) => hasClass(n, 'v3-week__dot'));
  assert.equal(dots.length, 7);
  assert.equal(dots.filter((d) => hasClass(d, 'is-on')).length, 4);
  assert.match(textOf(all(day, (n) => hasClass(n, 'v3-streak'))[0]), /4\|dias seguidos/);
  const chips = all(day, (n) => hasClass(n, 'v3-chip'));
  assert.deepEqual(chips.map((c) => c.attrs['aria-pressed']), ['false', 'true', 'false']);
  chips[2].listeners.click();
  assert.deepEqual(calls, [['goal', 20]]);
  const picker = all(day, (n) => hasClass(n, 'v3-goal-picker'))[0];
  assert.equal(hasClass(picker, 'hidden'), true);
  const toggle = all(day, (n) => hasClass(n, 'v3-link'))[0];
  toggle.listeners.click();
  assert.equal(toggle.attrs['aria-expanded'], 'true');
  assert.equal(hasClass(picker, 'hidden'), false);
  assert.equal(v3.buildDay(ctxFor(fakeDoc(), { eng: null }).ctx), null, 'sem dados do servidor, o resumo some');
});

test('"Para hoje" e "Seus assuntos": botões reais, faixa com cartões, barra com texto acessível', () => {
  const doc = fakeDoc();
  const { ctx, calls } = ctxFor(doc, {
    summary: { nextEvents: [{ title: 'Aula aberta', eventDate: '2026-11-05T22:00:00Z', location: 'Online' }], voting: { pendingCount: 1, nextClosesAt: '2026-11-06T22:00:00Z' } },
    stats: { farmacologia: { attempts: 3, accuracyPct: 70 } },
  });
  const today = v3.buildToday(ctx);
  const rows = all(today, (n) => n.tag === 'button');
  assert.equal(rows.length, 3);
  rows[1].listeners.click();
  rows[2].listeners.click();
  assert.deepEqual(calls, [['panel', 'panel-events'], ['panel', 'panel-proposals']]);
  assert.equal(v3.buildToday(ctxFor(fakeDoc(), { eng: null, summary: {} }).ctx), null, 'sem itens, a seção some');
  const subjects = v3.buildSubjects(ctx);
  const cards = all(subjects, (n) => hasClass(n, 'v3-subject'));
  assert.equal(cards.length, 5);
  assert.equal(cards[0].style.props['--c1'], '#0f6f62');
  const bar = all(cards[0], (n) => hasClass(n, 'v3-bar'))[0];
  assert.equal(bar.attrs['aria-label'], 'Aproveitamento de 70%');
  assert.equal(all(cards[1], (n) => hasClass(n, 'v3-bar'))[0].attrs['aria-label'], 'Sem nota registrada');
  assert.equal(all(subjects, (n) => n.tag === 'svg').length >= 5, true);
});

test('carga: usa resumo, engajamento e estatísticas reais, marca o painel e descarta resposta atrasada', async () => {
  const doc = fakeDoc();
  doc.getElementById('panel-home');
  const calls = [];
  const eng = { today: '2026-11-04', streak: { current: 2, best: 2, activeToday: true }, goal: { target: 10, todayQuestions: 1, reached: false, persisted: true }, dailyQuizDone: true, last: { module: 'toxicologia', activity: 'caso_clinico', at: new Date().toISOString() } };
  const app = {
    getState: () => ({ sessionToken: 'tk', profile: { fullName: 'Ana Teste' } }),
    showPanel() {},
    callApi: async (name) => { calls.push(name); return name === 'apiLearnGetEngagement' ? { success: true, engagement: eng } : { success: true, summary: { nextEvents: [], inbox: { unreadMessages: 0, pendingConnectionRequests: 0 } } }; },
    callLearningApi: async (name) => { calls.push(name); return { success: true, stats: { byModule: { toxicologia: { attempts: 1, accuracyPct: 80 } } } }; },
  };
  globalThis.LaiftEngagement = engagement;
  try {
    await v3.load(app, doc);
  } finally { delete globalThis.LaiftEngagement; }
  assert.deepEqual(calls.sort(), ['apiGetHomeSummary', 'apiLearnGetEngagement', 'apiLearnGetMyStats']);
  assert.equal(doc.panel.attrs['data-v3'], '1');
  assert.equal(hasClass(doc.host, 'hidden'), false);
  assert.equal(doc.host.attrs['aria-busy'], 'false');
  assert.match(textOf(doc.host), /Toxicologia/);
  assert.match(textOf(doc.host), /80% de acerto/);
  assert.equal(hasClass(doc.host, 'has-card'), true);
  v3.reset(doc);
  assert.equal(hasClass(doc.host, 'hidden'), true);
  assert.equal('data-v3' in doc.panel.attrs, false);
});

// ---------- Fiação e regras do projeto ----------

test('sem innerHTML, sem script nem estilo inline, sem emoji no código novo', () => {
  assert.doesNotMatch(SRC, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(SRC, /setAttribute\('style'/);
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  assert.doesNotMatch(SRC, emoji);
  assert.doesNotMatch(CSS, emoji);
  assert.match(SRC, /createElementNS/);
});

test('pacote sob demanda: fora do shell, no lazy-bundles, copiado no build', () => {
  assertSobDemanda('inicio3', 'home-v3.js');
  assert.doesNotMatch(HTML, /<(?:script|link)[^>]*home-v3/);
  const build = ler('scripts/build.js');
  assert.ok(build.includes("'home-v3.js'") && build.includes("'home-v3.css'"));
  assert.ok(!ler('sw.js').includes('home-v3'), 'sob demanda: fora do precache');
});

test('index.html: contêiner da v3 vazio e escondido, antes da Início antiga; Na Liga e dashboard intactos', () => {
  assert.match(HTML, /<div id="home-v3" class="home-v3 hidden"><\/div>\s*<div class="card">\s*<h2>Início<\/h2>/);
  assert.match(HTML, /<section id="home-highlights" class="card home-highlights hidden"><\/section>\s*<div id="home-dashboard" class="home-grid"><\/div>/);
  assert.equal((HTML.match(/data-panel="panel-home"/g) || []).length >= 1, true);
  assert.equal((HTML.match(/id="app-nav"/g) || []).length, 1, 'uma navegação só');
});

test('app.js: v3 só com a flag; sem a flag a Início antiga carrega como sempre', () => {
  assert.match(APP, /function homeV2On\(\) \{ return document\.documentElement\.hasAttribute\('data-flag-home-v2-enabled'\); \}/);
  assert.match(APP, /if \(homeV2On\(\)\) mountHomeV2\(\);\s*else \{\s*resetHomeV2\(\);\s*if \(window\.LaiftHome\) window\.LaiftHome\.load\(window\.App, document\);/);
  assert.match(APP, /withBundle\('inicio3'/);
  assert.match(APP, /mountProfile\(window\.App, document\)/);
  assert.match(APP, /isSwipeExcluded[\s\S]{0,400}\.v3-strip, \.hl-list/, 'deslizar numa faixa rolável não troca de painel');
  assert.match(APP, /function hasHorizontalScroller[\s\S]{0,400}overflowX === 'auto'/, 'qualquer ancestral com rolagem horizontal fica com o gesto');
  assert.match(APP, /isSwipeExcluded[\s\S]{0,700}hasHorizontalScroller\(target/, 'isSwipeExcluded consulta a rolagem horizontal dos ancestrais');
});

test('CSS: tudo atrás da flag; alvos de 44 px; foco visível; movimento reduzido; faixas rolam; trilho de 88 e 248 px', () => {
  assert.match(CSS, /prefers-reduced-motion: no-preference/);
  assert.match(CSS, /:focus-visible/);
  assert.match(CSS, /--v3-rail: 88px/);
  assert.match(CSS, /--v3-rail: 248px/);
  assert.match(CSS, /@media \(min-width: 768px\)/);
  assert.match(CSS, /@media \(min-width: 1100px\)/);
  assert.match(CSS, /scroll-snap-type: x proximity/);
  assert.match(CSS, /\.v3-icon-btn \{[^}]*width: 44px; height: 44px/);
  assert.match(CSS, /\.v3-chip \{[^}]*min-height: 44px/);
  assert.match(CSS, /\.v3-row \{[^}]*min-height: 64px/);
  assert.match(CSS, /\.v3-btn \{[^}]*min-height: 52px/);
  assert.doesNotMatch(CSS, /font-size: (?:[0-9]|1[01])(?:\.\d+)?px/, 'fontes de pelo menos 12 px');
  assert.doesNotMatch(CSS, /!important/);
  // regras globais só valem com a flag: nenhum seletor de #app-nav ou #app-root sem o atributo
  for (const linha of CSS.split('\n').filter((l) => /#app-nav|#app-root|#panel-home/.test(l) && /\{/.test(l))) {
    assert.match(linha, /data-flag-home-v2-enabled/, linha);
  }
});

test('home.js e engagement.js: pontos de reaproveitamento exportados e Início antiga com assinatura compatível', () => {
  assert.equal(typeof home.formatWhen, 'function');
  assert.equal(typeof engagement.openModule, 'function');
  assert.equal(typeof engagement.saveGoal, 'function');
  assert.equal(engagement.MODULE_LABELS.farmaco, 'Farmacologia');
  assert.match(ler('home.js'), /function load\(app, doc, opts\)/);
  assert.match(ler('home.js'), /var host = doc\.getElementById\(\(opts && opts\.hostId\) \|\| 'home-dashboard'\)/);
});
