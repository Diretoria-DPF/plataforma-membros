/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Biblioteca v2 (flag library_v2_enabled; docs/biblioteca-v2.md): NOVO VISUAL para a Biblioteca de sempre, sem recriar nada.
// library.js, library-detail.js e library-cite.js continuam montando a tela, buscando, filtrando, favoritando, citando
// e sugerindo artigos (mesmos ids, mesmas ações, mesmas validações). Este script só marca o painel para o CSS
// (library-v2.css) e acrescenta o selo "ⓘ" de revisão nos artigos que têm resumo. A tela de sempre refaz o HTML a cada busca;
// por isso um MutationObserver reaplica o selo (de forma idempotente) e reset() desfaz tudo quando a flag é desligada.
// Carregado SOB DEMANDA (pacote "biblioteca2" de lazy-bundles.js) só com a flag ligada. Só DOM seguro (createElement e
// textContent); sem HTML por texto e sem estilo inline. Expõe window.LaiftLibraryV2; em Node (testes) exporta as funções puras.
(function (root) {
  'use strict';

  var PANEL_ID = 'panel-library';
  var ROOT_ID = 'library-root';
  var PANEL_ATTR = 'data-lib2';
  var STYLE_HREF = 'library-v2.css';
  var STYLE_ATTR = 'data-library-v2-css';
  var SEAL_ATTR = 'data-lib2-seal';
  var SUMMARY_BADGE = 'Com resumo';
  var SEAL_GLYPH = 'ⓘ';
  var SEAL_NOTE = 'O resumo vem da curadoria da Diretoria Científica: escrito por ela ou gerado por IA e revisado. Abra o artigo para ver a origem e quem revisou.';

  // ---------- Funções puras ----------

  /** O selo de um artigo só existe quando o artigo tem resumo (o selo "Com resumo" da lista de sempre). */
  function hasSummaryBadge(labels) {
    return Array.isArray(labels) && labels.indexOf(SUMMARY_BADGE) >= 0;
  }

  /** Id da nota do selo (liga o botão à nota por aria-controls). */
  function noteId(articleId) {
    return 'lib2-nota-' + String(articleId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  }

  /** Nome acessível do selo: inclui o título do artigo. */
  function sealLabel(title) {
    var text = String(title || '').trim();
    return text ? 'O que significa o resumo revisado de "' + text + '"?' : 'O que significa o resumo revisado?';
  }

  /** Valor de aria-expanded. */
  function expandedValue(open) { return open ? 'true' : 'false'; }

  // ---------- DOM ----------

  var mounted = null;

  function el(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function ensureStyles(doc) {
    if (!doc || !doc.head || doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '1');
    doc.head.appendChild(link);
  }

  function badgeLabels(selos) {
    return Array.prototype.map.call(selos.querySelectorAll('.badge'), function (b) { return b.textContent; });
  }

  /** Acrescenta o selo e a nota em um artigo da lista (uma vez só por artigo). */
  function sealItem(doc, item) {
    if (item.hasAttribute(SEAL_ATTR)) return;
    var selos = item.querySelector('.library-selos');
    var title = item.querySelector('.library-titulo');
    if (!selos || !title || !hasSummaryBadge(badgeLabels(selos))) return;
    item.setAttribute(SEAL_ATTR, '1');
    var id = noteId(title.getAttribute('data-id') || title.getAttribute('data-arg'));
    var button = el(doc, 'button', 'lib2-selo', SEAL_GLYPH);
    button.setAttribute('type', 'button');
    button.setAttribute('aria-label', sealLabel(title.textContent));
    button.setAttribute('aria-expanded', expandedValue(false));
    button.setAttribute('aria-controls', id);
    var note = el(doc, 'p', 'lib2-nota', SEAL_NOTE);
    note.id = id;
    note.hidden = true;
    button.addEventListener('click', function () {
      var open = note.hidden;
      note.hidden = !open;
      button.setAttribute('aria-expanded', expandedValue(open));
    });
    selos.appendChild(button);
    selos.parentNode.insertBefore(note, selos.nextSibling);
  }

  function enhance(doc) {
    var box = doc.getElementById(ROOT_ID);
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.library-item'), function (item) { sealItem(doc, item); });
  }

  /** Remove o que o script acrescentou e libera as marcas. */
  function undoEnhance(doc) {
    var box = doc.getElementById(ROOT_ID);
    if (!box) return;
    Array.prototype.forEach.call(box.querySelectorAll('.lib2-selo, .lib2-nota'), function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
    Array.prototype.forEach.call(box.querySelectorAll('[' + SEAL_ATTR + ']'), function (n) { n.removeAttribute(SEAL_ATTR); });
  }

  /** Liga o visual novo ao painel. Chamado a cada abertura; a partir da segunda só reaplica o selo. */
  function mount(app, doc) {
    var d = doc || root.document;
    var panel = d.getElementById(PANEL_ID);
    var box = d.getElementById(ROOT_ID);
    if (!panel || !box) return false;
    ensureStyles(d);
    panel.setAttribute(PANEL_ATTR, '1');
    enhance(d);
    if (mounted && mounted.box === box) return true;
    var observer = null;
    if (typeof root.MutationObserver === 'function') {
      var pending = false;
      observer = new root.MutationObserver(function () {
        if (pending) return;
        pending = true;
        root.setTimeout(function () { pending = false; enhance(d); }, 0);
      });
      observer.observe(box, { childList: true, subtree: true });
    }
    mounted = { box: box, panel: panel, observer: observer, doc: d };
    return true;
  }

  /** Devolve a Biblioteca de sempre (flag desligada depois de montado). */
  function reset() {
    if (!mounted) return;
    if (mounted.observer) mounted.observer.disconnect();
    undoEnhance(mounted.doc);
    mounted.panel.removeAttribute(PANEL_ATTR);
    var link = mounted.doc.querySelector('link[' + STYLE_ATTR + ']');
    if (link && link.parentNode) link.parentNode.removeChild(link);
    mounted = null;
  }

  var api = {
    SEAL_NOTE: SEAL_NOTE, SUMMARY_BADGE: SUMMARY_BADGE, hasSummaryBadge: hasSummaryBadge, noteId: noteId, sealLabel: sealLabel,
    expandedValue: expandedValue, ensureStyles: ensureStyles, mount: mount, reset: reset,
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.LaiftLibraryV2 = api;
})(typeof self !== 'undefined' ? self : this);
