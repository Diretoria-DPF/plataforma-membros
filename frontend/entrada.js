/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Tela de entrada e cadastro (index.html, #public-shell): "Mostrar senha" e foco no título ao trocar de tela.
// Contrato: docs/ux-progresso/CONTRATO.md §6.4. Roda depois de app.js (o showPublicScreen dele troca a tela; aqui só o foco).
(function (root) {
  'use strict';

  function aplicar(doc, caixa) {
    const campo = doc.getElementById(caixa.getAttribute('data-senha-visivel'));
    if (campo) campo.type = caixa.checked ? 'text' : 'password';
  }

  function esconder(doc, caixa) {
    caixa.checked = false;
    aplicar(doc, caixa);
  }

  function focarTitulo(doc, win, idTela) {
    win.scrollTo(0, 0);
    const tela = doc.getElementById(idTela);
    const titulo = tela ? tela.querySelector('h1') : null;
    if (titulo) {
      titulo.setAttribute('tabindex', '-1');
      titulo.focus({ preventScroll: true });
    }
  }

  function iniciar(doc, win) {
    const caixas = doc.querySelectorAll('input[type="checkbox"][data-senha-visivel]');
    Array.prototype.forEach.call(caixas, (caixa) => {
      caixa.addEventListener('change', () => aplicar(doc, caixa));
      const formulario = caixa.form;
      if (formulario) {
        formulario.addEventListener('submit', () => esconder(doc, caixa));
        formulario.addEventListener('reset', () => win.setTimeout(() => esconder(doc, caixa), 0));
      }
    });

    const botoes = doc.querySelectorAll('#public-shell [data-nav]');
    Array.prototype.forEach.call(botoes, (botao) => {
      botao.addEventListener('click', () => focarTitulo(doc, win, botao.getAttribute('data-nav')));
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { aplicar, esconder, focarTitulo, iniciar };
    return;
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', () => iniciar(root.document, root));
  } else {
    iniciar(root.document, root);
  }
})(typeof self !== 'undefined' ? self : this);
