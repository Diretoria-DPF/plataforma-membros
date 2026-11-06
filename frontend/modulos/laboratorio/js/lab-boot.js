/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-boot.js — primeiro script da bancada (defer, ~1 KB).
 * Em rede lenta o script principal chega depois da página: até lá, a barra inferior já troca de visão
 * (Bancada, Reagentes, Análise) e mostra o esqueleto com progresso, em vez de ficar sem resposta.
 * Quando o script principal define window.setMobileView, este ouvinte se remove e a delegação normal assume.
 */
(function () {
  'use strict';
  var VISOES = { bancada: 1, reagentes: 1, analise: 1 };
  function aoTocar(ev) {
    if (typeof window.setMobileView === 'function') { document.removeEventListener('click', aoTocar); return; }
    var botao = ev.target && ev.target.closest ? ev.target.closest('.m-nav-btn[data-target]') : null;
    var alvo = botao && botao.getAttribute('data-target');
    var grade = document.getElementById('mainGrid');
    if (!alvo || !VISOES[alvo] || !grade) return;
    grade.setAttribute('data-mobile-view', alvo);
    var botoes = document.querySelectorAll('.m-nav-btn');
    for (var i = 0; i < botoes.length; i++) botoes[i].classList.toggle('active', botoes[i] === botao);
  }
  document.addEventListener('click', aoTocar);
})();
