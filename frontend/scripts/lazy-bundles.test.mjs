/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Carga sob demanda do painel admin e da Guia (MOB-04) e service worker enxuto (MOB-07).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(frontend, rel), 'utf8');
const Lazy = require('../lazy-bundles.js');
const Sw = require('../sw.js');

/** Documento falso: guarda os <script> inseridos e deixa o teste decidir o resultado de cada um. */
function fakeDoc() {
  const inserted = [];
  const body = { appendChild(node) { inserted.push(node); } };
  return { inserted, body, createElement() { return { async: true }; } };
}

const precache = () => {
  const m = /var PRECACHE = \[([\s\S]*?)\n  \];/.exec(read('sw.js'));
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
};

test('carregador: injeta todos os scripts do pacote com async=false, na ordem da lista', async () => {
  const doc = fakeDoc();
  const loader = Lazy.createLoader(doc, { x: ['a.js', 'b.js', 'c.js'] });
  const done = loader.load('x');
  assert.deepEqual(doc.inserted.map((s) => s.src), ['a.js', 'b.js', 'c.js']);
  assert.ok(doc.inserted.every((s) => s.async === false), 'async=false mantém a ordem de execução');
  doc.inserted.forEach((s) => s.onload());
  assert.equal(await done, 'x');
});

test('carregador: um pacote é pedido uma única vez; chamadas repetidas devolvem a mesma promessa', async () => {
  const doc = fakeDoc();
  const loader = Lazy.createLoader(doc, { x: ['a.js'] });
  assert.equal(loader.isRequested('x'), false);
  const p1 = loader.load('x');
  const p2 = loader.load('x');
  assert.equal(p1, p2);
  assert.equal(doc.inserted.length, 1);
  assert.equal(loader.isRequested('x'), true);
  doc.inserted[0].onload();
  await p1;
});

test('carregador: falha recusa a promessa e permite tentar de novo', async () => {
  const doc = fakeDoc();
  const loader = Lazy.createLoader(doc, { x: ['a.js'] });
  const first = loader.load('x');
  doc.inserted[0].onerror();
  await assert.rejects(first, /Falha ao carregar a\.js/);
  assert.equal(loader.isRequested('x'), false);
  const second = loader.load('x');
  assert.equal(doc.inserted.length, 2, 'a nova tentativa baixa de novo');
  doc.inserted[1].onload();
  await second;
});

test('carregador: pacote desconhecido é recusado', async () => {
  const loader = Lazy.createLoader(fakeDoc(), {});
  await assert.rejects(loader.load('nada'), /desconhecido/);
});

test('whenIdle: usa requestIdleCallback com teto de tempo; sem ele, setTimeout', () => {
  const calls = [];
  Lazy.whenIdle({ requestIdleCallback(fn, opts) { calls.push(['idle', opts]); } }, () => {});
  Lazy.whenIdle({ setTimeout(fn, ms) { calls.push(['timeout', ms]); } }, () => {});
  assert.deepEqual(calls[0], ['idle', { timeout: Lazy.IDLE_TIMEOUT_MS }]);
  assert.equal(calls[1][0], 'timeout');
});

test('pacotes: sem repetição, todos os arquivos existem e o build os publica', () => {
  const build = read('scripts/build.js');
  const all = [].concat(...Object.values(Lazy.BUNDLES));
  assert.equal(new Set(all).size, all.length, 'arquivo em dois pacotes (ou repetido)');
  for (const file of all) {
    assert.ok(fs.existsSync(path.join(frontend, file)), `${file} não existe`);
    // Os da Guia em modulos/ vão pela cópia recursiva de modulos/; os demais precisam estar na lista do build.
    if (!file.startsWith('modulos/')) assert.ok(build.includes(`'${file}'`), `build.js não publica ${file}`);
  }
  assert.ok(build.includes("'lazy-bundles.js'"), 'build.js não publica lazy-bundles.js');
});

test('pacotes: nada do que é sob demanda vira <script> do index.html nem entra no precache do sw.js', () => {
  const html = read('index.html');
  const pre = precache();
  for (const file of [].concat(...Object.values(Lazy.BUNDLES))) {
    assert.ok(!html.includes(`src="${file}"`), `${file} ainda é carregado pelo index.html`);
    assert.ok(!pre.includes(file), `${file} está no precache do sw.js`);
  }
  assert.match(html, /<script src="lazy-bundles\.js" defer><\/script>/);
  assert.ok(html.indexOf('lazy-bundles.js') < html.indexOf('<script src="app.js"'), 'lazy-bundles.js antes do app.js');
});

test('index.html: sem script inline novo (CSP) e as dependências do shell que a Guia/admin usam continuam eager', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)(?![^>]*type="application\/ld\+json")[^>]*>/);
  // agents-tutor.js lê assistant-sources.js ao carregar; os painéis admin usam LaiftDom (safe-dom.js).
  assert.ok(html.indexOf('assistant-sources.js') < html.indexOf('<script src="agents-tutor.js"'));
  assert.ok(html.indexOf('modulos/shared/safe-dom.js') < html.indexOf('<script src="app.js"'));
  assert.ok(html.indexOf('src="library-cite.js"') > 0, 'admin-library.js usa LaiftLibraryCite (shell)');
  assert.ok(html.indexOf('src="privacy.js"') > 0, 'privacy-admin.js usa LaiftPrivacy (shell)');
});

test('app.js: todo painel admin garante o pacote antes de chamar o módulo; a Guia sobe no login', () => {
  const app = read('app.js');
  assert.match(app, /function withBundle\(name, fn\)/);
  for (const panel of ['panel-admin-dashboard', 'panel-admin-ai', 'panel-admin-selection', 'panel-admin-privacy', 'panel-admin-library', 'panel-admin-roles']) {
    const m = new RegExp(`'${panel}': function \\(\\) \\{[\\s\\S]*?withBundle\\('admin'`).exec(app);
    assert.ok(m && m[0].length < 400, `${panel} não pede o pacote admin`);
  }
  assert.match(app, /withBundle\('lia', function \(\) \{[\s\S]*?LaiftOnboarding\.maybeShow/);
  // reset e refresh continuam seguros sem o módulo (cada chamada confere window.X antes).
  assert.match(app, /if \(window\.LaiftAdminAi\) window\.LaiftAdminAi\.reset\(\)/);
  assert.match(app, /if \(window\.LaiftAssistant\) window\.LaiftAssistant\.refresh\(\)/);
});

test('assistant.js: sobe mesmo quando o DOM já está pronto (carga sob demanda) e o atalho espera a Guia chegar', () => {
  assert.match(read('assistant.js'), /readyState !== 'loading'\) start\(\)/);
  assert.match(read('keyboard-shortcuts.js'), /LaiftLazy\.isRequested\('lia'\)/);
});

test('sw.js MOB-07: o precache é só o shell; nada de admin, Guia, Atlas 3D, WASM ou módulos', () => {
  const pre = precache();
  assert.ok(pre.includes('./') && pre.includes('app.js') && pre.includes('lazy-bundles.js'));
  for (const item of pre) {
    assert.doesNotMatch(item, /^admin-|^assistant\.js$|lia-(art|anim|props|scenes|states|mood)\.js|anatomia-3d|\.wasm|\.glb|\.gz$|^modulos\/(?!shared\/|cracha\/laift-marca-80)/, `fora do shell: ${item}`);
    assert.doesNotMatch(item, /^(selection-admin|privacy-admin)\.js$/);
  }
  assert.ok(!pre.includes('modulos/cracha/laift-marca.png'), 'o PNG grande do crachá não é pré-cacheado');
  // Todo script do index.html (eager) continua no precache: a primeira visita abre offline.
  const eager = [...read('index.html').matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  for (const file of eager) assert.ok(pre.includes(file), `${file} é carregado pelo index.html mas não está no precache`);
});

test('sw.js MOB-07: o que não é pré-cacheado entra no cache ao ser usado (rede primeiro, grava 200 do próprio site)', () => {
  const origin = 'https://exemplo.test';
  const req = (url) => ({ method: 'GET', url, headers: new Map() });
  assert.equal(Sw.shouldHandle(req(origin + '/admin-ai.js'), origin), true);
  assert.equal(Sw.shouldHandle(req(origin + '/modulos/shared/lia/lia.js'), origin), true);
  assert.equal(Sw.shouldHandle(req(origin + '/modulos/anatomia-3d/vendor/draco/draco.wasm'), origin), false, 'Atlas tem cache próprio');
  assert.equal(Sw.shouldStore({ ok: true, type: 'basic' }), true);
});

test('versão do app bate com o cache do sw.js (v25 ou mais) e os caches antigos são limpos', () => {
  const cache = /CACHE_PREFIX \+ '(v\d+)'/.exec(read('sw.js'))[1];
  assert.ok(Number(cache.slice(1)) >= 25, 'o precache mudou: a versão precisa ter subido de v24');
  assert.match(read('index.html'), new RegExp(`data-app-version="${cache}"`));
  assert.equal(Sw.isStaleCache('laift-shell-v24'), true);
  assert.equal(Sw.isStaleCache(Sw.CACHE_NAME), false);
});
