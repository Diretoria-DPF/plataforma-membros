/**
 * clinica-page.js
 * Cola da página autônoma da Clínica Virtual. Antes da unificação, a clínica
 * vivia embutida no index.html raiz do o-bala-vip e dependia de funções
 * globais do js/app.js de lá (showStatus, hideStatus, closePreceptorModal,
 * modal de instruções). Esse app.js foi descartado junto com o cadastro
 * próprio; o que a clínica ainda usa foi trazido para cá.
 *
 * Fase 3: os botões da página deixaram de usar onclick/oninput inline —
 * são ligados aqui com addEventListener (um passo a menos para a CSP da
 * Onda 2, que proíbe script inline).
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

  // Fecha o resultado do preceptor e volta aos leitos. Pelo ClinicModal (botão, Esc): ele chama esta função de novo
  // já com o modal fechado, e aí segue para o mapa de leitos.
  function closePreceptorModal() {
    const modal = document.getElementById('preceptorModal');
    if (modal && window.ClinicModal && window.ClinicModal.isOpen(modal)) {
      window.ClinicModal.close(modal);
      return;
    }
    modal?.classList.remove('active');
    ClinicEngine.showBedsDashboard();
  }

  function openGuide() {
    const modal = document.getElementById('instructionsModal');
    if (!modal) return;
    if (window.ClinicModal) window.ClinicModal.open(modal); else modal.classList.add('active');
  }

  function closeGuide() {
    const modal = document.getElementById('instructionsModal');
    if (!modal) return;
    if (window.ClinicModal) window.ClinicModal.close(modal); else modal.classList.remove('active');
  }

  // Usadas pelo clinic-engine.js (typeof showStatus === 'function').
  window.showStatus = showStatus;
  window.hideStatus = hideStatus;
  window.closePreceptorModal = closePreceptorModal;

  function on(id, evt, handler) {
    document.getElementById(id)?.addEventListener(evt, handler);
  }

  function init() {
    on('infoBtn', 'click', openGuide);
    on('closeModal', 'click', closeGuide);
    // Clique no fundo escuro fecha só o guia; o resultado do preceptor fecha pelo botão ou Esc.
    window.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'instructionsModal') closeGuide();
    });

    on('btnGenerateAiCase', 'click', () => ClinicEngine.solicitarCasoProcedural());
    on('btnRadar', 'click', () => ClinicEngine.abrirRadarEpidemiologico());
    on('btnCloseRadar', 'click', () => ClinicEngine.fecharRadarEpidemiologico());
    on('btnModoPlantao', 'click', () => ClinicEngine.setModoExibicao('plantao'));
    on('btnModoAcervo', 'click', () => ClinicEngine.setModoExibicao('acervo'));
    on('btnRefreshAcervo', 'click', () => ClinicEngine.carregarAcervoComunitario());
    on('acervoSearchInput', 'input', () => ClinicEngine.filtrarAcervo());
    on('acervoToxFilter', 'change', () => ClinicEngine.filtrarAcervo());
    on('btnReturnToBeds', 'click', () => ClinicEngine.returnToBeds());
    on('sendQuestionBtn', 'click', () => ClinicEngine.submitPatientQuestion());
    on('submitCaseResolutionBtn', 'click', () => ClinicEngine.finalizeClinicalCase());
    on('btnClosePreceptor', 'click', closePreceptorModal);

    // Antes era o launchModule('clinica') do hub antigo que abria o mapa de leitos.
    ClinicEngine.showBedsDashboard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
