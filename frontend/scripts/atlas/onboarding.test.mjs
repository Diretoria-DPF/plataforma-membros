#!/usr/bin/env node
/**
 * onboarding.test.mjs — regras da apresentação (js/ui/onboarding.js) e das
 * dicas contextuais (js/ui/hints.js).
 * Uso: node scripts/atlas/onboarding.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, '../../modulos/anatomia-3d/js/ui');
const O = await import(path.join(ui, 'onboarding.js'));
const H = await import(path.join(ui, 'hints.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) {
    failures += 1; console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}
const memory = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const DAY = 86400000;
const NOW = Date.parse('2026-10-02T12:00:00Z');

console.log('onboarding.js');
test('mostra: armazenamento vazio, corrompido, sem data ou bloqueado', () => {
  assert.equal(O.shouldShowOnboarding(memory(), NOW), true);
  assert.equal(O.shouldShowOnboarding(memory({ [O.ONBOARDED_KEY]: '{quebrado' }), NOW), true);
  assert.equal(O.shouldShowOnboarding(memory({ [O.ONBOARDED_KEY]: '{"at":"não é data"}' }), NOW), true);
  assert.equal(O.shouldShowOnboarding(memory({ [O.ONBOARDED_KEY]: '{}' }), NOW), true);
  assert.equal(O.shouldShowOnboarding({ getItem() { throw new Error('bloqueado'); } }, NOW), true);
});
test('não mostra se viu há menos de 30 dias; volta a mostrar com 30+', () => {
  const st = memory();
  O.markOnboarded(st, NOW - 29 * DAY);
  assert.equal(O.shouldShowOnboarding(st, NOW), false);
  O.markOnboarded(st, NOW - 30 * DAY);
  assert.equal(O.shouldShowOnboarding(st, NOW), true);
});
test('link direto (#…sid=…) pula a apresentação', () => {
  assert.equal(O.isDeepLink('#sid=za:heart'), true);
  assert.equal(O.isDeepLink('#view=anterior&sid=za:liver'), true);
  assert.equal(O.isDeepLink('#sid='), true, 'veio de link explícito, mesmo inválido');
  assert.equal(O.isDeepLink(''), false);
  assert.equal(O.isDeepLink('#aprender'), false);
});
test('dispensada nesta aba não reabre (sessionStorage)', () => {
  const ss = memory();
  assert.equal(O.wasDismissedThisTab(ss), false);
  O.markDismissedThisTab(ss);
  assert.equal(O.wasDismissedThisTab(ss), true);
});

console.log('hints.js');
const base = () => ({ seen: new Set(), sessionCount: 0, activeHint: null, lastHiddenAt: 0, now: NOW });
test('evento → dica certa', () => {
  assert.equal(H.hintFor({ type: 'select', sid: 'za:liver' }), 'primeira-selecao');
  assert.equal(H.hintFor({ type: 'select', sid: null }), null);
  assert.equal(H.hintFor({ type: 'tools-open' }), 'ferramentas');
  assert.equal(H.hintFor({ type: 'idle', idleMs: 31000, hasSelection: false }), 'inatividade');
  assert.equal(H.hintFor({ type: 'idle', idleMs: 31000, hasSelection: true }), null);
  assert.equal(H.hintFor({ type: 'idle', idleMs: 10000 }), null);
});
test('cada dica 1 vez na vida; no máximo 3 por sessão', () => {
  assert.equal(H.nextHint({ ...base(), seen: new Set(['ferramentas']) }, { type: 'tools-open' }), null);
  assert.equal(H.nextHint({ ...base(), sessionCount: 3 }, { type: 'tools-open' }), null);
  assert.equal(H.nextHint(base(), { type: 'tools-open' }), 'ferramentas');
});
test('nunca com apresentação aberta, quiz ou digitando; 2 s entre dicas; uma por vez', () => {
  const ev = { type: 'select', sid: 'za:liver' };
  assert.equal(H.nextHint({ ...base(), onboardingOpen: true }, ev), null);
  assert.equal(H.nextHint({ ...base(), quizRunning: true }, ev), null);
  assert.equal(H.nextHint({ ...base(), typing: true }, ev), null);
  assert.equal(H.nextHint({ ...base(), activeHint: 'ferramentas' }, ev), null);
  assert.equal(H.nextHint({ ...base(), lastHiddenAt: NOW - 1000 }, ev), null);
  assert.equal(H.nextHint({ ...base(), lastHiddenAt: NOW - 2500 }, ev), 'primeira-selecao');
});
test('"já vistas" sobrevivem a storage corrompido/bloqueado', () => {
  const st = memory();
  H.writeSeen(st, new Set(['inatividade']));
  assert.deepEqual([...H.readSeen(st)], ['inatividade']);
  assert.equal(H.readSeen(memory({ [H.HINTS_KEY]: '{x' })).size, 0);
  assert.equal(H.readSeen({ getItem() { throw new Error('x'); } }).size, 0);
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
