/**
 * studio-ui.js — controladores globais da página do Estúdio Molecular.
 *
 * Antes eram um <script> inline no fim do index.html e dezenas de
 * onclick="..." nos botões. Agora (Fase 4) ficam aqui: os botões usam
 * data-action/data-arg, resolvidos por LaiftDom.delegateActions com uma
 * lista fechada de ações — pronto para uma CSP sem 'unsafe-inline'.
 * Carregado depois de studio.js (que define as ações em window).
 */
(function (global) {
  'use strict';

  var doc = global.document;

  global.toggleNativeFullscreen = function () {
    if (!doc.fullscreenElement) {
      doc.documentElement.requestFullscreen().catch(function (err) {
        console.warn('[Studio Fullscreen] Erro: ' + err.message);
      });
    } else if (doc.exitFullscreen) {
      doc.exitFullscreen();
    }
  };

  global.retornarAoLaboratorio = function () {
    if (global.opener) {
      global.close();
    } else if (global.parent && global.parent !== global) {
      // Origem fixa (nunca '*'): a bancada é da mesma origem.
      LaiftDom.postToParent({ acao: 'fecharModalStudio' });
    } else {
      global.location.href = '../index.html';
    }
  };

  LaiftDom.delegateActions(doc, [
    'irParaAnterior', 'irParaProximo', 'desfazerEdicao', 'refazerEdicao', 'alternarFavoritoAtual',
    'alternarModoApresentacao', 'toggleNativeFullscreen', 'carregarCompostoDoStudioNaBancada',
    'retornarAoLaboratorio', 'filtrarCategoriaStudio', 'filtrarCompostosStudio', 'setStudioModoVisual',
    'setModelo3D', 'abrirTabelaPeriodica', 'abrirPainelBioisosterismo', 'abrirSimilaridade',
    'extrairScaffoldAtual', 'abrirComparacao', 'abrirDossieChEMBL', 'toggleModoMedicao',
    'limparMedicoes3D', 'toggleAutoRotacao3D', 'resetarCamera3D', 'exportarImagemPNG',
    'exportarArquivoSDF', 'exportarCSVFiltrados', 'fecharInspectorAtomo',
    'substituirAtomoClicadoViaTabela', 'abrirModalCADD', 'fecharModalCADD', 'fecharTabelaPeriodica',
    'filtrarElementosPTable', 'fecharDossieChEMBL', 'fecharPainelBioisosterismo', 'fecharSimilaridade',
    'fecharComparacao', 'executarComparacao',
    // Ações de conteúdo gerado por studio.js (tabela periódica, bioisosterismo...)
    'executarSubstituicaoElementar', 'executarAdicaoAtomo', 'executarTransformacaoBioisosterica',
    'adicionarDerivadoAoCatalogo', 'selecionarSimilarPorId', 'removerBannerInstabilidade'
  ]);

  // Rolagem da lista virtualizada (antes onscroll="handleStudioScroll()").
  var lista = doc.getElementById('studioCompoundList');
  if (lista) {
    lista.addEventListener('scroll', function () {
      if (typeof global.handleStudioScroll === 'function') global.handleStudioScroll();
    }, { passive: true });
  }

  // Estado dos botões de filtro/estilo anunciado a leitores de tela.
  function sincronizarPressionados(seletor) {
    doc.querySelectorAll(seletor).forEach(function (b) {
      b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
    });
  }
  doc.addEventListener('click', function (evt) {
    if (!evt.target.closest) return;
    if (evt.target.closest('.category-pill, .tool-btn, .ptable-pill')) {
      setTimeout(function () { sincronizarPressionados('.category-pill, .tool-btn, .ptable-pill'); }, 0);
    }
  });
  sincronizarPressionados('.category-pill, .tool-btn, .ptable-pill');

  doc.addEventListener('fullscreenchange', function () {
    var btn = doc.getElementById('btnToggleNativeFullscreen');
    if (btn) {
      btn.title = doc.fullscreenElement ? 'Restaurar' : 'Tela Cheia';
      btn.setAttribute('aria-label', btn.title);
    }
    if (typeof global.resetarCamera3D === 'function') {
      setTimeout(global.resetarCamera3D, 150);
    }
  });

  doc.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (typeof global.desfazerEdicao === 'function') global.desfazerEdicao();
    }

    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
      e.preventDefault();
      if (typeof global.refazerEdicao === 'function') global.refazerEdicao();
    }

    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      if (typeof global.irParaAnterior === 'function') global.irParaAnterior();
    }

    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      if (typeof global.irParaProximo === 'function') global.irParaProximo();
    }

    if (e.key === 'Escape') {
      ['periodicTableModal', 'caddModal', 'chemblModal', 'bioisostereModal', 'similarityModal', 'comparisonModal'].forEach(function (id) {
        var m = doc.getElementById(id);
        if (m && m.style.display !== 'none') m.style.display = 'none';
      });
      if (doc.body.classList.contains('presentation-mode')) {
        if (typeof global.alternarModoApresentacao === 'function') global.alternarModoApresentacao();
      }
    }

    if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (typeof global.alternarModoApresentacao === 'function') global.alternarModoApresentacao();
    }
  });

  global.addEventListener('load', function () {
    var input = doc.getElementById('studioSearchInput');
    if (input) input.focus();
  });
})(window);
