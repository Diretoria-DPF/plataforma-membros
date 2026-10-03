#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * progress-bar.test.mjs — progresso de carregamento (js/ui/progress-bar.js)
 * e chaves de novidades (js/core/flags.js).
 * Uso: node scripts/atlas/progress-bar.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../modulos/anatomia-3d/js');
const { createProgressTracker } = await import(path.join(root, 'ui/progress-bar.js'));
const { parseFlags, FLAG_DEFAULTS } = await import(path.join(root, 'core/flags.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) {
    failures += 1; console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}

console.log('progress-bar.js / flags.js');

test('sem nada carregando: ocioso, progresso 0', () => {
  const t = createProgressTracker();
  assert.equal(t.idle(), true);
  assert.equal(t.progress(), 0);
});

test('um sistema: sobe com os bytes e chega a 1 ao terminar', () => {
  const t = createProgressTracker();
  t.start('esqueletico');
  t.update('esqueletico', 250, 1000);
  assert.equal(t.progress(), 0.25);
  assert.equal(t.current(), 'esqueletico');
  t.finish('esqueletico');
  assert.equal(t.idle(), true);
  assert.equal(t.progress(), 1);
});

test('dois sistemas em sequência: o progresso nunca recua', () => {
  const t = createProgressTracker();
  t.start('esqueletico');
  t.update('esqueletico', 900, 1000);
  const a = t.progress();
  t.start('muscular');            // entra no mesmo lote, com total ainda desconhecido
  const b = t.progress();
  t.update('muscular', 100, 2000); // total maior chega depois
  const c = t.progress();
  t.finish('esqueletico');
  const d = t.progress();
  t.update('muscular', 1500, 2000);
  const e = t.progress();
  t.finish('muscular');
  const seq = [a, b, c, d, e, t.progress()];
  for (let i = 1; i < seq.length; i++) assert.ok(seq[i] >= seq[i - 1], `recuou: ${seq.join(' → ')}`);
  assert.equal(seq[seq.length - 1], 1);
});

test('lote novo depois de terminar recomeça do zero', () => {
  const t = createProgressTracker();
  t.start('esqueletico'); t.update('esqueletico', 10, 10); t.finish('esqueletico');
  assert.equal(t.progress(), 1);
  t.start('nervoso');
  t.update('nervoso', 1, 10);
  assert.equal(t.progress(), 0.1);
});

test('erro conta como fim (a barra some)', () => {
  const t = createProgressTracker();
  t.start('linfatico'); t.update('linfatico', 5, 100);
  t.finish('linfatico');
  assert.equal(t.idle(), true);
});

test('flags: padrões ligados; ?flags= desliga e liga; overrides de teste', () => {
  // Novidades ligadas no padrão; experimentais (aguardando teste com alunos) desligadas.
  const EXPERIMENTAL = ['systemic', 'telemetry']; // desligadas por padrão
  assert.ok(Object.entries(FLAG_DEFAULTS).every(([k, v]) => (EXPERIMENTAL.includes(k) ? v === false : v === true)));
  const f = parseFlags('?flags=-onboarding,-hints', null);
  assert.equal(f.onboarding, false);
  assert.equal(f.hints, false);
  assert.equal(f.pulse, true);
  assert.equal(parseFlags('', { pulse: false }).pulse, false);
  assert.equal(parseFlags('?flags=-pulse,inexistente', null).pulse, false);
  assert.ok(Object.isFrozen(f));
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
