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
 *
 * Fase 2 (docs/PLANO_FASES_2_3_4.md, Contrato 3): também é a ponte para a
 * Worker (window.LaiftApi.call) e para o tema da plataforma
 * (LaiftIdentity.getTheme/applyTheme e <html data-theme>).
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

  // ===========================================================================
  // Fase 2 — tema (docs/PLANO_FASES_2_3_4.md, Contrato 3)
  // O módulo segue o tema da plataforma: <html data-theme="light|dark"> é
  // aplicado aqui já no carregamento (este é o primeiro script da página,
  // então não há "piscada" de tema errado) e atualizado quando a plataforma
  // chama applyTheme() ao mudar a preferência. "Sistema" é resolvido pelo
  // matchMedia da JANELA DA PLATAFORMA — é ela que a pessoa está vendo.
  // Quem precisar reagir (ex.: redesenhar um gráfico) escuta o evento
  // `laift:themechange` em window (detail.theme).
  // ===========================================================================
  function resolveTheme(pref, win) {
    if (pref === 'light' || pref === 'dark') return pref;
    try {
      return win && win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function getTheme() {
    var h = findHost();
    var pref = 'system';
    try {
      if (h && typeof h.App.getThemePreference === 'function') pref = h.App.getThemePreference();
    } catch (e) { /* plataforma indisponível */ }
    return resolveTheme(pref, h || global);
  }

  function applyTheme(theme) {
    var t = theme === 'dark' ? 'dark' : 'light';
    var root = global.document.documentElement;
    var changed = root.getAttribute('data-theme') !== t;
    root.setAttribute('data-theme', t);
    // Módulos dentro de módulos (ex.: o estúdio 3D dentro do laboratório).
    var frames = global.document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) {
      try {
        var w = frames[i].contentWindow;
        if (w && w.LaiftIdentity && typeof w.LaiftIdentity.applyTheme === 'function') w.LaiftIdentity.applyTheme(t);
      } catch (e) { /* outra origem */ }
    }
    if (changed) {
      try {
        global.dispatchEvent(new CustomEvent('laift:themechange', { detail: { theme: t } }));
      } catch (e) { /* navegador sem CustomEvent — o atributo já foi aplicado */ }
    }
    return t;
  }

  if (host) applyTheme(getTheme());

  // ===========================================================================
  // Fase 2 — chamadas à Worker a partir do módulo (Contrato 3)
  // Tudo passa pela plataforma (App.callLearningApi), que confere a
  // allowlist de ações e acrescenta o token de sessão — o módulo nunca vê o
  // token e nunca fala direto com a Worker. A resposta é copiada para este
  // "realm" (JSON) para o módulo não receber objetos/arrays de outra janela
  // (Array.isArray funciona, mas instanceof Array não) nem referências vivas
  // à plataforma. Nunca rejeita: falha vira { success:false, message }.
  // ===========================================================================
  var UNAVAILABLE = 'Sessão indisponível.';

  function call(action, input) {
    var h = findHost();
    if (!h || typeof h.App.callLearningApi !== 'function') {
      return Promise.resolve({ success: false, message: UNAVAILABLE });
    }
    var pending;
    try {
      pending = h.App.callLearningApi(action, input);
    } catch (e) {
      return Promise.resolve({ success: false, message: UNAVAILABLE });
    }
    return Promise.resolve(pending).then(function (res) {
      try {
        var copy = JSON.parse(JSON.stringify(res));
        return copy && typeof copy === 'object' ? copy : { success: false, message: 'Resposta inválida do servidor.' };
      } catch (e) {
        return { success: false, message: 'Resposta inválida do servidor.' };
      }
    }, function () {
      return { success: false, message: 'Falha de comunicação com o servidor.' };
    });
  }

  global.LaiftApi = { call: call };
  global.LaiftIdentity = { get: get, backToHub: backToHub, loginUrl: LOGIN_URL, getTheme: getTheme, applyTheme: applyTheme };
})(window);
