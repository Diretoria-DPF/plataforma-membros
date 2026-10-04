/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Registra o service worker (sw.js). Fica em arquivo próprio porque a CSP não
// permite script inline. Não registra: sem suporte, em http fora de localhost
// (exigência dos navegadores) ou sob automação (Playwright), para não
// interferir nos testes e2e. O PWA é opcional: se o registro falhar, o site
// segue funcionando normalmente.
(function (root) {
  'use strict';

  function shouldRegister(env) {
    if (!env.serviceWorker || env.webdriver) return false;
    return env.protocol === 'https:' || env.hostname === 'localhost';
  }

  function register(win) {
    var nav = win.navigator;
    var env = {
      serviceWorker: 'serviceWorker' in nav,
      webdriver: !!nav.webdriver,
      protocol: win.location.protocol,
      hostname: win.location.hostname,
    };
    if (!shouldRegister(env)) return;
    win.addEventListener('load', function () {
      nav.serviceWorker.register('sw.js', { scope: './' }).catch(function () {
        console.warn('Service worker não registrado; o site funciona normalmente, só sem modo offline.');
      });
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { shouldRegister: shouldRegister };
  } else {
    register(root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
