/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Splash de abertura: logo LAIFT + ícones SVG (frasco, folha, cápsula),
// 1x por sessão (sessionStorage), decorativa (aria-hidden, sem capturar
// toque). Some quando o app avisa que está pronto (evento "laift:ready", que
// app.js dispara) ou, no máximo, após SAFETY_MS. Sob movimento reduzido não há
// animação nem tempo mínimo na tela. Sem marcação em string: SVG via createElementNS.
// Expõe window.LaiftSplash.
(function (root) {
  'use strict';

  var STORAGE_KEY = 'laift-splash-shown';
  var READY_EVENT = 'laift:ready';
  var MIN_VISIBLE_MS = 900;   // tempo para a entrada animada terminar (--dur-slow + escalonamento)
  var SAFETY_MS = 4000;       // nunca prende a tela se o app não avisar
  var LEAVE_MS = 280;         // = --dur-base: saída por opacity
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** Mostra só se ainda não foi mostrada nesta sessão. Storage ausente/bloqueado: mostra. */
  function shouldShowSplash(storage) {
    try {
      return !(storage && storage.getItem(STORAGE_KEY) === '1');
    } catch (e) {
      return true;
    }
  }

  function markShown(storage) {
    try { if (storage) storage.setItem(STORAGE_KEY, '1'); } catch (e) { /* modo privado: tudo bem */ }
  }

  /** Tempo que ainda falta para cumprir o mínimo de exibição. */
  function remainingMs(shownAt, now, reducedMotion) {
    if (reducedMotion) return 0;
    return Math.max(0, MIN_VISIBLE_MS - (now - shownAt));
  }

  // Ícones: traços de 24x24, herdam a cor (currentColor).
  var ICONS = [
    { name: 'flask', d: 'M9 3h6M10 3v6.2L4.6 18.4A2 2 0 0 0 6.3 21.4h11.4a2 2 0 0 0 1.7-3L14 9.2V3M7.5 15h9' },
    { name: 'leaf', d: 'M5 19c0-9 5-14 15-14 0 10-5 15-14 15M5 19l8-8' },
    { name: 'capsule', d: 'M10.5 20.5a4.95 4.95 0 0 1-7-7l10-10a4.95 4.95 0 0 1 7 7zM8.5 8.5l7 7' },
  ];

  function svgIcon(doc, icon, index) {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.8');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'splash-icon splash-icon-' + icon.name);
    // Escalonamento por data-attribute (CSP: nada de style inline).
    svg.setAttribute('data-i', String(index));
    var path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', icon.d);
    svg.appendChild(path);
    return svg;
  }

  function buildSplash(doc) {
    var box = doc.createElement('div');
    box.className = 'splash';
    box.setAttribute('aria-hidden', 'true');
    var inner = doc.createElement('div');
    inner.className = 'splash-inner';
    var logo = doc.createElement('img');
    logo.className = 'splash-logo';
    logo.setAttribute('src', 'modulos/cracha/laift-marca.png');
    logo.setAttribute('alt', '');
    logo.setAttribute('width', '96');
    logo.setAttribute('height', '96');
    var brand = doc.createElement('p');
    brand.className = 'splash-brand';
    brand.textContent = 'LAIFT';
    var icons = doc.createElement('div');
    icons.className = 'splash-icons';
    ICONS.forEach(function (icon, i) { icons.appendChild(svgIcon(doc, icon, i)); });
    inner.appendChild(logo);
    inner.appendChild(brand);
    inner.appendChild(icons);
    box.appendChild(inner);
    return box;
  }

  function start(win) {
    var doc = win.document;
    var storage;
    try { storage = win.sessionStorage; } catch (e) { storage = null; }
    if (!doc || !doc.body || !shouldShowSplash(storage)) return null;
    markShown(storage);

    var reduced = !!(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var node = buildSplash(doc);
    var shownAt = Date.now();
    var closed = false;
    doc.body.appendChild(node);

    function remove() { if (node.parentNode) node.parentNode.removeChild(node); }
    function leave() {
      if (closed) return;
      closed = true;
      doc.removeEventListener(READY_EVENT, onReady);
      node.classList.add('splash-leaving');
      win.setTimeout(remove, reduced ? 0 : LEAVE_MS);
    }
    function onReady() {
      win.setTimeout(leave, remainingMs(shownAt, Date.now(), reduced));
    }

    doc.addEventListener(READY_EVENT, onReady);
    if (win.__laiftReady === true) onReady();
    win.setTimeout(leave, SAFETY_MS);
    return node;
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    READY_EVENT: READY_EVENT,
    MIN_VISIBLE_MS: MIN_VISIBLE_MS,
    shouldShowSplash: shouldShowSplash,
    markShown: markShown,
    remainingMs: remainingMs,
    buildSplash: buildSplash,
    start: start,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftSplash = api;
    start(root);
  }
})(typeof window !== 'undefined' ? window : globalThis);
