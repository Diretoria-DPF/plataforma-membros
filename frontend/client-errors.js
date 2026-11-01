/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * frontend/client-errors.js (OPS-08; docs/erros-frontend.md)
 * Coleta agregada de erros do navegador: window.onerror e unhandledrejection viram UM relato pequeno para
 * apiLogClientError. Sem PII: só mensagem curta, caminho da página (sem query nem hash), classe de navegador e versão
 * do app. Nada de e-mail, token, IP, cookie ou conteúdo da tela. O servidor limpa de novo e agrega por impressão digital.
 *
 * Dedupe e teto por sessão da aba: o mesmo erro vai uma vez e no máximo MAX_PER_SESSION relatos saem por aba. Falha ao
 * relatar é silenciosa (nunca gera outro erro). Sem inline script (CSP): arquivo próprio carregado por index.html.
 */
(function () {
  'use strict';

  var MAX_PER_SESSION = 5;
  var MESSAGE_MAX = 200;
  var NOISE = /ResizeObserver loop|^Script error\.?$|Non-Error promise rejection|extension:\/\//i;

  var sent = 0;
  var seen = {};

  function apiBase(hostname) {
    if (hostname === 'laift.com.br' || hostname === 'www.laift.com.br') return 'https://api.laift.com.br';
    if (hostname === 'staging.laift.com.br') return 'https://staging-api.laift.com.br';
    return 'https://plataforma-membros-api.diretoria-dpf.workers.dev';
  }

  /** Classe do navegador (lista fechada do servidor); nunca o user agent inteiro. */
  function browserClass(ua) {
    var s = String(ua || '');
    if (/SamsungBrowser/i.test(s)) return 'samsung';
    if (/Edg(e|A|iOS)?\//.test(s)) return 'edge';
    if (/OPR\/|Opera/.test(s)) return 'opera';
    if (/Firefox\/|FxiOS\//.test(s)) return 'firefox';
    if (/Chrome\/|CriOS\//.test(s)) return 'chrome';
    if (/Safari\//.test(s)) return 'safari';
    return 'other';
  }

  /** Texto do erro: só a mensagem, truncada. O servidor ainda remove e-mail, token, URL com query etc. */
  function messageOf(value) {
    var text = '';
    if (typeof value === 'string') text = value;
    else if (value && typeof value.message === 'string') text = value.message;
    return text.replace(/\s+/g, ' ').trim().slice(0, MESSAGE_MAX);
  }

  /** Monta o relato, ou null se for ruído conhecido, vazio ou repetido. Atualiza o dedupe. */
  function buildReport(kind, value, ctx) {
    var message = messageOf(value);
    if (!message || NOISE.test(message)) return null;
    var route = String((ctx && ctx.pathname) || '').split(/[?#]/)[0].slice(0, 80);
    var key = kind + '|' + message + '|' + route;
    if (seen[key]) return null;
    seen[key] = true;
    return {
      kind: kind === 'rejection' ? 'rejection' : 'error',
      message: message,
      route: route,
      browser: browserClass(ctx && ctx.userAgent),
      appVersion: String((ctx && ctx.appVersion) || '').slice(0, 32),
    };
  }

  function context() {
    var root = document.documentElement;
    return {
      pathname: window.location.pathname,
      userAgent: navigator.userAgent,
      appVersion: (root && root.getAttribute('data-app-version')) || '',
    };
  }

  function send(report) {
    if (!report || sent >= MAX_PER_SESSION) return;
    sent++;
    try {
      fetch(apiBase(window.location.hostname), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'apiLogClientError', args: [report] }),
        credentials: 'omit',
        keepalive: true,
      }).catch(function () { /* relatar nunca gera erro */ });
    } catch (e) { /* idem */ }
  }

  function onError(evt) {
    try {
      send(buildReport('error', evt && (evt.error || evt.message), context()));
    } catch (e) { /* idem */ }
  }

  function onRejection(evt) {
    try {
      send(buildReport('rejection', evt && evt.reason, context()));
    } catch (e) { /* idem */ }
  }

  var pure = { apiBase: apiBase, browserClass: browserClass, messageOf: messageOf, buildReport: buildReport, MAX_PER_SESSION: MAX_PER_SESSION };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Object.assign({ _reset: function () { sent = 0; seen = {}; }, _send: send }, pure);
  } else {
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.LaiftClientErrors = pure;
  }
})();
