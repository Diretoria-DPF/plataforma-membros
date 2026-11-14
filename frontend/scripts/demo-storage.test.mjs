// Plataforma de Membros LAIFT — © 2026 Daniel Pires Francisco. Licença proprietária: ver LICENSE.
// F-006: a demonstração (/demo) não grava no aparelho; a conta que entra depois não herda nada dela.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const frontend = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(frontend, p), 'utf8');
const D = require(path.join(frontend, 'modulos/shared/demo-storage.js'));
const Missao = require(path.join(frontend, 'modulos/shared/missao-semana.js'));
const Erros = require(path.join(frontend, 'modulos/shared/quiz-errors.js'));

function realStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => { data.set(k, String(v)); },
    removeItem: (k) => { data.delete(k); },
    dump: () => Object.fromEntries(data),
  };
}

test('F-006: o armazenamento da demo imita Storage e fica só em memória', () => {
  const s = D.create();
  assert.equal(s.getItem('a'), null);
  s.setItem('a', 1);
  s.setItem('b', 'x');
  assert.equal(s.getItem('a'), '1');
  assert.equal(s.length, 2);
  assert.equal(s.key(0), 'a');
  assert.equal(s.key(5), null);
  s.removeItem('a');
  assert.equal(s.getItem('a'), null);
  s.clear();
  assert.equal(s.length, 0);
  assert.equal(s.getItem('__proto__'), null);
});

test('F-006: o par local e sessão é independente e clear limpa os dois', () => {
  const p = D.createPair();
  p.local.setItem('x', '1');
  p.session.setItem('y', '2');
  assert.equal(p.local.getItem('y'), null);
  p.clear();
  assert.equal(p.local.length + p.session.length, 0);
});

test('F-006: a missão e os erros da demo vão para a memória, não para o armazenamento real', () => {
  const real = realStorage();
  const mem = D.create();
  Missao.createStore(mem, () => '').record({ module: 'farmacologia', topic: 'T', correct: true });
  Erros.createStore(mem, () => '').record({ module: 'farmacologia', id: 1, topic: 'T', correct: false });
  assert.deepEqual(real.dump(), {});
  assert.ok(mem.getItem('laiftMissao') && mem.getItem('laiftQuizErrors'));
});

test('F-006: registro sem dono (legado da demo) não é adotado pela conta que entra', () => {
  const legado = realStorage();
  // Simula a demo antiga: grava em armazenamento real, com dono vazio.
  Missao.createStore(legado, () => '').record({ module: 'farmacologia', topic: 'T', correct: true });
  Erros.createStore(legado, () => '').record({ module: 'farmacologia', id: 7, correct: false });
  assert.equal(JSON.parse(legado.getItem('laiftMissao')).owner, '');

  const conta = () => Missao.ownerTag('ana@exemplo.com');
  assert.equal(Missao.createStore(legado, conta).status().doneTotal, 0);
  assert.equal(Missao.createStore(legado, conta).achievements().length, 0);
  assert.equal(Erros.createStore(legado, conta).count(), 0);
  assert.deepEqual(Erros.createStore(legado, conta).pending(), []);
});

test('F-006: registro da própria conta continua valendo', () => {
  const st = realStorage();
  const conta = () => Missao.ownerTag('ana@exemplo.com');
  Missao.createStore(st, conta).record({ module: 'farmacologia', topic: 'T', correct: true });
  Erros.createStore(st, conta).record({ module: 'farmacologia', id: 1, correct: false });
  assert.equal(Missao.createStore(st, conta).status().doneTotal, 1);
  assert.equal(Erros.createStore(st, conta).count(), 1);
  const outra = () => Missao.ownerTag('bia@exemplo.com');
  assert.equal(Erros.createStore(st, outra).count(), 0);
});

// ---- laift-identity.js dentro de uma janela simulada ----
function carregarIdentidade(host) {
  const doc = {
    currentScript: { src: 'https://x.test/modulos/shared/laift-identity.js' },
    addEventListener() {},
    getElementsByTagName: () => [],
    documentElement: { setAttribute() {}, getAttribute: () => null, textContent: '' },
  };
  const win = { document: doc, location: { href: 'https://x.test/modulos/quiz/index.html', replace() {} }, parent: host, top: host, dispatchEvent() {}, CustomEvent: function () {}, URL };
  win.window = win;
  Object.defineProperty(win, 'localStorage', { configurable: true, get: () => { throw new Error('localStorage real tocado'); } });
  Object.defineProperty(win, 'sessionStorage', { configurable: true, get: () => { throw new Error('sessionStorage real tocado'); } });
  Object.defineProperty(win, 'indexedDB', { configurable: true, get: () => ({}) });
  vm.createContext(win);
  vm.runInContext(read('modulos/shared/laift-identity.js'), win);
  return win;
}

test('F-006: na demo, o módulo recebe localStorage, sessionStorage e indexedDB isolados', () => {
  const pair = D.createPair();
  const host = { App: { isDemo: true, demoStorage: pair, getIdentity: () => ({ email: '' }), getThemePreference: () => 'light' } };
  host.parent = host;
  host.top = host;
  const win = carregarIdentidade(host);
  win.localStorage.setItem('laiftMissao', '{}');
  win.sessionStorage.setItem('s', '1');
  assert.equal(pair.local.getItem('laiftMissao'), '{}');
  assert.equal(pair.session.getItem('s'), '1');
  assert.equal(win.indexedDB, undefined);
});

test('F-006: fora da demo, a identidade não troca o armazenamento do módulo', () => {
  const host = { App: { getIdentity: () => ({ email: 'a@b.c' }), getThemePreference: () => 'light' } };
  host.parent = host;
  host.top = host;
  const win = carregarIdentidade(host);
  assert.throws(() => win.localStorage, /localStorage real tocado/);
});

test('F-006: demo.js e demo.html não gravam no aparelho e carregam o armazenamento em memória', () => {
  const js = read('demo.js');
  assert.doesNotMatch(js, /(localStorage|sessionStorage)\.(setItem|clear)|document\.cookie|indexedDB|fetch\(|XMLHttpRequest|sendBeacon/);
  assert.match(js, /isDemo: true/);
  assert.match(js, /demoStorage: memoria/);
  assert.match(js, /pagehide/);
  const html = read('demo.html');
  assert.match(html, /modulos\/shared\/demo-storage\.js/);
  assert.ok(html.indexOf('demo-storage.js') < html.indexOf('src="demo.js"'));
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/); // CSP sem script inline
  assert.match(html, /script-src 'self'/);
});

test('F-035: o aviso da demo tem fundo opaco e se reorganiza em celular estreito', () => {
  const css = read('demo.css');
  assert.match(css, /\.demo-aviso \{[^}]*background-color: var\(--laift-bg\)/);
  assert.match(css, /@media \(max-width: 600px\) \{[\s\S]*\.demo-aviso \{ flex-wrap: wrap/);
  assert.match(css, /\.demo-topo \{ flex-wrap: wrap/); // o cabeçalho não alarga a página em 320 px
});

test('F-006: frame-ancestors de terceiros só em /demo e /modulos/<nome>/*', () => {
  const h = read('_headers');
  const blocos = h.split(/\n(?=\S)/).filter((b) => /frame-ancestors 'self' https:/.test(b));
  assert.ok(blocos.length > 0);
  for (const b of blocos) assert.match(b.split('\n')[0], /^\/(demo|demo\.html|modulos\/\*)/);
});
