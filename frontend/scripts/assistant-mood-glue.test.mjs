/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia (L7): cola do humor no chat (assistant-mood-glue.js). Funções puras, timers falsos e sem navegador.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Glue = require('../assistant-mood-glue.js');
const Mood = require('../modulos/shared/lia/lia-mood.js');
const States = require('../modulos/shared/lia/lia-states.js');

const NOW = 1_000_000;
const NEUTRAL = { energy: 0.5 }; // tom neutro: nem animado (> 0,7) nem reflexivo (< 0,4)
const SWEEP = Array.from({ length: 300 }, (_, i) => (i + 0.5) / 300); // valores de rand espalhados uniformemente em (0, 1)
const constantRand = (value) => () => value;
const codeOf = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

/** Relógio falso: guarda os timers pendentes e dispara o primeiro quando mandado. */
function fakeTimers() {
  const pending = new Map();
  let next = 1;
  return {
    pending,
    schedule(fn, ms) {
      const id = next;
      next += 1;
      pending.set(id, { fn, ms });
      return id;
    },
    cancel(id) { pending.delete(id); },
    fireNext() {
      const [id, job] = pending.entries().next().value;
      pending.delete(id);
      job.fn();
    },
  };
}

test('questionEvents: quick-reply só até 4 s depois da resposta anterior, e nunca sem resposta anterior', () => {
  assert.deepEqual(Glue.questionEvents('oi', NOW + 3999, NOW), ['quick-reply']);
  assert.deepEqual(Glue.questionEvents('oi', NOW + 4000, NOW), []);
  assert.deepEqual(Glue.questionEvents('oi', NOW, null), []);
  assert.deepEqual(Glue.questionEvents('oi', NOW, NOW + 1000), []); // relógio andou para trás: não conta
  assert.equal(Glue.QUICK_REPLY_MS, 4000);
});

test('questionEvents: asks-detail com "detalhe", "explique melhor" ou "mais", sem acento e como palavra inteira', () => {
  assert.deepEqual(Glue.questionEvents('Pode dar mais detalhes?', NOW, null), ['asks-detail']);
  assert.deepEqual(Glue.questionEvents('EXPLIQUE MELHOR isso', NOW, null), ['asks-detail']);
  assert.deepEqual(Glue.questionEvents('Quero mais', NOW, null), ['asks-detail']);
  assert.deepEqual(Glue.questionEvents('Estou demais cansado', NOW, null), []); // "demais" não é "mais"
  assert.deepEqual(Glue.questionEvents('Onde fica o laboratório?', NOW, null), []);
  assert.deepEqual(Glue.questionEvents('mais detalhes', NOW + 1000, NOW), ['quick-reply', 'asks-detail']);
});

test('mapeamento evento→reduce: 👍 positive, moderação negative, pergunta quick-reply e asks-detail', () => {
  const base = Glue.newSession(NEUTRAL);
  assert.deepEqual(Glue.onFeedback(base, 'up').mood, Mood.reduce(base.mood, 'positive'));
  assert.deepEqual(Glue.onFeedback(base, 'down').mood, base.mood);
  assert.deepEqual(Glue.onReply(base, 'warning', NOW).mood, Mood.reduce(base.mood, 'negative'));
  assert.deepEqual(Glue.onReply(base, 'suspended', NOW).mood, Mood.reduce(base.mood, 'negative'));
  assert.deepEqual(Glue.onReply(base, 'none', NOW).mood, base.mood);
  assert.deepEqual(Glue.moderationEvents('warning'), ['negative']);
  assert.deepEqual(Glue.moderationEvents('none'), []);
  const answered = Glue.onReply(base, 'none', NOW);
  assert.equal(answered.lastReplyAt, NOW);
  const asked = Glue.onQuestion(answered, 'explique melhor', NOW + 1000);
  assert.deepEqual(asked.mood, Mood.reduce(Mood.reduce(base.mood, 'quick-reply'), 'asks-detail'));
  assert.deepEqual(Glue.applyEvents(base, ['evento-inventado']).mood, base.mood);
});

test('as funções nunca alteram a sessão recebida e devolvem objetos congelados', () => {
  const session = Glue.newSession(NEUTRAL);
  const before = JSON.stringify(session);
  Glue.onReply(session, 'warning', NOW);
  Glue.onFeedback(session, 'up');
  Glue.onQuestion(session, 'mais', NOW);
  Glue.greeting(session, constantRand(0));
  Glue.fixedLine(session, 'error', 'x', constantRand(0));
  assert.equal(JSON.stringify(session), before);
  assert.equal(Object.isFrozen(Glue.onReply(session, 'none', NOW)), true);
});

test('saudação: troca o "Oi!" fixo por uma variação, nunca repete a anterior e mantém a apresentação', () => {
  let session = Glue.newSession(NEUTRAL);
  const salutations = [];
  for (const value of SWEEP) {
    const out = Glue.greeting(session, constantRand(value));
    session = out.session;
    salutations.push(session.lastGreeting);
    assert.equal(out.text, session.lastGreeting + ' ' + Glue.GREETING_REST);
    assert.ok(Mood.VARIATIONS.greeting.includes(session.lastGreeting), session.lastGreeting);
  }
  for (let i = 1; i < salutations.length; i += 1) assert.notEqual(salutations[i], salutations[i - 1]);
  assert.ok(new Set(salutations).size >= 4, 'varia de verdade');
});

test('saudação: tom reflexivo usa pausa; rapport alto acrescenta a forma calorosa', () => {
  const calm = Glue.greeting(Glue.newSession({ energy: 0.2 }), constantRand(0));
  assert.match(calm.text, /^Oi… Eu sou a Lia/);
  const warm = Glue.greeting(Glue.newSession({ energy: 0.5, rapport: 0.9 }), constantRand(0.99));
  assert.match(warm.text, /^Que bom te ver! Eu sou a Lia/);
});

test('frases fixas: fora do tom reflexivo ficam iguais; no reflexivo ganham variação e não repetem a anterior', () => {
  const neutral = Glue.newSession(NEUTRAL);
  const same = Glue.fixedLine(neutral, 'error', 'Não consegui.', constantRand(0.9));
  assert.equal(same.text, 'Não consegui.');
  assert.equal(same.session, neutral);

  const calm = Glue.newSession({ energy: 0.2 });
  const first = Glue.fixedLine(calm, 'error', 'Não consegui.', constantRand(0));
  assert.equal(first.text, 'Hmm, não entendi. Não consegui.');
  const second = Glue.fixedLine(first.session, 'error', 'Não consegui.', constantRand(0));
  assert.equal(second.text, 'Pode reformular? Não consegui.');

  const confirmed = Glue.fixedLine(calm, 'confirmation', 'O chat voltou ao normal.', constantRand(0));
  assert.equal(confirmed.text, 'Beleza… O chat voltou ao normal.');
});

test('supportLine: com paciência baixa, encurta só a última frase; com paciência alta, não mexe em nada', () => {
  const text = 'Primeira frase fica inteira. Segunda frase bem longa que passa do limite de sessenta caracteres e precisa ser cortada.';
  const impatient = Mood.createMood({ patience: 0.1 });
  const cut = Glue.supportLine(impatient, text);
  assert.ok(cut.startsWith('Primeira frase fica inteira. '), cut);
  assert.ok(cut.endsWith('…'), cut);
  assert.ok(cut.length < text.length);
  assert.equal(Glue.supportLine(Mood.createMood(), text), text);
  // a apresentação da saudação é curta: a paciência baixa não a corta
  const greet = Glue.greeting(Glue.newSession({ patience: 0.1, energy: 0.5 }), constantRand(0));
  assert.match(greet.text, /Sobre o que você quer saber\?$/);
});

test('idle: um único timer entre 10 e 30 s; desarmar cancela o pendente e não deixa nada para trás', () => {
  const timers = fakeTimers();
  const mood = Glue.newSession(NEUTRAL).mood;
  const idle = Glue.createIdle({
    schedule: timers.schedule, cancel: timers.cancel, allowed: () => true, canPose: () => true,
    mood: () => mood, apply() {}, random: constantRand(0.5),
  });
  idle.arm();
  idle.arm(); // rearmar não cria um segundo timer
  assert.equal(timers.pending.size, 1);
  const [{ ms }] = timers.pending.values();
  assert.ok(ms >= 10000 && ms <= 30000, String(ms));
  assert.equal(idle.isArmed(), true);
  idle.disarm();
  assert.equal(timers.pending.size, 0);
  assert.equal(idle.isArmed(), false);
});

test('idle: cada disparo aplica uma pose válida para a Lia e reagenda; fora do repouso, não aplica nem reagenda', () => {
  const timers = fakeTimers();
  const mood = Glue.newSession(NEUTRAL).mood;
  const poses = [];
  let resting = true;
  const idle = Glue.createIdle({
    schedule: timers.schedule, cancel: timers.cancel, allowed: () => true, canPose: () => resting,
    mood: () => mood, apply: (pose) => poses.push(pose), random: constantRand(0.3),
  });
  idle.arm();
  timers.fireNext();
  assert.equal(poses.length, 1);
  assert.equal(timers.pending.size, 1, 'reagenda a próxima pose');
  for (const [key, value] of Object.entries(poses[0])) {
    assert.equal(States.resolve('idle', poses[0])[key], value, 'pose aceita pela matriz de estados: ' + key);
  }
  resting = false; // pensando, falando, celebrando ou moderação ativa
  timers.fireNext();
  assert.equal(poses.length, 1, 'não aplica durante uma reação');
  assert.equal(timers.pending.size, 0, 'não reagenda durante uma reação');
});

test('idle: sem painel aberto ou com movimento reduzido, não agenda nada', () => {
  const timers = fakeTimers();
  const idle = Glue.createIdle({
    schedule: timers.schedule, cancel: timers.cancel, allowed: () => false, canPose: () => true,
    mood: () => Glue.newSession(NEUTRAL).mood, apply() {}, random: constantRand(0.5),
  });
  idle.arm();
  assert.equal(timers.pending.size, 0);
  assert.equal(idle.isArmed(), false);
});

test('assistant-mood-glue.js é cola pura: sem armazenamento, sem DOM, sem HTML, sem intervalo e sem Math.random', () => {
  const code = codeOf('assistant-mood-glue.js');
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(code, /innerHTML|insertAdjacentHTML|document\./);
  assert.doesNotMatch(code, /setInterval|Math\.random/);
});

test('assistant-mood-glue.js segue o padrão dos módulos irmãos: window.AssistantMood ou module.exports', () => {
  const src = fs.readFileSync(path.join(frontend, 'assistant-mood-glue.js'), 'utf8');
  assert.match(src, /root\.AssistantMood = api/);
  assert.match(src, /module\.exports = api/);
});
