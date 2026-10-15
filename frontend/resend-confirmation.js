/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// "Reenviar e-mail de confirmação" (SEC-02) na tela de entrada e, depois de um cadastro, na tela de cadastro.
// Chama apiResendConfirmation({ email }); a resposta do servidor é a mesma exista ou não a conta, e a mensagem
// mostrada é sempre a dele. Durante o intervalo mínimo o botão fica desabilitado com a contagem.
// Só createElement/textContent: nenhum HTML montado a partir de texto. Roda depois de app.js (usa window.App.callApi).
(function (root) {
  'use strict';

  const COOLDOWN_PADRAO_S = 120;
  const ROTULO = 'Reenviar e-mail de confirmação';

  /** "Reenviar em 1:05" durante a contagem; o rótulo normal quando acabou. */
  function rotuloDoBotao(restante) {
    if (!(restante > 0)) return ROTULO;
    const min = Math.floor(restante / 60);
    const seg = String(restante % 60).padStart(2, '0');
    return 'Reenviar em ' + min + ':' + seg;
  }

  /** Segundos de espera depois de uma resposta: o que o servidor mandou, ou o padrão. */
  function esperaDe(res) {
    const s = res && Number(res.cooldownSeconds);
    return Number.isInteger(s) && s > 0 && s <= 3600 ? s : COOLDOWN_PADRAO_S;
  }

  /** Contagem regressiva de 1 em 1 s. `timers` permite testar sem relógio real. Devolve a função de parar. */
  function contar(segundos, aoTick, aoFim, timers) {
    let restante = segundos;
    aoTick(restante);
    const id = timers.setInterval(() => {
      restante -= 1;
      if (restante > 0) { aoTick(restante); return; }
      timers.clearInterval(id);
      aoFim();
    }, 1000);
    return () => timers.clearInterval(id);
  }

  function el(doc, tag, attrs, texto) {
    const node = doc.createElement(tag);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    if (texto) node.textContent = texto;
    return node;
  }

  /** Monta o bloco (fechado atrás de um botão "Não recebeu...?") logo depois de `ancora`. */
  function montarBloco(doc, ancora, prefixo) {
    const bloco = el(doc, 'div', { class: 'reenvio-confirmacao', 'data-reenvio': prefixo });
    const abrir = el(doc, 'button', { type: 'button', class: 'link-btn reenvio-confirmacao__abrir', 'aria-expanded': 'false', 'aria-controls': prefixo + '-form' },
      'Não recebeu o e-mail de confirmação?');
    const form = el(doc, 'form', { id: prefixo + '-form', class: 'hidden', novalidate: '' });
    const rotulo = el(doc, 'label', { for: prefixo + '-email' }, 'E-mail do cadastro');
    const campo = el(doc, 'input', { type: 'email', id: prefixo + '-email', autocomplete: 'email', required: '' });
    rotulo.appendChild(campo);
    const botao = el(doc, 'button', { type: 'submit', class: 'secondary' }, ROTULO);
    const status = el(doc, 'div', { id: prefixo + '-msg', class: 'status-msg', role: 'status', 'aria-live': 'polite' });
    form.appendChild(rotulo);
    form.appendChild(botao);
    bloco.appendChild(abrir);
    bloco.appendChild(form);
    bloco.appendChild(status);
    ancora.insertAdjacentElement('afterend', bloco);
    abrir.addEventListener('click', () => {
      const aberto = form.classList.toggle('hidden') === false;
      abrir.setAttribute('aria-expanded', aberto ? 'true' : 'false');
      if (aberto) campo.focus();
    });
    return { bloco, abrir, form, campo, botao, status };
  }

  function mostrar(status, mensagem, tipo) {
    status.textContent = mensagem || '';
    if (tipo) status.setAttribute('data-kind', tipo);
    else status.removeAttribute('data-kind');
  }

  /** Liga o envio: uma contagem compartilhada entre os blocos (o servidor conta por e-mail, não por tela). */
  function ligar(win, blocos) {
    let parar = null;
    const ajustar = (restante) => blocos.forEach((b) => {
      b.botao.disabled = restante > 0;
      b.botao.textContent = rotuloDoBotao(restante);
    });
    const iniciarEspera = (segundos) => {
      if (parar) parar();
      parar = contar(segundos, ajustar, () => { parar = null; ajustar(0); }, win);
    };
    blocos.forEach((b) => {
      b.form.addEventListener('submit', (evt) => {
        evt.preventDefault();
        const app = win.App;
        const email = String(b.campo.value || '').trim();
        if (!email) { mostrar(b.status, 'Informe o e-mail usado no cadastro.', 'error'); return; }
        if (!app || typeof app.callApi !== 'function') { mostrar(b.status, 'Recarregue a página e tente de novo.', 'error'); return; }
        b.botao.disabled = true;
        mostrar(b.status, 'Enviando...', 'info');
        app.callApi('apiResendConfirmation', { email }).then((res) => {
          const ok = !!(res && res.success);
          mostrar(b.status, res && res.message, ok ? 'success' : 'error');
          if (ok) iniciarEspera(esperaDe(res));
          else if (!parar) ajustar(0);
        });
      });
    });
  }

  function iniciar(doc, win) {
    const msgLogin = doc.getElementById('msg-login');
    const msgCadastro = doc.getElementById('msg-register');
    const formCadastro = doc.getElementById('form-register');
    const blocos = [];
    if (msgLogin) blocos.push(montarBloco(doc, msgLogin, 'resend-login'));
    if (msgCadastro && formCadastro) {
      const pos = montarBloco(doc, msgCadastro, 'resend-register');
      pos.bloco.classList.add('hidden');
      let ultimoEmail = '';
      // Fase de captura: lê o e-mail antes de o app.js limpar o formulário no sucesso.
      formCadastro.addEventListener('submit', () => {
        const campo = doc.getElementById('reg-email');
        ultimoEmail = campo ? String(campo.value || '').trim() : '';
      }, true);
      const Observer = win.MutationObserver;
      if (Observer) {
        new Observer(() => {
          if (msgCadastro.getAttribute('data-kind') !== 'success') return;
          pos.campo.value = ultimoEmail;
          pos.bloco.classList.remove('hidden');
        }).observe(msgCadastro, { attributes: true, attributeFilter: ['data-kind'] });
      }
      blocos.push(pos);
    }
    if (blocos.length) ligar(win, blocos);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { rotuloDoBotao, esperaDe, contar, iniciar, COOLDOWN_PADRAO_S, ROTULO };
    return;
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', () => iniciar(root.document, root));
  } else {
    iniciar(root.document, root);
  }
})(typeof self !== 'undefined' ? self : this);
