/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Atalhos de teclado da plataforma. "?" (Shift+/) abre a ajuda com a lista de atalhos;
// Ctrl+K (Cmd+K no Mac) abre e foca o campo da Lia (window.LaiftAssistant.open). Nada dispara
// quando o foco está em campo de texto ou contenteditable, nem com outro diálogo aberto, e só
// há combinações que não colidem com leitores de tela. Ponto de extensão:
// window.LaiftShortcuts.register('Ctrl+Shift+F', handler, 'Busca global') (a busca da F4 entra aqui).
// Expõe window.LaiftShortcuts; as funções são testadas em Node.
(function (root) {
  'use strict';

  var HELP_ID = 'modal-shortcuts-help';
  var NON_TEXT_INPUT_TYPES = ['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'];
  var MODIFIERS = ['mod', 'alt', 'shift'];
  var ALIASES = { ctrl: 'mod', cmd: 'mod', meta: 'mod', control: 'mod', option: 'alt' };

  function isLetter(key) { return /^[a-z]$/i.test(key); }

  /** Forma canônica de uma tecla pressionada: 'mod+k', 'mod+shift+f', '?'. Ctrl e Cmd contam como 'mod'. */
  function comboOf(evt) {
    var key = String(evt.key || '');
    if (key === '/' && evt.shiftKey) key = '?';
    var parts = [];
    if (evt.ctrlKey || evt.metaKey) parts.push('mod');
    if (evt.altKey) parts.push('alt');
    if (evt.shiftKey && isLetter(key)) parts.push('shift'); // "?" e outros símbolos já trazem o shift
    parts.push(key.toLowerCase());
    return parts.join('+');
  }

  /** Escreve uma combinação do mesmo jeito que comboOf: aceita "Ctrl+K", "Cmd+Shift+K", "shift+/". */
  function normalizeCombo(text) {
    var words = String(text || '').toLowerCase().split('+').map(function (w) { return w.trim(); }).filter(Boolean);
    if (!words.length) return '';
    var key = words.pop();
    if (key === '/' && words.indexOf('shift') >= 0) key = '?';
    var names = words.map(function (w) { return ALIASES[w] || w; });
    var mods = MODIFIERS.filter(function (m) {
      return names.indexOf(m) >= 0 && (m !== 'shift' || isLetter(key));
    });
    return mods.concat([key]).join('+');
  }

  /** Campo de texto, área de texto, seleção ou contenteditable: a tecla pertence ao campo. */
  function isEditableTarget(el) {
    if (!el) return false;
    if (el.isContentEditable === true) return true;
    var tag = String(el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag !== 'INPUT') return false;
    return NON_TEXT_INPUT_TYPES.indexOf(String(el.type || 'text').toLowerCase()) < 0;
  }

  function hasOpenModal(doc) {
    return Array.prototype.some.call(doc.querySelectorAll('.modal-overlay'), function (el) {
      return !el.classList.contains('hidden');
    });
  }

  /** Rótulo para leitura humana: "mod+k" -> "Ctrl/Cmd + K". */
  function comboLabel(combo) {
    var names = { mod: 'Ctrl/Cmd', alt: 'Alt', shift: 'Shift' };
    return combo.split('+').map(function (part) {
      return names[part] || (part.length === 1 ? part.toUpperCase() : part);
    }).join(' + ');
  }

  function make(doc, tag, className, text) {
    var el = doc.createElement(tag);
    (className || '').split(' ').filter(Boolean).forEach(function (c) { el.classList.add(c); });
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function trapTab(doc, evt, box) {
    var items = Array.prototype.filter.call(box.querySelectorAll('button'), function (b) { return !b.disabled; });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (evt.shiftKey && doc.activeElement === first) { evt.preventDefault(); last.focus({ preventScroll: true }); }
    else if (!evt.shiftKey && doc.activeElement === last) { evt.preventDefault(); first.focus({ preventScroll: true }); }
  }

  /** Diálogo de ajuda no padrão de credential.js: foco preso, Esc fecha, foco volta à origem. */
  function createHelpDialog(doc, shortcuts) {
    var overlay = make(doc, 'div', 'modal-overlay hidden');
    overlay.id = HELP_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shortcuts-help-title');
    var box = make(doc, 'div', 'modal-box');
    var title = make(doc, 'h3', '', 'Atalhos de teclado');
    title.id = 'shortcuts-help-title';
    var list = make(doc, 'dl', 'shortcuts-list');
    var close = make(doc, 'button', 'secondary', 'Fechar');
    close.type = 'button';
    close.id = 'shortcuts-help-close';
    var actions = make(doc, 'div', 'modal-actions');
    actions.appendChild(close);
    [title, list, actions].forEach(function (node) { box.appendChild(node); });
    overlay.appendChild(box);
    doc.body.appendChild(overlay);

    var dialog = { overlay: overlay, list: list, close: close, opener: null };
    close.addEventListener('click', function () { shortcuts.closeHelp(); });
    overlay.addEventListener('click', function (evt) { if (evt.target === overlay) shortcuts.closeHelp(); });
    overlay.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') { evt.stopPropagation(); shortcuts.closeHelp(); }
      else if (evt.key === 'Tab') trapTab(doc, evt, box);
    });
    return dialog;
  }

  function renderShortcutList(doc, list, described) {
    while (list.firstChild) list.removeChild(list.firstChild);
    described.forEach(function (item) {
      var term = make(doc, 'dt');
      term.appendChild(make(doc, 'kbd', '', comboLabel(item.combo)));
      list.appendChild(term);
      list.appendChild(make(doc, 'dd', '', item.description));
    });
  }

  /** Cria o gerenciador de atalhos para um documento. Usado pela página e pelos testes. */
  function createShortcuts(doc, win) {
    var entries = new Map();
    var help = null;

    function register(combo, handler, description) {
      var key = normalizeCombo(combo);
      if (!key || typeof handler !== 'function') {
        throw new TypeError('LaiftShortcuts.register: combinação e função são obrigatórias');
      }
      var entry = { combo: key, handler: handler, description: String(description || '') };
      entries.set(key, entry);
      return function unregister() { if (entries.get(key) === entry) entries.delete(key); };
    }

    function described() {
      return Array.from(entries.values()).filter(function (entry) { return entry.description; });
    }

    function ensureHelp() {
      if (!help) help = createHelpDialog(doc, shortcuts);
      return help;
    }

    function openHelp() {
      var dialog = ensureHelp();
      dialog.opener = doc.activeElement;
      renderShortcutList(doc, dialog.list, described());
      dialog.overlay.classList.remove('hidden');
      dialog.close.focus({ preventScroll: true });
      return true;
    }

    function closeHelp() {
      if (!help || help.overlay.classList.contains('hidden')) return;
      help.overlay.classList.add('hidden');
      var opener = help.opener;
      help.opener = null;
      if (opener && doc.contains(opener) && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }

    function openLia() {
      var assistant = win && win.LaiftAssistant;
      if (!assistant || typeof assistant.open !== 'function') return false;
      assistant.open();
      return true;
    }

    /** Trata uma tecla. Devolve true só quando um atalho a reclamou (e o padrão foi cancelado). */
    function dispatch(evt) {
      if (!evt || evt.isComposing || evt.defaultPrevented) return false;
      var entry = entries.get(comboOf(evt));
      if (!entry || isEditableTarget(evt.target) || hasOpenModal(doc)) return false;
      if (entry.handler(evt) === false) return false;
      if (typeof evt.preventDefault === 'function') evt.preventDefault();
      return true;
    }

    var shortcuts = { register: register, dispatch: dispatch, openHelp: openHelp, closeHelp: closeHelp };
    register('?', openHelp, 'Mostra esta lista de atalhos');
    register('mod+k', openLia, 'Abre a Lia e foca o campo de pergunta');
    return shortcuts;
  }

  var api = {
    comboOf: comboOf,
    normalizeCombo: normalizeCombo,
    isEditableTarget: isEditableTarget,
    comboLabel: comboLabel,
    createShortcuts: createShortcuts,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (root.document) {
    var shortcuts = createShortcuts(root.document, root);
    root.LaiftShortcuts = { register: shortcuts.register };
    root.document.addEventListener('keydown', function (evt) { shortcuts.dispatch(evt); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
