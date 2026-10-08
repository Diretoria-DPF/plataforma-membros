/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Visual v2 (flag ux_v2_enabled): (1) aplica as flags públicas como atributos
// data-flag-<chave-com-hifen>="1" no <html>, que o CSS usa como condição
// (docs/FEATURE_FLAGS.md); (2) "porta" de rolagem da barra flutuante: marca
// data-scrolling no <html> enquanto a página rola e tira ~150 ms depois do fim.
// Sem script inline, sem innerHTML. A lógica é pura e testada em Node.
// Expõe window.LaiftUx.
(function (root) {
  'use strict';

  var FLAG_ATTR_PREFIX = 'data-flag-';
  var FLAG_KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;
  var CACHE_KEY = 'laift-ui-flags';
  var SCROLL_IDLE_MS = 150;
  var SCROLL_MIN_DELTA_PX = 8; // tremida de dedo/trackpad não esconde a barra

  /** "ux_v2_enabled" -> "data-flag-ux-v2-enabled"; chave inválida -> null. */
  function flagAttribute(key) {
    if (typeof key !== 'string' || !FLAG_KEY_RE.test(key)) return null;
    return FLAG_ATTR_PREFIX + key.replace(/_/g, '-');
  }

  /**
   * Põe data-flag-*="1" para cada flag === true e remove as demais, inclusive
   * atributos de flags que deixaram de vir. Devolve as chaves ligadas.
   */
  function applyFlags(element, flags) {
    var source = flags && typeof flags === 'object' ? flags : {};
    var on = {};
    var enabled = [];
    Object.keys(source).forEach(function (key) {
      var attr = flagAttribute(key);
      if (attr && source[key] === true) { on[attr] = true; enabled.push(key); }
    });
    var existing = typeof element.getAttributeNames === 'function' ? element.getAttributeNames() : [];
    existing.forEach(function (name) {
      if (name.indexOf(FLAG_ATTR_PREFIX) === 0 && !on[name]) element.removeAttribute(name);
    });
    Object.keys(on).forEach(function (attr) { element.setAttribute(attr, '1'); });
    return enabled;
  }

  /** Só chaves válidas com valor true entram no cache (nada pessoal, só booleanos). */
  function pickEnabledFlags(flags) {
    var out = {};
    if (flags && typeof flags === 'object') {
      Object.keys(flags).forEach(function (key) {
        if (flagAttribute(key) && flags[key] === true) out[key] = true;
      });
    }
    return out;
  }

  /** Aplica e guarda as flags para a próxima visita abrir já no visual certo (sem piscar). */
  function applyAndRememberFlags(element, flags, storage) {
    var enabled = applyFlags(element, flags);
    try { if (storage) storage.setItem(CACHE_KEY, JSON.stringify(pickEnabledFlags(flags))); } catch (e) { /* storage cheio/bloqueado */ }
    return enabled;
  }

  /** Reaplica as últimas flags conhecidas, antes de a rede responder. */
  function restoreFlags(element, storage) {
    var cached = null;
    try { cached = storage ? JSON.parse(storage.getItem(CACHE_KEY) || 'null') : null; } catch (e) { cached = null; }
    return applyFlags(element, pickEnabledFlags(cached));
  }

  /** Liga/desliga data-scrolling no elemento conforme a janela rola. */
  function createScrollGate(win, element, options) {
    var idleMs = (options && options.idleMs) || SCROLL_IDLE_MS;
    var minDelta = (options && options.minDelta) || SCROLL_MIN_DELTA_PX;
    var timer = null;
    var lastY = win.scrollY || 0;

    function settle() {
      timer = null;
      element.removeAttribute('data-scrolling');
      lastY = win.scrollY || 0;
    }
    function onScroll() {
      var y = win.scrollY || 0;
      if (timer === null && Math.abs(y - lastY) < minDelta) return;
      element.setAttribute('data-scrolling', '1');
      if (timer !== null) win.clearTimeout(timer);
      timer = win.setTimeout(settle, idleMs);
    }
    win.addEventListener('scroll', onScroll, { passive: true });
    return {
      destroy: function () {
        win.removeEventListener('scroll', onScroll);
        if (timer !== null) win.clearTimeout(timer);
        element.removeAttribute('data-scrolling');
      },
    };
  }

  var api = {
    flagAttribute: flagAttribute,
    applyFlags: applyFlags,
    applyAndRememberFlags: applyAndRememberFlags,
    restoreFlags: restoreFlags,
    pickEnabledFlags: pickEnabledFlags,
    CACHE_KEY: CACHE_KEY,
    createScrollGate: createScrollGate,
    SCROLL_IDLE_MS: SCROLL_IDLE_MS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftUx = api;
    if (root.document && root.document.documentElement) {
      var storage = null;
      try { storage = root.localStorage; } catch (e) { storage = null; }
      restoreFlags(root.document.documentElement, storage);
      createScrollGate(root, root.document.documentElement);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
