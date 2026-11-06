/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Monograma "dpf" da autoria técnica: SVG de uma cor só (currentColor), sem marcação em string
// (createElementNS). Compartilhado pela abertura (splash.js) e pelos créditos (creditos.js); as
// páginas estáticas (404.html) levam a mesma geometria inline. Expõe window.LaiftMarca.
(function (root) {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var VIEWBOX = '0 0 34 20';
  // d, p e f desenhados em traço (stroke) para herdar a cor do contexto.
  var PATH = 'M8.4 10a3.2 3.2 0 1 0-6.4 0a3.2 3.2 0 1 0 6.4 0M8.4 2.5V13.2'
    + 'M22.4 10a3.2 3.2 0 1 0-6.4 0a3.2 3.2 0 1 0 6.4 0M16 6.8V18'
    + 'M29 14V5.5A2.5 2.5 0 0 1 31.5 3H32.5M26.5 7.5H31.5';

  /** Cria o <svg> decorativo (aria-hidden). opts.className e opts.width (px) são opcionais. */
  function create(doc, opts) {
    var o = opts || {};
    var width = o.width || 34;
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', VIEWBOX);
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(Math.round(width * 20 / 34)));
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.7');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    if (o.className) svg.setAttribute('class', o.className);
    var path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', PATH);
    svg.appendChild(path);
    return svg;
  }

  var api = { VIEWBOX: VIEWBOX, PATH: PATH, create: create };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftMarca = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
