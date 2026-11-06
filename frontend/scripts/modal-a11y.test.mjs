/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const CR = String.fromCharCode(13);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8').split(CR).join('');
const M = require('../modal-a11y.js');

test('nextFocusIndex: Tab e Shift+Tab dão a volta dentro do diálogo', () => {
  assert.equal(M.nextFocusIndex(3, 0, false), 1);
  assert.equal(M.nextFocusIndex(3, 2, false), 0, 'Tab no último volta ao primeiro');
  assert.equal(M.nextFocusIndex(3, 0, true), 2, 'Shift+Tab no primeiro vai ao último');
  assert.equal(M.nextFocusIndex(3, -1, false), 0, 'foco fora do diálogo entra pelo primeiro');
  assert.equal(M.nextFocusIndex(3, -1, true), 2);
  assert.equal(M.nextFocusIndex(0, -1, false), -1, 'sem elementos focáveis não faz nada');
});

test('closeTargetId: cada diálogo tem seu botão de fechar/cancelar', () => {
  assert.equal(M.closeTargetId('modal-member-profile'), 'modal-member-profile-close');
  assert.equal(M.closeTargetId('modal-stepup'), 'modal-stepup-cancel');
  assert.equal(M.closeTargetId('modal-vote-complement'), 'modal-vote-cancel');
  assert.equal(M.closeTargetId('modal-confirm'), null, 'o confirmar cuida do próprio Esc');
});

test('arquivos: carregado pelo index, publicado no build e no cache offline', () => {
  assert.match(read('index.html'), /<script src="modal-a11y\.js" defer><\/script>/);
  assert.ok(read('scripts/build.js').includes("'modal-a11y.js'"));
  assert.ok(read('sw.js').includes("'modal-a11y.js'"));
  const js = read('modal-a11y.js');
  assert.ok(js.startsWith('/*\n * Plataforma de Membros LAIFT\n'), 'cabeçalho de copyright');
  assert.ok(!/\.(innerHTML|outerHTML)\s*=|document\.write\(/.test(js));
});
