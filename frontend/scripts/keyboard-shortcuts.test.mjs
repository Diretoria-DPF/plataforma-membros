/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Atalhos de teclado (frontend/keyboard-shortcuts.js): "?" abre a ajuda, Ctrl/Cmd+K abre a Lia,
// nada dispara dentro de campo de texto nem com outro diálogo aberto; ponto de extensão register().
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const require = createRequire(import.meta.url);
const Shortcuts = require('../keyboard-shortcuts.js');

const HTML = read('frontend/index.html');
const SOURCE = read('frontend/keyboard-shortcuts.js')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

// ---------- DOM mínimo (o suficiente para o diálogo de ajuda) ----------
function fakeElement(tag, doc) {
  const el = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attrs: {},
    listeners: {},
    text: '',
    id: '',
    type: '',
    isContentEditable: false,
    ownerDocument: doc,
    classes: new Set(),
    classList: {
      add: (c) => el.classes.add(c),
      remove: (c) => el.classes.delete(c),
      contains: (c) => el.classes.has(c),
    },
    setAttribute(k, v) { el.attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(el.attrs, k) ? el.attrs[k] : null; },
    appendChild(child) { el.children.push(child); child.parent = el; return child; },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); return child; },
    get firstChild() { return el.children[0] || null; },
    get textContent() { return el.text + el.children.map((c) => c.textContent).join(''); },
    set textContent(value) { el.text = String(value); el.children = []; },
    addEventListener(type, fn) { (el.listeners[type] ||= []).push(fn); },
    focus() { doc.activeElement = el; },
    querySelectorAll(selector) { return matching(el, selector); },
  };
  return el;
}

function matching(node, selector) {
  const out = [];
  const walk = (n) => n.children.forEach((c) => {
    const ok = selector.startsWith('.') ? c.classes.has(selector.slice(1)) : c.tagName === selector.toUpperCase();
    if (ok) out.push(c);
    walk(c);
  });
  walk(node);
  return out;
}

function fakeDocument() {
  const doc = { activeElement: null, body: null };
  doc.body = fakeElement('body', doc);
  doc.body.ownerDocument = doc;
  doc.createElement = (tag) => fakeElement(tag, doc);
  doc.contains = () => true;
  doc.querySelectorAll = (selector) => matching(doc.body, selector);
  doc.fire = (name, evt) => (doc.body.listeners[name] || []).forEach((fn) => fn(evt));
  doc.addEventListener = (name, fn) => (doc.body.listeners[name] ||= []).push(fn);
  return doc;
}

/** Evento de teclado com preventDefault espionado. */
function keyEvent(key, mods = {}, target = null) {
  const evt = {
    key,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    altKey: !!mods.alt,
    shiftKey: !!mods.shift,
    isComposing: false,
    defaultPrevented: false,
    target,
    prevented: 0,
    preventDefault() { evt.prevented += 1; evt.defaultPrevented = true; },
    stopPropagation() {},
  };
  return evt;
}

const BODY = { tagName: 'DIV', isContentEditable: false };
const TEXT_INPUT = { tagName: 'INPUT', type: 'text' };

function setup(extra = {}) {
  const doc = fakeDocument();
  let opened = 0;
  const win = Object.assign({ LaiftAssistant: { open() { opened += 1; } } }, extra);
  const shortcuts = Shortcuts.createShortcuts(doc, win);
  return { doc, win, shortcuts, openedCount: () => opened };
}

// ---------- forma canônica das teclas ----------
test('comboOf: Ctrl e Cmd viram "mod"; "?" já traz o shift e não vira "shift+?"', () => {
  assert.equal(Shortcuts.comboOf(keyEvent('k', { ctrl: true })), 'mod+k');
  assert.equal(Shortcuts.comboOf(keyEvent('k', { meta: true })), 'mod+k');
  assert.equal(Shortcuts.comboOf(keyEvent('?', { shift: true })), '?');
  assert.equal(Shortcuts.comboOf(keyEvent('/', { shift: true })), '?');
  assert.equal(Shortcuts.comboOf(keyEvent('K', { ctrl: true, shift: true })), 'mod+shift+k');
  assert.equal(Shortcuts.comboOf(keyEvent('k')), 'k');
});

test('normalizeCombo aceita escritas diferentes da mesma tecla', () => {
  assert.equal(Shortcuts.normalizeCombo('Ctrl+K'), 'mod+k');
  assert.equal(Shortcuts.normalizeCombo('Cmd+Shift+K'), 'mod+shift+k');
  assert.equal(Shortcuts.normalizeCombo('shift+/'), '?');
  assert.equal(Shortcuts.normalizeCombo('?'), '?');
  assert.equal(Shortcuts.normalizeCombo(''), '');
});

// ---------- campo de texto ----------
test('isEditableTarget: campo de texto, textarea, select e contenteditable são campos; botão e corpo não', () => {
  assert.equal(Shortcuts.isEditableTarget(TEXT_INPUT), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'BUTTON' }), false);
  assert.equal(Shortcuts.isEditableTarget(BODY), false);
  assert.equal(Shortcuts.isEditableTarget(null), false);
});

// ---------- atalhos ----------
test('"?" fora de campo abre a ajuda e cancela a tecla (preventDefault)', () => {
  const { doc, shortcuts } = setup();
  const evt = keyEvent('?', { shift: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), true);
  assert.equal(evt.prevented, 1);
  const overlay = doc.body.children.find((c) => c.id === 'modal-shortcuts-help');
  assert.ok(overlay, 'diálogo de ajuda não foi criado');
  assert.equal(overlay.classes.has('hidden'), false);
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.equal(overlay.getAttribute('aria-modal'), 'true');
});

test('"?" dentro de campo de texto é digitado: não abre a ajuda nem cancela a tecla', () => {
  const { shortcuts, doc } = setup();
  const evt = keyEvent('?', { shift: true }, TEXT_INPUT);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
  assert.equal(doc.body.children.length, 0);
});

test('Ctrl+K e Cmd+K fora de campo abrem a Lia e cancelam o padrão do navegador', () => {
  const ctrl = setup();
  const evtCtrl = keyEvent('k', { ctrl: true }, BODY);
  assert.equal(ctrl.shortcuts.dispatch(evtCtrl), true);
  assert.equal(ctrl.openedCount(), 1);
  assert.equal(evtCtrl.prevented, 1);

  const meta = setup();
  const evtMeta = keyEvent('k', { meta: true }, BODY);
  assert.equal(meta.shortcuts.dispatch(evtMeta), true);
  assert.equal(meta.openedCount(), 1);
  assert.equal(evtMeta.prevented, 1);
});

test('Ctrl+K dentro de textarea segue o padrão do navegador (não abre a Lia)', () => {
  const { shortcuts, openedCount } = setup();
  const evt = keyEvent('k', { ctrl: true }, { tagName: 'TEXTAREA' });
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
  assert.equal(openedCount(), 0);
});

test('Ctrl+K sem LaiftAssistant não cancela a tecla (nada foi tratado)', () => {
  const doc = fakeDocument();
  const shortcuts = Shortcuts.createShortcuts(doc, {});
  const evt = keyEvent('k', { ctrl: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
});

test('com outro diálogo aberto, "?" e Ctrl+K não disparam', () => {
  const { doc, shortcuts, openedCount } = setup();
  const other = doc.createElement('div');
  other.classes.add('modal-overlay');
  doc.body.appendChild(other);
  assert.equal(shortcuts.dispatch(keyEvent('?', { shift: true }, BODY)), false);
  assert.equal(shortcuts.dispatch(keyEvent('k', { ctrl: true }, BODY)), false);
  assert.equal(openedCount(), 0);
});

test('tecla já tratada (defaultPrevented) ou em composição de IME é ignorada', () => {
  const { shortcuts, openedCount } = setup();
  const done = keyEvent('k', { ctrl: true }, BODY);
  done.defaultPrevented = true;
  assert.equal(shortcuts.dispatch(done), false);
  const composing = keyEvent('k', { ctrl: true }, BODY);
  composing.isComposing = true;
  assert.equal(shortcuts.dispatch(composing), false);
  assert.equal(openedCount(), 0);
});

// ---------- ponto de extensão ----------
test('register: a busca global (F4) entra pelo mesmo mecanismo e pode ser removida', () => {
  const { shortcuts } = setup();
  let calls = 0;
  const unregister = shortcuts.register('Ctrl+Shift+F', () => { calls += 1; }, 'Busca global');
  const evt = keyEvent('F', { ctrl: true, shift: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), true);
  assert.equal(calls, 1);
  assert.equal(evt.prevented, 1);
  unregister();
  assert.equal(shortcuts.dispatch(keyEvent('F', { ctrl: true, shift: true }, BODY)), false);
  assert.equal(calls, 1);
});

test('register exige combinação e função; handler que devolve false não cancela a tecla', () => {
  const { shortcuts } = setup();
  assert.throws(() => shortcuts.register('', () => {}), TypeError);
  assert.throws(() => shortcuts.register('mod+x', 'nao-e-funcao'), TypeError);
  shortcuts.register('mod+j', () => false);
  const evt = keyEvent('j', { ctrl: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
});

// ---------- diálogo de ajuda: foco e fechamento ----------
test('Esc fecha a ajuda e devolve o foco ao elemento de origem', () => {
  const { doc, shortcuts } = setup();
  const opener = fakeElement('button', doc);
  doc.activeElement = opener;
  shortcuts.dispatch(keyEvent('?', { shift: true }, BODY));
  const overlay = doc.body.children.find((c) => c.id === 'modal-shortcuts-help');
  assert.equal(doc.activeElement.id, 'shortcuts-help-close', 'o foco deve ir para o botão Fechar');
  overlay.listeners.keydown.forEach((fn) => fn(keyEvent('Escape')));
  assert.equal(overlay.classes.has('hidden'), true);
  assert.equal(doc.activeElement, opener);
});

test('Tab no último foco do diálogo volta ao primeiro (foco preso dentro do diálogo)', () => {
  const { doc, shortcuts } = setup();
  shortcuts.dispatch(keyEvent('?', { shift: true }, BODY));
  const overlay = doc.body.children.find((c) => c.id === 'modal-shortcuts-help');
  const tab = keyEvent('Tab');
  overlay.listeners.keydown.forEach((fn) => fn(tab));
  assert.equal(tab.prevented, 1, 'Tab no último botão precisa dar a volta');
});

test('a lista da ajuda mostra os atalhos registrados com descrição', () => {
  const { doc, shortcuts } = setup();
  shortcuts.register('Ctrl+Shift+F', () => {}, 'Busca global');
  shortcuts.dispatch(keyEvent('?', { shift: true }, BODY));
  const overlay = doc.body.children.find((c) => c.id === 'modal-shortcuts-help');
  assert.match(overlay.textContent, /Busca global/);
  assert.match(overlay.textContent, /Abre a Lia/);
});

// ---------- fiação na página ----------
test('index.html carrega keyboard-shortcuts.js com defer', () => {
  const idx = HTML.indexOf('src="keyboard-shortcuts.js"');
  assert.ok(idx > 0, 'script keyboard-shortcuts.js ausente em index.html');
  assert.match(HTML.slice(idx - 20, idx + 60), /defer/);
});

test('keyboard-shortcuts.js não usa innerHTML, eval, handler inline nem animação própria', () => {
  assert.doesNotMatch(SOURCE, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.doesNotMatch(SOURCE, /\son[a-z]+\s*=/);
  assert.match(SOURCE, /LaiftAssistant/);
});
