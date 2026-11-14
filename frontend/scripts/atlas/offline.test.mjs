#!/usr/bin/env node
/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * offline.test.mjs — registro do Service Worker e regras do sw.js (Onda 3.5, A.1).
 * Uso: node --test scripts/atlas/offline.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { loadedResources, registerOffline, updateReady, watchTakeover, watchUpdates } from '../../modulos/anatomia-3d/js/core/offline.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const A3D = path.resolve(here, '../../modulos/anatomia-3d');

test('loadedResources: só o mesmo domínio e dentro do escopo, sem repetir', () => {
  const r = loadedResources([
    { name: 'https://x.test/m/anatomia-3d/js/main.js' },
    { name: 'https://x.test/m/anatomia-3d/js/main.js' },
    { name: 'https://x.test/m/shared/laift-identity.js' },
    { name: 'https://cdn.jsdelivr.net/npm/chart.js' },
    { name: 'https://x.test/app.js' },
    { name: 'inválido' },
  ], 'https://x.test', ['/m/anatomia-3d/', '/m/shared/']);
  assert.deepEqual(r, ['/m/anatomia-3d/js/main.js', '/m/shared/laift-identity.js']);
});

test('registerOffline: sem a flag ou sem suporte não registra nada', async () => {
  const nav = { serviceWorker: { register: () => { throw new Error('não devia registrar'); } } };
  assert.equal(await registerOffline({ offline: false }, nav, { location: { href: 'https://x.test/m/anatomia-3d/' } }), false);
  assert.equal(await registerOffline({ offline: true }, {}, { location: { href: 'https://x.test/m/anatomia-3d/' } }), false);
});

test('registerOffline: registra, espera ficar pronto e avisa o SW; falha de registro devolve false', async () => {
  const sent = [];
  const reg = { active: { postMessage: (m) => sent.push(m) } };
  const nav = { serviceWorker: { register: (u, o) => { sent.push({ register: u, scope: o.scope }); return Promise.resolve(); }, ready: Promise.resolve(reg) } };
  const win = { location: { href: 'https://x.test/m/anatomia-3d/index.html', origin: 'https://x.test' }, performance: { getEntriesByType: () => [{ name: 'https://x.test/m/anatomia-3d/js/main.js' }] } };
  assert.equal(await registerOffline({ offline: true }, nav, win), true);
  assert.deepEqual(sent[0], { register: './sw.js', scope: './' });
  assert.equal(sent[1].type, 'cache-loaded');
  assert.ok(sent[1].urls.includes('/m/anatomia-3d/js/main.js') && sent[1].urls.includes('/m/anatomia-3d/'));
  const bad = { serviceWorker: { register: () => Promise.reject(new Error('x')), ready: new Promise(() => {}) } };
  assert.equal(await registerOffline({ offline: true }, bad, win), false);
});

function loadSw(build, scope = 'https://x.test/m/anatomia-3d/') {
  const listeners = {};
  const sandbox = {
    self: null, URL, Response: class { constructor(b, o) { this.body = b; Object.assign(this, o); } },
    caches: {}, fetch: () => {}, Request: class { constructor(u) { this.url = u; } },
  };
  sandbox.self = { registration: { scope }, location: { origin: new URL(scope).origin }, addEventListener: (n, f) => { listeners[n] = f; }, clients: { claim: async () => {} } };
  const src = fs.readFileSync(path.join(A3D, 'sw.js'), 'utf8').replace(/__ATLAS_BUILD__/g, build);
  vm.runInNewContext(src, sandbox);
  return { listeners, sandbox };
}

function fetchEvent(url, extra = {}) {
  let responded = null;
  const ev = { request: { url, method: 'GET', mode: 'cors', headers: { has: () => false }, ...extra }, respondWith: (p) => { responded = p; }, waitUntil: () => {} };
  return { ev, responded: () => responded };
}

test('sw.js sem build (desenvolvimento) não intercepta nada', () => {
  const { listeners } = loadSw('__ATLAS_BUILD__');
  const f = fetchEvent('https://x.test/m/anatomia-3d/js/main.js');
  listeners.fetch(f.ev);
  assert.equal(f.responded(), null);
});

test('sw.js com build: ignora outro domínio, POST, Range, revisao/ e o próprio sw.js; intercepta o resto', () => {
  const { listeners } = loadSw('abc123');
  const must = (url, extra) => { const f = fetchEvent(url, extra); listeners.fetch(f.ev); return f.responded() !== null; };
  assert.equal(must('https://x.test/m/anatomia-3d/js/main.js'), true);
  assert.equal(must('https://x.test/m/anatomia-3d/models/zanatomy/esqueletico.lod1.glb.gz'), true);
  assert.equal(must('https://x.test/m/anatomia-3d/data/atlas/generated/review-status.json'), true);
  assert.equal(must('https://x.test/m/anatomia-3d/', { mode: 'navigate' }), true);
  assert.equal(must('https://worker.dev/api'), false);
  assert.equal(must('https://x.test/m/shared/safe-dom.js'), true);
  assert.equal(must('https://x.test/outra-pagina.js'), false);
  assert.equal(must('https://x.test/m/anatomia-3d/js/main.js', { method: 'POST' }), false);
  assert.equal(must('https://x.test/m/anatomia-3d/models/a.glb', { headers: { has: (h) => h === 'range' } }), false);
  assert.equal(must('https://x.test/m/anatomia-3d/revisao/index.html'), false);
  assert.equal(must('https://x.test/m/anatomia-3d/sw.js'), false);
});

test('flag desligada: desregistra só o SW do atlas e apaga só os caches atlas-*', async () => {
  const gone = [];
  const mk = (scope) => ({ scope, unregister: async () => { gone.push(scope); return true; } });
  const nav = { serviceWorker: { register: () => { throw new Error('não devia registrar'); }, getRegistrations: async () => [mk('https://x.test/m/anatomia-3d/'), mk('https://x.test/outro/')] } };
  const deleted = [];
  const win = { location: { href: 'https://x.test/m/anatomia-3d/index.html', origin: 'https://x.test' }, caches: { keys: async () => ['atlas-aaa', 'outro-cache'], delete: async (k) => { deleted.push(k); return true; } } };
  assert.equal(await registerOffline({ offline: false }, nav, win), false);
  assert.deepEqual(gone, ['https://x.test/m/anatomia-3d/']);
  assert.deepEqual(deleted, ['atlas-aaa']);
});

// ---------- Aviso de versão nova ----------

test('updateReady: só com um worker novo esperando E a página já controlada por um antigo', () => {
  assert.equal(updateReady({ waiting: {} }, {}), true);
  assert.equal(updateReady({ waiting: {} }, null), false); // 1ª visita: nada a trocar
  assert.equal(updateReady({ waiting: null }, {}), false);
  assert.equal(updateReady(null, {}), false);
});

function fakeUpdateEnv(over = {}) {
  const sent = [];
  const reg = { waiting: { postMessage: (m) => sent.push(m) }, update: () => Promise.resolve(), addEventListener: () => {}, ...over };
  const nav = { serviceWorker: { controller: {}, addEventListener: () => {} } };
  return { reg, nav, sent };
}

test('watchUpdates: worker novo esperando é ativado sozinho, sem aviso', () => {
  const env = fakeUpdateEnv();
  watchUpdates(env.reg, env.nav);
  assert.deepEqual(env.sent, [{ type: 'skip-waiting' }]);
});

test('watchUpdates: não ativa na 1ª visita; falhas e falta de suporte não quebram', () => {
  const first = fakeUpdateEnv();
  first.nav.serviceWorker.controller = null;
  watchUpdates(first.reg, first.nav);
  assert.deepEqual(first.sent, []);
  assert.doesNotThrow(() => watchUpdates(null, first.nav));
  assert.doesNotThrow(() => watchUpdates({ waiting: {}, update: () => { throw new Error('x'); } }, first.nav));
});

test('watchUpdates: worker que termina de instalar depois também é ativado', () => {
  const env = fakeUpdateEnv({ waiting: null });
  const handlers = {};
  const worker = { state: 'installing', addEventListener: (n, f) => { handlers[n] = f; } };
  env.reg.installing = worker;
  env.reg.addEventListener = (n, f) => { handlers[`reg:${n}`] = f; };
  watchUpdates(env.reg, env.nav);
  handlers['reg:updatefound']();
  worker.state = 'installed';
  const sent = [];
  env.reg.waiting = { postMessage: (m) => sent.push(m) };
  handlers.statechange();
  assert.deepEqual(sent, [{ type: 'skip-waiting' }]);
});

test('sw.js: a mensagem skip-waiting ativa o worker novo (com build; no desenvolvimento não faz nada)', () => {
  const { listeners, sandbox } = loadSw('abc123');
  let skipped = 0;
  sandbox.self.skipWaiting = () => { skipped += 1; };
  listeners.message({ data: { type: 'skip-waiting' }, waitUntil: () => {} });
  assert.equal(skipped, 1);
  const dev = loadSw('__ATLAS_BUILD__');
  let devSkipped = 0;
  dev.sandbox.self.skipWaiting = () => { devSkipped += 1; };
  dev.listeners.message({ data: { type: 'skip-waiting' }, waitUntil: () => {} });
  assert.equal(devSkipped, 0);
});

// ---------- Atlas abrindo sempre: shell sem redirecionamento e troca de versão sem esperar ----------

test('sw.js: instala guardando o shell pelo diretório (nunca index.html), recusa resposta redirecionada e assume sozinho', async () => {
  const run = async (shellRedirected) => {
    const { listeners, sandbox } = loadSw('abc123');
    const puts = [];
    const fetched = [];
    let skipped = 0;
    sandbox.self.skipWaiting = () => { skipped += 1; };
    sandbox.caches = { open: async () => ({ add: async () => {}, put: async (k) => { puts.push(String(k.url || k)); } }) };
    sandbox.fetch = async (r) => {
      const url = String(r.url || r);
      fetched.push(url);
      return { ok: true, status: 200, type: 'basic', redirected: (url.endsWith('/m/anatomia-3d/') || url.endsWith('index.html')) ? shellRedirected : false, json: async () => ({ urls: [] }) };
    };
    let done = null;
    listeners.install({ waitUntil: (p) => { done = p; } });
    await done;
    return { puts, fetched, skipped };
  };
  const ok = await run(false);
  assert.deepEqual(ok.puts, ['https://x.test/m/anatomia-3d/']);
  assert.ok(!ok.fetched.some((u) => /index\.html$/.test(u)), 'nunca busca index.html (o servidor redireciona)');
  assert.equal(ok.skipped, 1, 'a versão nova assume sem esperar as abas fecharem');
  const redirected = await run(true);
  assert.deepEqual(redirected.puts, [], 'resposta redirecionada não entra no cache do shell');
  assert.equal(redirected.skipped, 1);
});

test('sw.js: servidor sem índice de diretório (404) — guarda index.html sob a chave do diretório; precache.json fora do ar ainda assume', async () => {
  const { listeners, sandbox } = loadSw('abc123');
  const puts = [];
  let skipped = 0;
  sandbox.self.skipWaiting = () => { skipped += 1; };
  sandbox.caches = { open: async () => ({ add: async () => {}, put: async (k) => { puts.push(String(k.url || k)); } }) };
  sandbox.fetch = async (r) => {
    const url = String(r.url || r);
    if (url.endsWith('precache.json')) return { ok: true, status: 200, type: 'basic', redirected: false, json: async () => ({ urls: [] }) };
    return url.endsWith('/m/anatomia-3d/') ? { ok: false, status: 404, type: 'basic', redirected: false } : { ok: true, status: 200, type: 'basic', redirected: false };
  };
  let done = null;
  listeners.install({ waitUntil: (p) => { done = p; } });
  await done;
  assert.deepEqual(puts, ['https://x.test/m/anatomia-3d/'], 'index.html entra sob a chave do diretório');
  assert.equal(skipped, 1);
  const off = loadSw('abc123');
  let skippedOff = 0;
  off.sandbox.self.skipWaiting = () => { skippedOff += 1; };
  off.sandbox.caches = { open: async () => ({ add: async () => {}, put: async () => {} }) };
  off.sandbox.fetch = async () => ({ ok: false, status: 503 });
  let doneOff = null;
  off.listeners.install({ waitUntil: (p) => { doneOff = p; } });
  await doneOff;
  assert.equal(skippedOff, 1, 'precache.json fora do ar: a versão nova assume do mesmo jeito');
});

test('sw.js: entrada de shell redirecionada deixada por versão antiga é entregue limpa à navegação', async () => {
  const { listeners, sandbox } = loadSw('abc123');
  const stale = { redirected: true, status: 200, statusText: 'OK', headers: { h: 1 }, body: 'x' };
  sandbox.caches = { open: async () => ({ match: async () => stale }) };
  const f = fetchEvent('https://x.test/m/anatomia-3d/', { mode: 'navigate' });
  listeners.fetch(f.ev);
  const res = await f.responded();
  assert.ok(!res.redirected, 'o navegador recusa entregar resposta redirecionada a uma navegação (ERR_FAILED)');
  assert.equal(res.status, 200);
});

function takeoverEnv(visibility = 'visible') {
  const sw = {}; const docL = {}; const winL = {}; const reloaded = [];
  const nav = { serviceWorker: { addEventListener: (n, f) => { sw[n] = f; } } };
  const doc = { visibilityState: visibility, addEventListener: (n, f) => { docL[n] = f; } };
  const win = { document: doc, location: { reload: () => reloaded.push(1) }, addEventListener: (n, f) => { winL[n] = f; } };
  return { nav, doc, win, sw, docL, winL, reloaded };
}

test('watchTakeover: aba visível e livre recarrega UMA vez, sem aviso', () => {
  const e = takeoverEnv();
  watchTakeover(e.nav, e.win, () => false, true);
  e.sw.controllerchange();
  e.sw.controllerchange();
  e.winL.focus();
  assert.equal(e.reloaded.length, 1);
});

test('watchTakeover: em segundo plano espera a aba voltar ao foco', () => {
  const e = takeoverEnv('hidden');
  watchTakeover(e.nav, e.win, () => false, true);
  e.sw.controllerchange();
  assert.equal(e.reloaded.length, 0);
  e.docL.visibilitychange(); // ainda oculta
  assert.equal(e.reloaded.length, 0);
  e.doc.visibilityState = 'visible';
  e.docL.visibilitychange();
  assert.equal(e.reloaded.length, 1);
});

test('watchTakeover: quiz/sessão em andamento nunca é interrompido; recarrega no próximo foco livre', () => {
  const e = takeoverEnv();
  let busy = true;
  watchTakeover(e.nav, e.win, () => busy, true);
  e.sw.controllerchange();
  e.docL.visibilitychange();
  assert.equal(e.reloaded.length, 0);
  busy = false;
  e.docL.visibilitychange();
  assert.equal(e.reloaded.length, 1);
  const f = takeoverEnv();
  watchTakeover(f.nav, f.win, () => { throw new Error('x'); }, true); // dúvida = ocupado
  f.sw.controllerchange();
  assert.equal(f.reloaded.length, 0);
});

test('watchTakeover: na 1ª visita ou sem suporte não faz nada', () => {
  const e = takeoverEnv();
  watchTakeover(e.nav, e.win, () => false, false);
  assert.equal(e.sw.controllerchange, undefined);
  assert.doesNotThrow(() => watchTakeover({}, {}, () => false, true));
  assert.doesNotThrow(() => watchTakeover(null, {}, () => false, true));
});

test('sem aviso de versão nova: a barra e seus textos não existem mais', () => {
  assert.equal(fs.existsSync(path.join(A3D, 'js/ui/update-bar.js')), false);
  for (const f of ['js/main.js', 'js/core/offline.js', 'css/hints.css', 'sw.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(A3D, f), 'utf8'), /update-bar|atlas-update|Há uma versão nova|showUpdateBar/);
  }
});
