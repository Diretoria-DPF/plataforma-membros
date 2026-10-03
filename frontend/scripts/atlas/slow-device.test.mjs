#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * slow-device.test.mjs — perfil do aparelho (js/ui/slow-device.js classifyDevice).
 * Uso: node scripts/atlas/slow-device.test.mjs
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { classifyDevice } = await import(path.resolve(here, '../../modulos/anatomia-3d/js/ui/slow-device.js'));

let failures = 0;
function test(name, fn) {
  try { fn(); console.log(`  ok — ${name}`); } catch (err) {
    failures += 1; console.error(`  FALHOU — ${name}\n    ${err && err.message ? err.message : err}`);
  }
}

console.log('slow-device.classifyDevice');
test('economia de dados vence tudo', () => {
  assert.equal(classifyDevice({ connection: { saveData: true, effectiveType: '4g' }, hardwareConcurrency: 8 }), 'save-data');
});
test('2g/slow-2g = muito lento; 3g = lento', () => {
  assert.equal(classifyDevice({ connection: { effectiveType: '2g' } }), 'very-slow');
  assert.equal(classifyDevice({ connection: { effectiveType: 'slow-2g' } }), 'very-slow');
  assert.equal(classifyDevice({ connection: { effectiveType: '3g' } }), 'slow');
});
test('CPU de 2 núcleos ou 2 GB de memória = fraco', () => {
  assert.equal(classifyDevice({ connection: { effectiveType: '4g' }, hardwareConcurrency: 2 }), 'weak-cpu');
  assert.equal(classifyDevice({ hardwareConcurrency: 8, deviceMemory: 2 }), 'weak-cpu');
});
test('sem informação ou aparelho bom = normal', () => {
  assert.equal(classifyDevice({}), 'normal');
  assert.equal(classifyDevice({ connection: { effectiveType: '4g' }, hardwareConcurrency: 8, deviceMemory: 8 }), 'normal');
});

console.log('');
if (failures > 0) { console.error(`${failures} verificação(ões) falharam.`); process.exitCode = 1; } else console.log('Todas as verificações passaram.');
