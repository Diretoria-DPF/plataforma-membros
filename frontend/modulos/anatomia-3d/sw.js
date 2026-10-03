/**
 * sw.js — Atlas offline (Onda 3.5, A.1)
 * ---------------------------------------------------------------------------
 * Cada build publica um sw.js com `__ATLAS_BUILD__` trocado pelo hash do
 * conteúdo de modulos/anatomia-3d (scripts/build.js). O cache se chama
 * `atlas-<hash>`: um build novo = um cache novo, e o antigo é apagado ao
 * ativar. Assim o app inteiro (HTML, JS, CSS, modelos, fichas) é sempre um
 * retrato de UM build — nunca um JS novo com um HTML velho.
 *
 *  - Navegação, JS, CSS, modelos 3D, vendor e fichas: cache primeiro.
 *  - JSON de data/atlas (fora de curated/content/legacy) e models/manifest.json:
 *    cache primeiro, atualizando em segundo plano (stale-while-revalidate).
 *  - O SW novo espera as abas do atlas fecharem para assumir (sem skipWaiting).
 *  - Qualquer falha de cache cai na rede; nada aqui pode quebrar o atlas.
 *  - Só toca em GET do mesmo domínio dentro do escopo; a Worker (outro
 *    domínio) e a ferramenta de revisão (revisao/) passam direto.
 * Desligar: flag `offline` (js/core/flags.js) — e docs/atlas-rollback.md §6.
 */
const BUILD = '__ATLAS_BUILD__';
const PREFIX = 'atlas-';
const CACHE = PREFIX + BUILD;
const DEV = BUILD.indexOf('__') === 0; // sem build (servidor de desenvolvimento): não intercepta
const SCOPE = self.registration.scope;
const SCOPE_PATH = new URL(SCOPE).pathname;
// Os módulos irmãos compartilham ../shared/ (identidade, safe-dom, tokens): fora do escopo
// de registro, mas as páginas controladas pedem esses arquivos pelo SW do mesmo jeito.
const SHARED_PATH = new URL('../shared/', SCOPE).pathname;
const inside = (p) => p.startsWith(SCOPE_PATH) || p.startsWith(SHARED_PATH);
const SHELL_KEY = `${SCOPE}index.html`;
const REVALIDATE = /^(data\/atlas\/(?!curated\/|content\/|legacy\/)|models\/manifest\.json$)/;
const OK = (res) => res && res.status === 200 && res.type === 'basic';

self.addEventListener('install', (event) => {
  if (DEV) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const res = await fetch(`${SCOPE}precache.json`, { cache: 'no-store' });
      if (!res.ok) return;
      const { urls } = await res.json();
      await Promise.all((urls || []).map((u) => cache.add(new URL(u, SCOPE)).catch(() => {})));
      await cache.add(new Request(SHELL_KEY)).catch(() => {});
    } catch (e) { /* sem lista: o cache se forma durante o uso */ }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    } catch (e) { /* ignora */ }
    await self.clients.claim();
  })());
});

// A página manda os recursos que já baixou no 1º acesso (antes de o SW existir).
self.addEventListener('message', (event) => {
  const d = event.data;
  if (DEV || !d || d.type !== 'cache-loaded' || !Array.isArray(d.urls)) return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      for (const u of d.urls.slice(0, 400)) {
        const url = new URL(u, SCOPE);
        if (url.origin !== self.location.origin || !inside(url.pathname) || /\/revisao\//.test(url.pathname)) continue;
        if (!(await cache.match(url.href))) await cache.add(url.href).catch(() => {});
      }
    } catch (e) { /* ignora */ }
  })());
});

async function openCache() {
  try { return await caches.open(CACHE); } catch (e) { return null; } // cache indisponível: segue pela rede
}

async function cacheFirst(req, key) {
  const cache = await openCache();
  if (!cache) return fetch(req);
  const hit = await cache.match(key || req).catch(() => null);
  if (hit) return hit;
  const res = await fetch(req);
  if (OK(res)) cache.put(key || req, res.clone()).catch(() => {});
  return res;
}

async function revalidate(event, req) {
  const cache = await openCache();
  if (!cache) return fetch(req);
  const hit = await cache.match(req).catch(() => null);
  const net = fetch(req).then((res) => { if (OK(res)) cache.put(req, res.clone()).catch(() => {}); return res; }).catch(() => null);
  if (hit) { event.waitUntil(net); return hit; }
  return (await net) || new Response('', { status: 504, statusText: 'Offline' });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (DEV || req.method !== 'GET' || req.headers.has('range')) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !inside(url.pathname)) return;
  const rel = url.pathname.startsWith(SCOPE_PATH) ? url.pathname.slice(SCOPE_PATH.length) : `../shared/${url.pathname.slice(SHARED_PATH.length)}`;
  if (rel === 'sw.js' || rel === 'precache.json' || rel.startsWith('revisao/')) return;
  if (req.mode === 'navigate') {
    event.respondWith(cacheFirst(req, SHELL_KEY).catch(() => new Response('Atlas indisponível offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })));
  } else if (REVALIDATE.test(rel)) {
    event.respondWith(revalidate(event, req));
  } else {
    event.respondWith(cacheFirst(req));
  }
});
