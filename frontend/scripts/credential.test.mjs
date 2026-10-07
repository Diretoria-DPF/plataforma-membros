/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Crachá virtual (frontend/credential.js): funções puras e fiação da página.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Credential = require('../credential.js');

const SIGNED = 'LAIFT:v2:123e4567-e89b-12d3-a456-426614174000.AbCdEfGhIjKlMnOpQrStUvWx';

test('roleLabel: papel do servidor vira o rótulo do crachá (desconhecido = Visitante)', () => {
  assert.equal(Credential.roleLabel('admin'), 'Administrador');
  assert.equal(Credential.roleLabel('member'), 'Membro');
  assert.equal(Credential.roleLabel('visitor'), 'Visitante');
  assert.equal(Credential.roleLabel('root'), 'Visitante');
  assert.equal(Credential.roleLabel(undefined), 'Visitante');
  assert.equal(Credential.roleLabel('__proto__'), 'Visitante');
});

test('initialsOf: até duas iniciais, em maiúsculas', () => {
  assert.equal(Credential.initialsOf('Maria Souza'), 'MS');
  assert.equal(Credential.initialsOf('  ana  clara  de  lima '), 'AC');
  assert.equal(Credential.initialsOf('Ana'), 'A');
  assert.equal(Credential.initialsOf(''), 'L');
  assert.equal(Credential.initialsOf(null), 'L');
});

test('formatMemberSince: mês/ano em UTC, vazio quando a data não existe', () => {
  assert.equal(Credential.formatMemberSince('2026-03-15T12:00:00Z'), '03/2026');
  assert.equal(Credential.formatMemberSince('2026-12-31T23:59:59Z'), '12/2026');
  assert.equal(Credential.formatMemberSince('lixo'), '');
  assert.equal(Credential.formatMemberSince(null), '');
  assert.equal(Credential.formatMemberSince(undefined), '');
});

test('fileNameFor: nome de arquivo seguro, sem acento nem caractere perigoso', () => {
  assert.equal(Credential.fileNameFor('Maria Souza'), 'cracha-laift-maria-souza.png');
  assert.equal(Credential.fileNameFor('José d\'Ávila / ../../etc'), 'cracha-laift-jose-d-avila-etc.png');
  assert.equal(Credential.fileNameFor(''), 'cracha-laift-membro.png');
  assert.equal(Credential.fileNameFor('x'.repeat(200)).length <= 'cracha-laift-'.length + 40 + '.png'.length, true);
});

test('qrPayloadOf: aceita só a credencial assinada; senão cai no formato provisório pelo e-mail', () => {
  assert.deepEqual(Credential.qrPayloadOf({ success: true, qrPayload: SIGNED }, { email: 'a@b.com' }), { payload: SIGNED, kind: 'v2' });
  assert.deepEqual(Credential.qrPayloadOf({ success: true, qrPayload: 'LAIFT:v2:forjado' }, { email: 'a@b.com' }), { payload: 'LAIFT:ID:a@b.com', kind: 'legacy' });
  assert.deepEqual(Credential.qrPayloadOf({ success: false }, { email: 'a@b.com' }), { payload: 'LAIFT:ID:a@b.com', kind: 'legacy' });
  assert.deepEqual(Credential.qrPayloadOf(null, { email: 'a@b.com' }), { payload: 'LAIFT:ID:a@b.com', kind: 'legacy' });
  assert.equal(Credential.qrPayloadOf({ success: false }, { email: '' }), null);
  assert.equal(Credential.qrPayloadOf(undefined, null), null);
});

test('credential.js nunca converte texto em HTML e não guarda a credencial no navegador', () => {
  const src = read('frontend/credential.js');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|document\.write|eval\(/);
  assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
});

test('o PNG salvo não leva o e-mail nem desenha imagem de outro domínio', () => {
  const src = read('frontend/credential.js');
  const save = src.slice(src.indexOf('function drawCard'), src.indexOf('// Abertura'));
  assert.ok(save.length > 1500, 'não achou o corpo de drawCard e saveImage');
  assert.doesNotMatch(save, /email/i);
  assert.doesNotMatch(save, /avatar/i);
});

test('credential.js está no index.html, na lista do build e no precache do service worker', () => {
  assert.match(read('frontend/index.html'), /<script src="credential\.js" defer><\/script>/);
  assert.match(read('frontend/scripts/build.js'), /'credential\.js'/);
  assert.match(read('frontend/sw.js'), /'credential\.js'/);
});

test('o modal do crachá mantém os ids que os testes e o hub usam e ganhou os botões novos', () => {
  const html = read('frontend/index.html');
  for (const id of ['modal-learn-credential', 'learn-credential-qr', 'learn-credential-name', 'learn-credential-email', 'learn-credential-note', 'learn-credential-close', 'learn-credential-zoom', 'learn-credential-save', 'learn-credential-role', 'learn-credential-since', 'learn-credential-avatar']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'falta #' + id);
  }
  assert.match(html, /id="btn-learn-credential"[^>]*data-open-credential/);
});

test('learning.js não monta mais o QR sozinho: delega ao crachá', () => {
  const src = read('frontend/learning.js');
  assert.doesNotMatch(src, /function loadQrLib/);
  assert.match(src, /LaiftCredential/);
});
