/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Estados vazio/carregando/erro, esqueletos e aviso offline (frontend/shared-states.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const States = require('../shared-states.js');

/** DOM mínimo. innerHTML lança: o componente nunca pode converter texto em HTML. */
function fakeDoc() {
  const make = (tag) => {
    const node = {
      tag, children: [], attrs: {}, className: '', textContent: '', hidden: false, listeners: {},
      appendChild(child) { this.children.push(child); return child; },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    };
    Object.defineProperty(node, 'innerHTML', { set() { throw new Error('innerHTML proibido'); }, get() { return ''; } });
    return node;
  };
  return { createElement: make, body: make('body') };
}
const texts = (node) => [node.textContent, ...node.children.flatMap(texts)].filter(Boolean);

test('modelo de cada estado: papel ARIA e anúncio corretos', () => {
  assert.deepEqual(States.stateModel('loading'), { role: 'status', live: 'polite', busy: true });
  assert.deepEqual(States.stateModel('empty'), { role: 'status', live: 'polite', busy: false });
  assert.deepEqual(States.stateModel('error'), { role: 'alert', live: 'assertive', busy: false });
  assert.throws(() => States.stateModel('quebrado'), /desconhecido/);
});

test('createStateNode monta título, mensagem e papel ARIA sem innerHTML', () => {
  const doc = fakeDoc();
  const node = States.createStateNode(doc, 'empty', { title: 'Sem eventos', message: 'Volte em breve.' });
  assert.equal(node.className, 'state state-empty');
  assert.equal(node.attrs.role, 'status');
  assert.equal(node.attrs['aria-live'], 'polite');
  assert.deepEqual(texts(node), ['Sem eventos', 'Volte em breve.']);
});

test('texto vindo de fora nunca vira HTML (fica como texto)', () => {
  const node = States.createStateNode(fakeDoc(), 'error', { title: '<img src=x onerror=alert(1)>', message: '<b>x</b>' });
  assert.deepEqual(texts(node), ['<img src=x onerror=alert(1)>', '<b>x</b>']);
});

test('mensagens padrão em português para cada estado', () => {
  const doc = fakeDoc();
  assert.match(texts(States.createStateNode(doc, 'loading'))[0], /Carregando/);
  assert.match(texts(States.createStateNode(doc, 'empty'))[0], /Nada por aqui/);
  const err = States.createStateNode(doc, 'error');
  assert.equal(err.attrs.role, 'alert');
  assert.match(texts(err).join(' '), /Tente novamente/);
});

test('estado de carregando marca aria-busy', () => {
  assert.equal(States.createStateNode(fakeDoc(), 'loading').attrs['aria-busy'], 'true');
  assert.equal(States.createStateNode(fakeDoc(), 'empty').attrs['aria-busy'], undefined);
});

test('botão de ação só existe com rótulo e função; o clique chama a função', () => {
  const doc = fakeDoc();
  assert.equal(States.createStateNode(doc, 'error', {}).children.filter((c) => c.tag === 'button').length, 0);
  assert.equal(States.createStateNode(doc, 'error', { actionLabel: 'Tentar de novo' }).children.filter((c) => c.tag === 'button').length, 0);
  let clicks = 0;
  const node = States.createStateNode(doc, 'error', { actionLabel: 'Tentar de novo', onAction: () => { clicks++; } });
  const button = node.children.find((c) => c.tag === 'button');
  assert.equal(button.textContent, 'Tentar de novo');
  assert.equal(button.attrs.type, 'button');
  button.listeners.click();
  assert.equal(clicks, 1);
});

test('esqueleto: escondido dos leitores de tela e com 1 a 8 linhas', () => {
  const doc = fakeDoc();
  const sk = States.createSkeleton(doc, 3);
  assert.equal(sk.attrs['aria-hidden'], 'true');
  assert.equal(sk.className, 'skeleton');
  assert.equal(sk.children.length, 3);
  assert.ok(sk.children.every((c) => c.className.includes('skeleton-line')));
  assert.equal(States.createSkeleton(doc, 0).children.length, 1);
  assert.equal(States.createSkeleton(doc, 99).children.length, 8);
  assert.equal(States.createSkeleton(doc).children.length, 3);
});

test('errorMessageFor usa a mensagem da API ou a padrão em português', () => {
  assert.equal(States.errorMessageFor({ success: false, message: '  Sessão expirada.  ' }), 'Sessão expirada.');
  assert.match(States.errorMessageFor({ success: false }), /Tente novamente/);
  assert.match(States.errorMessageFor({ success: false, message: '   ' }), /Tente novamente/);
  assert.match(States.errorMessageFor(undefined), /Tente novamente/);
  assert.match(States.errorMessageFor({ message: 42 }), /Tente novamente/);
});

test('resolveListState: erro quando a chamada falha, vazio sem itens, pronto com itens', () => {
  assert.deepEqual(States.resolveListState({ success: false, message: 'Falhou.' }, []), { kind: 'error', message: 'Falhou.' });
  assert.deepEqual(States.resolveListState(null, []).kind, 'error');
  assert.deepEqual(States.resolveListState({ success: true }, []), { kind: 'empty' });
  assert.deepEqual(States.resolveListState({ success: true }, undefined), { kind: 'empty' });
  assert.deepEqual(States.resolveListState({ success: true }, [{ id: 1 }]), { kind: 'ready' });
  // Falha com itens antigos ainda é erro: não se mostra lista velha como atual.
  assert.equal(States.resolveListState({ success: false }, [{ id: 1 }]).kind, 'error');
});

test('setBusy liga e desliga aria-busy e ignora nó ausente', () => {
  const node = fakeDoc().createElement('div');
  States.setBusy(node, true);
  assert.equal(node.attrs['aria-busy'], 'true');
  States.setBusy(node, false);
  assert.equal(node.attrs['aria-busy'], undefined);
  assert.doesNotThrow(() => States.setBusy(null, true));
});

test('aviso offline aparece ao perder a conexão e some ao voltar', () => {
  const doc = fakeDoc();
  const handlers = {};
  const win = { navigator: { onLine: true }, addEventListener: (t, fn) => { handlers[t] = fn; } };
  const banner = States.watchConnection(win, doc);
  assert.equal(banner.attrs.role, 'status');
  assert.equal(banner.hidden, true);
  assert.match(texts(banner).join(' '), /offline/i);
  assert.ok(doc.body.children.includes(banner));
  win.navigator.onLine = false; handlers.offline();
  assert.equal(banner.hidden, false);
  win.navigator.onLine = true; handlers.online();
  assert.equal(banner.hidden, true);
});

test('aviso offline já nasce visível se a página abre sem conexão', () => {
  const win = { navigator: { onLine: false }, addEventListener() {} };
  assert.equal(States.watchConnection(win, fakeDoc()).hidden, false);
});

test('index.html carrega ux.css e shared-states.js (antes do app.js)', () => {
  const html = read('frontend/index.html');
  assert.match(html, /<link rel="stylesheet" href="ux\.css">/);
  const states = html.indexOf('<script src="shared-states.js" defer></script>');
  const app = html.indexOf('<script src="app.js" defer></script>');
  assert.ok(states > 0 && app > states, 'shared-states.js precisa vir antes do app.js');
});

test('build.js publica ux.css e shared-states.js', () => {
  const build = read('frontend/scripts/build.js');
  assert.match(build, /'ux\.css'/);
  assert.match(build, /'shared-states\.js'/);
});

test('ux.css respeita movimento reduzido, tem fallback sem backdrop-filter e nenhum texto abaixo de 11 px', () => {
  const css = read('frontend/ux.css');
  assert.match(read('frontend/modulos/shared/laift-tokens.css'), /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
  const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(px|rem|em)/g)].map((m) => (m[2] === 'px' ? Number(m[1]) : Number(m[1]) * 16));
  assert.ok(sizes.every((s) => s >= 11), 'font-size abaixo de 11 px: ' + sizes.filter((s) => s < 11));
});
