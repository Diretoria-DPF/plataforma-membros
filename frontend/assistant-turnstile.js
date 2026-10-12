/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia: desafio Cloudflare Turnstile da PRÉVIA de IA para visitante (flag pública lia_visitor_ai_enabled).
// Só entra em cena para quem NÃO tem sessão e só quando a flag está ligada: o script da Cloudflare é
// injetado sob demanda (ao abrir o painel da Lia) e o widget é renderizado de forma explícita, no modo
// 'interaction-only' (invisível, a menos que a Cloudflare precise de interação). O token é de USO ÚNICO:
// vai junto da pergunta (turnstileToken) e o widget é reiniciado depois de cada envio, com sucesso ou erro.
// Falha ao carregar o script, widget sem token ou qualquer erro NÃO atrapalham o chat: a pergunta segue sem
// token e o servidor responde com o trecho do acervo. A chave do SITE é pública; o segredo mora só no Worker.
// Nada vindo do servidor vira HTML aqui. Expõe window.LaiftAssistantTurnstile.
(function (root) {
  'use strict';

  var SITE_KEY = '0x4AAAAAAFU5o9zPQhbtV0yA';
  var ACTION = 'lia_preview';
  var SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  var TOKEN_MAX = 2048; // o mesmo teto do servidor (turnstileService.js)

  /** O desafio deve existir? Só visitante (sem sessão) com a flag pública lia_visitor_ai_enabled ligada. */
  function wanted(flags, sessionToken) {
    return !!flags && flags.lia_visitor_ai_enabled === true && !sessionToken;
  }

  function validToken(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= TOKEN_MAX ? value : null;
  }

  /**
   * Controlador do widget para uma janela (`win` tem document e, depois do script, turnstile).
   * ensure(parent): carrega o script (uma vez) e renderiza o widget dentro de um contêiner novo em `parent`.
   * token(): o token atual ou null. reset(): descarta o token e pede outro. dispose(): remove o widget.
   */
  function create(win) {
    var state = { widgetId: null, token: null, container: null, scriptLoading: false, parent: null };

    function api() { return win.turnstile && typeof win.turnstile.render === 'function' ? win.turnstile : null; }

    function render() {
      var ts = api();
      if (!ts || state.widgetId !== null || !state.container) return;
      try {
        state.widgetId = ts.render(state.container, {
          sitekey: SITE_KEY,
          action: ACTION,
          appearance: 'interaction-only',
          callback: function (value) { state.token = validToken(value); },
          'expired-callback': function () { state.token = null; },
          'error-callback': function () { state.token = null; },
        });
      } catch (err) {
        state.widgetId = null; // sem widget: o chat segue sem token
      }
    }

    function loadScript() {
      if (api() || state.scriptLoading) return;
      state.scriptLoading = true;
      try {
        var script = win.document.createElement('script');
        script.src = SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.onload = function () { state.scriptLoading = false; render(); };
        script.onerror = function () { state.scriptLoading = false; }; // o chat funciona igual, sem token
        win.document.head.appendChild(script);
      } catch (err) {
        state.scriptLoading = false;
      }
    }

    return {
      ensure: function (parent) {
        if (state.widgetId !== null) return;
        if (!state.container && parent) {
          state.container = win.document.createElement('div');
          state.container.className = 'lia-turnstile';
          parent.appendChild(state.container);
        }
        if (api()) render(); else loadScript();
      },
      token: function () { return state.token; },
      reset: function () {
        state.token = null;
        var ts = api();
        if (ts && state.widgetId !== null && typeof ts.reset === 'function') {
          try { ts.reset(state.widgetId); } catch (err) { /* o próximo envio vai sem token */ }
        }
      },
      dispose: function () {
        var ts = api();
        if (ts && state.widgetId !== null && typeof ts.remove === 'function') {
          try { ts.remove(state.widgetId); } catch (err) { /* nada a fazer */ }
        }
        if (state.container && state.container.parentNode) state.container.parentNode.removeChild(state.container);
        state.widgetId = null;
        state.token = null;
        state.container = null;
      },
      active: function () { return state.widgetId !== null; },
    };
  }

  /** Carga útil do chat com o token atual (se houver). Não altera o objeto recebido. */
  function withToken(payload, controller) {
    var token = controller ? controller.token() : null;
    if (!token) return payload;
    var out = {};
    Object.keys(payload).forEach(function (key) { out[key] = payload[key]; });
    out.turnstileToken = token;
    return out;
  }

  /** Mantém o controlador alinhado com o desejado: cria quando passa a valer, remove o widget quando deixa de valer. */
  function sync(current, win, isWanted) {
    if (isWanted) return current || create(win);
    if (current) current.dispose();
    return null;
  }

  var api = { SITE_KEY: SITE_KEY, ACTION: ACTION, SCRIPT_URL: SCRIPT_URL, TOKEN_MAX: TOKEN_MAX, wanted: wanted, create: create, sync: sync, withToken: withToken };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftAssistantTurnstile = api;
})(typeof window !== 'undefined' ? window : globalThis);
