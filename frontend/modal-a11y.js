/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Acessibilidade comum dos diálogos que abrem só tirando a classe "hidden": Esc fecha (usa o botão
// de fechar/cancelar do próprio diálogo, então a limpeza de cada tela continua valendo), o foco entra
// no diálogo ao abrir, Tab não escapa dele e o foco volta ao botão que o abriu. O confirmar
// (#modal-confirm), o ampliar-imagem e o crachá já tratam o Esc por conta própria.
(function (root) {
  'use strict';

  var CLOSE_IDS = {
    'modal-member-profile': 'modal-member-profile-close',
    'modal-stepup': 'modal-stepup-cancel',
    'modal-vote-complement': 'modal-vote-cancel',
  };
  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** Próximo índice de foco dentro do diálogo; -1 quando não há onde focar. */
  function nextFocusIndex(count, current, backwards) {
    if (!count) return -1;
    if (current < 0) return backwards ? count - 1 : 0;
    if (backwards) return current === 0 ? count - 1 : current - 1;
    return current === count - 1 ? 0 : current + 1;
  }

  function closeTargetId(overlayId) {
    return Object.prototype.hasOwnProperty.call(CLOSE_IDS, overlayId) ? CLOSE_IDS[overlayId] : null;
  }

  function visibleFocusables(box) {
    return Array.prototype.filter.call(box.querySelectorAll(FOCUSABLE), function (node) {
      return !node.closest('.hidden') && node.offsetParent !== null;
    });
  }

  function watch(doc, overlay) {
    var opener = null;
    var wasOpen = !overlay.classList.contains('hidden');
    var observer = new root.MutationObserver(function () {
      var isOpen = !overlay.classList.contains('hidden');
      if (isOpen === wasOpen) return;
      wasOpen = isOpen;
      if (isOpen) {
        opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;
        var box = overlay.querySelector('.modal-box') || overlay;
        var first = visibleFocusables(box)[0];
        root.setTimeout(function () { if (first) first.focus(); }, 0);
      } else if (opener && doc.contains(opener) && typeof opener.focus === 'function') {
        opener.focus();
        opener = null;
      }
    });
    observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  }

  function onKeydown(doc, evt) {
    var overlays = Object.keys(CLOSE_IDS).map(function (id) { return doc.getElementById(id); });
    var open = overlays.filter(function (node) { return node && !node.classList.contains('hidden'); })[0];
    if (!open) return;
    if (evt.key === 'Escape') {
      var close = doc.getElementById(closeTargetId(open.id));
      if (close) { evt.preventDefault(); close.click(); }
      return;
    }
    if (evt.key !== 'Tab') return;
    var items = visibleFocusables(open.querySelector('.modal-box') || open);
    var next = nextFocusIndex(items.length, items.indexOf(doc.activeElement), evt.shiftKey);
    if (next === -1) return;
    var atEdge = evt.shiftKey ? items.indexOf(doc.activeElement) <= 0 : items.indexOf(doc.activeElement) === items.length - 1;
    if (atEdge || items.indexOf(doc.activeElement) === -1) { evt.preventDefault(); items[next].focus(); }
  }

  var api = { nextFocusIndex: nextFocusIndex, closeTargetId: closeTargetId };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root.document && root.MutationObserver) {
    var doc = root.document;
    Object.keys(CLOSE_IDS).forEach(function (id) {
      var overlay = doc.getElementById(id);
      if (overlay) watch(doc, overlay);
    });
    doc.addEventListener('keydown', function (evt) { onKeydown(doc, evt); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
