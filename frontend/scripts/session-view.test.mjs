/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// SEC-10: window.App.getState() não expõe o token de sessão (alça opaca em session-view.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');
const SV = createRequire(import.meta.url)('../session-view.js');
const TOKEN_A = 'a'.repeat(64);
const TOKEN_B = 'b'.repeat(64);

function makeSession() {
  const s = { token: null, profile: null };
  return { s, sv: SV.create(() => s.token, () => s.profile) };
}

test('getState não contém o token, em nenhum formato', () => {
  const { s, sv } = makeSession();
  s.token = TOKEN_A; s.profile = { fullName: 'Ana', role: 'member' };
  assert.ok(!JSON.stringify(sv.view).includes(TOKEN_A));
  assert.ok(!Object.values(sv.view).includes(TOKEN_A));
  assert.match(sv.view.sessionToken, /^sessao-\d+$/);
  s.token = 'cookie'; // marcador do modo cookie
  assert.notEqual(sv.view.sessionToken, 'cookie');
});

test('sem sessão a alça é nula e o objeto não aceita escrita', () => {
  const { sv } = makeSession();
  assert.equal(sv.view.sessionToken, null);
  assert.throws(() => { 'use strict'; sv.view.sessionToken = 'x'; });
});

test('a visão é viva: perfil novo e logout aparecem em referência guardada', () => {
  const { s, sv } = makeSession();
  const guardada = sv.view;
  s.token = TOKEN_A; s.profile = { role: 'member' };
  assert.deepEqual(guardada.profile, { role: 'member' });
  s.token = null; s.profile = null;
  assert.equal(guardada.sessionToken, null);
});

test('resolve troca a alça atual pelo token e deixa o resto igual', () => {
  const { s, sv } = makeSession();
  s.token = TOKEN_A;
  assert.equal(sv.resolve(sv.view.sessionToken), TOKEN_A);
  assert.equal(sv.resolve(''), '');
  assert.equal(sv.resolve('ana@exemplo.test'), 'ana@exemplo.test');
  assert.deepEqual(sv.resolve({ a: 1 }), { a: 1 });
});

test('alça de sessão antiga não vale na sessão nova (troca de conta)', () => {
  const { s, sv } = makeSession();
  s.token = TOKEN_A;
  const velha = sv.view.sessionToken;
  s.token = TOKEN_B;
  const nova = sv.view.sessionToken;
  assert.notEqual(velha, nova);
  assert.equal(sv.resolve(velha), '');
  assert.equal(sv.resolve(nova), TOKEN_B);
  s.token = null;
  assert.equal(sv.resolve(nova), '');
});

test('app.js usa a visão: getState e App.callApi passam por ela; o token interno segue para a API', () => {
  const app = read('app.js');
  assert.match(app, /getState: function \(\) \{ return publicSession\.view; \}/);
  assert.match(app, /args\[0\] = publicSession\.resolve\(args\[0\]\)/);
  assert.doesNotMatch(app, /getState: function \(\) \{ return state; \}/);
});

test('arquivo novo entra no index.html (antes do app.js), no build e no precache do sw', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('src="session-view.js"') > 0);
  assert.ok(html.indexOf('src="session-view.js"') < html.indexOf('src="app.js"'));
  assert.ok(read('sw.js').includes("'session-view.js'"));
  assert.ok(read('scripts/build.js').includes("'session-view.js'"));
  assert.doesNotMatch(read('session-view.js'), /innerHTML|localStorage/);
});
