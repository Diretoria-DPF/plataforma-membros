/**
 * clinica-page.js
 * Cola da página autônoma da Clínica Virtual. Antes da unificação, a clínica
 * vivia embutida no index.html raiz do o-bala-vip e dependia de funções
 * globais do js/app.js de lá (showStatus, hideStatus, closePreceptorModal,
 * modal de instruções). Esse app.js foi descartado junto com o cadastro
 * próprio; o que a clínica ainda usa foi trazido para cá.
 */
(function () {
  'use strict';

  function showStatus(msg, type) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.className = `status-banner ${type}`;
    el.classList.remove('hidden');
  }

  function hideStatus() {
    const el = document.getElementById('status');
    if (el) el.classList.add('hidden');
  }

  function closePreceptorModal() {
    document.getElementById('preceptorModal')?.classList.remove('active');
    ClinicEngine.showBedsDashboard();
  }

  // Usadas pelo clinic-engine.js (typeof showStatus === 'function') e por
  // onclick inline no HTML.
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.closePreceptorModal = closePreceptorModal;

  function init() {
    document.getElementById('infoBtn')?.addEventListener('click', () => {
      document.getElementById('instructionsModal')?.classList.add('active');
    });
    document.getElementById('closeModal')?.addEventListener('click', () => {
      document.getElementById('instructionsModal')?.classList.remove('active');
    });
    window.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) e.target.classList.remove('active');
    });

    // Antes era o launchModule('clinica') do hub antigo que abria o mapa de leitos.
    ClinicEngine.showBedsDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
