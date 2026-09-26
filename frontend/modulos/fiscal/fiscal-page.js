/**
 * fiscal-page.js
 * Cola da página autônoma do Terminal Fiscal, aberta pelo modo admin da
 * Plataforma de Membros. Antes da unificação o terminal ficava escondido
 * dentro do cartão de cadastro do o-bala-vip e era aberto por duplo clique
 * no cabeçalho ou Ctrl+Shift+F; esses gatilhos ocultos foram removidos.
 *
 * A checagem de papel abaixo é só de interface: quem de fato protege as
 * ações de presença é o Apps Script, que ainda exige a própria senha fiscal
 * (`loginFiscal`) em toda chamada. Na Fase 2 isso passa para a Worker, com o
 * papel `admin` validado no servidor (docs/PLANO_UNIFICACAO_LAIFT.md).
 */
(function () {
  'use strict';

  function init() {
    const identity = window.LaiftIdentity && window.LaiftIdentity.get();
    if (!identity || identity.role !== 'admin') {
      document.getElementById('fiscalDenied')?.classList.remove('hidden');
      return;
    }
    document.getElementById('fiscalLocked')?.classList.remove('hidden');
    FiscalEngine.abrirModalLogin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
