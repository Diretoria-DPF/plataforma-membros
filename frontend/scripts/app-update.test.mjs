/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Botão "Atualizar o aplicativo" (frontend/app-update.js): só os caches do app e do Atlas somem, os service workers
// são desregistrados, nada trava e a sessão/dados do aparelho não são tocados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const U = createRequire(import.meta.url)('../app-update.js');

function fakeCaches(names) {
  const deleted = [];
  return { deleted, keys: async () => names.slice(), delete: async (n) => { deleted.push(n); return true; } };
}
function fakeNavigator(count) {
  const unregistered = [];
  const regs = Array.from({ length: count }, (_, i) => ({ unregister: async () => { unregistered.push(i); return true; } }));
  return { unregistered, serviceWorker: { getRegistrations: async () => regs } };
}

test('só os caches do app (laift-shell-) e do Atlas (atlas-) contam', () => {
  assert.equal(U.isAppCache('laift-shell-v13'), true);
  assert.equal(U.isAppCache('atlas-7f30ba1210c831ee'), true);
  assert.equal(U.isAppCache('workbox-precache'), false);
  assert.equal(U.isAppCache('outro-app-atlas-1'), false);
  assert.equal(U.isAppCache(null), false);
});

test('refresh desregistra todos os service workers e apaga só os caches do app e do Atlas', async () => {
  const nav = fakeNavigator(2);
  const cs = fakeCaches(['laift-shell-v12', 'laift-shell-v13', 'atlas-abc', 'cache-de-outra-coisa']);
  const result = await U.refresh({ navigator: nav, caches: cs });
  assert.deepEqual(result, { registrations: 2, caches: 3 });
  assert.deepEqual(nav.unregistered, [0, 1]);
  assert.deepEqual(cs.deleted, ['laift-shell-v12', 'laift-shell-v13', 'atlas-abc']);
});

test('sem service worker nem CacheStorage (navegador antigo), refresh não falha', async () => {
  assert.deepEqual(await U.refresh({ navigator: {}, caches: undefined }), { registrations: 0, caches: 0 });
  assert.deepEqual(await U.refresh({}), { registrations: 0, caches: 0 });
});

test('uma etapa que falha ou trava não impede as outras nem a recarga', async () => {
  const nav = { serviceWorker: { getRegistrations: () => new Promise(() => {}) } }; // nunca responde
  const cs = fakeCaches(['atlas-x']);
  const result = await U.refresh({ navigator: nav, caches: cs }, 30);
  assert.deepEqual(result, { registrations: 0, caches: 1 });
  const broken = { keys: async () => { throw new Error('bloqueado'); } };
  assert.deepEqual(await U.refresh({ navigator: fakeNavigator(1), caches: broken }), { registrations: 1, caches: 0 });
});

test('não toca em sessão, preferências, progresso nem na chave das mensagens', () => {
  const code = read('app-update.js').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML/);
});

test('o botão está no Perfil e o arquivo no build e no cache do service worker', () => {
  const html = read('index.html');
  assert.match(html, /id="btn-app-update"/);
  assert.match(html, /id="msg-app-update"/);
  assert.match(html, /<script src="app-update\.js" defer><\/script>/);
  assert.match(read('scripts/build.js'), /app-update\.js/);
  assert.match(read('sw.js'), /app-update\.js/);
});
