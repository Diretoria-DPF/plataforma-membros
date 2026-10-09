/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Service worker do blog instalável (escopo /blog). Não mexe no sw.js da
// plataforma (escopo /): cache próprio, prefixo próprio.
//  - "rede primeiro": quando há conexão, o leitor recebe a versão nova;
//  - sem conexão, abre os posts que já foram lidos e, para o resto, mostra
//    a página de aviso /blog/404.html;
//  - nunca trata: outra origem, POST (ou qualquer não-GET), pedido com Range
//    e o próprio /blog-sw.js;
//  - só guarda resposta 200 "basic" (do próprio site);
//  - a chave do cache é o caminho sem ".html" no fim: /blog.html e /blog
//    ocupam a mesma entrada;
//  - na ativação apaga só os caches laift-blog-* antigos (nunca o do shell
//    da plataforma nem o do Atlas 3D).
(function (root) {
  'use strict';

  var CACHE_PREFIX = 'laift-blog-';
  var CACHE_NAME = CACHE_PREFIX + 'v1';
  var PAGINA_OFFLINE = '/blog/404.html';
  // Itens que falharem no precache são ignorados; a instalação segue.
  var PRECACHE = [
    '/blog', '/blog.css', '/blog-campanha.css', '/publico.css', '/static-page.js',
    '/modulos/shared/laift-tokens.css', '/modulos/cracha/laift-marca.png', '/blog/icones.svg',
    '/blog/feed.js', '/blog/welcome.js', '/blog/post.js', '/blog/contato.js', '/blog/campanha.js',
    '/blog/instalar.js', '/blog/index.json', '/blog/404.html', '/blog/manifest.webmanifest',
    '/icons/icon-192.png', '/icons/favicon-32.png',
  ];
  var BASE_CHAVE = 'https://blog.invalid';

  function chaveDe(url) {
    return new URL(url, BASE_CHAVE).pathname.replace(/\.html$/, '');
  }

  function shouldHandle(request, origin) {
    if (request.method !== 'GET') return false;
    var url;
    try { url = new URL(request.url); } catch (e) { return false; }
    if (url.origin !== origin) return false;
    if (/\/blog-sw\.js$/.test(url.pathname)) return false;
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
      CACHE_PREFIX: CACHE_PREFIX, CACHE_NAME: CACHE_NAME, PRECACHE: PRECACHE,
      chaveDe: chaveDe, shouldHandle: shouldHandle, shouldStore: shouldStore,
      isStaleCache: isStaleCache,
    };
    return;
  }

  function abrirCache() {
    return root.caches.open(CACHE_NAME);
  }

  function guardarPrecache(cache, url) {
    return root.fetch(url).then(function (response) {
      if (!shouldStore(response)) return null;
      return cache.put(chaveDe(url), response);
    }).catch(function () { return null; });
  }

  function semCopia(request) {
    if (request.mode !== 'navigate') return Response.error();
    return abrirCache().then(function (cache) {
      return cache.match(chaveDe(PAGINA_OFFLINE));
    }).then(function (pagina) {
      return pagina || Response.error();
    });
  }

  root.addEventListener('install', function (event) {
    event.waitUntil(
      abrirCache().then(function (cache) {
        return Promise.all(PRECACHE.map(function (url) { return guardarPrecache(cache, url); }));
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
    var chave = chaveDe(request.url);
    event.respondWith(
      root.fetch(request).then(function (response) {
        if (shouldStore(response)) {
          var copia = response.clone();
          abrirCache().then(function (cache) { return cache.put(chave, copia); }).catch(function () {});
        }
        return response;
      }).catch(function () {
        return abrirCache().then(function (cache) {
          return cache.match(chave);
        }).then(function (hit) {
          return hit || semCopia(request);
        });
      })
    );
  });
})(typeof self !== 'undefined' ? self : globalThis);
