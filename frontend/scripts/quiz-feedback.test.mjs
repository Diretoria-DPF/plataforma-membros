/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Microinteração de acerto/erro do quiz (ENG-05): modulos/shared/quiz-feedback.js, CSS e fiação.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Feedback = require('../modulos/shared/quiz-feedback.js');

function memoryStorage({ throws = false, initial = {} } = {}) {
  const data = { ...initial };
  return {
    getItem(key) { if (throws) throw new Error('bloqueado'); return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { if (throws) throw new Error('bloqueado'); data[key] = String(value); },
  };
}

function fakeWin({ storage = memoryStorage(), reduced = false, canVibrate = true } = {}) {
  const calls = [];
  const timers = [];
  const win = {
    localStorage: storage,
    matchMedia: (q) => ({ matches: reduced && /reduce/.test(q) }),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
    navigator: canVibrate ? { vibrate: (ms) => { calls.push(ms); return true; } } : {},
  };
  return { win, calls, timers };
}

function fakeOption() {
  const classes = new Set();
  return { classes, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, offsetWidth: 1 };
}

test('vibração: padrão ligada; "0" desliga; a preferência é gravada e relida', () => {
  const storage = memoryStorage();
  assert.equal(Feedback.isVibrationEnabled(storage), true);
  Feedback.setVibrationEnabled(storage, false);
  assert.equal(Feedback.isVibrationEnabled(storage), false);
  Feedback.setVibrationEnabled(storage, true);
  assert.equal(Feedback.isVibrationEnabled(storage), true);
  assert.equal(Feedback.STORAGE_KEY, 'laift_vibration');
});

test('storage bloqueado ou ausente: vale o padrão (ligada) e nada lança', () => {
  assert.equal(Feedback.isVibrationEnabled(memoryStorage({ throws: true })), true);
  assert.equal(Feedback.isVibrationEnabled(null), true);
  assert.doesNotThrow(() => Feedback.setVibrationEnabled(memoryStorage({ throws: true }), false));
  assert.doesNotThrow(() => Feedback.setVibrationEnabled(null, false));
});

test('vibrate: navigator.vibrate(10) quando ligada e disponível', () => {
  const { win, calls } = fakeWin();
  assert.equal(Feedback.vibrate(win), true);
  assert.deepEqual(calls, [10]);
});

test('vibrate: preferência desligada, movimento reduzido ou aparelho sem suporte não vibram', () => {
  const off = fakeWin({ storage: memoryStorage({ initial: { laift_vibration: '0' } }) });
  assert.equal(Feedback.vibrate(off.win), false);
  assert.deepEqual(off.calls, []);
  const reduced = fakeWin({ reduced: true });
  assert.equal(Feedback.vibrate(reduced.win), false);
  assert.deepEqual(reduced.calls, []);
  const none = fakeWin({ canVibrate: false });
  assert.equal(Feedback.vibrate(none.win), false);
});

test('vibrate: erro do navegador nunca lança', () => {
  const win = { localStorage: memoryStorage(), navigator: { vibrate() { throw new Error('bloqueado'); } } };
  assert.equal(Feedback.vibrate(win), false);
});

test('respond: marca a alternativa com feedback-pop, vibra e limpa a classe depois', () => {
  const { win, calls, timers } = fakeWin();
  const option = fakeOption();
  Feedback.respond(win, option);
  assert.ok(option.classes.has('feedback-pop'));
  assert.deepEqual(calls, [10]);
  timers[0].fn();
  assert.ok(!option.classes.has('feedback-pop'));
});

test('respond: com movimento reduzido não anima nem vibra; sem alternativa não lança', () => {
  const { win, calls } = fakeWin({ reduced: true });
  const option = fakeOption();
  Feedback.respond(win, option);
  assert.equal(option.classes.size, 0);
  assert.deepEqual(calls, []);
  assert.doesNotThrow(() => Feedback.respond(fakeWin().win, null));
});

test('CSS: animação curta de escala/cor só dentro de prefers-reduced-motion: no-preference', () => {
  const css = read('modulos/shared/quiz-engine.css');
  const block = /@media \(prefers-reduced-motion: no-preference\) \{[^}]*feedback-pop[^}]*\{[^}]*\}[^}]*\{[^}]*\}\s*\}/.exec(css);
  assert.ok(block, 'animação dentro do bloco no-preference');
  assert.match(css, /@keyframes quiz-pop-correct[\s\S]*scale\(1\.03\)/);
  assert.match(css, /@keyframes quiz-pop-incorrect[\s\S]*scale\(0\.97\)/);
  assert.match(css, /feedback-pop\.correct \{ animation: quiz-pop-correct 280ms/);
});

test('motor: só resposta nova anima (freshAnswer), o script vem antes do motor nos dois quizzes e não há som', () => {
  const engine = read('modulos/shared/quiz-engine.js');
  assert.match(engine, /state\.freshAnswer = true;[\s\S]*?loadQuestion\(\);\s*state\.freshAnswer = false;/);
  assert.match(engine, /if \(state\.freshAnswer && global\.LaiftQuizFeedback\)/);
  for (const page of ['modulos/quiz/index.html', 'modulos/toxicologia/index.html']) {
    const html = read(page);
    assert.ok(html.indexOf('quiz-feedback.js') > 0 && html.indexOf('quiz-feedback.js') < html.indexOf('quiz-engine.js'), page);
  }
  assert.doesNotMatch(read('modulos/shared/quiz-feedback.js'), /Audio|AudioContext|\.play\(/);
});

test('Perfil: caixa "Vibração" nas Preferências, padrão ligada, gravada em localStorage', () => {
  const html = read('index.html');
  assert.match(html, /<input type="checkbox" id="pref-vibration" checked>/);
  const app = read('app.js');
  assert.match(app, /VIBRATION_KEY = 'laift_vibration'/);
  assert.match(app, /setVibration\(document\.getElementById\('pref-vibration'\)\.checked\)/);
  assert.match(app, /getItem\(VIBRATION_KEY\) !== '0'/);
});
