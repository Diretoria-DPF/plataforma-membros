/*
 * Lia - props e poses sob demanda (ondas 2-4). Carrega lia-props-art.js (window.LIA_PROPS_ART) só quando um
 * contexto pede peças extras e monta essas peças no <svg> da Lia com createElementNS (nunca innerHTML).
 * CSP: o <script> é injetado com src da MESMA origem; não há fetch nem código inline.
 * Falha de carga (rede, arquivo ausente, arte inválida) = Lia base sem as peças, sem erro visível;
 * a falha é lembrada por um tempo para não repetir o pedido a cada troca de estado.
 * Quem chama: lia.js (createSet/ready/load) e frontend/scripts/lia-props.test.mjs.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiaProps = api;
})(typeof window !== 'undefined' ? window : null, function (root) {
  'use strict';

  var scope = root || globalThis; // no Node (testes) não há window: a arte e o documento vêm de globalThis
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ART_FILE = 'lia-props-art.js';
  var DEFAULT_PATH = 'modulos/shared/lia/' + ART_FILE;
  var ID_PREFIX = 'lia-pv-';
  var RETRY_AFTER_MS = 60000; // depois de uma falha, só tenta de novo passado este tempo
  var MAX_DEPTH = 8;
  var TAGS = Object.freeze(['g', 'path', 'rect', 'circle', 'ellipse']);
  var PARENT_FORMAT = /^(svg|#[A-Za-z][\w-]*)$/;
  var FIRST = 'primeiro'; // data-posicao: antes de #lia-body (atrás da Lia)

  // Script que carregou este arquivo: o de props fica na mesma pasta.
  var ownSrc = typeof document !== 'undefined' && document.currentScript && document.currentScript.src ? document.currentScript.src : '';
  var state = { status: 'idle', promise: null, index: null, failedAt: 0 };

  function now() { return Date.now(); }

  /** URL do lia-props-art.js: ao lado deste script, ou no caminho padrão. null se sair da origem da página. */
  function resolveSrc(scriptSrc, baseHref, origin) {
    try {
      var url = scriptSrc ? new URL(ART_FILE, scriptSrc) : new URL(DEFAULT_PATH, baseHref);
      return url.origin === origin ? url.href : null;
    } catch (err) {
      return null;
    }
  }

  function safeAttrs(attrs) {
    return Object.keys(attrs).every(function (name) {
      var value = attrs[name];
      if (typeof value !== 'string' || /^on/i.test(name) || name === 'style' || name === 'xmlns') return false;
      return name !== 'href' && name !== 'xlink:href' ? true : value.charAt(0) === '#';
    });
  }

  function safeNode(node, depth) {
    if (!node || depth > MAX_DEPTH || TAGS.indexOf(node.tag) < 0) return false;
    if (!node.attrs || typeof node.attrs !== 'object' || !safeAttrs(node.attrs)) return false;
    return Array.isArray(node.children) && node.children.every(function (child) { return safeNode(child, depth + 1); });
  }

  /** Arte válida → índice { byId } dos nós de topo; qualquer desvio (tag, atributo, id fora de lia-pv-) devolve null. */
  function validate(art) {
    if (!art || typeof art !== 'object' || !Array.isArray(art.tree)) return null;
    var byId = Object.create(null);
    var ok = art.tree.every(function (node) {
      var id = node && node.attrs && node.attrs.id;
      if (typeof id !== 'string' || id.indexOf(ID_PREFIX) !== 0 || byId[id] || !safeNode(node, 0)) return false;
      byId[id] = node;
      return true;
    });
    return ok ? Object.freeze({ byId: byId }) : null;
  }

  function settle(index, resolve) {
    if (index) {
      state.status = 'ready';
      state.index = index;
    } else {
      state.status = 'failed';
      state.failedAt = now();
    }
    resolve(index ? true : false);
  }

  function inject(doc, src, resolve) {
    var script = doc.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', function () { settle(validate(scope.LIA_PROPS_ART), resolve); });
    script.addEventListener('error', function () { settle(null, resolve); });
    (doc.head || doc.documentElement).appendChild(script);
  }

  function start(doc) {
    return new Promise(function (resolve) {
      var present = validate(scope.LIA_PROPS_ART); // já na página (outra tag, outro teste)
      if (present) { settle(present, resolve); return; }
      var win = doc && doc.defaultView;
      var src = doc && win ? resolveSrc(ownSrc, doc.baseURI || win.location.href, win.location.origin) : null;
      if (!src) { settle(null, resolve); return; }
      try { inject(doc, src, resolve); } catch (err) { settle(null, resolve); }
    });
  }

  /** Pede o carregamento (uma única vez, com cache). Nunca rejeita: resolve true (pronto) ou false (Lia base). */
  function load(doc) {
    var d = doc || scope.document || null;
    if (state.status === 'ready') return Promise.resolve(true);
    if (state.status === 'loading') return state.promise;
    if (state.status === 'failed' && now() - state.failedAt < RETRY_AFTER_MS) return Promise.resolve(false);
    state.status = 'loading';
    state.promise = start(d);
    return state.promise;
  }

  function ready() { return state.status === 'ready'; }

  // ---------- Montagem das peças ----------

  function build(doc, node) {
    var el = doc.createElementNS(SVG_NS, node.tag);
    Object.keys(node.attrs).forEach(function (name) { el.setAttribute(name, node.attrs[name]); });
    node.children.forEach(function (child) { el.appendChild(build(doc, child)); });
    return el;
  }

  function findIn(svg, id) {
    return typeof svg.querySelector === 'function' ? svg.querySelector('#' + id) : null;
  }

  function parentOf(svg, node) {
    var wanted = node.attrs['data-pai'];
    if (typeof wanted !== 'string' || !PARENT_FORMAT.test(wanted)) return null;
    return wanted === 'svg' ? svg : svg.querySelector(wanted);
  }

  function place(svg, parent, el, node) {
    var before = node.attrs['data-posicao'] === FIRST && typeof parent.insertBefore === 'function' ? findIn(svg, 'lia-body') : null;
    if (before && before.parentNode === parent) parent.insertBefore(el, before);
    else parent.appendChild(el);
  }

  /**
   * Conjunto de peças de UM <svg> de Lia. add(nomes) monta as que faltam e devolve as que entraram;
   * remove(nomes)/clear() tiram do DOM (as peças não têm regra display no CSS: fora da cena, não existem).
   */
  function createSet(svg, doc) {
    var items = {};
    var d = doc || svg.ownerDocument || scope.document;

    function addOne(name) {
      var node = state.index && state.index.byId[ID_PREFIX + name];
      if (!node || items[name]) return false;
      var parent = parentOf(svg, node);
      if (!parent) return false;
      var el = build(d, node);
      place(svg, parent, el, node);
      items[name] = el;
      return true;
    }

    function removeOne(name) {
      var el = items[name];
      if (!el) return;
      if (el.parentNode) el.parentNode.removeChild(el);
      delete items[name];
    }

    return {
      names: function () { return Object.keys(items); },
      has: function (name) { return !!items[name]; },
      add: function (names) { return names.filter(addOne); },
      remove: function (names) { names.forEach(removeOne); },
      clear: function () { Object.keys(items).forEach(removeOne); },
    };
  }

  /** Só para os testes: volta ao estado de antes do primeiro pedido. */
  function reset() {
    state = { status: 'idle', promise: null, index: null, failedAt: 0 };
  }

  return Object.freeze({
    ID_PREFIX: ID_PREFIX,
    RETRY_AFTER_MS: RETRY_AFTER_MS,
    resolveSrc: resolveSrc,
    validate: validate,
    load: load,
    ready: ready,
    createSet: createSet,
    reset: reset,
  });
});
