/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Atalhos de teclado (frontend/keyboard-shortcuts.js). Todo atalho tem modificador (WCAG 2.1.4):
// Ctrl/Cmd+/ abre a ajuda, Ctrl/Cmd+K abre a Lia. Nada dispara com tecla segurada, dentro de campo
// de texto, nem com outro diálogo aberto. register() recusa combinação repetida.
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
  doc.createElement = (tag) => fakeElement(tag, doc);
  doc.contains = () => true;
  doc.querySelectorAll = (selector) => matching(doc.body, selector);
  // O "document" do fake: listeners de teclado ficam aqui, como no navegador.
  const listeners = {};
  doc.addEventListener = (name, fn) => { (listeners[name] ||= []).push(fn); };
  doc.fire = (name, evt) => (listeners[name] || []).forEach((fn) => fn(evt));
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
    repeat: !!mods.repeat,
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
  // Mesmo ligação que a página faz: teclas do document vão para o gerenciador.
  doc.addEventListener('keydown', (evt) => shortcuts.dispatch(evt));
  return { doc, win, shortcuts, openedCount: () => opened };
}

function helpOverlay(doc) {
  return doc.body.children.find((c) => c.id === 'modal-shortcuts-help');
}

// ---------- forma canônica das teclas ----------
test('comboOf: Ctrl e Cmd viram "mod"; "/" e "?" não ganham shift extra', () => {
  assert.equal(Shortcuts.comboOf(keyEvent('k', { ctrl: true })), 'mod+k');
  assert.equal(Shortcuts.comboOf(keyEvent('k', { meta: true })), 'mod+k');
  assert.equal(Shortcuts.comboOf(keyEvent('/', { ctrl: true })), 'mod+/');
  assert.equal(Shortcuts.comboOf(keyEvent('?', { shift: true })), '?');
  assert.equal(Shortcuts.comboOf(keyEvent('K', { ctrl: true, shift: true })), 'mod+shift+k');
  assert.equal(Shortcuts.comboOf(keyEvent('k')), 'k');
});

test('normalizeCombo aceita escritas diferentes da mesma tecla', () => {
  assert.equal(Shortcuts.normalizeCombo('Ctrl+K'), 'mod+k');
  assert.equal(Shortcuts.normalizeCombo('Cmd+Shift+K'), 'mod+shift+k');
  assert.equal(Shortcuts.normalizeCombo('Ctrl+/'), 'mod+/');
  assert.equal(Shortcuts.normalizeCombo('Cmd+/'), 'mod+/');
  assert.equal(Shortcuts.normalizeCombo(''), '');
});

// ---------- campo de texto ----------
test('isEditableTarget: input de texto, textarea, select e contenteditable são campos; botão e corpo não', () => {
  assert.equal(Shortcuts.isEditableTarget(TEXT_INPUT), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(Shortcuts.isEditableTarget({ tagName: 'BUTTON' }), false);
  assert.equal(Shortcuts.isEditableTarget(BODY), false);
  assert.equal(Shortcuts.isEditableTarget(null), false);
});

test('isEditableTarget: role textbox, combobox e searchbox contam como campo, mesmo em elemento não-input', () => {
  for (const role of ['textbox', 'combobox', 'searchbox']) {
    const el = fakeElement('div', fakeDocument());
    el.setAttribute('role', role);
    assert.equal(Shortcuts.isEditableTarget(el), true, `role=${role} deveria ser campo`);
  }
  const button = fakeElement('div', fakeDocument());
  button.setAttribute('role', 'button');
  assert.equal(Shortcuts.isEditableTarget(button), false);
});

test('isEditableTarget: atributo contenteditable (true, vazio, plaintext-only) conta como campo; false não', () => {
  for (const value of ['true', '', 'plaintext-only']) {
    const el = fakeElement('div', fakeDocument());
    el.setAttribute('contenteditable', value);
    assert.equal(Shortcuts.isEditableTarget(el), true, `contenteditable="${value}"`);
  }
  const off = fakeElement('div', fakeDocument());
  off.setAttribute('contenteditable', 'false');
  assert.equal(Shortcuts.isEditableTarget(off), false);
});

// ---------- atalhos ----------
test('Ctrl+/ fora de campo abre a ajuda e cancela a tecla (preventDefault)', () => {
  const { doc, shortcuts } = setup();
  const evt = keyEvent('/', { ctrl: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), true);
  assert.equal(evt.prevented, 1);
  const overlay = helpOverlay(doc);
  assert.ok(overlay, 'diálogo de ajuda não foi criado');
  assert.equal(overlay.classes.has('hidden'), false);
  assert.equal(overlay.getAttribute('role'), 'dialog');
  assert.equal(overlay.getAttribute('aria-modal'), 'true');
});

test('"?" puro (sem modificador) não faz nada: WCAG 2.1.4 exige modificador', () => {
  const { doc, shortcuts } = setup();
  const evt = keyEvent('?', { shift: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
  assert.equal(helpOverlay(doc), undefined);
  assert.equal(shortcuts.dispatch(keyEvent('/', {}, BODY)), false);
});

test('Ctrl+/ dentro de campo de texto segue o padrão do navegador (não abre a ajuda)', () => {
  const { shortcuts, doc } = setup();
  const evt = keyEvent('/', { ctrl: true }, TEXT_INPUT);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
  assert.equal(helpOverlay(doc), undefined);
});

test('tecla segurada (evt.repeat) não dispara nenhum atalho', () => {
  const { shortcuts, openedCount, doc } = setup();
  assert.equal(shortcuts.dispatch(keyEvent('/', { ctrl: true, repeat: true }, BODY)), false);
  assert.equal(shortcuts.dispatch(keyEvent('k', { ctrl: true, repeat: true }, BODY)), false);
  assert.equal(openedCount(), 0);
  assert.equal(helpOverlay(doc), undefined);
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

test('Ctrl+K dentro de um controle com role=searchbox também é tratado como campo', () => {
  const { shortcuts, openedCount } = setup();
  const search = fakeElement('div', fakeDocument());
  search.setAttribute('role', 'searchbox');
  assert.equal(shortcuts.dispatch(keyEvent('k', { ctrl: true }, search)), false);
  assert.equal(openedCount(), 0);
});

test('Ctrl+K sem LaiftAssistant não cancela a tecla (nada foi tratado)', () => {
  const doc = fakeDocument();
  const shortcuts = Shortcuts.createShortcuts(doc, {});
  const evt = keyEvent('k', { ctrl: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
});

test('com outro diálogo aberto, Ctrl+/ e Ctrl+K não disparam', () => {
  const { doc, shortcuts, openedCount } = setup();
  const other = doc.createElement('div');
  other.classes.add('modal-overlay');
  doc.body.appendChild(other);
  assert.equal(shortcuts.dispatch(keyEvent('/', { ctrl: true }, BODY)), false);
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
  assert.equal(typeof unregister, 'function');
  const evt = keyEvent('F', { ctrl: true, shift: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), true);
  assert.equal(calls, 1);
  assert.equal(evt.prevented, 1);
  unregister();
  assert.equal(shortcuts.dispatch(keyEvent('F', { ctrl: true, shift: true }, BODY)), false);
  assert.equal(calls, 1);
});

test('register recusa (devolve false) combinação já registrada e não sobrescreve a original', () => {
  const { shortcuts } = setup();
  let original = 0;
  let intruder = 0;
  assert.equal(typeof shortcuts.register('Ctrl+J', () => { original += 1; }, 'Primeiro'), 'function');
  assert.equal(shortcuts.register('Ctrl+J', () => { intruder += 1; }, 'Segundo'), false);
  // Ctrl/Cmd+K já é da Lia: não pode ser tomado por outro registro.
  assert.equal(shortcuts.register('Cmd+K', () => { intruder += 1; }), false);
  shortcuts.dispatch(keyEvent('j', { ctrl: true }, BODY));
  assert.equal(original, 1);
  assert.equal(intruder, 0);
});

test('register devolve false para combinação vazia ou função inválida (sem lançar erro)', () => {
  const { shortcuts } = setup();
  assert.equal(shortcuts.register('', () => {}), false);
  assert.equal(shortcuts.register('mod+x', 'nao-e-funcao'), false);
});

test('handler que devolve false não cancela a tecla', () => {
  const { shortcuts } = setup();
  shortcuts.register('Ctrl+H', () => false);
  const evt = keyEvent('h', { ctrl: true }, BODY);
  assert.equal(shortcuts.dispatch(evt), false);
  assert.equal(evt.prevented, 0);
});

// ---------- diálogo de ajuda: foco e fechamento (teclas no document) ----------
test('Esc fecha a ajuda e devolve o foco ao elemento de origem', () => {
  const { doc, shortcuts } = setup();
  const opener = fakeElement('button', doc);
  doc.activeElement = opener;
  shortcuts.dispatch(keyEvent('/', { ctrl: true }, BODY));
  assert.equal(doc.activeElement.id, 'shortcuts-help-close', 'o foco deve ir para o botão Fechar');
  doc.fire('keydown', keyEvent('Escape'));
  assert.equal(helpOverlay(doc).classes.has('hidden'), true);
  assert.equal(doc.activeElement, opener);
});

test('Esc fecha a ajuda mesmo com o foco fora do diálogo (tecla tratada no document)', () => {
  const { doc, shortcuts } = setup();
  shortcuts.dispatch(keyEvent('/', { ctrl: true }, BODY));
  const elsewhere = fakeElement('a', doc);
  doc.activeElement = elsewhere; // foco saiu do diálogo
  const esc = keyEvent('Escape');
  doc.fire('keydown', esc);
  assert.equal(helpOverlay(doc).classes.has('hidden'), true);
  assert.equal(esc.prevented, 1);
});

test('Tab no último foco do diálogo volta ao primeiro (foco preso dentro do diálogo)', () => {
  const { doc, shortcuts } = setup();
  shortcuts.dispatch(keyEvent('/', { ctrl: true }, BODY));
  const tab = keyEvent('Tab');
  doc.fire('keydown', tab);
  assert.equal(tab.prevented, 1, 'Tab no último botão precisa dar a volta');
});

test('Tab com foco fora do diálogo traz o foco de volta para dentro (sem depender do overlay)', () => {
  const { doc, shortcuts } = setup();
  shortcuts.dispatch(keyEvent('/', { ctrl: true }, BODY));
  const outside = fakeElement('button', doc);
  doc.activeElement = outside;
  const tab = keyEvent('Tab');
  doc.fire('keydown', tab);
  assert.equal(tab.prevented, 1);
  assert.equal(doc.activeElement.id, 'shortcuts-help-close');
});

test('Esc e Tab não fazem nada quando a ajuda está fechada', () => {
  const { doc } = setup();
  const esc = keyEvent('Escape');
  const tab = keyEvent('Tab');
  doc.fire('keydown', esc);
  doc.fire('keydown', tab);
  assert.equal(esc.prevented, 0);
  assert.equal(tab.prevented, 0);
});

test('a lista da ajuda mostra os atalhos registrados com descrição, com o rótulo do Ctrl/Cmd + /', () => {
  const { doc, shortcuts } = setup();
  shortcuts.register('Ctrl+Shift+F', () => {}, 'Busca global');
  shortcuts.dispatch(keyEvent('/', { ctrl: true }, BODY));
  const overlay = helpOverlay(doc);
  assert.match(overlay.textContent, /Busca global/);
  assert.match(overlay.textContent, /Abre a Lia/);
  assert.match(overlay.textContent, /Ctrl\/Cmd \+ \//);
  assert.match(overlay.textContent, /Mostra esta lista de atalhos/, 'a própria ajuda também aparece na lista');
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
