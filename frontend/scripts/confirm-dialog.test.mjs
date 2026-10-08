/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// openConfirm acessível (app.js, #modal-confirm): foco inicial no botão seguro, foco preso no
// diálogo, Esc cancela, Enter não confirma por acidente e o foco volta a quem abriu. A lógica
// mora em createConfirmDialog(doc), entre marcadores em app.js, e é avaliada aqui com um DOM mínimo.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const APP = read('app.js');
const HTML = read('index.html');

const BLOCK_START = '// >>> confirm-dialog (puro)';
const BLOCK_END = '// <<< confirm-dialog (puro)';
function loadFactory() {
  const start = APP.indexOf(BLOCK_START);
  const end = APP.indexOf(BLOCK_END);
  assert.ok(start >= 0 && end > start, 'bloco "confirm-dialog (puro)" não encontrado em app.js');
  return new Function(`${APP.slice(start, end)}\nreturn createConfirmDialog;`)();
}

/** DOM mínimo: foco, classList, ouvintes com disparo manual e contains(). */
function makeNode(id, doc) {
  const hidden = new Set(['hidden']);
  const node = {
    id,
    children: [],
    listeners: {},
    textContent: '',
    isConnected: true,
    attrs: {},
    setAttribute(name, value) { node.attrs[name] = String(value); },
    removeAttribute(name) { delete node.attrs[name]; },
    classList: {
      add(name) { hidden.add(name); },
      remove(name) { hidden.delete(name); },
      contains(name) { return hidden.has(name); },
    },
    addEventListener(type, fn) { (node.listeners[type] ||= []).push(fn); },
    removeEventListener(type, fn) { node.listeners[type] = (node.listeners[type] || []).filter((f) => f !== fn); },
    focus() { doc.activeElement = node; },
    contains(other) { return node === other || node.children.some((child) => child.contains(other)); },
    dispatch(type, evt) { (node.listeners[type] || []).slice().forEach((fn) => fn(evt)); },
    click() { node.dispatch('click', { target: node }); },
  };
  return node;
}

let doc;
let overlay;
let message;
let okBtn;
let cancelBtn;
let opener;
let outside;
let background;
let open;

function buildDom() {
  const docListeners = [];
  doc = {
    activeElement: null,
    body: { id: 'body' },
    docListeners,
    addEventListener(type, fn, capture) { docListeners.push({ type, fn, capture: capture === true }); },
    removeEventListener(type, fn, capture) {
      const at = docListeners.findIndex((l) => l.type === type && l.fn === fn && l.capture === (capture === true));
      if (at >= 0) docListeners.splice(at, 1);
    },
  };
  overlay = makeNode('modal-confirm', doc);
  message = makeNode('modal-confirm-message', doc);
  okBtn = makeNode('modal-confirm-ok', doc);
  cancelBtn = makeNode('modal-confirm-cancel', doc);
  overlay.children = [message, cancelBtn, okBtn];
  opener = makeNode('btn-ban', doc);
  outside = makeNode('fora', doc);
  background = makeNode('app-root', doc);
  background.children = [opener, outside];
  const byId = { 'modal-confirm': overlay, 'modal-confirm-message': message, 'modal-confirm-ok': okBtn, 'modal-confirm-cancel': cancelBtn, 'app-root': background };
  doc.getElementById = (id) => byId[id];
}

const keydownListeners = () => doc.docListeners.filter((l) => l.type === 'keydown');

/** Evento de teclado no documento (captura); devolve o evento e simula o padrão do navegador quando ninguém o cancelou. */
function press(key, { shiftKey = false, repeat = false, target } = {}) {
  const evt = {
    key,
    shiftKey,
    repeat,
    target: target || doc.activeElement || doc.body,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
  keydownListeners().forEach((l) => l.fn(evt));
  if (!evt.defaultPrevented) naturalDefault(evt);
  return evt;
}

/** O que o navegador faria sem o preventDefault: Enter clica no botão; Tab segue a ordem e pode sair do diálogo. */
function naturalDefault(evt) {
  if (evt.key === 'Enter' && (evt.target === okBtn || evt.target === cancelBtn)) evt.target.click();
  if (evt.key === 'Tab') {
    const order = [cancelBtn, okBtn, outside];
    const at = order.indexOf(doc.activeElement);
    const next = order[Math.max(0, Math.min(order.length - 1, at + (evt.shiftKey ? -1 : 1)))];
    next.focus();
  }
}

const isOpen = () => !overlay.classList.contains('hidden');

beforeEach(() => {
  buildDom();
  open = loadFactory()(doc);
  opener.focus();
});

test('abrir: mostra o diálogo, escreve a mensagem como texto e põe o foco em Cancelar (o botão seguro)', () => {
  open('Banir a conta de "Ana"?', () => {});
  assert.equal(isOpen(), true);
  assert.equal(message.textContent, 'Banir a conta de "Ana"?');
  assert.equal(doc.activeElement, cancelBtn);
});

test('a assinatura continua (mensagem, aoConfirmar)', () => {
  assert.equal(open.length, 2);
  assert.match(APP, /function openConfirm\(message, onConfirm\) \{\s*confirmDialog\(message, onConfirm\);/);
});

test('Tab no último botão volta ao primeiro; Shift+Tab no primeiro vai ao último (foco preso)', () => {
  open('?', () => {});
  okBtn.focus();
  const forward = press('Tab');
  assert.equal(forward.defaultPrevented, true);
  assert.equal(doc.activeElement, cancelBtn);
  const backward = press('Tab', { shiftKey: true });
  assert.equal(backward.defaultPrevented, true);
  assert.equal(doc.activeElement, okBtn);
});

test('Tab entre os dois botões segue a ordem natural, sem interferência', () => {
  open('?', () => {});
  assert.equal(press('Tab').defaultPrevented, false);
  assert.equal(doc.activeElement, okBtn);
  assert.equal(press('Tab', { shiftKey: true }).defaultPrevented, false);
  assert.equal(doc.activeElement, cancelBtn);
});

test('foco que escapou do diálogo volta para Cancelar no próximo Tab', () => {
  open('?', () => {});
  outside.focus();
  const evt = press('Tab');
  assert.equal(evt.defaultPrevented, true);
  assert.equal(doc.activeElement, cancelBtn);
});

test('Esc fecha cancelando: não confirma, devolve o foco a quem abriu e não vaza para a página', () => {
  let confirmed = 0;
  open('Excluir?', () => { confirmed += 1; });
  const evt = press('Escape');
  assert.equal(isOpen(), false);
  assert.equal(confirmed, 0);
  assert.equal(doc.activeElement, opener);
  assert.equal(evt.defaultPrevented, true);
  assert.equal(evt.propagationStopped, true);
});

test('Cancelar fecha sem confirmar e devolve o foco a quem abriu', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  cancelBtn.click();
  assert.equal(isOpen(), false);
  assert.equal(confirmed, 0);
  assert.equal(doc.activeElement, opener);
});

test('Confirmar chama o callback uma vez, com o foco já devolvido a quem abriu', () => {
  const seen = [];
  open('?', () => { seen.push(doc.activeElement); });
  okBtn.click();
  assert.equal(isOpen(), false);
  assert.deepEqual(seen, [opener], 'o callback roda depois de o foco voltar (ele pode mudar o foco depois)');
  okBtn.click();
  assert.equal(seen.length, 1, 'clique repetido não confirma de novo');
});

test('Enter logo ao abrir cai em Cancelar: não confirma por acidente', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  press('Enter');
  assert.equal(confirmed, 0);
  assert.equal(isOpen(), false, 'Enter no botão focado (Cancelar) cancela');
});

test('Enter com o foco fora dos botões não faz nada', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  const evt = press('Enter', { target: overlay });
  assert.equal(evt.defaultPrevented, true);
  assert.equal(confirmed, 0);
  assert.equal(isOpen(), true);
});

test('Enter repetido (tecla segurada) é ignorado, mesmo sobre Confirmar', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  okBtn.focus();
  const held = press('Enter', { repeat: true });
  assert.equal(held.defaultPrevented, true);
  assert.equal(confirmed, 0);
  assert.equal(isOpen(), true);
});

test('Enter deliberado em Confirmar (Tab até ele) confirma', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  press('Tab');
  assert.equal(doc.activeElement, okBtn);
  press('Enter');
  assert.equal(confirmed, 1);
  assert.equal(isOpen(), false);
});

test('depois de fechar, os ouvintes saem: Esc e cliques não fazem mais nada', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  assert.equal(keydownListeners().length, 1);
  cancelBtn.click();
  assert.equal(keydownListeners().length, 0, 'o ouvinte do documento sai');
  assert.equal(okBtn.listeners.click.length, 0);
  assert.equal(cancelBtn.listeners.click.length, 0);
  okBtn.click();
  assert.equal(confirmed, 0);
});

test('abrir com um diálogo já aberto descarta o anterior e mantém o opener original', () => {
  const calls = [];
  open('primeiro', () => calls.push('primeiro'));
  open('segundo', () => calls.push('segundo'));
  assert.equal(message.textContent, 'segundo');
  assert.equal(okBtn.listeners.click.length, 1, 'sem ouvintes empilhados');
  assert.equal(keydownListeners().length, 1, 'um ouvinte de teclado só');
  assert.equal('inert' in background.attrs, true, 'o fundo segue inert na troca');
  okBtn.click();
  assert.deepEqual(calls, ['segundo']);
  assert.equal(doc.activeElement, opener, 'o foco volta ao elemento que abriu o primeiro, não a um botão do diálogo');
});

test('opener que saiu da página (lista redesenhada) não quebra o fechamento', () => {
  open('?', () => {});
  opener.isConnected = false;
  assert.doesNotThrow(() => press('Escape'));
  assert.equal(isOpen(), false);
  assert.notEqual(doc.activeElement, opener);
});

test('sem elemento focado ao abrir (body), o foco não é forçado para o body', () => {
  doc.activeElement = doc.body;
  open('?', () => {});
  cancelBtn.click();
  assert.equal(doc.activeElement, cancelBtn, 'sem opener válido o foco fica onde estava, sem erro');
});

test('index.html: o diálogo segue com role, aria-modal e rótulos; Cancelar vem antes de Confirmar', () => {
  const dialog = /<div id="modal-confirm"[^>]*>/.exec(HTML);
  assert.ok(dialog);
  assert.match(dialog[0], /role="dialog"/);
  assert.match(dialog[0], /aria-modal="true"/);
  assert.match(dialog[0], /aria-labelledby="modal-confirm-title"/);
  assert.match(dialog[0], /aria-describedby="modal-confirm-message"/);
  assert.ok(HTML.indexOf('id="modal-confirm-cancel"') < HTML.indexOf('id="modal-confirm-ok"'), 'ordem de Tab: Cancelar, depois Confirmar');
});

// ---------- teclado no documento (captura) e fundo inert ----------

test('as teclas são ouvidas no documento, em captura (não no overlay)', () => {
  open('?', () => {});
  assert.equal(keydownListeners().length, 1);
  assert.equal(keydownListeners()[0].capture, true);
  assert.equal(overlay.listeners.keydown, undefined);
});

test('com o foco no <body> (clique no texto do modal), Esc continua cancelando e devolve o foco a quem abriu', () => {
  let confirmed = 0;
  open('Banir?', () => { confirmed += 1; });
  doc.activeElement = doc.body;
  const evt = press('Escape');
  assert.equal(isOpen(), false);
  assert.equal(confirmed, 0);
  assert.equal(evt.propagationStopped, true);
  assert.equal(doc.activeElement, opener);
});

test('com o foco no <body>, Tab não sai para a página: o foco vai para Cancelar', () => {
  open('?', () => {});
  doc.activeElement = doc.body;
  const evt = press('Tab');
  assert.equal(evt.defaultPrevented, true);
  assert.equal(doc.activeElement, cancelBtn);
  doc.activeElement = doc.body;
  const back = press('Tab', { shiftKey: true });
  assert.equal(back.defaultPrevented, true);
  assert.equal(doc.activeElement, cancelBtn);
});

test('com o foco no <body>, Enter não faz nada (nem confirma, nem ativa a página)', () => {
  let confirmed = 0;
  open('?', () => { confirmed += 1; });
  doc.activeElement = doc.body;
  const evt = press('Enter');
  assert.equal(evt.defaultPrevented, true);
  assert.equal(confirmed, 0);
  assert.equal(isOpen(), true);
});

test('fundo (#app-root) fica inert enquanto o diálogo está aberto e volta ao normal em toda saída', () => {
  assert.equal('inert' in background.attrs, false);
  open('?', () => {});
  assert.equal(background.attrs.inert, '');
  cancelBtn.click();
  assert.equal('inert' in background.attrs, false, 'Cancelar');
  open('?', () => {});
  okBtn.click();
  assert.equal('inert' in background.attrs, false, 'Confirmar');
  open('?', () => {});
  press('Escape');
  assert.equal('inert' in background.attrs, false, 'Esc');
});

test('o inert sai ANTES do callback de confirmação: o callback pode mexer na página e mesmo se lançar erro nada fica preso', () => {
  const seen = [];
  open('?', () => { seen.push('inert' in background.attrs); throw new Error('falha do chamador'); });
  assert.throws(() => okBtn.click(), /falha do chamador/);
  assert.deepEqual(seen, [false]);
  assert.equal('inert' in background.attrs, false);
  assert.equal(keydownListeners().length, 0);
  assert.equal(isOpen(), false);
});

test('erro ao abrir (ex.: foco impossível): desfaz inert, ouvintes e overlay antes de repassar o erro', () => {
  cancelBtn.focus = () => { throw new Error('sem foco'); };
  assert.throws(() => open('?', () => {}), /sem foco/);
  assert.equal('inert' in background.attrs, false);
  assert.equal(keydownListeners().length, 0);
  assert.equal(okBtn.listeners.click.length, 0);
  assert.equal(isOpen(), false);
  // e o diálogo funciona normalmente na próxima abertura
  cancelBtn.focus = () => { doc.activeElement = cancelBtn; };
  open('?', () => {});
  assert.equal(isOpen(), true);
  assert.equal(background.attrs.inert, '');
});

test('sem #app-root na página o diálogo abre e fecha normalmente', () => {
  const byId = doc.getElementById;
  doc.getElementById = (id) => (id === 'app-root' ? null : byId(id));
  assert.doesNotThrow(() => open('?', () => {}));
  assert.equal(isOpen(), true);
  cancelBtn.click();
  assert.equal(isOpen(), false);
});

test('app.js: o diálogo fica fora do #app-root (senão o inert o travaria) e o fundo é o #app-root', () => {
  // Conta a profundidade das tags de bloco a partir da abertura de #app-root até ele fechar.
  const open = HTML.lastIndexOf('<', HTML.indexOf('id="app-root"'));
  const tags = /<(\/?)(div|section|main|header|nav|aside|footer|form|ul|ol|table|article)\b[^>]*>/g;
  tags.lastIndex = open;
  let depth = 0;
  let closedAt = -1;
  for (let m = tags.exec(HTML); m && closedAt < 0; m = tags.exec(HTML)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) closedAt = m.index;
  }
  assert.ok(closedAt > open, '#app-root fecha');
  assert.ok(HTML.indexOf('id="modal-confirm"') > closedAt, 'o diálogo de confirmação fica depois do fim de #app-root');
  assert.match(APP, /background: doc\.getElementById\('app-root'\)/);
});

test('os chamadores existentes continuam com dois argumentos', () => {
  const callers = ['app.js', 'admin-ai.js', 'messaging.js'].map((f) => read(f));
  const calls = callers.join('\n').match(/openConfirm\(/g) || [];
  assert.ok(calls.length >= 10, `chamadores de openConfirm preservados (${calls.length})`);
});
