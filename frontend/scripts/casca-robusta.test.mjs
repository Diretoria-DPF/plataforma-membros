/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Casca robusta (F-009, F-032, F-039 da revisão de 2026-11-13): script que falha ao carregar não deixa a Início em
// branco (estado de erro + "Tentar de novo" + nova tentativa com recuo), visitante não gera 401 e as Mensagens tratam
// a falha de carga do módulo de cifragem e a falta de X25519.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ler = (arquivo) => fs.readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const Lazy = require('../lazy-bundles.js');
const Ux = require('../ux-v2.js');
const Engagement = require('../engagement.js');
const Highlights = require('../highlights.js');

/** DOM mínimo (elementos, classList, atributos, busca por id). */
function fakeDoc() {
  const ids = new Map();
  function make(tag) {
    const classes = new Set();
    const el = {
      tag, children: [], attrs: {}, listeners: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      textContent: '', _id: '', parentNode: null,
      get firstChild() { return this.children[0] || null; },
      get id() { return this._id; },
      set id(v) { this._id = v; ids.set(v, el); },
      get className() { return [...classes].join(' '); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
      insertBefore(child, ref) { child.parentNode = el; el.children.splice(Math.max(0, el.children.indexOf(ref)), 0, child); return child; },
      removeChild(child) { el.children.splice(el.children.indexOf(child), 1); return child; },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      removeAttribute(k) { delete el.attrs[k]; },
      hasAttribute: (k) => k in el.attrs,
      addEventListener(type, fn) { el.listeners[type] = fn; },
      setAttributeNS() {},
    };
    el.classList = {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      toggle(c, force) { const on = force === undefined ? !classes.has(c) : force; if (on) classes.add(c); else classes.delete(c); return on; },
    };
    return el;
  }
  const host = make('div'); host.id = 'home-v3'; host.classList.add('hidden');
  const panel = make('section'); panel.id = 'panel-home';
  const body = make('body');
  return { host, panel, body, createElement: make, createElementNS: (ns, tag) => make(tag), getElementById: (id) => ids.get(id) || null, querySelector: () => null, readyState: 'complete' };
}
const all = (el, test) => (test(el) ? [el] : []).concat(...el.children.map((c) => all(c, test)));
const textOf = (el) => [el.textContent].concat(el.children.map(textOf)).join('|');
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Documento falso só para o carregador de pacotes. */
function loaderDoc() {
  const inserted = [];
  return { inserted, body: { appendChild(node) { inserted.push(node); } }, createElement() { return { async: true }; } };
}

// ---------- lazy-bundles: nova tentativa com recuo ----------

test('loadWithRetry: falha, espera o recuo e baixa de novo até dar certo', async () => {
  const doc = loaderDoc();
  const waits = [];
  const loader = Lazy.createLoader(doc, { x: ['a.js'] });
  const done = loader.loadWithRetry('x', [10, 20], async (ms) => { waits.push(ms); });
  doc.inserted[0].onerror();
  await tick();
  assert.deepEqual(waits, [10]);
  assert.equal(doc.inserted.length, 2, 'a segunda tentativa insere outro <script>');
  doc.inserted[1].onerror();
  await tick();
  assert.deepEqual(waits, [10, 20]);
  doc.inserted[2].onload();
  assert.equal(await done, 'x');
});

test('loadWithRetry: esgotadas as tentativas, recusa com a falha; pacote desconhecido recusa na hora', async () => {
  const doc = loaderDoc();
  const loader = Lazy.createLoader(doc, { x: ['a.js'] });
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  const done = loader.loadWithRetry('x', [1], wait);
  doc.inserted[0].onerror();
  await tick();
  doc.inserted[1].onerror();
  await assert.rejects(done, /Falha ao carregar a\.js/);
  assert.deepEqual(waits, [1]);
  await assert.rejects(loader.loadWithRetry('nada', [1], wait), /desconhecido/);
  assert.equal(waits.length, 1, 'não espera por pacote inexistente');
});

test('recover: insere os scripts de novo a cada chamada (sem memória) e recusa se algum falhar', async () => {
  const doc = loaderDoc();
  const loader = Lazy.createLoader(doc, {});
  const first = loader.recover(['engagement.js', 'home.js']);
  assert.deepEqual(doc.inserted.map((s) => s.src), ['engagement.js', 'home.js']);
  doc.inserted.forEach((s) => s.onload());
  await first;
  const second = loader.recover(['home.js']);
  assert.equal(doc.inserted.length, 3);
  doc.inserted[2].onerror();
  await assert.rejects(second, /Falha ao carregar home\.js/);
  assert.deepEqual(Lazy.RETRY_DELAYS_MS, [800, 2400]);
  assert.deepEqual(await loader.recover([]), []);
});

// ---------- engagement.js sem o catálogo ----------

test('engagement.js: sem o catálogo (script que falhou) o arquivo sobe com nomes vazios em vez de lançar', () => {
  const sandbox = { Intl, Date, JSON, Math, Array, Object, String, Number };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(ler('engagement.js'), sandbox));
  assert.ok(sandbox.LaiftEngagement, 'o módulo se registra mesmo sem o catálogo');
  assert.deepEqual(Object.keys(sandbox.LaiftEngagement.MODULE_LABELS), []);
});

// ---------- Início v3: sem engagement.js, erro com "Tentar de novo" ----------

function carregarHomeV3(extra) {
  const sandbox = Object.assign({ Intl, Date, JSON, Math, Array, Object, String, Number, Promise, setTimeout }, extra || {});
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(ler('home-v3.js'), sandbox);
  return sandbox;
}

const appCom = (token, calls) => ({
  getState: () => ({ sessionToken: token, profile: { fullName: 'Ana Teste' } }),
  showPanel() {},
  callApi: async (name) => { calls.push(name); return { success: false }; },
  callLearningApi: async (name) => { calls.push(name); return { success: false }; },
});

test('Início v3 sem engagement.js: estado de erro com mensagem e botão, nunca tela em branco; o botão baixa só o que falta', async () => {
  const doc = fakeDoc();
  const recovered = [];
  const sb = carregarHomeV3({ LaiftLazy: { recover: async (list) => { recovered.push(...list); } } });
  const calls = [];
  await sb.LaiftHomeV3.load(appCom('tk', calls), doc);
  assert.match(textOf(doc.host), /Não foi possível carregar a Início agora/);
  assert.match(textOf(doc.host), /Uma parte do aplicativo não carregou/);
  assert.equal(doc.host.attrs['aria-busy'], 'false');
  assert.deepEqual(calls, [], 'sem a biblioteca não há chamada nenhuma');
  const botao = all(doc.host, (n) => n.tag === 'button' && n.textContent === 'Tentar de novo')[0];
  assert.ok(botao, 'botão "Tentar de novo"');
  botao.listeners.click();
  await tick();
  assert.deepEqual(recovered, ['modulos/shared/catalogo.js', 'engagement.js', 'home.js'], 'baixa de novo os três scripts ausentes');
});

test('Início v3 sem sessão (visitante): não monta e não faz chamada nenhuma (nada de 401)', async () => {
  const doc = fakeDoc();
  const sb = carregarHomeV3({ LaiftEngagement: Engagement });
  const calls = [];
  await sb.LaiftHomeV3.load(appCom('', calls), doc);
  assert.deepEqual(calls, []);
  assert.equal(doc.host.classList.contains('hidden'), true);
  assert.equal('data-v3' in doc.panel.attrs, false);
});

test('engagement e destaques: sem token não chamam a API (visitante recebia 401)', async () => {
  const calls = [];
  const app = { getState: () => ({ sessionToken: '' }), callApi: async (name) => { calls.push(name); return { success: false }; } };
  assert.equal(await Engagement.fetchEngagement(app, ''), null);
  const doc = fakeDoc();
  await Highlights.mount(app, doc);
  assert.deepEqual(calls, []);
});

// ---------- Casca: aviso quando o app.js não sobe ----------

function fakeStorage(initial) {
  const store = new Map(initial || []);
  return { store, getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
}

test('checkShell: sem window.App mostra o aviso (alerta, botão) e agenda UMA nova tentativa por sessão', () => {
  const doc = fakeDoc();
  doc.createElement('div').id = 'public-shell';
  const timers = [];
  const storage = fakeStorage();
  let reloads = 0;
  const win = { document: doc, location: { reload() { reloads += 1; } }, setTimeout: (fn, ms) => timers.push({ fn, ms }), addEventListener() {} };
  const node = Ux.checkShell(win, storage);
  assert.ok(node && node.attrs.role === 'alert');
  assert.equal(doc.body.children[0], node);
  assert.match(textOf(node), /Não foi possível abrir o aplicativo/);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, Ux.SHELL_RETRY_DELAY_MS);
  all(node, (n) => n.tag === 'button')[0].listeners.click();
  assert.equal(reloads, 1, 'o botão recarrega');
  timers[0].fn();
  assert.equal(reloads, 2, 'a nova tentativa automática recarrega');
  Ux.checkShell(win, storage);
  assert.equal(timers.length, 1, 'na segunda falha da sessão não agenda de novo (sem laço de recarga)');
});

test('checkShell: com window.App (ou em página sem a casca) não mostra nada e libera a próxima tentativa', () => {
  const doc = fakeDoc();
  doc.createElement('div').id = 'public-shell';
  const storage = fakeStorage([[Ux.SHELL_RETRY_KEY, '1']]);
  const win = { document: doc, App: {}, setTimeout() { throw new Error('não deve agendar'); }, location: {} };
  assert.equal(Ux.checkShell(win, storage), null);
  assert.equal(storage.store.has(Ux.SHELL_RETRY_KEY), false);
  const outra = { document: fakeDoc(), setTimeout() {}, location: {} };
  assert.equal(Ux.checkShell(outra, storage), null, 'páginas sem #public-shell (blog, Liga) ficam em paz');
});

// ---------- Mensagens: módulo de cifragem ----------

test('supportsX25519: true quando o navegador importa a chave; false (sem lançar) quando não importa ou não há Web Crypto', async () => {
  const mod = await import('../msg-crypto.js');
  assert.equal(await mod.supportsX25519(), true, 'Node 20+ tem X25519');
  const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { value: { subtle: { importKey: async () => { throw new Error('Unrecognized name.'); } }, getRandomValues: () => {} }, configurable: true });
    assert.equal(await mod.supportsX25519(), false);
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    assert.equal(await mod.supportsX25519(), false);
  } finally {
    if (original) Object.defineProperty(globalThis, 'crypto', original); else delete globalThis.crypto;
  }
});

test('messaging.js: import() nunca recusa, nova tentativa em outro endereço, aviso de X25519 e botão "Tentar de novo"', () => {
  const src = ler('messaging.js');
  assert.doesNotMatch(src, /import\('\.\/msg-crypto\.js'\)\.then\(function \(mod\) \{ MsgCrypto = mod; \}\);/, 'o import sem catch de antes');
  assert.match(src, /function \(\) \{ cryptoStatus = 'failed'; \}/, 'falha de carga vira estado');
  assert.match(src, /'\?r=' \+ cryptoAttempts/, 'a nova tentativa usa outro endereço');
  assert.match(src, /supportsX25519/);
  assert.match(src, /falta suporte a X25519/);
  assert.match(src, /Tentar de novo/);
  assert.equal((src.match(/await msgCryptoReady;/g) || []).length, 2, 'só ensureCrypto espera a carga (2 usos internos)');
});

// ---------- Fiação no app.js e regras do projeto ----------

test('app.js: visitante não monta Início nem destaques; falha do pacote usa nova tentativa e o estado de erro', () => {
  const app = ler('app.js');
  assert.match(app, /function mountHighlights\(\) \{\n    if \(!state\.sessionToken\) return;/);
  assert.match(app, /function mountHomeV2\(\) \{\n    if \(!state\.sessionToken\) return;/);
  assert.match(app, /if \(homeV2Requested \|\| !state\.sessionToken\) return;/);
  assert.match(app, /highlights_enabled === true && currentPanelId === 'panel-home' && state\.sessionToken/);
  assert.match(app, /loadWithRetry\('inicio3'\)/);
  assert.match(app, /else showHomeError\(\);/);
  assert.match(app, /actionLabel: 'Tentar de novo', onAction: retryHome/);
});

test('arquivos tocados: sem innerHTML nem estilo inline; alvo de toque de 44 px e sem rolagem lateral no aviso', () => {
  for (const arquivo of ['lazy-bundles.js', 'ux-v2.js', 'home-v3.js', 'engagement.js', 'highlights.js']) {
    const src = ler(arquivo);
    assert.doesNotMatch(src, /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/, arquivo);
    assert.doesNotMatch(src, /setAttribute\('style'/, arquivo);
  }
  const css = ler('ux.css');
  assert.match(css, /\.state-error button \{ min-height: 44px; min-width: 44px; \}/);
  assert.match(css, /\.shell-error \{[^}]*width: calc\(100% - 32px\)/);
});
