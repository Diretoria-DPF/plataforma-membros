/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * laift-dialog.js — substitui alert()/confirm() nativos nos módulos (MOB-03).
 *
 *   LaiftDialog.alert(mensagem, { title, okLabel })                -> Promise<void>
 *   LaiftDialog.confirm(mensagem, { title, okLabel, cancelLabel }) -> Promise<boolean>
 *
 * Acessibilidade: role="dialog" + aria-modal, aria-labelledby (título) e aria-describedby
 * (mensagem); foco inicial no botão seguro (OK no aviso, Cancelar na confirmação); foco preso
 * (Tab/Shift+Tab); Esc fecha (cancela); o fundo fica inert; o foco volta a quem abriu; alvos de
 * toque >= 44px e texto >= 16px (laift-dialog.css). Todo texto entra por textContent. Sem
 * scripts inline (CSP): só este arquivo + a folha. Diálogos pedidos com outro aberto entram
 * numa fila e abrem em seguida, na ordem. Sem DOM (ou sem document), cai nos nativos.
 *
 * Script clássico (as páginas dos módulos também são). create(doc) é exposto para os testes.
 */
(function (global) {
  'use strict';

  var seq = 0;

  function create(doc) {
    var queue = Promise.resolve();

    function native(kind, message) {
      if (kind === 'confirm' && typeof global.confirm === 'function') return global.confirm(message);
      if (kind === 'alert' && typeof global.alert === 'function') global.alert(message);
      return kind === 'confirm' ? false : undefined;
    }

    function el(tag, className, text) {
      var node = doc.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function setInertOutside(overlay, on, touched) {
      if (!on) {
        touched.forEach(function (n) { n.removeAttribute('inert'); });
        return;
      }
      var kids = doc.body.children || [];
      for (var i = 0; i < kids.length; i++) {
        var kid = kids[i];
        if (kid !== overlay && typeof kid.setAttribute === 'function' && !(typeof kid.hasAttribute === 'function' && kid.hasAttribute('inert'))) {
          kid.setAttribute('inert', '');
          touched.push(kid);
        }
      }
    }

    /** Abre UM diálogo agora; resolve com true (OK/confirmou) ou false (cancelou/Esc). */
    function show(kind, message, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var id = 'laift-dialog-' + (++seq);
        var isConfirm = kind === 'confirm';
        var opener = doc.activeElement;
        var overlay = el('div', 'laift-dialog-overlay');
        var box = el('div', 'laift-dialog');
        var title = el('h2', 'laift-dialog-title', opts.title || (isConfirm ? 'Confirmação' : 'Aviso'));
        var body = el('p', 'laift-dialog-message', String(message === undefined || message === null ? '' : message));
        var actions = el('div', 'laift-dialog-actions');
        var cancelBtn = isConfirm ? el('button', 'laift-dialog-btn laift-dialog-btn-secondary', opts.cancelLabel || 'Cancelar') : null;
        var okBtn = el('button', 'laift-dialog-btn laift-dialog-btn-primary', opts.okLabel || (isConfirm ? 'Confirmar' : 'OK'));
        var touched = [];
        var done = false;

        title.id = id + '-title';
        body.id = id + '-msg';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', title.id);
        box.setAttribute('aria-describedby', body.id);
        okBtn.type = 'button';
        if (cancelBtn) { cancelBtn.type = 'button'; actions.appendChild(cancelBtn); }
        actions.appendChild(okBtn);
        box.appendChild(title);
        box.appendChild(body);
        box.appendChild(actions);
        overlay.appendChild(box);

        function buttons() { return cancelBtn ? [cancelBtn, okBtn] : [okBtn]; }

        function close(result) {
          if (done) return;
          done = true;
          doc.removeEventListener('keydown', onKeydown, true);
          setInertOutside(overlay, false, touched);
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          if (opener && opener !== doc.body && opener.isConnected !== false && typeof opener.focus === 'function') opener.focus();
          resolve(result);
        }

        function onKeydown(evt) {
          if (evt.key === 'Escape') { evt.preventDefault(); evt.stopPropagation(); close(false); return; }
          if (evt.key === 'Tab') {
            var items = buttons();
            var at = items.indexOf(doc.activeElement);
            if (at === -1) { evt.preventDefault(); items[evt.shiftKey ? items.length - 1 : 0].focus(); return; }
            var next = at + (evt.shiftKey ? -1 : 1);
            if (next < 0 || next >= items.length) {
              evt.preventDefault();
              items[(next + items.length) % items.length].focus();
            }
            return;
          }
          // Enter só age no botão focado e nunca por repetição de tecla (evita confirmar sem querer).
          if (evt.key === 'Enter' && (evt.repeat || buttons().indexOf(evt.target) === -1)) evt.preventDefault();
        }

        okBtn.addEventListener('click', function () { close(true); });
        if (cancelBtn) cancelBtn.addEventListener('click', function () { close(false); });
        doc.addEventListener('keydown', onKeydown, true);
        doc.body.appendChild(overlay);
        setInertOutside(overlay, true, touched);
        (cancelBtn || okBtn).focus();
      });
    }

    function enqueue(kind, message, opts) {
      if (!doc || !doc.body || typeof doc.createElement !== 'function') {
        return Promise.resolve(native(kind, message));
      }
      var run = queue.then(function () { return show(kind, message, opts); });
      queue = run.then(function () {}, function () {});
      return run.then(function (result) { return kind === 'confirm' ? result === true : undefined; });
    }

    return {
      alert: function (message, opts) { return enqueue('alert', message, opts); },
      confirm: function (message, opts) { return enqueue('confirm', message, opts); },
    };
  }

  global.LaiftDialog = create(global.document);
  global.LaiftDialog.create = create;
})(typeof window !== 'undefined' ? window : globalThis);
