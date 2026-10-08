/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Digitação do balão da Lia (frontend/assistant-typing.js): caractere a caractere em requestAnimationFrame,
// tempo limitado, texto completo para o leitor de tela de uma vez, texto inteiro com movimento reduzido.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Typing = require('../assistant-typing.js');

// ---------- DOM e janela mínimos ----------

function fakeNode(tag) {
  const node = {
    tag,
    className: '',
    attrs: {},
    children: [],
    textContent: '',
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    setAttribute(name, value) { node.attrs[name] = String(value); },
    appendChild(child) { node.children.push(child); return child; },
    removeChild(child) { node.children = node.children.filter((c) => c !== child); return child; },
  };
  Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
  return node;
}
const doc = { createElement: fakeNode };

function fakeWin({ reduced = false, noRaf = false, throwing = false } = {}) {
  const queue = [];
  let id = 0;
  const win = {
    queue,
    cancelled: [],
    matchMedia() {
      if (throwing) throw new Error('indisponível');
      return { matches: reduced };
    },
    cancelAnimationFrame(handle) { win.cancelled.push(handle); queue.splice(0, queue.length, ...queue.filter((q) => q.id !== handle)); },
    /** Roda o próximo quadro no instante `stamp` (ms). */
    tick(stamp) { const next = queue.shift(); if (next) next.fn(stamp); },
  };
  if (!noRaf) win.requestAnimationFrame = (fn) => { id += 1; queue.push({ id, fn }); return id; };
  return win;
}

const spans = (bubble) => bubble.children;
const srOnly = (bubble) => bubble.children.find((c) => c.className === 'visually-hidden');
const layer = (bubble) => bubble.children.find((c) => c.className === 'lia-typed');
const shown = (bubble) => layer(bubble).children.find((c) => c.className === 'lia-typed-shown');
const rest = (bubble) => layer(bubble).children.find((c) => c.className === 'lia-typed-rest');

// ---------- Funções puras ----------

test('duração: proporcional ao tamanho e nunca acima de 2,5 s', () => {
  assert.equal(Typing.durationFor(0), 0);
  assert.equal(Typing.durationFor(90), 1000);
  assert.equal(Typing.durationFor(225), 2500);
  assert.equal(Typing.durationFor(2000), 2500);
  assert.equal(Typing.durationFor(-5), 0);
  assert.equal(Typing.durationFor('abc'), 0);
  assert.equal(Typing.MAX_MS, 2500);
});

test('visibleCount: linear no tempo, limitado ao total e sem passar de zero', () => {
  assert.equal(Typing.visibleCount(0, 100, 1000), 0);
  assert.equal(Typing.visibleCount(500, 100, 1000), 50);
  assert.equal(Typing.visibleCount(999, 100, 1000), 99);
  assert.equal(Typing.visibleCount(1000, 100, 1000), 100);
  assert.equal(Typing.visibleCount(5000, 100, 1000), 100);
  assert.equal(Typing.visibleCount(-50, 100, 1000), 0);
  assert.equal(Typing.visibleCount(10, 0, 1000), 0);
  assert.equal(Typing.visibleCount(10, 100, 0), 100);
});

test('canType: precisa de texto, de requestAnimationFrame e de movimento normal', () => {
  assert.equal(Typing.canType('oi', fakeWin()), true);
  assert.equal(Typing.canType('', fakeWin()), false);
  assert.equal(Typing.canType(null, fakeWin()), false);
  assert.equal(Typing.canType('oi', fakeWin({ reduced: true })), false);
  assert.equal(Typing.canType('oi', fakeWin({ noRaf: true })), false);
  assert.equal(Typing.canType('oi', null), false);
  assert.equal(Typing.canType('oi', fakeWin({ throwing: true })), false, 'sem saber, fica conservador (movimento reduzido)');
});

// ---------- Efeito ----------

test('sem movimento reduzido: o balão digita em quadros e termina com o texto inteiro e onDone uma vez', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  let done = 0;
  const handle = Typing.render(doc, bubble, 'Olá, tudo bem?', { win, onDone: () => { done += 1; } });
  assert.ok(handle);
  assert.equal(shown(bubble).textContent, '');
  assert.equal(rest(bubble).textContent, 'Olá, tudo bem?');
  const total = Typing.durationFor(14); // 156 ms
  win.tick(1000); // primeiro quadro marca o início
  assert.equal(shown(bubble).textContent, '');
  win.tick(1000 + total / 2);
  const half = shown(bubble).textContent;
  assert.ok(half.length > 0 && half.length < 14, `parcial: "${half}"`);
  assert.equal(half + rest(bubble).textContent, 'Olá, tudo bem?', 'o texto nunca perde nem repete caractere');
  assert.equal(handle.isDone(), false);
  win.tick(1000 + total);
  assert.equal(shown(bubble).textContent, 'Olá, tudo bem?');
  assert.equal(handle.isDone(), true);
  assert.equal(done, 1);
  assert.equal(win.queue.length, 0, 'sem novo quadro depois de terminar');
  assert.equal(layer(bubble).children.includes(rest(bubble)), false, 'a parte futura some no fim');
});

test('leitor de tela: o texto completo entra de uma vez num trecho só para leitores; a camada que digita é aria-hidden', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  Typing.render(doc, bubble, 'Resposta completa da Lia.', { win });
  assert.equal(srOnly(bubble).textContent, 'Resposta completa da Lia.');
  assert.equal(layer(bubble).attrs['aria-hidden'], 'true');
  assert.equal(srOnly(bubble).attrs['aria-hidden'], undefined);
  assert.equal(spans(bubble).length, 2);
  win.tick(0);
  win.tick(60);
  assert.equal(srOnly(bubble).textContent, 'Resposta completa da Lia.', 'o trecho dos leitores nunca muda durante a digitação');
});

test('a parte ainda não digitada fica transparente (opacity por CSSOM) e ocupa o lugar dela', () => {
  const bubble = fakeNode('p');
  Typing.render(doc, bubble, 'abc', { win: fakeWin() });
  assert.equal(rest(bubble).style.props.opacity, '0');
  assert.equal(rest(bubble).attrs.style, undefined, 'sem atributo style (CSP)');
});

test('finish: mostra tudo na hora, avisa onDone uma vez e cancela o quadro pendente', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  let done = 0;
  const handle = Typing.render(doc, bubble, 'Texto bem comprido para digitar aos poucos', { win, onDone: () => { done += 1; } });
  win.tick(0);
  handle.finish();
  assert.equal(shown(bubble).textContent, 'Texto bem comprido para digitar aos poucos');
  assert.equal(done, 1);
  assert.equal(win.cancelled.length >= 1, true);
  handle.finish();
  assert.equal(done, 1);
});

test('cancel: para sem terminar e sem chamar onDone', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  let done = 0;
  const handle = Typing.render(doc, bubble, 'Texto qualquer', { win, onDone: () => { done += 1; } });
  handle.cancel();
  assert.equal(handle.isDone(), true);
  assert.equal(win.queue.length, 0);
  assert.equal(done, 0);
});

test('resposta longa acelera: o efeito dura no máximo 2,5 s', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  const text = 'palavra '.repeat(250); // 2000 caracteres
  const handle = Typing.render(doc, bubble, text, { win });
  win.tick(0);
  win.tick(Typing.MAX_MS - 1);
  assert.equal(handle.isDone(), false);
  win.tick(Typing.MAX_MS);
  assert.equal(handle.isDone(), true);
  assert.equal(shown(bubble).textContent, text);
});

test('emoji e letras acentuadas não são cortados no meio', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  Typing.render(doc, bubble, 'Olá 👩‍🔬 ação', { win });
  win.tick(0);
  win.tick(50);
  const part = shown(bubble).textContent;
  assert.equal(/[\uD800-\uDBFF]$/.test(part), false, 'sem metade de par substituto no fim');
  assert.equal(part + rest(bubble).textContent, 'Olá 👩‍🔬 ação');
});

test('movimento reduzido, sem rAF ou texto vazio: texto inteiro direto, sem efeito e sem handle', () => {
  [fakeWin({ reduced: true }), fakeWin({ noRaf: true })].forEach((win) => {
    const bubble = fakeNode('p');
    assert.equal(Typing.render(doc, bubble, 'Texto inteiro', { win, onDone() { throw new Error('não deveria chamar'); } }), null);
    assert.equal(bubble.textContent, 'Texto inteiro');
    assert.equal(bubble.children.length, 0);
    assert.equal(win.queue.length, 0);
  });
  const empty = fakeNode('p');
  assert.equal(Typing.render(doc, empty, '', { win: fakeWin() }), null);
  assert.equal(empty.textContent, '');
  const odd = fakeNode('p');
  Typing.render(doc, odd, undefined, { win: fakeWin() });
  assert.equal(odd.textContent, '');
});

test('texto vindo da API entra só por textContent: marcação vira texto', () => {
  const win = fakeWin();
  const bubble = fakeNode('p');
  Typing.render(doc, bubble, '<img src=x onerror=alert(1)> oi', { win });
  assert.equal(srOnly(bubble).textContent, '<img src=x onerror=alert(1)> oi');
  assert.equal(spans(bubble).every((c) => c.tag === 'span'), true);
});

test('assistant-typing.js não usa innerHTML, style inline, eval nem temporizador de caractere', () => {
  const src = fs.readFileSync(path.join(frontend, 'assistant-typing.js'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\b|new Function|setAttribute\('style'|setInterval/);
  assert.match(code, /requestAnimationFrame/);
});

// ---------- Fiação em assistant.js e index.html ----------

test('assistant.js: só respostas novas digitam e o que vem depois do balão fica escondido até o fim', () => {
  const src = fs.readFileSync(path.join(frontend, 'assistant.js'), 'utf8').replace(/\r\n/g, '\n');
  assert.match(src, /root\.AssistantTyping \|\| null/, 'módulo opcional');
  assert.match(src, /typing: true,\n\s+\}\);/, 'resposta com sucesso digita');
  assert.match(src, /error: true, typing: true/, 'resposta de erro digita');
  assert.match(src, /later\.forEach\(function \(node\) \{ node\.classList\.add\('hidden'\); \}\)/);
  assert.match(src, /finishTyping\(\); \/\/ a resposta anterior termina/);
});

test('index.html carrega assistant-typing.js antes de assistant.js', () => {
  const html = fs.readFileSync(path.join(frontend, 'index.html'), 'utf8');
  const typing = html.indexOf('<script src="assistant-typing.js" defer></script>');
  const assistant = html.indexOf('<script src="assistant.js" defer></script>');
  assert.ok(typing > 0 && assistant > typing);
});
