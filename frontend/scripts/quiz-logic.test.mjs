// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// quiz-logic.js e o motor de simulados: embaralhar alternativas (QZ-01), rolagem (QZ-02), travar resposta (QZ-03),
// progresso por id e sem apagar (QZ-04), questão em branco (QZ-05).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const Logic = require(path.join(frontend, 'modulos/shared/quiz-logic.js'));
const engine = fs.readFileSync(path.join(frontend, 'modulos/shared/quiz-engine.js'), 'utf8');

test('QZ-01: a ordem é uma permutação, estável para a mesma semente e diferente entre sementes', () => {
  const a = Logic.optionOrder(123, 7, 4);
  assert.deepEqual([...a].sort(), [0, 1, 2, 3]);
  assert.deepEqual(Logic.optionOrder(123, 7, 4), a);
  const distintas = new Set();
  for (let seed = 1; seed <= 50; seed++) distintas.add(Logic.optionOrder(seed, 7, 4).join(''));
  assert.ok(distintas.size > 10);
});

test('QZ-01: a posição da correta se espalha de forma quase uniforme', () => {
  const counts = [0, 0, 0, 0];
  for (let id = 1; id <= 2000; id++) counts[Logic.optionOrder(99, id, 4).indexOf(1)]++;
  counts.forEach((n) => assert.ok(n > 380 && n < 620, `posição fora da faixa: ${counts}`));
});

test('QZ-01: o motor guarda o índice original (o dado não é reordenado)', () => {
  assert.match(engine, /state\.answers\[state\.index\] = orderOf\(q\)\[position\]/);
  assert.doesNotMatch(engine, /options\.sort|options\.reverse|shuffle\(q\.options/);
});

test('QZ-02: iniciar, responder (estudo) e mostrar resultado levam a tela até o alvo, sem animar com movimento reduzido', () => {
  assert.match(engine, /bringIntoView\(el\.quiz, 'start'\)/);
  assert.match(engine, /bringIntoView\(el\.explanation, 'nearest'\)/);
  assert.match(engine, /bringIntoView\(title, 'start'\)/);
  assert.match(engine, /prefers-reduced-motion: reduce[\s\S]{0,200}scrollIntoView|behavior: prefersReducedMotion\(\) \? 'auto' : 'smooth'/);
});

test('QZ-03: no estudo a resposta é definitiva; na prova pode trocar', () => {
  assert.equal(Logic.canAnswer('study', null), true);
  assert.equal(Logic.canAnswer('study', 2), false);
  assert.equal(Logic.canAnswer('study', 0), false);
  assert.equal(Logic.canAnswer('exam', 2), true);
  assert.match(engine, /Logic\.canAnswer\(state\.mode, state\.answers\[state\.index\]\)\) return/);
});

test('QZ-04: progresso por id; o formato antigo por posição é lido; mesclar não apaga outros tópicos', () => {
  const bank = [{ id: 10 }, { id: 11 }, { id: 12 }];
  const legado = Logic.readProgress({ userAnswers: [1, null, 3] }, bank);
  assert.deepEqual(legado.byId, { 10: 1, 12: 3 });
  const gravado = Logic.writeProgress(legado, [{ id: 11, answer: 0 }, { id: 12, answer: null }], { seed: 5, owner: 'x' });
  assert.deepEqual(gravado.byId, { 10: 1, 11: 0, 12: 3 });
  assert.equal(gravado.v, 2);
  assert.deepEqual(Logic.readProgress(JSON.parse(JSON.stringify(gravado)), []).byId, gravado.byId);
  assert.deepEqual(Logic.withoutIds(gravado, [11]).byId, { 10: 1, 12: 3 });
  assert.deepEqual(Logic.readProgress('lixo', bank).byId, {});
});

test('QZ-04: Voltar e Refazer não chamam clearProgress; Refazer e Reiniciar pedem confirmação', () => {
  const goHome = engine.slice(engine.indexOf('function goHome'), engine.indexOf('function goHome') + 300);
  const retry = engine.slice(engine.indexOf('function retry'), engine.indexOf('function goHome'));
  assert.doesNotMatch(goHome, /clearProgress/);
  assert.doesNotMatch(retry, /clearProgress/);
  assert.match(retry, /dialogConfirm\(/);
  assert.match(engine, /function resetProgress\(\) \{\s*dialogConfirm/);
});

test('QZ-05: em branco não vale erro, não entra no total nem nos tópicos', () => {
  const qs = [
    { topic: 'A', correct: 0 }, { topic: 'A', correct: 1 }, { topic: 'B', correct: 2 }, { topic: 'C', correct: 0 },
  ];
  const r = Logic.scoreAnswers(qs, [0, null, 1, undefined]);
  assert.equal(r.answered, 2);
  assert.equal(r.correct, 1);
  assert.equal(r.blank, 2);
  assert.deepEqual(r.topicStats, [{ topic: 'A', correct: 1, total: 1 }, { topic: 'B', correct: 0, total: 1 }]);
  assert.equal(Logic.scoreAnswers(qs, [null, null, null, null]).answered, 0);
});

test('QZ-05: o envio usa só as respondidas e a entrega com branco pede confirmação', () => {
  assert.match(engine, /submitAttempt\(r\.correct, r\.answered,/);
  assert.match(engine, /requestFinish/);
  assert.match(engine, /if \(!r\.answered\)/);
  assert.match(engine, /state\.answers\[i\] !== null && state\.answers\[i\] !== undefined && state\.answers\[i\] !== q\.correct/);
});

test('QZ-12: aria-label diz correta/incorreta e só há uma região viva no motor', () => {
  assert.match(engine, /\(correta\)/);
  assert.match(engine, /sua resposta, incorreta/);
  for (const page of ['quiz', 'toxicologia']) {
    const html = fs.readFileSync(path.join(frontend, 'modulos', page, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /id="(questionText|explanation|resultsContainer)"[^>]*aria-live/);
    assert.ok(html.indexOf('quiz-logic.js') > 0 && html.indexOf('quiz-logic.js') < html.indexOf('quiz-engine.js'), page);
  }
});
