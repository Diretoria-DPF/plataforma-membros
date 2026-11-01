/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Retorno pessoal (ENG-01/02/03): engagement.js, daily-quiz.js, estilo e registro no app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Eng = require('../engagement.js');
const Daily = require('../daily-quiz.js');

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
const texts = (n) => flat(n).map((x) => x.textContent).filter(Boolean);

const BANK = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, topic: 'T', question: 'Pergunta ' + (i + 1), options: ['a', 'b', 'c', 'd'], correct: i % 4, explanation: 'Porque sim.' }));
const NOW = new Date('2026-10-31T15:00:00Z');
const ENG = {
  today: '2026-10-31', streak: { current: 3, best: 5, activeToday: true },
  goal: { target: 10, todayQuestions: 4, reached: false, persisted: false }, dailyQuizDone: false,
  last: { module: 'toxicologia', activity: 'quiz_estudo', at: '2026-10-30T14:00:00.000Z' },
};

test('dia de São Paulo: a madrugada em UTC ainda é o dia anterior', () => {
  assert.equal(Eng.dateKey(new Date('2026-10-31T02:30:00Z')), '2026-10-30');
  assert.equal(Eng.dateKey(new Date('2026-10-31T15:00:00Z')), '2026-10-31');
});

test('quiz do dia: mesmo conjunto na mesma data, 5 distintas, independe da ordem do banco', () => {
  const a = Eng.pickDaily(BANK, '2026-10-31', 5).map((q) => q.id);
  const b = Eng.pickDaily(BANK.slice().reverse(), '2026-10-31', 5).map((q) => q.id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, 5);
  const other = Eng.pickDaily(BANK, '2026-11-01', 5).map((q) => q.id);
  assert.notDeepEqual(a, other);
  assert.equal(Eng.pickDaily(BANK.slice(0, 3), '2026-10-31', 5).length, 3);
  assert.equal(Eng.pickDaily(null, '2026-10-31', 5).length, 0);
});

test('quiz do dia: questão malformada é ignorada', () => {
  const picked = Eng.pickDaily([{ id: 1 }, { id: 2, question: 'x', options: ['a'], correct: 0 }], '2026-10-31', 5);
  assert.deepEqual(picked.map((q) => q.id), [2]);
});

test('mensagens positivas: sem culpa por perder a sequência', () => {
  const all = [
    Eng.streakText({ current: 0, best: 0, activeToday: false }),
    Eng.streakText({ current: 0, best: 7, activeToday: false }),
    Eng.streakText({ current: 4, best: 7, activeToday: false }),
    Eng.streakText({ current: 4, best: 7, activeToday: true }),
    Eng.goalText({ target: 10, todayQuestions: 0, reached: false }),
    Eng.goalText({ target: 10, todayQuestions: 12, reached: true }),
    Daily.resultText(0, 5), Daily.resultText(3, 5), Daily.resultText(5, 5),
  ].join(' | ');
  assert.doesNotMatch(all, /perdeu|perdida|falhou|fracasso|culpa|infelizmente|pena/i);
  assert.match(Eng.streakText({ current: 0, best: 7, activeToday: false }), /recomeçar/);
  assert.match(Eng.streakText({ current: 1, best: 1, activeToday: true }), /1 dia seguido\./);
});

test('último módulo: o mais recente entre servidor e aparelho; sem nada, nulo', () => {
  const server = { module: 'toxicologia', activity: 'quiz_estudo', at: '2026-10-30T14:00:00.000Z' };
  assert.deepEqual(Eng.resolveLast(server, null), { id: 'toxico', activity: 'quiz_estudo', at: server.at });
  assert.equal(Eng.resolveLast(server, { id: 'lab', at: '2026-10-31T10:00:00.000Z' }).id, 'lab');
  assert.equal(Eng.resolveLast(server, { id: 'lab', at: '2026-10-29T10:00:00.000Z' }).id, 'toxico');
  assert.equal(Eng.resolveLast(null, { id: 'clinica', at: '2026-10-29T10:00:00.000Z' }).id, 'clinica');
  assert.equal(Eng.resolveLast(null, { id: 'inexistente', at: 'x' }), null);
  assert.equal(Eng.resolveLast({ module: 'x', activity: 'y', at: 'z' }, null), null);
});

test('meta efetiva: a do servidor quando salva lá; senão a do aparelho; senão 10', () => {
  assert.equal(Eng.effectiveGoal({ target: 20, persisted: true }, 5), 20);
  assert.equal(Eng.effectiveGoal({ target: 10, persisted: false }, 5), 5);
  assert.equal(Eng.effectiveGoal({ target: 10, persisted: false }, 7), 10);
  assert.equal(Eng.effectiveGoal(null, null), 10);
});

test('"há N dias" no fuso de São Paulo', () => {
  assert.equal(Eng.whenText('2026-10-31T13:00:00.000Z', NOW), 'hoje');
  assert.equal(Eng.whenText('2026-10-30T13:00:00.000Z', NOW), 'ontem');
  assert.equal(Eng.whenText('2026-10-28T13:00:00.000Z', NOW), 'há 3 dias');
  assert.equal(Eng.whenText('lixo', NOW), '');
});

test('painel: continuar leva ao módulo, meta tem 3 opções e quiz do dia chama o handler; só textContent', () => {
  const opened = [];
  const picked = [];
  let daily = 0;
  const data = Eng.assemble(ENG);
  const section = Eng.buildSection(fakeDoc(), data, {
    onOpenModule: (id) => opened.push(id), onGoal: (v) => picked.push(v), onDaily: () => { daily += 1; },
  }, NOW);
  const nodes = flat(section);
  const buttons = nodes.filter((n) => n.tag === 'button');
  const find = (label) => buttons.find((b) => b.textContent === label);
  find('Continuar').listeners.click();
  assert.deepEqual(opened, ['toxico']);
  find('Fazer o quiz do dia').listeners.click();
  assert.equal(daily, 1);
  assert.deepEqual(Eng.GOALS, [5, 10, 20]);
  buttons.filter((b) => /^(5|10|20)$/.test(b.textContent)).forEach((b) => b.listeners.click());
  assert.deepEqual(picked, [5, 10, 20]);
  assert.ok(texts(section).includes('Continuar de onde parou'));
  assert.ok(texts(section).some((t) => /Toxicologia · simulado · ontem/.test(t)));
  assert.ok(buttons.every((b) => b.attrs.type === 'button'));
  const bar = nodes.find((n) => n.tag === 'progress');
  assert.equal(bar.attrs.max, '10');
  assert.equal(bar.attrs.value, '4');
});

test('painel: sem dados do servidor mostra só o que existe; sem nada, não desenha', () => {
  const noop = { onOpenModule() {}, onGoal() {}, onDaily() {} };
  assert.equal(Eng.buildSection(fakeDoc(), Eng.assemble(null), noop, NOW), null);
  const onlyEng = Eng.buildSection(fakeDoc(), { eng: { ...ENG, last: null }, goal: 10, last: null }, noop, NOW);
  assert.ok(!texts(onlyEng).includes('Continuar de onde parou'));
  const done = Eng.buildSection(fakeDoc(), Eng.assemble({ ...ENG, dailyQuizDone: true }), noop, NOW);
  assert.ok(texts(done).includes('Rever o quiz de hoje'));
});

test('quiz do dia: pergunta, marcação certa/errada com texto e resultado', () => {
  const q = BANK[1];
  const picks = [];
  const view = Daily.buildQuestionView(fakeDoc(), q, 0, 5, (i) => picks.push(i));
  assert.ok(texts(view.node).includes('Questão 1 de 5'));
  assert.equal(view.buttons.length, 4);
  view.buttons[2].listeners.click();
  assert.deepEqual(picks, [2]);
  Daily.markAnswer(q, view, 2);
  assert.ok(view.buttons.every((b) => b.disabled));
  assert.match(view.buttons[q.correct].attrs['aria-label'], /resposta certa/);
  assert.match(view.buttons[2].attrs['aria-label'], /sua resposta/);
  assert.match(Daily.feedbackText(q, q.correct), /^Isso aí!/);
  assert.match(Daily.feedbackText(q, (q.correct + 1) % 4), /^Quase! A resposta certa é a/);
  assert.equal(Daily.resultText(5, 5), 'Você acertou 5 de 5 questões. Perfeito!');
  assert.match(Daily.resultText(1, 1), /1 de 1 questão\./);
});

test('segurança e acessibilidade dos arquivos novos', () => {
  for (const file of ['frontend/engagement.js', 'frontend/daily-quiz.js']) {
    const code = read(file);
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|eval\(|document\.write/);
    assert.doesNotMatch(code, /\.style\.|setAttribute\('style'/);
  }
  const css = read('frontend/engagement.css');
  assert.match(css, /prefers-reduced-motion: no-preference\)\s*\{\s*\.eng-pop/);
  assert.doesNotMatch(css.replace(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*$/, ''), /animation:/);
  assert.match(css, /\.eng-btn\s*\{[^}]*min-height: 48px/);
  assert.match(css, /\.dq-option\s*\{[^}]*min-height: 48px/);
  assert.match(css, /\.eng-chip\s*\{[^}]*min-height: 44px/);
  assert.match(css, /\.dq-close\s*\{[^}]*min-height: 44px/);
});

test('sem ranking: nada de placar entre pessoas no código novo (comentários à parte)', () => {
  const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const all = ['frontend/engagement.js', 'frontend/daily-quiz.js', 'worker/src/services/engagementService.js'].map((f) => semComentarios(read(f))).join('\n');
  assert.doesNotMatch(all, /ranking|leaderboard|classificaç/i);
});

test('registro: index.html (css antes e scripts antes do home.js), build.js e sw.js; cache subiu', () => {
  const html = read('frontend/index.html');
  assert.ok(html.includes('<link rel="stylesheet" href="engagement.css">'));
  const iEng = html.indexOf('<script src="engagement.js" defer></script>');
  const iDaily = html.indexOf('<script src="daily-quiz.js" defer></script>');
  const iHome = html.indexOf('<script src="home.js" defer></script>');
  assert.ok(iEng > 0 && iDaily > iEng && iHome > iDaily);
  assert.ok(html.includes('id="learn-engagement"'));
  const build = read('frontend/scripts/build.js');
  const sw = read('frontend/sw.js');
  for (const name of ['engagement.js', 'engagement.css', 'daily-quiz.js']) {
    assert.ok(build.includes("'" + name + "'"), 'build.js: ' + name);
    assert.ok(sw.includes("'" + name + "'"), 'sw.js: ' + name);
  }
  assert.ok(Number((sw.match(/CACHE_NAME = CACHE_PREFIX \+ 'v(\d+)'/) || [])[1]) >= 20);
  assert.doesNotMatch(read('frontend/index.html').match(/Content-Security-Policy" content="([^"]+)"/)[1], /unsafe-inline'[^;]*script|script-src[^;]*unsafe/);
});

test('home.js monta o retorno só quando há aprendizagem no resumo e o módulo existe', () => {
  const code = read('frontend/home.js');
  assert.match(code, /mountReturn\(app, doc, host, summary, token, isCurrent\)/);
  assert.match(code, /if \(!engagement \|\| !summary\.learning\) return;/);
});

test('o último módulo aberto fica guardado no aparelho e nunca lança sem armazenamento', () => {
  assert.doesNotThrow(() => Eng.rememberModule('farmaco', NOW));
  assert.doesNotThrow(() => Eng.rememberModule('inexistente', NOW));
});

test('servidor e dados: migração 047 com reversão, handlers registrados', () => {
  assert.match(read('sql/047_daily_goal.sql'), /ADD COLUMN IF NOT EXISTS daily_goal SMALLINT NOT NULL DEFAULT 10/);
  assert.match(read('sql/down/047_daily_goal.sql'), /DROP COLUMN IF EXISTS daily_goal/);
  const handlers = read('worker/src/handlers.js');
  assert.match(handlers, /apiLearnGetEngagement/);
  assert.match(handlers, /apiLearnSetDailyGoal/);
});
