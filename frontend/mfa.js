/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Verificação em duas etapas (TOTP) na interface: segundo passo do login e o
// cartão "Verificação em duas etapas" do perfil (ativar com QR, códigos de
// recuperação, gerar novos, desativar). As funções puras são testadas em Node;
// o DOM é montado só com createElement/textContent. A chave de cadastro e os
// códigos de recuperação vêm da API, ficam apenas na tela e nunca são guardados
// no navegador. Expõe window.LaiftMfa.
(function (root) {
  'use strict';

  var QR_LIB_SRC = 'vendor/qrcode-generator.js';
  var qrLibPromise = null;

  /** "JBSW Y3DP EHPK 3PXP" — agrupa de 4 em 4 para digitar sem erro. */
  function groupSecret(secret) {
    return String(secret || '').replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
  }

  /** Seis dígitos viram só dígitos; qualquer outra coisa é tratada como código de recuperação. */
  function normalizeLoginCode(text) {
    var raw = String(text || '').trim();
    var digits = raw.replace(/\s/g, '');
    if (/^\d{6}$/.test(digits)) return digits;
    return raw.replace(/\s/g, '').toUpperCase();
  }

  function recoveryCodesText(codes) {
    return 'LAIFT — códigos de recuperação da verificação em duas etapas\n' +
      'Cada código vale uma única vez. Guarde em local seguro.\n\n' + (codes || []).join('\n') + '\n';
  }

  function element(doc, tag, className, text) {
    var node = doc.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function button(doc, label, kind, onClick) {
    var b = element(doc, 'button', kind || '', label);
    b.setAttribute('type', 'button');
    b.style.width = 'auto';
    b.addEventListener('click', onClick);
    return b;
  }

  function field(doc, id, label, attrs) {
    var wrap = element(doc, 'label');
    wrap.setAttribute('for', id);
    wrap.appendChild(doc.createTextNode(label));
    var input = doc.createElement('input');
    input.id = id;
    Object.keys(attrs || {}).forEach(function (k) { input.setAttribute(k, attrs[k]); });
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function loadQrLib(doc) {
    if (root.qrcode) return Promise.resolve(root.qrcode);
    if (!qrLibPromise) {
      qrLibPromise = new Promise(function (resolve, reject) {
        var s = doc.createElement('script');
        s.src = QR_LIB_SRC;
        s.onload = function () { resolve(root.qrcode); };
        s.onerror = function () { qrLibPromise = null; reject(new Error('qr')); };
        doc.head.appendChild(s);
      });
    }
    return qrLibPromise;
  }

  function qrDataUrl(qrcode, text) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    var qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(6, 4);
  }

  // ---------------------------------------------------------------------------
  // Segundo passo do login
  // ---------------------------------------------------------------------------
  function startLoginStep(app, doc, mfaToken) {
    var loginForm = doc.getElementById('form-login');
    var form = doc.getElementById('form-login-mfa');
    var input = doc.getElementById('login-mfa-code');
    var back = doc.getElementById('btn-login-mfa-back');
    if (!form || !input) return;

    function leave() {
      input.value = '';
      form.classList.add('hidden');
      loginForm.classList.remove('hidden');
      form.onsubmit = null;
      back.onclick = null;
    }
    loginForm.classList.add('hidden');
    form.classList.remove('hidden');
    app.setStatus('msg-login', '', null);
    input.focus();

    form.onsubmit = function (evt) {
      evt.preventDefault();
      var code = normalizeLoginCode(input.value);
      if (!code) return;
      app.setStatus('msg-login', 'Verificando...', 'info');
      app.callApi('apiLoginMfa', mfaToken, code).then(function (res) {
        if (!res.success) { app.setStatus('msg-login', res.message, 'error'); input.select(); return; }
        leave();
        app.finishLogin(res);
      });
    };
    back.onclick = function () { leave(); app.setStatus('msg-login', '', null); };
  }

  // ---------------------------------------------------------------------------
  // Cartão do perfil
  // ---------------------------------------------------------------------------
  function load(app, doc) {
    var host = doc.getElementById('mfa-card-body');
    if (!host) return Promise.resolve();
    host.textContent = '';
    return app.callApi('apiMfaStatus', app.getState().sessionToken || '').then(function (res) {
      if (!res.success) { app.setStatus('msg-mfa', res.message, 'error'); return; }
      app.setStatus('msg-mfa', '', null);
      if (res.enabled) renderEnabled(app, doc, host, res);
      else renderDisabled(app, doc, host, res);
    });
  }

  function renderDisabled(app, doc, host, status) {
    if (status.required) {
      host.appendChild(element(doc, 'p', 'state-error-text', 'A verificação em duas etapas é obrigatória para administradores. Ative para continuar usando a administração.'));
    } else {
      host.appendChild(element(doc, 'p', 'muted', 'Proteja sua conta: além da senha, o login pede um código do aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy…).'));
    }
    host.appendChild(button(doc, 'Ativar verificação em duas etapas', '', function () { beginEnrollment(app, doc, host); }));
  }

  function beginEnrollment(app, doc, host) {
    app.setStatus('msg-mfa', 'Preparando...', 'info');
    app.callApi('apiMfaBeginEnrollment', app.getState().sessionToken || '').then(function (res) {
      if (!res.success) { app.setStatus('msg-mfa', res.message, 'error'); return; }
      app.setStatus('msg-mfa', '', null);
      host.textContent = '';
      host.appendChild(element(doc, 'p', '', '1. No aplicativo autenticador, escaneie o QR Code ou digite a chave abaixo.'));

      var img = doc.createElement('img');
      img.alt = 'QR Code para o aplicativo autenticador';
      img.width = 168;
      img.height = 168;
      host.appendChild(img);
      loadQrLib(doc).then(function (qrcode) { img.src = qrDataUrl(qrcode, res.otpauthUri); }).catch(function () { img.remove(); });

      host.appendChild(element(doc, 'p', 'muted', 'Chave (se não puder escanear):'));
      var secret = element(doc, 'code', 'mfa-secret', groupSecret(res.secret));
      host.appendChild(secret);

      host.appendChild(element(doc, 'p', '', '2. Digite o código de 6 dígitos que o aplicativo mostra.'));
      var f = field(doc, 'mfa-confirm-code', 'Código', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8', required: 'required' });
      host.appendChild(f.wrap);
      host.appendChild(button(doc, 'Confirmar e ativar', '', function () {
        var code = normalizeLoginCode(f.input.value);
        if (!code) return;
        app.setStatus('msg-mfa', 'Confirmando...', 'info');
        app.callApi('apiMfaConfirmEnrollment', app.getState().sessionToken || '', code).then(function (r) {
          if (!r.success) { app.setStatus('msg-mfa', r.message, 'error'); return; }
          app.setStatus('msg-mfa', r.message, 'success');
          showRecoveryCodes(app, doc, host, r.recoveryCodes);
        });
      }));
    });
  }

  function showRecoveryCodes(app, doc, host, codes) {
    host.textContent = '';
    host.appendChild(element(doc, 'h4', '', 'Códigos de recuperação'));
    host.appendChild(element(doc, 'p', 'muted', 'Se você perder o celular, cada código abaixo permite entrar uma vez. Eles não serão mostrados de novo.'));
    var list = element(doc, 'ul', 'mfa-codes');
    (codes || []).forEach(function (c) { list.appendChild(element(doc, 'li', '', c)); });
    host.appendChild(list);

    var row = element(doc, 'div', 'mfa-actions');
    row.appendChild(button(doc, 'Copiar', 'secondary', function () {
      var text = recoveryCodesText(codes);
      if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(text).then(function () { app.setStatus('msg-mfa', 'Códigos copiados.', 'success'); });
    }));
    row.appendChild(button(doc, 'Baixar .txt', 'secondary', function () {
      var url = root.URL.createObjectURL(new root.Blob([recoveryCodesText(codes)], { type: 'text/plain' }));
      var a = doc.createElement('a');
      a.href = url;
      a.download = 'laift-codigos-de-recuperacao.txt';
      doc.body.appendChild(a);
      a.click();
      a.remove();
      root.URL.revokeObjectURL(url);
    }));
    host.appendChild(row);

    var saved = doc.createElement('input');
    saved.type = 'checkbox';
    saved.id = 'mfa-codes-saved';
    var label = element(doc, 'label', 'checkbox-row');
    label.setAttribute('for', 'mfa-codes-saved');
    label.appendChild(saved);
    label.appendChild(element(doc, 'span', '', 'Guardei os códigos em local seguro.'));
    host.appendChild(label);
    var done = button(doc, 'Concluir', '', function () { load(app, doc); });
    done.disabled = true;
    saved.addEventListener('change', function () { done.disabled = !saved.checked; });
    host.appendChild(done);
  }

  function renderEnabled(app, doc, host, status) {
    var head = element(doc, 'p', '');
    head.appendChild(element(doc, 'span', 'badge', 'Ativa'));
    head.appendChild(doc.createTextNode(' Códigos de recuperação restantes: ' + status.recoveryCodesLeft + '.'));
    host.appendChild(head);

    var regenerate = field(doc, 'mfa-regen-code', 'Código atual (para gerar novos códigos de recuperação)', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8' });
    host.appendChild(regenerate.wrap);
    host.appendChild(button(doc, 'Gerar novos códigos', 'secondary', function () {
      var code = normalizeLoginCode(regenerate.input.value);
      if (!code) return;
      app.callApi('apiMfaRegenerateRecoveryCodes', app.getState().sessionToken || '', { code: code }).then(function (r) {
        if (!r.success) { app.setStatus('msg-mfa', r.message, 'error'); return; }
        app.setStatus('msg-mfa', r.message, 'success');
        showRecoveryCodes(app, doc, host, r.recoveryCodes);
      });
    }));

    if (status.required) return;
    host.appendChild(element(doc, 'h4', '', 'Desativar'));
    var pwd = field(doc, 'mfa-off-password', 'Senha', { type: 'password', autocomplete: 'current-password' });
    var code = field(doc, 'mfa-off-code', 'Código atual', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '8' });
    host.appendChild(pwd.wrap);
    host.appendChild(code.wrap);
    host.appendChild(button(doc, 'Desativar verificação em duas etapas', 'secondary', function () {
      app.callApi('apiMfaDisable', app.getState().sessionToken || '', { password: pwd.input.value, code: normalizeLoginCode(code.input.value) }).then(function (r) {
        app.setStatus('msg-mfa', r.message, r.success ? 'success' : 'error');
        if (r.success) load(app, doc);
      });
    }));
  }

  var api = {
    groupSecret: groupSecret,
    normalizeLoginCode: normalizeLoginCode,
    recoveryCodesText: recoveryCodesText,
    startLoginStep: function (app, mfaToken) { startLoginStep(app, root.document, mfaToken); },
    load: function (app) { return load(app, root.document); },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LaiftMfa = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
