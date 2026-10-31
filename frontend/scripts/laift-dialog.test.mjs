/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// LaiftDialog (modulos/shared/laift-dialog.js, MOB-03): role=dialog, aria-labelledby/describedby, foco preso, Esc fecha,
// foco volta a quem abriu, fundo inert, fila de diálogos, texto só por textContent. Roda num DOM falso mínimo.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-dialog.js'), 'utf8');
const CSS = fs.readFileSync(path.join(frontend, 'modulos/shared/laift-dialog.css'), 'utf8');

function makeNode(tag, doc) {
  const node = {
    tag, doc, id: '', className: '', type: '', textContent: '', children: [], parentNode: null, attrs: {}, listeners: {}, isConnected: true,
    setAttribute(n, v) { node.attrs[n] = String(v); },
    getAttribute(n) { return node.attrs[n]; },
    hasAttribute(n) { return n in node.attrs; },
    removeAttribute(n) { delete node.attrs[n]; },
    appendChild(c) { c.parentNode = node; node.children.push(c); return c; },
    removeChild(c) { node.children = node.children.filter((x) => x !== c); c.parentNode = null; c.isConnected = false; return c; },
    addEventListener(t, fn) { (node.listeners[t] ||= []).push(fn); },
    focus() { doc.activeElement = node; },
    click() { (node.listeners.click || []).slice().forEach((fn) => fn({ target: node })); },
    find(pred) { for (const c of node.children) { if (pred(c)) return c; const f = c.find(pred); if (f) return f; } return null; },
  };
  return node;
}

let doc;
let dialogs;
let opener;
let app;
const flush = () => new Promise((r) => setImmediate(r));
const overlay = () => doc.body.children.find((c) => c.className === 'laift-dialog-overlay');
const byClass = (cls) => overlay().find((n) => n.className.split(' ').includes(cls));

function press(key, opts = {}) {
  const evt = { key, shiftKey: !!opts.shiftKey, repeat: !!opts.repeat, target: opts.target || doc.activeElement, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() {} };
  doc.listeners.slice().forEach((l) => l.fn(evt));
  return evt;
}

beforeEach(() => {
  const listeners = [];
  doc = {
    activeElement: null,
    listeners,
    createElement: (tag) => makeNode(tag, doc),
    addEventListener(type, fn, capture) { listeners.push({ type, fn, capture }); },
    removeEventListener(type, fn) { const i = listeners.findIndex((l) => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
  };
  doc.body = makeNode('body', doc);
  app = makeNode('main', doc);
  doc.body.appendChild(app);
  opener = makeNode('button', doc);
  app.appendChild(opener);
  const sandbox = { window: { document: doc }, document: doc, globalThis: null };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(SRC, sandbox);
  dialogs = sandbox.window.LaiftDialog;
  opener.focus();
});

test('confirm: semântica ARIA, título/mensagem ligados e foco inicial em Cancelar', async () => {
  const p = dialogs.confirm('Apagar o progresso?\nNão tem volta.');
  await flush();
  const box = byClass('laift-dialog');
  assert.equal(box.getAttribute('role'), 'dialog');
  assert.equal(box.getAttribute('aria-modal'), 'true');
  const title = byClass('laift-dialog-title');
  const msg = byClass('laift-dialog-message');
  assert.equal(box.getAttribute('aria-labelledby'), title.id);
  assert.equal(box.getAttribute('aria-describedby'), msg.id);
  assert.ok(title.id && msg.id && title.id !== msg.id);
  assert.equal(msg.textContent, 'Apagar o progresso?\nNão tem volta.');
  assert.equal(doc.activeElement.textContent, 'Cancelar');
  doc.activeElement.click();
  assert.equal(await p, false);
});

test('confirm: Confirmar resolve true, remove o diálogo, devolve o foco e tira o inert do fundo', async () => {
  const p = dialogs.confirm('Pausar o atendimento?');
  await flush();
  assert.equal(app.hasAttribute('inert'), true);
  byClass('laift-dialog-btn-primary').click();
  assert.equal(await p, true);
  assert.equal(overlay(), undefined);
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(doc.activeElement, opener);
  assert.equal(doc.listeners.length, 0, 'sem ouvinte de teclado sobrando');
});

test('Esc cancela a confirmação e fecha o aviso', async () => {
  const c = dialogs.confirm('x');
  await flush();
  const evt = press('Escape');
  assert.equal(evt.defaultPrevented, true);
  assert.equal(await c, false);
  const a = dialogs.alert('y');
  await flush();
  press('Escape');
  assert.equal(await a, undefined);
  assert.equal(doc.activeElement, opener);
});

test('foco preso: Tab e Shift+Tab giram entre os botões; foco fora volta para dentro', async () => {
  dialogs.confirm('x');
  await flush();
  const [cancel, ok] = byClass('laift-dialog-actions').children;
  assert.equal(doc.activeElement, cancel);
  let evt = press('Tab', { shiftKey: true });
  assert.equal(evt.defaultPrevented, true);
  assert.equal(doc.activeElement, ok);
  evt = press('Tab');
  assert.equal(evt.defaultPrevented, true);
  assert.equal(doc.activeElement, cancel);
  evt = press('Tab'); // de Cancelar para Confirmar: deixa o navegador seguir a ordem natural
  assert.equal(evt.defaultPrevented, false);
  opener.focus();
  press('Tab');
  assert.equal(doc.activeElement, cancel);
});

test('Enter repetido ou fora dos botões não confirma por acidente', async () => {
  dialogs.confirm('x');
  await flush();
  const ok = byClass('laift-dialog-btn-primary');
  assert.equal(press('Enter', { target: ok, repeat: true }).defaultPrevented, true);
  assert.equal(press('Enter', { target: opener }).defaultPrevented, true);
  assert.equal(press('Enter', { target: ok }).defaultPrevented, false);
});

test('aviso: um botão OK com o foco, resolve sem valor', async () => {
  const p = dialogs.alert('Salvo.', { title: 'Pronto' });
  await flush();
  assert.equal(byClass('laift-dialog-title').textContent, 'Pronto');
  assert.equal(byClass('laift-dialog-actions').children.length, 1);
  assert.equal(doc.activeElement.textContent, 'OK');
  doc.activeElement.click();
  assert.equal(await p, undefined);
});

test('diálogos em sequência entram numa fila e abrem um por vez', async () => {
  const first = dialogs.alert('um');
  const second = dialogs.confirm('dois');
  await flush();
  assert.equal(doc.body.children.filter((c) => c.className === 'laift-dialog-overlay').length, 1);
  assert.equal(byClass('laift-dialog-message').textContent, 'um');
  doc.activeElement.click();
  await first;
  await flush();
  assert.equal(byClass('laift-dialog-message').textContent, 'dois');
  byClass('laift-dialog-btn-primary').click();
  assert.equal(await second, true);
  assert.equal(doc.activeElement, opener, 'o foco volta a quem abriu o primeiro, não a um botão já removido');
});

test('mensagem é texto: marcação HTML não vira elemento', async () => {
  dialogs.alert('<img src=x onerror=alert(1)>');
  await flush();
  assert.equal(byClass('laift-dialog-message').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(byClass('laift-dialog-message').children.length, 0);
});

test('sem DOM, cai nos nativos', async () => {
  const calls = [];
  const sandbox = { window: { document: null, alert: (m) => calls.push(['alert', m]), confirm: (m) => { calls.push(['confirm', m]); return true; } } };
  sandbox.window.window = sandbox.window;
  vm.runInNewContext(SRC, sandbox);
  await sandbox.window.LaiftDialog.alert('a');
  assert.equal(await sandbox.window.LaiftDialog.confirm('b'), true);
  assert.deepEqual(calls, [['alert', 'a'], ['confirm', 'b']]);
});

test('CSS: alvo de toque >= 44px, texto >= 16px, foco visível e sem script inline', () => {
  assert.match(CSS, /\.laift-dialog-btn \{[^}]*min-height: 44px/);
  assert.match(CSS, /\.laift-dialog \{[^}]*font-size: 16px/);
  assert.match(CSS, /\.laift-dialog-message \{[^}]*font-size: 1rem/);
  assert.match(CSS, /:focus-visible/);
  assert.doesNotMatch(SRC, /\.innerHTML|eval\(|new Function/);
});

test('páginas dos módulos carregam a folha e o script, e não sobra alert/confirm nativo', () => {
  for (const [page, files] of [
    ['modulos/quiz/index.html', ['modulos/shared/quiz-engine.js']],
    ['modulos/toxicologia/index.html', ['modulos/shared/quiz-engine.js']],
    ['modulos/clinica/index.html', ['modulos/clinica/clinic-engine.js']],
  ]) {
    const html = fs.readFileSync(path.join(frontend, page), 'utf8');
    assert.match(html, /laift-dialog\.css/, `${page} sem a folha`);
    assert.match(html, /laift-dialog\.js/, `${page} sem o script`);
    assert.ok(html.indexOf('laift-dialog.js') < html.search(/<script src="[^"]*(quiz-engine|clinic-engine)\.js/), `${page}: dialog antes do motor`);
    for (const f of files) {
      const code = fs.readFileSync(path.join(frontend, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const native = code.match(/(^|[^.\w])(alert|confirm)\(/gm) || [];
      // As únicas ocorrências são o fallback `window.alert(` / `global.alert(` / `global.confirm(` dentro dos helpers.
      assert.equal(native.length, 0, `${f} ainda chama alert/confirm nativo sem prefixo`);
    }
  }
});
