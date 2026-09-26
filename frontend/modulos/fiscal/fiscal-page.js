/**
 * fiscal-page.js
 * Inicialização da página do Terminal Fiscal, aberta pelo modo admin da
 * Plataforma de Membros (iframe da mesma origem).
 *
 * Fase 2: acabou a "senha fiscal" do Apps Script. A checagem de papel abaixo
 * é só de interface (esconde o terminal de quem não é admin); quem de fato
 * protege cada ação é a Worker, que exige o papel `admin` da SESSÃO em todo
 * endpoint apiAdminAttendance* (worker/src/services/attendanceService.js).
 */
(function () {
  'use strict';

  function init() {
    const identity = window.LaiftIdentity && window.LaiftIdentity.get();
    if (!identity || identity.role !== 'admin') {
      document.getElementById('fiscalDenied').classList.remove('hidden');
      return;
    }
    document.getElementById('fiscalArea').classList.remove('hidden');
    window.FiscalEngine.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
