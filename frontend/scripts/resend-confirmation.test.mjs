/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Botão "Reenviar e-mail de confirmação" (resend-confirmation.js, SEC-02). Sem navegador: lógica pura e registro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const { rotuloDoBotao, esperaDe, contar, COOLDOWN_PADRAO_S, ROTULO } = require('../resend-confirmation.js');

test('rotuloDoBotao: contagem m:ss durante a espera e o rótulo normal no fim', () => {
  assert.equal(rotuloDoBotao(120), 'Reenviar em 2:00');
  assert.equal(rotuloDoBotao(65), 'Reenviar em 1:05');
  assert.equal(rotuloDoBotao(9), 'Reenviar em 0:09');
  assert.equal(rotuloDoBotao(0), ROTULO);
  assert.equal(rotuloDoBotao(undefined), 'Reenviar e-mail de confirmação');
});

test('esperaDe: usa o cooldownSeconds do servidor quando válido; senão 2 minutos', () => {
  assert.equal(esperaDe({ cooldownSeconds: 90 }), 90);
  assert.equal(esperaDe({}), COOLDOWN_PADRAO_S);
  assert.equal(esperaDe({ cooldownSeconds: 'x' }), 120);
  assert.equal(esperaDe({ cooldownSeconds: -5 }), 120);
  assert.equal(esperaDe({ cooldownSeconds: 999999 }), 120);
  assert.equal(esperaDe(null), 120);
});

test('contar: um tick por segundo até zero, depois aoFim; parar interrompe', () => {
  let fn = null;
  let cleared = false;
  const timers = { setInterval: (f) => { fn = f; return 1; }, clearInterval: () => { cleared = true; } };
  const ticks = [];
  let fim = 0;
  contar(3, (r) => ticks.push(r), () => { fim += 1; }, timers);
  fn(); fn(); fn();
  assert.deepEqual(ticks, [3, 2, 1]);
  assert.equal(fim, 1);
  assert.equal(cleared, true);
});

test('o script nunca usa innerHTML/outerHTML/insertAdjacentHTML e chama só apiResendConfirmation', () => {
  const src = read('resend-confirmation.js');
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src));
  assert.deepEqual([...src.matchAll(/callApi\('([^']+)'/g)].map((m) => m[1]), ['apiResendConfirmation']);
});

test('registrado no index.html (depois de app.js), no service worker e no build; a CSP não mudou', () => {
  const html = read('index.html');
  const tag = '<script src="resend-confirmation.js" defer></script>';
  assert.ok(html.includes(tag));
  assert.ok(html.indexOf(tag) > html.indexOf('<script src="app.js" defer></script>'));
  assert.ok(read('sw.js').includes("'resend-confirmation.js'"));
  assert.ok(read('scripts/build.js').includes("'resend-confirmation.js'"));
  assert.match(html, /script-src 'self' https:\/\/challenges\.cloudflare\.com;/);
});
