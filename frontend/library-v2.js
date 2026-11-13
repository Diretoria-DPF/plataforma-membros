/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Biblioteca v2 (flag library_v2_enabled; docs/biblioteca-v2.md): NOVO VISUAL para a Biblioteca de sempre, sem recriar nada.
// library.js, library-detail.js e library-cite.js continuam montando a tela, buscando, filtrando, favoritando, citando
// e sugerindo artigos (mesmos ids, mesmas ações, mesmas validações). Este script só marca o painel para o CSS
// (library-v2.css). Não exibe selo nem nota de revisão ou de origem do resumo (regra do dono). reset() desfaz tudo quando a flag é desligada.
// Carregado SOB DEMANDA (pacote "biblioteca2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement e
// textContent); sem HTML por texto e sem estilo inline. Expõe window.LaiftLibraryV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-library';
  var ROOT_ID = 'library-root';
  var PANEL_ATTR = 'data-lib2';
  var STYLE_HREF = 'library-v2.css';
  var STYLE_ATTR = 'data-library-v2-css';

  // ---------- DOM ----------

  var mounted = null;

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  /** Liga o visual novo ao painel. Chamado a cada abertura; a partir da segunda não refaz nada. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    var box = d.getElementById(ROOT_ID);
    if (!panel || !box) return false;
    ensureStyles(d);
    panel.setAttribute(PANEL_ATTR, '1');
    mounted = { box: box, panel: panel, doc: d };
    return true;
  }

  /** Devolve a Biblioteca de sempre (flag desligada depois de montado). */
  function reset() {
    if (!mounted) return;
    mounted.panel.removeAttribute(PANEL_ATTR);
    var link = mounted.doc.querySelector('link[' + STYLE_ATTR + ']');
    if (link && link.parentNode) link.parentNode.removeChild(link);
    mounted = null;
  }

  var api = { ensureStyles: ensureStyles, mount: mount, reset: reset };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftLibraryV2 = api;
})(typeof self !== 'undefined' ? self : this);
