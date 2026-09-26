/**
 * laift-identity.js
 * Ponte de identidade entre os módulos de aprendizagem (páginas carregadas
 * em iframe) e a Plataforma de Membros (janela principal, mesma origem).
 *
 * Substitui a antiga sessão própria do o-bala-vip (`laift_student_session`
 * no localStorage, criada pelo cadastro por matrícula/CPF + código OTP, que
 * foi descartado na unificação). A fonte da verdade agora é a sessão da
 * plataforma, validada pela Worker; aqui só se lê o que o app principal já
 * expõe em `window.App.getIdentity()` — nome, e-mail e papel. O token de
 * sessão da plataforma NUNCA passa por aqui e nunca é enviado ao Apps Script.
 *
 * Deve ser o PRIMEIRO script de cada módulo: se a página for aberta fora da
 * plataforma (link direto, sem ninguém logado), redireciona para o login.
 */
(function (global) {
  'use strict';

  // modulos/shared/laift-identity.js → frontend/index.html
  var scriptSrc = (global.document.currentScript && global.document.currentScript.src) || global.location.href;
  var LOGIN_URL = new URL('../../index.html', scriptSrc).href;

  /**
   * Localiza a janela da plataforma. Os módulos podem estar num iframe
   * (window.top), num iframe dentro de outro (studio dentro do laboratório)
   * ou numa aba aberta por um módulo (window.opener → .top).
   */
  function findHost() {
    var candidates = [];
    try { if (global.top && global.top !== global) candidates.push(global.top); } catch (e) { /* outra origem */ }
    try { if (global.opener) candidates.push(global.opener.top || global.opener); } catch (e) { /* outra origem */ }
    for (var i = 0; i < candidates.length; i++) {
      try {
        var c = candidates[i];
        if (c && c.App && typeof c.App.getIdentity === 'function') return c;
      } catch (e) { /* outra origem */ }
    }
    return null;
  }

  var ROLE_TO_TYPE = { visitor: 'Visitante', member: 'Membro', admin: 'Membro' };

  /**
   * Identidade da pessoa logada na plataforma, no formato que os módulos já
   * esperavam da sessão antiga: { identifier, name, type, email, role }.
   * `identifier` é o e-mail da conta (o Apps Script indexa métricas por ele).
   * Retorna null se não houver plataforma/sessão.
   */
  function get() {
    var host = findHost();
    if (!host) return null;
    var p = host.App.getIdentity();
    if (!p) return null;
    return {
      identifier: p.email || '',
      email: p.email || '',
      name: p.fullName || '',
      role: p.role,
      type: ROLE_TO_TYPE[p.role] || 'Visitante',
    };
  }

  /** Volta ao hub de módulos da plataforma (fecha o iframe atual). */
  function backToHub() {
    var host = findHost();
    if (host && host.LaiftLearning && typeof host.LaiftLearning.closeModule === 'function') {
      host.LaiftLearning.closeModule();
    } else {
      global.location.href = LOGIN_URL;
    }
  }

  var host = findHost();

  // Aberto fora da plataforma: não há de quem herdar identidade.
  if (!host) {
    global.location.replace(LOGIN_URL);
  }

  // Backend legado (Google Apps Script) dos módulos — métricas, IA da
  // clínica/laboratório e terminal fiscal. A URL vive num único lugar, o
  // frontend/learning.js da plataforma; os módulos que já liam
  // `window.APPS_SCRIPT_GATEWAY` passam a receber o valor de lá.
  // Migração para a Worker prevista na Fase 2 (docs/PLANO_UNIFICACAO_LAIFT.md).
  global.APPS_SCRIPT_GATEWAY = (host && host.LaiftLearning && host.LaiftLearning.APPS_SCRIPT_URL) || '';

  // Cliques/teclas/toques dentro de um iframe não chegam ao documento da
  // plataforma, que é quem adia a expiração da sessão por inatividade. Sem
  // este repasse, quem passasse 30 min num simulado era deslogado no meio.
  // (A plataforma já limita a no máximo 1 renovação a cada 30 s.)
  function notifyActivity() {
    var h = findHost();
    if (h && typeof h.App.notifyActivity === 'function') h.App.notifyActivity();
  }
  ['click', 'keydown', 'touchstart'].forEach(function (evtName) {
    global.document.addEventListener(evtName, notifyActivity, { passive: true });
  });

  global.LaiftIdentity = { get: get, backToHub: backToHub, loginUrl: LOGIN_URL };
})(window);
