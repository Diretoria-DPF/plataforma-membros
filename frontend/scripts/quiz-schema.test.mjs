// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// A1: esquema de questão (dificuldade, fonte, revisor — opcionais, nunca exibidos) e tamanho da sessão.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Logic = require(path.join(frontend, 'modulos/shared/quiz-logic.js'));
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');

function loadBank(rel) {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(read(rel), sandbox, { filename: rel });
  return vm.runInContext('allQuestions', sandbox);
}

const base = { id: 1, topic: 'A', question: 'Pergunta?', options: ['a', 'b', 'c', 'd'], correct: 1, explanation: 'Porque sim.' };

test('A1: questão sem campos opcionais continua válida', () => {
  assert.deepEqual(Logic.validateQuestion(base), []);
});

test('A1: campos opcionais válidos passam', () => {
  const q = { ...base, difficulty: 2, source: 'Goodman & Gilman, 14ª ed., cap. 3', reviewedBy: 'Fulana de Tal', reviewedAt: '2026-11-05', tags: ['gabarito-conferido', 'aine'] };
  assert.deepEqual(Logic.validateQuestion(q), []);
});

test('A1: campos opcionais malformados são apontados', () => {
  const ruins = [
    { difficulty: 0 }, { difficulty: 4 }, { difficulty: '2' }, { difficulty: 1.5 },
    { source: '' }, { source: 12 }, { source: 'x'.repeat(301) },
    { reviewedBy: '' }, { reviewedBy: 7 },
    { reviewedAt: '05/11/2026' }, { reviewedAt: '2026-13-40' },
    { tags: 'aine' }, { tags: [''] }, { tags: [1] }, { tags: new Array(11).fill('t') },
  ];
  ruins.forEach((extra) => {
    assert.ok(Logic.validateQuestion({ ...base, ...extra }).length > 0, `deveria reprovar ${JSON.stringify(extra).slice(0, 60)}`);
  });
});

test('A1: campos obrigatórios quebrados são apontados', () => {
  assert.ok(Logic.validateQuestion({ ...base, correct: 4 }).length > 0);
  assert.ok(Logic.validateQuestion({ ...base, options: ['só uma'] }).length > 0);
  assert.ok(Logic.validateQuestion({ ...base, question: '' }).length > 0);
  assert.ok(Logic.validateQuestion({ ...base, topic: undefined }).length > 0);
  assert.ok(Logic.validateQuestion(null).length > 0);
});

test('A1: os dois bancos (480 questões) passam no esquema', () => {
  ['modulos/quiz/questions.js', 'modulos/toxicologia/questions.js'].forEach((rel) => {
    const bank = loadBank(rel);
    assert.equal(bank.length, 240, rel);
    const ids = new Set();
    bank.forEach((q) => {
      assert.deepEqual(Logic.validateQuestion(q), [], `${rel} id ${q.id}`);
      assert.ok(!ids.has(q.id), `${rel}: id repetido ${q.id}`);
      ids.add(q.id);
    });
  });
});

test('A1: dificuldade, fonte, revisor e etiquetas nunca são exibidos ao público', () => {
  const internos = Logic.INTERNAL_FIELDS;
  assert.deepEqual([...internos].sort(), ['difficulty', 'reviewedAt', 'reviewedBy', 'source', 'tags']);
  const arquivos = ['modulos/shared/quiz-engine.js', 'modulos/quiz/index.html', 'modulos/toxicologia/index.html', 'modulos/quiz/app.js', 'modulos/toxicologia/app.js'];
  arquivos.forEach((rel) => {
    const texto = read(rel);
    internos.forEach((campo) => {
      assert.doesNotMatch(texto, new RegExp('(?<!dataset)\\.' + campo + '\\b|\\[[\'"]' + campo + '[\'"]\\]'), `${rel} lê o campo interno ${campo}`);
    });
  });
});

test('A1: sessão com tamanho 0 ou maior que o conjunto devolve tudo, na mesma ordem', () => {
  const pool = [1, 2, 3, 4, 5].map((id) => ({ id }));
  assert.deepEqual(Logic.pickSession(pool, 0, { seed: 1 }).map((q) => q.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(Logic.pickSession(pool, 99, { seed: 1 }).map((q) => q.id), [1, 2, 3, 4, 5]);
  assert.notEqual(Logic.pickSession(pool, 0, { seed: 1 }), pool);
});

test('A1: sessão limita o tamanho, mantém a ordem do banco e é estável para a mesma semente', () => {
  const pool = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));
  const a = Logic.pickSession(pool, 10, { seed: 7, mode: 'study', answered: {} });
  assert.equal(a.length, 10);
  const ids = a.map((q) => q.id);
  assert.deepEqual([...ids].sort((x, y) => x - y), ids);
  assert.equal(new Set(ids).size, 10);
  assert.deepEqual(Logic.pickSession(pool, 10, { seed: 7, mode: 'study', answered: {} }).map((q) => q.id), ids);
  assert.notDeepEqual(Logic.pickSession(pool, 10, { seed: 8, mode: 'study', answered: {} }).map((q) => q.id), ids);
});

test('A1: no estudo, as questões ainda não respondidas vêm antes das respondidas', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
  const answered = {};
  for (let i = 1; i <= 25; i++) answered[String(i)] = 0; // sobram 26..30
  const ids = Logic.pickSession(pool, 8, { seed: 3, mode: 'study', answered }).map((q) => q.id);
  [26, 27, 28, 29, 30].forEach((id) => assert.ok(ids.includes(id), `faltou a pendente ${id}`));
  assert.equal(ids.length, 8);
});

test('A1: na prova a preferência por não respondidas não se aplica', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }));
  const answered = {};
  for (let i = 1; i <= 25; i++) answered[String(i)] = 0;
  let semPendentes = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const ids = Logic.pickSession(pool, 5, { seed, mode: 'exam', answered }).map((q) => q.id);
    if (!ids.some((id) => id > 25)) semPendentes++;
  }
  assert.ok(semPendentes > 0, 'na prova também só saíram pendentes: a preferência vazou');
});

test('A1: motor e páginas usam o tamanho da sessão e os erros guardados', () => {
  const engine = read('modulos/shared/quiz-engine.js');
  assert.match(engine, /Logic\.pickSession\(/);
  assert.match(engine, /LaiftQuizErrors/);
  ['modulos/quiz/index.html', 'modulos/toxicologia/index.html'].forEach((rel) => {
    const html = read(rel);
    assert.match(html, /class="[^"]*size-btn[^"]*"[^>]*data-size="5"/, rel);
    assert.match(html, /data-size="10"/, rel);
    assert.match(html, /data-size="20"/, rel);
    assert.match(html, /data-size="0"/, rel);
    assert.match(html, /id="reviewErrorsBtn"/, rel);
    assert.match(html, /<script src="\.\.\/shared\/quiz-errors\.js"><\/script>/, rel);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, `${rel}: script inline`);
  });
});

test('A1: o motor não guarda erro com innerHTML e usa try/catch no armazenamento', () => {
  const engine = read('modulos/shared/quiz-engine.js');
  const errors = read('modulos/shared/quiz-errors.js');
  assert.doesNotMatch(engine + errors, /\.innerHTML\s*[+=]|insertAdjacentHTML/);
  assert.match(errors, /try \{/);
});
