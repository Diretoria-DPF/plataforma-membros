/**
 * static-page.js — folhas decorativas das páginas estáticas (404, termos e
 * privacidade). Antes era um <script> inline repetido em cada página; saiu
 * para um arquivo para as páginas poderem ter CSP sem 'unsafe-inline'
 * (Fase 4, Onda 2). O index.html tem a mesma decoração dentro do app.js.
 */
(function initLeaves() {
  'use strict';
  var field = document.getElementById('leaf-field');
  if (!field) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var count = Number(field.getAttribute('data-leaves')) || 10;
  var symbols = ['🍃', '🍂', '🌿'];
  for (var i = 0; i < count; i++) {
    var leaf = document.createElement('span');
    leaf.className = 'leaf';
    leaf.textContent = symbols[i % symbols.length];
    leaf.style.left = Math.random() * 100 + '%';
    leaf.style.animationDuration = 12 + Math.random() * 10 + 's';
    leaf.style.animationDelay = Math.random() * 10 + 's';
    leaf.style.fontSize = 16 + Math.random() * 14 + 'px';
    field.appendChild(leaf);
  }
})();
