/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * demo-storage.js — armazenamento só em memória do modo demonstração (/demo).
 *
 * Imita a interface Storage (getItem, setItem, removeItem, clear, key, length) sem tocar no
 * localStorage real do aparelho. A página /demo cria um par (local, sessão) e o expõe aos módulos
 * em `App.demoStorage`; `laift-identity.js` troca `localStorage` e `sessionStorage` de cada módulo
 * por ele. Ao fechar ou recarregar a página tudo some: nada da demonstração chega às chaves
 * usadas pelas contas.
 * Script clássico (global LaiftDemoStorage) e, em Node, module.exports.
 */
(function (global) {
  'use strict';

  function create() {
    var data = Object.create(null);
    return {
      getItem: function (k) { k = String(k); return k in data ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = Object.create(null); },
      key: function (i) { var ks = Object.keys(data); return i >= 0 && i < ks.length ? ks[i] : null; },
      get length() { return Object.keys(data).length; },
    };
  }

  /** Par de armazenamentos da demonstração: um para `localStorage`, outro para `sessionStorage`. */
  function createPair() {
    var pair = { local: create(), session: create() };
    pair.clear = function () { pair.local.clear(); pair.session.clear(); };
    return pair;
  }

  var api = { create: create, createPair: createPair };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.LaiftDemoStorage = api;
})(typeof self !== 'undefined' ? self : this);
