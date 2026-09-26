/**
 * static-page.js — folhas decorativas e o link "← Voltar" das páginas
 * estáticas (404, termos e privacidade). Antes era um <script> inline repetido em cada página; saiu
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

/**
 * "← Voltar": volta no histórico quando a pessoa chegou por um link da
 * própria plataforma; senão (aba nova, link direto) segue o href para a
 * plataforma. Substitui o antigo href="javascript:history.back()", que a
 * CSP sem 'unsafe-inline' bloqueia.
 */
(function initBackLinks() {
  'use strict';
  var links = document.querySelectorAll('a[data-history-back]');
  Array.prototype.forEach.call(links, function (link) {
    link.addEventListener('click', function (event) {
      var sameOriginReferrer = false;
      try {
        sameOriginReferrer = !!document.referrer && new URL(document.referrer).origin === window.location.origin;
      } catch (e) { sameOriginReferrer = false; }
      if (sameOriginReferrer && window.history.length > 1) {
        event.preventDefault();
        window.history.back();
      }
    });
  });
})();
