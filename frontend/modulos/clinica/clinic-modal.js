/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinic-modal.js
 * Acessibilidade dos modais estáticos da Clínica (guia, radar, resultado do preceptor): Esc fecha, o foco fica preso
 * dentro do modal enquanto aberto e volta para o botão que o abriu. O modal precisa ter role="dialog" e nome
 * (aria-labelledby). Sem innerHTML. Testado em frontend/scripts/clinic-engine.test.mjs.
 */
(function (root) {
  'use strict';

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  var open = []; // pilha: o último é o modal do topo

  function isClassModal(node) {
    return node.classList.contains('modal');
  }

  function show(node) {
    if (isClassModal(node)) node.classList.add('active'); else node.style.display = 'flex';
  }

  function hide(node) {
    if (isClassModal(node)) node.classList.remove('active'); else node.style.display = 'none';
  }

  function focusables(node) {
    return Array.prototype.slice.call(node.querySelectorAll(FOCUSABLE));
  }

  function top() {
    return open.length ? open[open.length - 1] : null;
  }

  function onKeydown(event) {
    var entry = top();
    if (!entry) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal(entry.node);
      return;
    }
    if (event.key !== 'Tab') return;
    var items = focusables(entry.node);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    var first = items[0];
    var last = items[items.length - 1];
    var active = root.document.activeElement;
    var inside = entry.node.contains(active);
    if (event.shiftKey && (active === first || !inside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !inside)) {
      event.preventDefault();
      first.focus();
    }
  }

  function openModal(node, options) {
    if (!node) return;
    var opts = options || {};
    var existing = open.findIndex(function (e) { return e.node === node; });
    if (existing !== -1) return;
    open.push({ node: node, opener: root.document.activeElement, onClose: typeof opts.onClose === 'function' ? opts.onClose : null });
    show(node);
    if (open.length === 1) root.document.addEventListener('keydown', onKeydown, true);
    var items = focusables(node);
    var target = items[0] || node;
    if (!items.length) node.setAttribute('tabindex', '-1');
    if (typeof target.focus === 'function') target.focus();
  }

  function closeModal(node) {
    var idx = open.findIndex(function (e) { return e.node === node; });
    if (idx === -1) {
      hide(node);
      return;
    }
    var entry = open[idx];
    open.splice(idx, 1);
    hide(node);
    if (!open.length) root.document.removeEventListener('keydown', onKeydown, true);
    if (entry.onClose) {
      entry.onClose();
    } else if (entry.opener && typeof entry.opener.focus === 'function' && root.document.contains(entry.opener)) {
      entry.opener.focus();
    }
  }

  root.ClinicModal = { open: openModal, close: closeModal, isOpen: function (node) { return open.some(function (e) { return e.node === node; }); } };
})(typeof window !== 'undefined' ? window : globalThis);
