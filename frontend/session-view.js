/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Visão pública do estado de sessão (SEC-10, ADR 0011). window.App.getState() devolve esta visão: no lugar do token
// de sessão há uma ALÇA opaca ("sessao-N", N cresce a cada sessão nova) que os módulos passam a App.callApi como
// primeiro argumento, como faziam com o token. Quem chama por App.callApi tem a alça trocada pelo token real só dentro
// do app.js; alça de sessão antiga vira vazio (a Worker recusa). O token (modo cabeçalho do GitHub Pages/workers.dev,
// ou o marcador "cookie") fica em memória interna do app.js e nunca aparece no objeto devolvido.
(function (root) {
  'use strict';

  var HANDLE_PATTERN = /^sessao-[0-9]+$/;

  /** getToken() devolve o token atual (ou null). Retorna { handle, view, resolve }. */
  function create(getToken, getProfile) {
    var seq = 0;
    var lastToken = null;
    var current = null;

    function handle() {
      var token = getToken();
      if (!token) { lastToken = null; current = null; return null; }
      if (token !== lastToken) { seq += 1; lastToken = token; current = 'sessao-' + seq; }
      return current;
    }

    /** Objeto vivo (getters) para quem guarda a referência: sem token, só a alça. */
    var view = {};
    Object.defineProperty(view, 'sessionToken', { enumerable: true, get: handle });
    Object.defineProperty(view, 'profile', { enumerable: true, get: getProfile });
    Object.freeze(view);

    /** Primeiro argumento de uma chamada: alça atual vira o token; alça velha vira ''; o resto passa igual. */
    function resolve(arg) {
      if (typeof arg !== 'string' || !HANDLE_PATTERN.test(arg)) return arg;
      return arg === handle() ? getToken() : '';
    }

    return { handle: handle, view: view, resolve: resolve };
  }

  var api = { create: create, HANDLE_PATTERN: HANDLE_PATTERN };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftSessionView = api;
})(typeof self !== 'undefined' ? self : this);
