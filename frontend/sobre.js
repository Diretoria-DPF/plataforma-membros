/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Seção "Sobre" do Perfil: mostra a versão do aplicativo (atributo data-app-version do <html>) e
// conta toques seguidos na versão. Três toques dentro de TAP_WINDOW_MS abrem os créditos, que
// ficam num pacote sob demanda (lazy-bundles.js, "creditos"). Nada é gravado nem enviado.
// Expõe window.LaiftSobre.
(function (root) {
  'use strict';

  var TAP_WINDOW_MS = 1200;
  var TAPS_NEEDED = 3;

  /** Contador de toques seguidos: devolve true no toque que completa a sequência. */
  function createTapCounter(needed, windowMs) {
    var times = [];
    return function tap(now) {
      times.push(now);
      while (times.length && now - times[0] > windowMs) times.shift();
      if (times.length >= needed) { times.length = 0; return true; }
      return false;
    };
  }

  function versionOf(doc) {
    var html = doc && doc.documentElement;
    var v = html && html.getAttribute ? html.getAttribute('data-app-version') : '';
    return v || '';
  }

  function openCredits(win) {
    if (!win.LaiftLazy) return;
    win.LaiftLazy.load('creditos').then(function () {
      if (win.LaiftCreditos) win.LaiftCreditos.open(win.document);
    }, function () { /* sem rede e sem cache: segue sem os créditos */ });
  }

  function start(win) {
    var doc = win.document;
    var btn = doc.getElementById('about-version');
    if (!btn) return null;
    var version = versionOf(doc);
    btn.textContent = version ? 'Versão ' + version : 'Versão';
    var tap = createTapCounter(TAPS_NEEDED, TAP_WINDOW_MS);
    btn.addEventListener('click', function () {
      if (tap(Date.now())) openCredits(win);
    });
    return btn;
  }

  var api = { TAP_WINDOW_MS: TAP_WINDOW_MS, TAPS_NEEDED: TAPS_NEEDED, createTapCounter: createTapCounter, versionOf: versionOf, start: start };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftSobre = api;
    start(root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
