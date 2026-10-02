#!/usr/bin/env node
/**
 * peek.test.mjs — selo de revisão da ficha (js/ui/infocard.js getStatusLabel).
 * Uso: node scripts/atlas/peek.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { getStatusLabel } = await import(path.resolve(here, '../../modulos/anatomia-3d/js/ui/infocard.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) {
    failures += 1; console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}
const NOW = Date.parse('2026-10-02T12:00:00Z');

console.log('infocard.getStatusLabel');
test('sem conteúdo ou status desconhecido: sem selo', () => {
  assert.equal(getStatusLabel(undefined), null);
  assert.equal(getStatusLabel({}), null);
  assert.equal(getStatusLabel({ status: 'xyz' }), null);
});
test('4 estados distintos, nenhum diz "Rascunho"', () => {
  const kinds = ['editorial', 'legacy-unverified', 'auto-draft', 'reviewed'].map((status) => getStatusLabel({ status, review_requested_at: '2026-09-30', by: 'Dra. Ana', date: '2026-10-01' }, NOW));
  assert.deepEqual(kinds.map((k) => k.kind), ['editorial', 'legacy', 'auto', 'reviewed']);
  assert.equal(kinds[0].label, 'Em revisão editorial');
  assert.equal(kinds[1].label, 'Conteúdo antigo · sem revisão');
  assert.equal(kinds[2].label, 'Gerado automaticamente · não revisado');
  assert.equal(kinds[3].label, 'Revisado por Dra. Ana em 01/10/2026');
  assert.ok(kinds.every((k) => !/rascunho/i.test(k.label) && k.tooltip));
});
test('editorial há 30+ dias vira aviso amarelo com os dias', () => {
  const late = getStatusLabel({ status: 'editorial', review_requested_at: '2026-08-20' }, NOW);
  assert.equal(late.kind, 'editorial-late');
  assert.equal(late.label, 'Aguardando revisão há 43 dias');
  assert.equal(getStatusLabel({ status: 'editorial', review_requested_at: '2026-09-10' }, NOW).kind, 'editorial');
});
test('approved sem revisor/data ainda mostra "Revisado"', () => {
  assert.equal(getStatusLabel({ status: 'approved' }, NOW).label, 'Revisado');
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
