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
  function restoreFlags(element, storage, defaults) {
    var cached = null;
    try { cached = storage ? JSON.parse(storage.getItem(CACHE_KEY) || 'null') : null; } catch (e) { cached = null; }
    // Primeira abertura (sem cache): usa os padrões, para a tela já nascer no visual novo e não trocar
    // do antigo para o novo quando a API responder. A resposta da API depois corrige o que for diferente.
    if (cached === null && defaults) cached = defaults;
    return applyFlags(element, pickEnabledFlags(cached));
  }

  /** Flags de visual que estão ligadas em produção: valem só enquanto não há cache nem resposta da API. */
  var BOOT_DEFAULT_FLAGS = {
    ux_v2_enabled: true, entrada_v2_enabled: true, home_v2_enabled: true, profile_v2_enabled: true,
    learn_v2_enabled: true, events_v2_enabled: true, library_v2_enabled: true, messages_v2_enabled: true,
    team_v2_enabled: true, proposals_v2_enabled: true, tasks_v2_enabled: true, admin_v2_enabled: true,
    highlights_enabled: true, mentoring_v2_enabled: true,
  };

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

  // Casca que não subiu (app.js ou dependência não carregou): depois do load, sem window.App, aviso com "Tentar de novo"
  // e uma nova tentativa automática por sessão, com recuo. Não envia nada a lugar nenhum.
  var SHELL_RETRY_KEY = 'laift-shell-retry';
  var SHELL_RETRY_DELAY_MS = 5000;

  function shellMissing(win) {
    var doc = win && win.document;
    return !!(doc && doc.getElementById('public-shell')) && !win.App;
  }

  function el(doc, tag, cls, txt) {
    var n = doc.createElement(tag);
    n.className = cls;
    n.textContent = txt;
    return n;
  }

  function checkShell(win, storage) {
    var flag = function (on) { try { if (on) storage.setItem(SHELL_RETRY_KEY, '1'); else storage.removeItem(SHELL_RETRY_KEY); } catch (e) { /* sem storage */ } };
    if (!shellMissing(win)) { flag(false); return null; }
    var doc = win.document;
    var box = el(doc, 'div', 'shell-error state state-error', '');
    box.setAttribute('role', 'alert');
    box.appendChild(el(doc, 'p', 'state-title', 'Não foi possível abrir o aplicativo'));
    box.appendChild(el(doc, 'p', 'state-message', 'Uma parte dele não chegou, em geral por causa da conexão. Toque em "Tentar de novo" e, se continuar, confira a internet.'));
    var button = el(doc, 'button', 'secondary', 'Tentar de novo');
    button.setAttribute('type', 'button');
    button.addEventListener('click', function () { win.location.reload(); });
    box.appendChild(button);
    if (doc.body) doc.body.insertBefore(box, doc.body.firstChild);
    var tried = false;
    try { tried = !!storage.getItem(SHELL_RETRY_KEY); } catch (e) { tried = true; }
    if (!tried) { flag(true); win.setTimeout(function () { if (shellMissing(win)) win.location.reload(); }, SHELL_RETRY_DELAY_MS); }
    return box;
  }

  function watchShell(win, storage) {
    if (win.document.readyState === 'complete') checkShell(win, storage);
    else win.addEventListener('load', function () { checkShell(win, storage); });
  }

  var api = {
    checkShell: checkShell,
    shellMissing: shellMissing,
    SHELL_RETRY_KEY: SHELL_RETRY_KEY,
    SHELL_RETRY_DELAY_MS: SHELL_RETRY_DELAY_MS,
    flagAttribute: flagAttribute,
    applyFlags: applyFlags,
    applyAndRememberFlags: applyAndRememberFlags,
    restoreFlags: restoreFlags,
    BOOT_DEFAULT_FLAGS: BOOT_DEFAULT_FLAGS,
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
      restoreFlags(root.document.documentElement, storage, BOOT_DEFAULT_FLAGS);
      createScrollGate(root, root.document.documentElement);
      var sessionStore = null;
      try { sessionStore = root.sessionStorage; } catch (e) { sessionStore = null; }
      watchShell(root, sessionStore);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
