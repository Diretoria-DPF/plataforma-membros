/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Créditos (easter egg do Perfil > Sobre): tela cheia com o nome "dpflabs" andando pela tela por
// CSS (@keyframes, sem canvas). Diálogo acessível: role="dialog" + aria-modal, foco preso e
// devolvido, Esc fecha, botão Fechar de 44 px. O Voltar do Android é tratado por panel-history.js
// (diálogo aberto = entrada de histórico; o Voltar envia Esc e clica no botão com data-close).
// Texto fixo, só por textContent. Carregado sob demanda (pacote "creditos"). Expõe window.LaiftCreditos.
(function (root) {
  'use strict';

  var STYLE_HREF = 'creditos.css';
  var STYLE_ATTR = 'data-creditos-css';
  var NAME = 'dpflabs';
  var SITE = 'dpflabs.com';

  function ensureStyle(doc) {
    if (doc.querySelector('link[' + STYLE_ATTR + ']')) return;
    var link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = STYLE_HREF;
    link.setAttribute(STYLE_ATTR, '');
    doc.head.appendChild(link);
  }

  function el(doc, tag, cls, text) {
    var node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Abre os créditos. Devolve o elemento, ou o já aberto (nunca duplica). */
  function open(doc) {
    var existing = doc.getElementById('creditos');
    if (existing) return existing;
    ensureStyle(doc);
    var opener = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : null;

    var overlay = el(doc, 'div', 'creditos');
    overlay.id = 'creditos';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'creditos-titulo');

    var stage = el(doc, 'div', 'creditos__palco');
    stage.setAttribute('aria-hidden', 'true');
    for (var i = 1; i <= 3; i++) stage.appendChild(el(doc, 'span', 'creditos__corre creditos__corre--' + i, NAME));

    var box = el(doc, 'div', 'creditos__caixa');
    var title = el(doc, 'h2', 'creditos__titulo', 'Créditos');
    title.id = 'creditos-titulo';
    var close = el(doc, 'button', 'creditos__fechar', 'Fechar');
    close.type = 'button';
    close.setAttribute('data-close', '');
    if (root.LaiftMarca) box.appendChild(root.LaiftMarca.create(doc, { className: 'creditos__marca', width: 48 }));
    box.appendChild(title);
    box.appendChild(el(doc, 'p', 'creditos__linha', 'Plataforma de Membros LAIFT'));
    box.appendChild(el(doc, 'p', 'creditos__linha creditos__linha--forte', 'Desenvolvida por ' + NAME));
    box.appendChild(el(doc, 'p', 'creditos__linha creditos__linha--suave', SITE));
    box.appendChild(close);
    overlay.appendChild(stage);
    overlay.appendChild(box);

    var touched = [];
    var done = false;

    function shutdown() {
      if (done) return;
      done = true;
      doc.removeEventListener('keydown', onKeydown, true);
      touched.forEach(function (n) { n.removeAttribute('inert'); });
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (opener && opener.isConnected !== false && typeof opener.focus === 'function') opener.focus();
    }

    function onKeydown(evt) {
      if (evt.key === 'Escape') { evt.preventDefault(); evt.stopPropagation(); shutdown(); return; }
      // Único elemento focável: Tab e Shift+Tab mantêm o foco no botão Fechar.
      if (evt.key === 'Tab') { evt.preventDefault(); close.focus(); }
    }

    close.addEventListener('click', shutdown);
    doc.addEventListener('keydown', onKeydown, true);
    doc.body.appendChild(overlay);
    Array.prototype.forEach.call(doc.body.children, function (kid) {
      if (kid !== overlay && kid.setAttribute && !kid.hasAttribute('inert')) { kid.setAttribute('inert', ''); touched.push(kid); }
    });
    close.focus();
    return overlay;
  }

  var api = { NAME: NAME, open: open };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftCreditos = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
