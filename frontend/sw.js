/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Service worker da plataforma: SÓ para o shell estático do próprio site.
//  - estratégia "rede primeiro, cache de reserva": o usuário sempre recebe a
//    versão nova quando há conexão, e abre a tela inicial mesmo offline;
//  - nunca intercepta a API (outra origem), POST, Range, o próprio sw.js nem o
//    Atlas 3D (que tem service worker e cache próprios);
//  - só guarda resposta 200 do próprio site; nada autenticado passa por aqui;
//  - cache versionado: ao subir a versão, os caches antigos (prefixo
//    laift-shell-) são apagados na ativação.
// Para desligar o PWA em emergência: publicar um sw.js que apaga os caches
// laift-shell-* e chama registration.unregister() (ver docs/DEPLOYMENT.md).
(function (root) {
  'use strict';

  var CACHE_PREFIX = 'laift-shell-';
  var CACHE_NAME = CACHE_PREFIX + 'v3';
  // O shell inteiro (HTML, estilos e scripts) entra no cache na instalação, para
  // a tela inicial abrir offline já na primeira visita. Item ausente é ignorado.
  var PRECACHE = [
    './', 'styles.css', 'ux.css', 'manifest.webmanifest', 'icons/icon-192.png',
    'app.js', 'shared-states.js', 'pwa.js', 'domain-notice.js', 'learning.js', 'admin-ai.js',
    'msg-crypto.js', 'messaging.js', 'home.js', 'mfa.js', 'credential.js', 'assistant.js',
    'ux-v2.js', 'splash.js', 'splash.css', 'modulos/shared/laift-tokens.css',
    'modulos/cracha/laift-marca.png',
  ];
  var ATLAS_PATH = '/modulos/anatomia-3d/';

  function shouldHandle(request, origin) {
    if (request.method !== 'GET') return false;
    var url;
    try { url = new URL(request.url); } catch (e) { return false; }
    if (url.origin !== origin) return false;
    if (url.pathname.indexOf(ATLAS_PATH) !== -1) return false;
    if (/\/sw\.js$/.test(url.pathname)) return false;
    if (request.headers && request.headers.has('range')) return false;
    return true;
  }

  function shouldStore(response) {
    return !!response && response.ok === true && response.type === 'basic';
  }

  function isStaleCache(name) {
    return name.indexOf(CACHE_PREFIX) === 0 && name !== CACHE_NAME;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      CACHE_PREFIX: CACHE_PREFIX, CACHE_NAME: CACHE_NAME, shouldHandle: shouldHandle,
      shouldStore: shouldStore, isStaleCache: isStaleCache,
    };
    return;
  }

  root.addEventListener('install', function (event) {
    event.waitUntil(
      root.caches.open(CACHE_NAME).then(function (cache) {
        // Um item que falhe não pode abortar a instalação inteira.
        return Promise.all(PRECACHE.map(function (url) { return cache.add(url).catch(function () { return null; }); }));
      }).then(function () { return root.skipWaiting(); })
    );
  });

  root.addEventListener('activate', function (event) {
    event.waitUntil(
      root.caches.keys().then(function (names) {
        return Promise.all(names.filter(isStaleCache).map(function (name) { return root.caches.delete(name); }));
      }).then(function () { return root.clients.claim(); })
    );
  });

  root.addEventListener('fetch', function (event) {
    var request = event.request;
    if (!shouldHandle(request, root.location.origin)) return;
    event.respondWith(
      root.fetch(request).then(function (response) {
        if (shouldStore(response)) {
          var copy = response.clone();
          root.caches.open(CACHE_NAME).then(function (cache) { return cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return root.caches.match(request).then(function (hit) {
          if (hit) return hit;
          if (request.mode === 'navigate') return root.caches.match('./').then(function (home) { return home || Response.error(); });
          return Response.error();
        });
      })
    );
  });
})(typeof self !== 'undefined' ? self : globalThis);
