/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Hero da tela de entrada: monta a Lia (só a cabeça, estado idle) no contêiner decorativo
// #hero-lia. Melhoria progressiva: só monta com as flags ux_v2 e chatbot ligadas e com a Lia
// carregada (window.Lia). Na primeira visita as flags chegam pela rede, depois do carregamento:
// observamos os atributos data-flag-* do <html> (não há evento em ux-v2.js) e montamos assim que
// as duas aparecem, sem recarregar. Não cria animação própria: a Lia já não roda loops sob
// prefers-reduced-motion. Sem innerHTML (CSP). Expõe window.LaiftHero; as funções são testadas em Node.
(function (root) {
  'use strict';

  var HERO_ID = 'hero-lia';
  var MOUNTED_ATTR = 'data-hero-mounted';
  var REQUIRED_FLAGS = ['data-flag-ux-v2-enabled', 'data-flag-chatbot-enabled'];

  /** true só com as duas flags ligadas no <html> (atributos data-flag-*="1" de ux-v2.js). */
  function flagsOn(documentElement) {
    if (!documentElement || typeof documentElement.hasAttribute !== 'function') return false;
    return REQUIRED_FLAGS.every(function (attr) { return documentElement.hasAttribute(attr); });
  }

  /** Monta a Lia no contêiner do hero. Devolve a instância, ou null se não der (nunca monta duas vezes). */
  function mountHero(doc, lia) {
    var container = doc && doc.getElementById(HERO_ID);
    if (!container || container.getAttribute(MOUNTED_ATTR) !== null) return null;
    if (!lia || typeof lia.mount !== 'function') return null;
    var instance = lia.mount(container, { crop: 'head' });
    if (!instance) return null;
    instance.setState('idle');
    container.setAttribute(MOUNTED_ATTR, '1');
    container.classList.remove('hidden');
    return instance;
  }

  /** Entrada imediata: só age com as flags já ligadas. */
  function heroMountIfEnabled(doc, lia) {
    if (!doc || !flagsOn(doc.documentElement)) return null;
    return mountHero(doc, lia);
  }

  /**
   * Monta assim que as flags estiverem no <html>, mesmo que cheguem depois. Se já estiverem, monta
   * na hora e não cria observador. Devolve o MutationObserver enquanto espera, ou null.
   */
  function watchFlags(doc, lia, ObserverCtor) {
    var html = doc && doc.documentElement;
    if (!html) return null;
    var observer = null;
    function check() {
      if (!flagsOn(html)) return false;
      if (observer) observer.disconnect();
      mountHero(doc, lia);
      return true;
    }
    if (check() || typeof ObserverCtor !== 'function') return null;
    observer = new ObserverCtor(function () { check(); });
    observer.observe(html, { attributes: true, attributeFilter: REQUIRED_FLAGS });
    return observer;
  }

  var api = {
    flagsOn: flagsOn,
    mountHero: mountHero,
    heroMountIfEnabled: heroMountIfEnabled,
    watchFlags: watchFlags,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftHero = api;
    var doc = root.document;
    if (doc) {
      var run = function () { watchFlags(doc, root.Lia, root.MutationObserver); };
      if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', run);
      else run();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
