/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Dica contextual da Lia (plano §3.4): ao entrar num painel ou módulo, um balão curto e
// dispensável perto do botão da Lia. O texto é FIXO deste arquivo (nunca vem de IA nem da API)
// e a dica não altera nada: tocar nela só abre o painel da Lia com a pergunta no campo, sem enviar.
// Uma vez por módulo por sessão (Set em memória; nada vai para o armazenamento do navegador),
// some sozinha em 8 s e não aparece com o painel aberto, com a Lia desligada ou com suspensão.
// A cola com a tela fica em assistant.js. Expõe window.AssistantHints (ou module.exports, no Node).
(function (root) {
  'use strict';

  var SHOW_MS = 8000;

  // Texto fixo por contexto da Lia (os mesmos nomes de MODULES em lia-states.js).
  var HINT_TEXT = Object.freeze({
    events: 'Quer ajuda com sua inscrição?',
    proposals: 'Posso te levar para criar uma proposta.',
    learn: 'Quer sugestão por onde começar a estudar?',
    lab: 'Dúvida sobre vidraria ou preparo?',
    clinic: 'Quer revisar um caso antes?',
    atlas: 'Posso explicar alguma estrutura?',
  });
  // Painel (id da <section>) → contexto. Só os três painéis que têm dica.
  var CONTEXT_BY_PANEL = Object.freeze({
    'panel-events': 'events',
    'panel-proposals': 'proposals',
    'panel-learn': 'learn',
  });
  // Módulo de estudo (id em learning.js) → contexto. Farmacologia e Toxicologia usam o de Aprender.
  var CONTEXT_BY_MODULE = Object.freeze({
    farmaco: 'learn',
    toxico: 'learn',
    clinica: 'clinic',
    lab: 'lab',
    anatomia: 'atlas',
  });

  /** Valor do mapa para a chave, só se a chave for uma propriedade própria (nada de protótipo). */
  function own(map, key) {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : '';
  }

  function contextForPanel(panelId) { return own(CONTEXT_BY_PANEL, panelId); }

  function contextForModule(moduleId) { return own(CONTEXT_BY_MODULE, moduleId); }

  /** Contexto com dica → { context, text }; sem dica → null. */
  function hintFor(context) {
    var text = own(HINT_TEXT, context);
    return text ? Object.freeze({ context: context, text: text }) : null;
  }

  /**
   * Mostra a dica? Só com a Lia ligada (flags.chatbot_enabled === true), com o painel da Lia fechado,
   * sem suspensão (flags.moderated) e se o contexto ainda não foi mostrado nesta sessão (seen: Set).
   */
  function shouldShow(context, seen, flags) {
    var f = flags || {};
    if (!hintFor(context)) return false;
    if (f.chatbot_enabled !== true || f.panelOpen === true || f.moderated === true) return false;
    return !(seen && typeof seen.has === 'function' && seen.has(context));
  }

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  /** Balão: o texto é um botão (abre o painel com a pergunta) e o × fecha. role="status" avisa leitor de tela. */
  function buildBubble(doc, hint, handlers) {
    var box = el(doc, 'div', 'lia-hint');
    box.setAttribute('role', 'status');
    var open = el(doc, 'button', 'lia-hint-open', hint.text);
    open.type = 'button';
    open.addEventListener('click', function () { handlers.open(hint.text); });
    var close = el(doc, 'button', 'lia-hint-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fechar a dica');
    close.addEventListener('click', function () { handlers.close(); });
    box.appendChild(open);
    box.appendChild(close);
    return box;
  }

  function defaultTimers() {
    return {
      set: function (fn, ms) { return root.setTimeout(fn, ms); },
      clear: function (id) { root.clearTimeout(id); },
    };
  }

  /**
   * Controlador da dica. opts: { doc, flags() → { chatbot_enabled, panelOpen, moderated },
   * onOpen(texto), timers? { set(fn, ms), clear(id) } }.
   * panelChanged/moduleChanged são decididos num microtask: numa mesma ação (painel e depois módulo),
   * só vale o último contexto, e a dica de passagem nunca chega a aparecer nem a contar como vista.
   */
  function createHints(opts) {
    var doc = opts.doc;
    var flagsOf = typeof opts.flags === 'function' ? opts.flags : function () { return {}; };
    var onOpen = typeof opts.onOpen === 'function' ? opts.onOpen : function () {};
    var timers = opts.timers || defaultTimers();
    var seen = new Set();
    var node = null;
    var timerId = null;
    var pending = null;
    var queued = false;
    var state = { panel: '', module: '' };

    function hide() {
      if (timerId !== null) timers.clear(timerId);
      timerId = null;
      if (node) node.remove();
      node = null;
    }

    function expire() {
      timerId = null;
      hide();
    }

    function show(hint) {
      node = buildBubble(doc, hint, {
        open: function (text) { hide(); onOpen(text); },
        close: hide,
      });
      doc.body.appendChild(node);
      seen.add(hint.context);
      timerId = timers.set(expire, SHOW_MS);
    }

    function decide() {
      var context = pending;
      queued = false;
      pending = null;
      hide();
      if (shouldShow(context, seen, flagsOf())) show(hintFor(context));
    }

    function offer(context) {
      pending = context;
      if (queued) return;
      queued = true;
      Promise.resolve().then(decide);
    }

    function panelChanged(panelId) {
      state = { panel: typeof panelId === 'string' ? panelId : '', module: '' };
      offer(contextForPanel(state.panel));
    }

    function moduleChanged(moduleId) {
      state = { panel: state.panel, module: typeof moduleId === 'string' ? moduleId : '' };
      offer(contextForModule(state.module));
    }

    /** Contexto da Lia na tela: o módulo aberto, ou o painel. */
    function context() {
      return state.module ? contextForModule(state.module) : contextForPanel(state.panel);
    }

    /** Logout: some o balão, zera o timer e a lista do que já foi mostrado. */
    function reset() {
      pending = null;
      seen.clear();
      state = { panel: '', module: '' };
      hide();
    }

    return {
      panelChanged: panelChanged,
      moduleChanged: moduleChanged,
      context: context,
      hide: hide,
      reset: reset,
      isShowing: function () { return node !== null; },
    };
  }

  var api = {
    SHOW_MS: SHOW_MS,
    HINT_TEXT: HINT_TEXT,
    contextForPanel: contextForPanel,
    contextForModule: contextForModule,
    hintFor: hintFor,
    shouldShow: shouldShow,
    createHints: createHints,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AssistantHints = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
