// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// A6: missão da semana e conquistas pessoais, só no aparelho, sem ranking.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = require(path.join(frontend, 'modulos/shared/missao-semana.js'));

// 2026-11-04 é quarta-feira; a semana começa na segunda 2026-11-02 (fuso de São Paulo).
const QUA = Date.UTC(2026, 10, 4, 15, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function fakeStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    dump: () => Object.fromEntries(data),
  };
}

function answer(store, module, topic, correct, now, n = 1) {
  let s = store;
  for (let i = 0; i < n; i++) s = M.record(s, { module, topic, correct, now });
  return s;
}

test('A6: a semana começa na segunda-feira no fuso de São Paulo', () => {
  assert.equal(M.weekKey(QUA), '2026-11-02');
  assert.equal(M.weekKey(Date.UTC(2026, 10, 2, 2, 0, 0)), '2026-10-26'); // 23h de domingo em SP
  assert.equal(M.weekKey(Date.UTC(2026, 10, 2, 4, 0, 0)), '2026-11-02');
  assert.equal(M.weekKey(Date.UTC(2026, 10, 8, 20, 0, 0)), '2026-11-02'); // domingo
});

test('A6: a missão é determinística, com módulos diferentes e sem repetição', () => {
  const a = M.missionFor('2026-11-02');
  const b = M.missionFor('2026-11-02');
  assert.deepEqual(a, b);
  assert.ok(a.length >= 2);
  assert.equal(new Set(a.map((t) => t.module)).size, a.length);
  a.forEach((t) => { assert.ok(t.target > 0); assert.ok(t.label); });
});

test('A6: atividade soma na semana certa e limita o progresso ao alvo', () => {
  const tasks = M.missionFor(M.weekKey(QUA));
  const first = tasks[0];
  let s = answer(M.emptyStore(), first.module, 'Tema', true, QUA, first.target + 3);
  const st = M.status(s, QUA);
  assert.equal(st.tasks[0].done, first.target);
  assert.equal(st.tasks[0].complete, true);
  assert.equal(st.complete, false);
  // semana seguinte começa do zero
  const next = M.status(s, QUA + 7 * DAY);
  assert.equal(next.doneTotal, 0);
});

test('A6: completar todas as tarefas fecha a missão e concede a conquista uma única vez', () => {
  let s = M.emptyStore();
  M.missionFor(M.weekKey(QUA)).forEach((t) => { s = answer(s, t.module, 'X', true, QUA, t.target); });
  assert.equal(M.status(s, QUA).complete, true);
  const earned = M.achievements(s).filter((a) => a.id === 'missao-1');
  assert.equal(earned.length, 1);
  s = answer(s, 'farmacologia', 'X', true, QUA + 1000, 5);
  assert.equal(M.achievements(s).filter((a) => a.id === 'missao-1').length, 1);
  assert.equal(M.status(s, QUA).weeksDone, 1);
});

test('A6: dominar um tema exige volume e taxa de acerto; acertos fracos não concedem', () => {
  let s = answer(M.emptyStore(), 'toxicologia', 'Antídotos', true, QUA, M.MASTERY_MIN - 1);
  assert.equal(M.achievements(s).some((a) => a.kind === 'tema'), false);
  s = answer(s, 'toxicologia', 'Antídotos', true, QUA, 1);
  const tema = M.achievements(s).filter((a) => a.kind === 'tema');
  assert.equal(tema.length, 1);
  assert.match(tema[0].label, /Antídotos/);
  let fraco = answer(M.emptyStore(), 'toxicologia', 'Metais', true, QUA, 5);
  fraco = answer(fraco, 'toxicologia', 'Metais', false, QUA, 6);
  assert.equal(M.achievements(fraco).some((a) => a.kind === 'tema'), false);
});

test('A6: record é puro e ignora entrada inválida', () => {
  const before = M.emptyStore();
  const snap = JSON.stringify(before);
  M.record(before, { module: 'farmacologia', topic: 'T', correct: true, now: QUA });
  assert.equal(JSON.stringify(before), snap);
  assert.equal(JSON.stringify(M.record(before, null)), snap);
  assert.equal(JSON.stringify(M.record(before, { module: '', correct: true })), snap);
});

test('A6: parse aceita lixo e armazenamento bloqueado nunca lança', () => {
  assert.deepEqual(M.parse('{não é json', 'a').weeks, {});
  assert.deepEqual(M.parse({ weeks: 'x', topics: [] }, 'a').topics, {});
  const quebrado = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
  const st = M.createStore(quebrado, () => 'dono');
  assert.doesNotThrow(() => st.record({ module: 'farmacologia', topic: 'T', correct: true, now: QUA }));
  assert.equal(st.status(QUA).doneTotal, 0);
  const nulo = M.createStore(null, () => '');
  assert.doesNotThrow(() => nulo.record({ module: 'farmacologia', topic: 'T', correct: true, now: QUA }));
});

test('A6: persiste em UMA chave, por dono, e não mostra dados de outra conta', () => {
  const storage = fakeStorage();
  const a = M.createStore(storage, () => 'conta-a');
  a.record({ module: 'farmacologia', topic: 'T', correct: true, now: QUA });
  assert.deepEqual(Object.keys(storage.dump()), [M.KEY]);
  assert.equal(M.createStore(storage, () => 'conta-a').status(QUA).doneTotal, 1);
  assert.equal(M.createStore(storage, () => 'conta-b').status(QUA).doneTotal, 0);
});

test('A6: o armazenamento não cresce sem limite (semanas e temas antigos saem)', () => {
  let s = M.emptyStore();
  for (let i = 0; i < M.MAX_WEEKS + 10; i++) s = answer(s, 'farmacologia', 'T', true, QUA + i * 7 * DAY);
  assert.ok(Object.keys(s.weeks).length <= M.MAX_WEEKS);
  for (let i = 0; i < M.MAX_TOPICS + 20; i++) s = answer(s, 'farmacologia', 'Tema ' + i, true, QUA);
  assert.ok(Object.keys(s.topics).length <= M.MAX_TOPICS);
});

test('A6: ponto de extensão do "Para hoje" devolve a próxima tarefa e some quando a missão fecha', () => {
  let s = M.emptyStore();
  const item = M.paraHojeItem(s, QUA);
  assert.equal(item.kind, 'missao');
  assert.ok(item.title && item.sub && item.module);
  assert.doesNotMatch(item.title + item.sub, /ranking|\bIA\b|rascunho|revisad/);
  M.missionFor(M.weekKey(QUA)).forEach((t) => { s = answer(s, t.module, 'X', true, QUA, t.target); });
  assert.equal(M.paraHojeItem(s, QUA), null);
});

// ---------- Integração (Aprender v2, quiz e carga sob demanda) ----------
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

test('A6: o Aprender v2 mostra a missão e as conquistas pessoais sem ranking, com DOM seguro', () => {
  const v2 = require(path.join(frontend, 'learn-v2.js'));
  const make = (tag) => {
    const node = { tag, children: [], attrs: {}, className: '', textContent: '', style: { setProperty() {} },
      appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener() {} };
    return node;
  };
  const doc = { createElement: make, createElementNS: (ns, tag) => make(tag) };
  const flat = (n) => [n, ...n.children.flatMap(flat)];
  const textOf = (n) => flat(n).map((x) => x.textContent).filter(Boolean).join('|');

  assert.equal(v2.buildMission({ doc, mission: null }), null);
  assert.equal(v2.buildMyAchievements({ doc, mission: { achievements: [] } }), null);

  let s = M.emptyStore();
  M.missionFor(M.weekKey(QUA)).forEach((t, i) => { s = answer(s, t.module, 'Antídotos', true, QUA, i === 0 ? t.target : 4); });
  const mission = { status: M.status(s, QUA), achievements: M.achievements(s) };
  const node = v2.buildMission({ doc, mission });
  const txt = textOf(node);
  assert.match(txt, /Missão da semana/);
  assert.match(txt, /4 de 10/);
  assert.match(txt, /Feita/);
  assert.doesNotMatch(txt, /ranking|placar/i);
  assert.equal(flat(node).filter((x) => /l2-mission__task/.test(x.className)).length, mission.status.tasks.length);

  s = answer(s, 'toxicologia', 'Antídotos', true, QUA, M.MASTERY_MIN);
  const mine = v2.buildMyAchievements({ doc, mission: { status: M.status(s, QUA), achievements: M.achievements(s) } });
  assert.match(textOf(mine), /Dominou Antídotos/);
  assert.match(textOf(mine), /só para você/);
});

test('A6: o quiz registra a missão, as páginas carregam o módulo e a carga é sob demanda', () => {
  const engine = read('modulos/shared/quiz-engine.js');
  assert.match(engine, /LaiftMissao/);
  assert.match(engine, /recordMission\(q, correct\)/);
  ['modulos/quiz/index.html', 'modulos/toxicologia/index.html'].forEach((rel) => {
    const html = read(rel);
    assert.match(html, /<script src="\.\.\/shared\/missao-semana\.js"><\/script>/, rel);
    assert.ok(html.indexOf('missao-semana.js') < html.indexOf('quiz-engine.js'), rel);
  });
  const lazy = require(path.join(frontend, 'lazy-bundles.js'));
  assert.deepEqual(lazy.BUNDLES.aprender2.slice(0, 2), ['modulos/shared/missao-semana.js', 'learn-v2.js']);
  assert.doesNotMatch(read('index.html'), /missao-semana/);
});

test('A6: arquivo novo tem cabeçalho de licença e sem script inline', () => {
  assert.match(read('modulos/shared/missao-semana.js').slice(0, 300), /Licença proprietária/);
  assert.doesNotMatch(read('learn-v2.js'), /innerHTML\s*=/);
});
