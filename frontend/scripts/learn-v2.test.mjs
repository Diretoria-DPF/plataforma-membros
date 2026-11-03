/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Aprender v2 (learn-v2.js, learn-v2.css; flag learn_v2_enabled): funções puras, desenho com um DOM mínimo
// (sem innerHTML) e a fiação (pacote sob demanda, flag, hub de sempre intacto sem a flag).
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
const v2 = require('../learn-v2.js');
const SRC = ler('learn-v2.js');
const CSS = ler('learn-v2.css');
const LEARNING = ler('learning.js');

const NOW = new Date('2026-11-04T15:00:00-03:00');

function fakeDoc() {
  function make(tag) {
    const classes = new Set();
    const el = {
      tag, children: [], attrs: {}, listeners: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      textContent: '', id: '',
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      appendChild(c) { el.children.push(c); return c; },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      addEventListener(type, fn) { el.listeners[type] = fn; },
    };
    el.classList = {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle(c, f) { const on = f === undefined ? !classes.has(c) : f; if (on) classes.add(c); else classes.delete(c); return on; },
    };
    return el;
  }
  return { createElement: make, createElementNS: (ns, tag) => make(tag) };
}
const all = (el, test) => (test(el) ? [el] : []).concat(...el.children.map((c) => all(c, test)));
const textOf = (el) => [el.textContent].concat(el.children.map(textOf)).join('|');

function ctxFor(over = {}) {
  const calls = [];
  const ctx = Object.assign({
    doc: fakeDoc(), app: { showPanel: (p) => calls.push(['panel', p]) }, token: 't', now: NOW,
    data: { eng: null, goal: 10, last: null }, stats: null, byModule: null,
    openModule: (id) => calls.push(['open', id]), openSheet: (card) => calls.push(['sheet', card.id]),
    openGuia: () => calls.push(['guia']), reload: () => {}, changeGoal: (v) => calls.push(['goal', v]),
  }, over);
  return { ctx, calls };
}

test('weekDots, anel e sequência: mesmos textos e regras da Início v3', () => {
  const on = (s) => v2.weekDots(s).map((d) => (d.on ? 1 : 0)).join('');
  assert.equal(on({ current: 4, activeToday: true }), '0001111');
  assert.equal(on({ current: 4, activeToday: false }), '0011110');
  assert.equal(on(null), '0000000');
  assert.equal(v2.ringPercent(3, 10), 30);
  assert.equal(v2.ringPercent(15, 10), 100);
  assert.equal(v2.ringLabel(3, 10), '3 de 10 questões hoje');
  assert.equal(v2.ringHint(9, 10), 'Faltam 1 questão');
  assert.match(v2.ringHint(10, 10), /cumprida/);
  assert.equal(v2.streakLabel({ current: 1 }), '1 dia seguido');
  assert.equal(v2.streakLabel({ current: 4 }), '4 dias seguidos');
});

test('focusModel: título, atividade e quando; sem último módulo, nada', () => {
  const last = { id: 'farmaco', activity: 'quiz_estudo', at: '2026-11-03T12:00:00Z' };
  assert.deepEqual(v2.focusModel(last, NOW), { id: 'farmaco', title: 'Farmacologia', detail: 'simulado · ontem' });
  assert.equal(v2.focusModel(null, NOW), null);
  assert.equal(v2.focusModel({ id: 'x', at: null }, NOW), null);
});

test('todayItems: quiz do dia só com dados do servidor; simulado e caso clínico abrem módulos reais', () => {
  const items = v2.todayItems({ dailyQuizDone: false });
  assert.deepEqual(items.map((i) => i.kind), ['quiz', 'simulado', 'caso']);
  assert.match(items[0].sub, /5 questões/);
  assert.equal(items[1].module, 'farmaco');
  assert.equal(items[2].module, 'clinica');
  assert.match(v2.todayItems({ dailyQuizDone: true })[0].sub, /Feito hoje/);
  assert.deepEqual(v2.todayItems(null).map((i) => i.kind), ['simulado', 'caso']);
});

test('moduleCards: cinco módulos com aproveitamento real; sem dado, convite; nunca número inventado', () => {
  const cards = v2.moduleCards({ farmacologia: { attempts: 5, accuracyPct: 72 }, toxicologia: { attempts: 2, accuracyPct: null }, laboratorio: { attempts: 1, accuracyPct: 140 } });
  assert.deepEqual(cards.map((c) => c.id), ['farmaco', 'toxico', 'clinica', 'lab', 'anatomia']);
  assert.equal(cards[0].text, '72% de acerto');
  assert.equal(cards[1].text, '2 atividades');
  assert.equal(cards[2].text, 'Comece por aqui');
  assert.equal(cards[3].pct, 100);
  assert.ok(v2.moduleCards(null).every((c) => c.pct === null && c.attempts === 0));
  assert.match(v2.sheetSummary(cards[0]), /5 atividades · 72% de acerto/);
  assert.equal(v2.sheetSummary(cards[2]), 'Nenhuma atividade ainda');
});

test('overallChips e badgeItems: só dado da API; ausente vira null; sem conquistas, lista vazia', () => {
  assert.deepEqual(v2.overallChips(null), []);
  const chips = v2.overallChips({ accuracyPct: 72, questionsAnswered: 40, quizzesCompleted: 4, clinicalCasesCompleted: 1 });
  assert.deepEqual(chips.map((c) => c.value), ['72%', 40, 4, 1, null]);
  assert.deepEqual(v2.badgeItems([{ id: 'a', label: 'Primeira', description: 'd', unlocked: true }, { label: '' }, null]), [{ id: 'a', label: 'Primeira', description: 'd', unlocked: true }]);
  assert.deepEqual(v2.badgeItems(undefined), []);
});

test('buildFocus: Continuar abre o módulo; sem último módulo e sem histórico, convite do primeiro quiz; com histórico, some', () => {
  const eng = { streak: { best: 0 }, goal: { todayQuestions: 0 } };
  let { ctx, calls } = ctxFor({ data: { eng: null, goal: 10, last: { id: 'toxico', activity: 'caso_clinico', at: '2026-11-04T10:00:00Z' } } });
  const card = v2.buildFocus(ctx);
  assert.match(textOf(card), /Continuar de onde parou\|Toxicologia\|caso clínico · hoje/);
  all(card, (n) => n.tag === 'button')[0].listeners.click();
  assert.deepEqual(calls, [['open', 'toxico']]);
  ({ ctx } = ctxFor({ data: { eng, goal: 10, last: null } }));
  assert.match(textOf(v2.buildFocus(ctx)), /Faça o primeiro quiz/);
  ({ ctx } = ctxFor({ data: { eng: { streak: { best: 3 }, goal: { todayQuestions: 0 } }, goal: 10, last: null } }));
  assert.equal(v2.buildFocus(ctx), null);
});

test('buildDay: anel com a meta real, 7 pontos, sequência e opções de meta; sem engajamento, some', () => {
  const eng = { streak: { current: 4, activeToday: true }, goal: { todayQuestions: 3 } };
  const { ctx, calls } = ctxFor({ data: { eng, goal: 10, last: null } });
  const day = v2.buildDay(ctx);
  const ring = all(day, (n) => /l2-ring/.test(n.className))[0];
  assert.equal(ring.attrs['aria-label'], '3 de 10 questões hoje');
  assert.equal(ring.style.props['--p'], '30');
  assert.equal(all(day, (n) => /l2-week__dot/.test(n.className)).length, 7);
  assert.equal(all(day, (n) => /is-on/.test(n.className)).length, 4);
  const chips = all(day, (n) => /l2-chip/.test(n.className));
  assert.equal(chips.length, 3);
  chips[2].listeners.click();
  assert.deepEqual(calls, [['goal', 20]]);
  assert.equal(v2.buildDay(ctxFor().ctx), null);
});

test('buildToday e buildModules: ações das linhas e dos cartões', () => {
  const { ctx, calls } = ctxFor({ data: { eng: { dailyQuizDone: false }, goal: 10, last: null } });
  const today = all(v2.buildToday(ctx), (n) => n.tag === 'button');
  assert.equal(today.length, 3);
  today[1].listeners.click();
  today[2].listeners.click();
  assert.deepEqual(calls, [['open', 'farmaco'], ['open', 'clinica']]);
  const mods = all(v2.buildModules(ctx), (n) => n.tag === 'button');
  assert.equal(mods.length, 5);
  mods[3].listeners.click();
  assert.deepEqual(calls[2], ['sheet', 'lab']);
});

test('weakItems (ENG-06): módulo real, texto com a nota e o número de questões; entrada inválida some', () => {
  const res = { success: true, topics: [
    { module: 'toxicologia', topic: 'Antídotos', correct: 2, total: 6, pct: 33 },
    { module: 'farmacologia', topic: 'Receptores', correct: 1, total: 5, pct: 20 },
    { module: 'inexistente', topic: 'X', correct: 0, total: 5, pct: 0 },
    { module: 'toxicologia', topic: '', correct: 0, total: 5, pct: 0 },
    null,
  ] };
  assert.deepEqual(v2.weakItems(res), [
    { id: 'toxico', title: 'Antídotos', sub: 'Toxicologia · 33% de acerto em 6 questões' },
    { id: 'farmaco', title: 'Receptores', sub: 'Farmacologia · 20% de acerto em 5 questões' },
  ]);
  assert.deepEqual(v2.weakItems(null), []);
  assert.deepEqual(v2.weakItems({ success: false }), []);
  assert.equal(v2.weakItems({ success: true, topics: new Array(6).fill({ module: 'toxicologia', topic: 'T', correct: 0, total: 5, pct: 0 }) }).length, 3);
});

test('buildWeak (ENG-06): cada tópico abre o módulo dele; sem tópico fraco, a seção não aparece', () => {
  const { ctx, calls } = ctxFor({ weak: [{ id: 'toxico', title: 'Antídotos', sub: 'Toxicologia · 33% de acerto em 6 questões' }] });
  const section = v2.buildWeak(ctx);
  assert.match(textOf(section), /Para reforçar/);
  assert.match(textOf(section), /Antídotos/);
  const btns = all(section, (n) => n.tag === 'button');
  assert.equal(btns.length, 1);
  btns[0].listeners.click();
  assert.deepEqual(calls, [['open', 'toxico']]);
  assert.equal(v2.buildWeak(ctxFor({ weak: [] }).ctx), null);
  assert.equal(v2.buildWeak(ctxFor({}).ctx), null);
});

test('buildPerformance e buildBadges: barras com rótulo acessível; sem conquistas, nada', () => {
  const { ctx } = ctxFor({ byModule: { farmacologia: { attempts: 5, accuracyPct: 72 } }, stats: { badges: [{ id: 'b', label: 'Explorador', description: 'x', unlocked: false }] } });
  const perf = v2.buildPerformance(ctx);
  const labels = all(perf, (n) => n.attrs && n.attrs.role === 'img').map((n) => n.attrs['aria-label']);
  assert.equal(labels[0], 'Aproveitamento de 72%');
  assert.equal(labels[1], 'Sem nota registrada');
  assert.match(textOf(v2.buildBadges(ctx)), /Explorador\|.*Bloqueada/);
  assert.equal(v2.buildBadges(ctxFor({ stats: { badges: [] } }).ctx), null);
});

test('regras: sem innerHTML, sem style inline, sem "Lia" nem "grátis" em texto, textContent para dados', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/setAttribute\(['"]style['"]/.test(SRC));
  const textos = [...SRC.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]).filter((t) => /\s/.test(t));
  assert.ok(textos.every((t) => !/\bLia\b/.test(t) && !/gr[aá]tis/i.test(t)), 'texto proibido');
  assert.ok(/Falar com a Guia/.test(SRC));
});

test('CSS: toda regra vale só com a flag; foco visível, movimento reduzido, alvos de 44 px e fontes de 12 px', () => {
  const semMedia = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = [...semMedia.matchAll(/(^|[}\n])\s*([^{}@\n][^{}]*)\{/g)].map((m) => m[2].trim()).filter((s) => !/^(from|to)\b/.test(s));
  const fora = seletores.flatMap((s) => s.split(',').map((x) => x.trim())).filter((s) => s && !s.startsWith(':root[data-flag-learn-v2-enabled]') && !s.startsWith('@keyframes'));
  assert.deepEqual(fora, []);
  assert.match(CSS, /prefers-reduced-motion: reduce/);
  assert.match(CSS, /:focus-visible/);
  assert.ok(!/font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px/.test(CSS), 'fonte abaixo de 12px');
  assert.match(CSS, /\.l2-icon-btn \{[^}]*width: 44px; height: 44px/);
  assert.ok(!/style=/.test(SRC));
});

test('fiação: pacote aprender2 sob demanda; learning.js só carrega com a flag e cai no hub de sempre', () => {
  assertSobDemanda('aprender2', 'learn-v2.js');
  assert.ok(ler('scripts/build.js').includes("'learn-v2.css'"), 'build.js publica o CSS');
  assert.match(LEARNING, /data-flag-learn-v2-enabled/);
  assert.match(LEARNING, /LaiftLazy\.load\('aprender2'\)/);
  assert.match(LEARNING, /function loadLegacyHub\(\)/);
  assert.match(SRC, /learn-v2\.css/);
  assert.ok(!ler('index.html').includes('learn-v2'), 'index.html não referencia a tela nova');
  assert.ok(!ler('sw.js').includes('learn-v2'), 'sw.js não pré-cacheia a tela nova');
});
