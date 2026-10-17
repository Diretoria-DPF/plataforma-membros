/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cookie de sessão HttpOnly (SEC-08, docs/adr/0011): as duas chamadas do app à API mandam credenciais, e o Worker
// sabe qual é o site que pode receber o cookie. A lógica de troca do marcador fica no Worker (sessionCookie.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8').replace(/\r\n/g, '\n');

test('toda chamada do app à API envia credenciais (cookie de sessão)', () => {
  const app = read('app.js');
  const calls = app.split('fetch(API_BASE_URL').slice(1);
  assert.equal(calls.length, 2, 'esperava as duas chamadas à API em app.js (api e callLearningApi)');
  calls.forEach((chunk, i) => {
    const options = chunk.slice(0, chunk.indexOf('.then('));
    assert.match(options, /credentials: 'include'/, `chamada ${i + 1} sem credentials: 'include'`);
  });
});

test('o Worker declara o site do cookie nos dois ambientes', () => {
  const toml = fs.readFileSync(path.join(frontend, '..', 'worker', 'wrangler.toml'), 'utf8');
  assert.equal((toml.match(/^SESSION_COOKIE_SITE = "laift\.com\.br"$/gm) || []).length, 2);
});

test('o token nunca é lido do corpo do login quando a resposta traz sessionCookie (marcador, não credencial)', () => {
  const app = read('app.js');
  assert.match(app, /state\.sessionToken = res\.sessionToken;/);
  assert.match(app, /saveSessionCache\(res\.sessionToken\);/);
});
