#!/usr/bin/env node
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
import { loadedResources, registerOffline } from '../../modulos/anatomia-3d/js/core/offline.js';

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
