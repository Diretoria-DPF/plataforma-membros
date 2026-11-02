/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Mensagens v2 (messages-v2.js, messages-v2.css; flag messages_v2_enabled): funções puras, fiação (pacote sob demanda,
// tela de sempre sem a flag) e regras do código e do CSS (sem innerHTML, sem estilo inline, tudo sob a flag).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertSobDemanda } from './lazy-wiring.mjs';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const m2 = require('../messages-v2.js');
const SRC = ler('messages-v2.js');
const CSS = ler('messages-v2.css');
const APP = ler('app.js');
const HTML = ler('index.html');

test('isActivationKey: Enter e espaço', () => {
  assert.equal(m2.isActivationKey('Enter'), true);
  assert.equal(m2.isActivationKey(' '), true);
  assert.equal(m2.isActivationKey('a'), false);
});

test('isListEmpty: só com a lista carregada e sem linhas', () => {
  assert.equal(m2.isListEmpty(0, 1), true);
  assert.equal(m2.isListEmpty(0, 0), false); // ainda carregando
  assert.equal(m2.isListEmpty(3, 3), false);
});

test('mount sem o painel não faz nada', () => {
  const doc = { getElementById: () => null };
  assert.equal(m2.mount(null, doc), null);
  assert.doesNotThrow(() => m2.reset());
});

test('os ids de sempre que a v2 usa existem no index.html', () => {
  for (const id of ['panel-messages', 'messaging-main-card', 'messaging-conversations-list', 'messaging-conversations-view', 'messaging-thread-view', 'messaging-thread-list', 'messaging-char-counter', 'btn-messaging-clear', 'btn-messaging-back']) {
    assert.ok(HTML.includes(`id="${id}"`), id);
  }
});

test('o script não recria nem troca ids nem toca na cifragem: sem innerHTML, sem estilo inline', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(SRC));
  assert.ok(!/\.style\.|setAttribute\('style'/.test(SRC));
  assert.ok(!/\.id\s*=\s*'messaging-/.test(SRC));
  assert.ok(!/msg-crypto|callApi|MsgCrypto/.test(SRC), 'sem chamadas nem cifragem: só apresentação');
  assert.ok(SRC.includes('createElementNS'));
});

test('textos: sem "grátis"', () => {
  for (const texto of [SRC, CSS]) assert.ok(!/gr[áa]tis/i.test(texto));
});

test('CSS: toda regra sob a flag, movimento reduzido, foco visível e fontes de 12 px ou mais', () => {
  const semComentario = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  const seletores = semComentario.replace(/@media[^{]*\{/g, '').split('}').map((b) => b.split('{')[0].trim()).filter(Boolean);
  for (const seletor of seletores) {
    for (const parte of seletor.split(',')) assert.ok(parte.trim().startsWith(':root[data-flag-messages-v2-enabled]'), `fora da flag: ${parte.trim()}`);
  }
  assert.ok(CSS.includes('prefers-reduced-motion: reduce'));
  assert.ok(CSS.includes('focus-visible'));
  assert.ok(!/font-size:\s*(1[01]|[0-9])(\.\d+)?px/.test(CSS));
  assert.ok(/min-height: 44px/.test(CSS));
});

test('fiação: pacote sob demanda, flag no app.js e tela de sempre sem a flag', () => {
  assertSobDemanda('mensagens2', 'messages-v2.js');
  assert.ok(ler('scripts/build.js').includes("'messages-v2.css'"));
  assert.ok(APP.includes('data-flag-messages-v2-enabled'));
  assert.ok(APP.includes("withBundle('mensagens2'"));
  assert.ok(/if \(messagesV2On\(\)\) mountMessagesV2\(\);\s*else if \(window\.LaiftMessagesV2\) window\.LaiftMessagesV2\.reset/.test(APP));
  assert.ok(!HTML.includes('messages-v2'), 'o index.html não carrega nada de Mensagens v2');
});
