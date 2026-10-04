/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificação em duas etapas (frontend/mfa.js): normalização do código digitado,
// formatação da chave e fiação da página (script listado no build e no index).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Mfa = require('../mfa.js');

test('normalizeLoginCode: seis dígitos (com ou sem espaço) viram só dígitos', () => {
  assert.equal(Mfa.normalizeLoginCode('123456'), '123456');
  assert.equal(Mfa.normalizeLoginCode(' 123 456 '), '123456');
});

test('normalizeLoginCode: qualquer outra coisa é tratada como código de recuperação (maiúsculas, sem espaços)', () => {
  assert.equal(Mfa.normalizeLoginCode('abcde-fghjk'), 'ABCDE-FGHJK');
  assert.equal(Mfa.normalizeLoginCode(' abcde fghjk '), 'ABCDEFGHJK');
  assert.equal(Mfa.normalizeLoginCode(''), '');
  assert.equal(Mfa.normalizeLoginCode(null), '');
});

test('groupSecret: agrupa a chave de 4 em 4 para digitar sem erro', () => {
  assert.equal(Mfa.groupSecret('JBSWY3DPEHPK3PXP'), 'JBSW Y3DP EHPK 3PXP');
  assert.equal(Mfa.groupSecret('jbsw y3dp'), 'jbsw y3dp');
  assert.equal(Mfa.groupSecret(''), '');
});

test('recoveryCodesText: uma linha por código, com o aviso de uso único', () => {
  const text = Mfa.recoveryCodesText(['AAAAA-BBBBB', 'CCCCC-DDDDD']);
  assert.match(text, /uma única vez/);
  assert.ok(text.includes('AAAAA-BBBBB\nCCCCC-DDDDD'));
});

test('mfa.js nunca converte texto em HTML e não guarda segredo no navegador', () => {
  const src = read('frontend/mfa.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
});

test('mfa.js está no index.html, na lista do build e no precache do service worker', () => {
  assert.match(read('frontend/index.html'), /<script src="mfa\.js" defer><\/script>/);
  assert.match(read('frontend/scripts/build.js'), /'mfa\.js'/);
  assert.match(read('frontend/sw.js'), /'mfa\.js'/);
});

test('o login tem o formulário do segundo passo, escondido por padrão', () => {
  const html = read('frontend/index.html');
  assert.match(html, /<form id="form-login-mfa" class="hidden"/);
  assert.match(html, /id="login-mfa-code"[^>]*autocomplete="one-time-code"/);
  assert.match(html, /id="mfa-card-body"/);
});
