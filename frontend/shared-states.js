/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Estados padronizados de tela (carregando, vazio, erro), esqueletos de lista e
// aviso de "você está offline". Tudo é montado com createElement/textContent,
// nunca convertendo texto em HTML, então é compatível com a CSP estrita e seguro
// para mensagens que venham da API. Expõe window.LaiftStates; em Node (testes)
// exporta só as funções puras.
(function (root) {
  'use strict';

  var MODELS = {
    loading: { role: 'status', live: 'polite', busy: true },
    empty: { role: 'status', live: 'polite', busy: false },
    error: { role: 'alert', live: 'assertive', busy: false },
  };

  var DEFAULTS = {
    loading: { title: 'Carregando…', message: '' },
    empty: { title: 'Nada por aqui ainda.', message: '' },
    error: { title: 'Não foi possível carregar.', message: 'Tente novamente em instantes.' },
  };

  var MAX_SKELETON_ROWS = 8;
  var DEFAULT_SKELETON_ROWS = 3;
  var OFFLINE_TEXT = 'Você está offline. Algumas funções podem não funcionar até a conexão voltar.';

  function stateModel(kind) {
    var model = MODELS[kind];
    if (!model) throw new Error('Estado desconhecido: ' + kind);
    return { role: model.role, live: model.live, busy: model.busy };
  }

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  /**
   * @param {Document} doc
   * @param {'loading'|'empty'|'error'} kind
   * @param {{title?: string, message?: string, actionLabel?: string, onAction?: Function}} [opts]
   */
  function createStateNode(doc, kind, opts) {
    var model = stateModel(kind);
    var options = opts || {};
    var defaults = DEFAULTS[kind];
    var title = options.title || defaults.title;
    var message = options.message !== undefined ? options.message : defaults.message;

    var node = element(doc, 'div', 'state state-' + kind);
    node.setAttribute('role', model.role);
    node.setAttribute('aria-live', model.live);
    if (model.busy) node.setAttribute('aria-busy', 'true');
    // <p>, não título: um estado não deve alterar a hierarquia de h1/h2 da tela.
    node.appendChild(element(doc, 'p', 'state-title', title));
    if (message) node.appendChild(element(doc, 'p', 'state-message', message));

    if (options.actionLabel && typeof options.onAction === 'function') {
      var button = element(doc, 'button', 'secondary', options.actionLabel);
      button.setAttribute('type', 'button');
      button.addEventListener('click', options.onAction);
      node.appendChild(button);
    }
    return node;
  }

  function createSkeleton(doc, rows) {
    var count = rows === undefined ? DEFAULT_SKELETON_ROWS : Math.floor(Number(rows));
    if (!(count >= 1)) count = 1;
    if (count > MAX_SKELETON_ROWS) count = MAX_SKELETON_ROWS;
    var box = element(doc, 'div', 'skeleton');
    // Decorativo: leitores de tela ouvem o estado "carregando", não as barras.
    box.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < count; i++) {
      box.appendChild(element(doc, 'div', 'skeleton-line' + (i % 3 === 2 ? ' skeleton-line-short' : '')));
    }
    return box;
  }

  /** Mostra/esconde um aviso fixo conforme a conexão do navegador. */
  function watchConnection(win, doc) {
    var banner = element(doc, 'div', 'offline-banner', OFFLINE_TEXT);
    banner.setAttribute('role', 'status');
    banner.setAttribute('aria-live', 'polite');
    function sync() {
      banner.hidden = !(win.navigator && win.navigator.onLine === false);
    }
    sync();
    win.addEventListener('online', sync);
    win.addEventListener('offline', sync);
    doc.body.appendChild(banner);
    return banner;
  }

  var api = {
    stateModel: stateModel,
    createStateNode: createStateNode,
    createSkeleton: createSkeleton,
    watchConnection: watchConnection,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftStates = api;
    if (root.document) {
      if (root.document.body) watchConnection(root, root.document);
      else root.document.addEventListener('DOMContentLoaded', function () { watchConnection(root, root.document); });
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
