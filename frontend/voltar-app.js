/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Botão "Voltar" no topo de cada painel do app (exceto Início). Guarda uma
// pilha dos painéis visitados, separada por escopo (membro ou admin).
(function () {
  'use strict';

  var PAINEL_INICIO = 'panel-home';
  var PAINEL_DASHBOARD_ADMIN = 'panel-admin-dashboard';
  var PAINEL_APRENDER = 'panel-learn';
  var PREFIXO_ADMIN = 'panel-admin-';
  var LIMITE_PILHA = 20;
  var ROTULO_INICIO = 'Início';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  /** 'admin' se o id do painel começa com "panel-admin-", senão 'membro'. */
  function escopoDe(painel) {
    return typeof painel === 'string' && painel.indexOf(PREFIXO_ADMIN) === 0 ? 'admin' : 'membro';
  }

  /**
   * Pilha nova com o painel no fim. Não altera a pilha recebida.
   * Painel repetido não entra de novo. Troca de escopo ou Início zera a pilha.
   */
  function registrar(pilha, painel) {
    var copia = pilha.slice();
    var ultimo = copia[copia.length - 1];
    if (painel === PAINEL_INICIO || ultimo === undefined || escopoDe(ultimo) !== escopoDe(painel)) {
      return [painel];
    }
    if (ultimo === painel) return copia;
    return copia.concat([painel]).slice(-LIMITE_PILHA);
  }

  /** Para onde o Voltar leva. O último item da pilha é o painel atual. */
  function destinoDoVoltar(pilha) {
    var atual = pilha[pilha.length - 1];
    var anterior = pilha[pilha.length - 2];
    if (anterior !== undefined) return { painel: anterior };
    if (atual === PAINEL_DASHBOARD_ADMIN) return { sairDoAdmin: true };
    return { painel: escopoDe(atual) === 'admin' ? PAINEL_DASHBOARD_ADMIN : PAINEL_INICIO };
  }

  // ---------------------------------------------------------------------------
  // Parte de DOM (só no navegador)
  // ---------------------------------------------------------------------------
  var pilha = [];
  var botoes = [];
  var botaoAprender = null;

  /** Nome do painel de destino, lido do próprio item de navegação. */
  function nomeDoPainel(painel) {
    var itens = document.querySelectorAll('#app-nav [data-panel]');
    var item = Array.prototype.find.call(itens, function (el) {
      return el.getAttribute('data-panel') === painel;
    });
    var rotulo = item ? item.querySelector('span') : null;
    var texto = rotulo ? rotulo.textContent.trim() : '';
    return texto || ROTULO_INICIO;
  }

  function atualizarRotulos() {
    var destino = destinoDoVoltar(pilha);
    var nome = destino.sairDoAdmin ? ROTULO_INICIO : nomeDoPainel(destino.painel);
    botoes.forEach(function (botao) {
      botao.setAttribute('aria-label', 'Voltar para ' + nome);
    });
  }

  function criarIcone() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'app-voltar__icone');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var caminho = document.createElementNS(SVG_NS, 'path');
    caminho.setAttribute('d', 'M15 18l-6-6 6-6');
    svg.appendChild(caminho);
    return svg;
  }

  function voltar() {
    var destino = destinoDoVoltar(pilha);
    if (destino.sairDoAdmin) {
      var sair = document.getElementById('btn-exit-admin-mode');
      if (sair) sair.click();
      return;
    }
    // O painel atual sai da pilha; o destino vira o topo, sem empilhar de novo.
    pilha = pilha.slice(0, -1);
    if (window.App && typeof window.App.showPanel === 'function') {
      window.App.showPanel(destino.painel);
      focarPainel(destino.painel, document);
    }
  }

  /**
   * Leva o foco ao Voltar do painel de destino, que acabou de aparecer (o
   * botão de origem sumiu). Sem Voltar (Início), foca o primeiro título.
   */
  function focarPainel(painel, doc) {
    var secao = doc.getElementById(painel);
    if (!secao) return;
    var botao = secao.querySelector('.app-voltar');
    var alvo = botao || secao.querySelector('h1, h2');
    if (!alvo) return;
    if (!botao) alvo.setAttribute('tabindex', '-1');
    alvo.focus({ preventScroll: true });
  }

  function criarBotao() {
    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'app-voltar';
    botao.setAttribute('data-voltar-app', '');
    botao.setAttribute('aria-label', 'Voltar para ' + ROTULO_INICIO);
    botao.appendChild(criarIcone());
    var texto = document.createElement('span');
    texto.textContent = 'Voltar';
    botao.appendChild(texto);
    botao.addEventListener('click', voltar);
    return botao;
  }

  function inserirBotoes() {
    var secoes = document.querySelectorAll('#app-root .app-main > section');
    Array.prototype.forEach.call(secoes, function (secao) {
      if (secao.id === PAINEL_INICIO) return;
      var primeiro = secao.firstElementChild;
      if (primeiro && primeiro.classList.contains('app-voltar')) return;
      var botao = criarBotao();
      secao.insertBefore(botao, secao.firstChild);
      botoes.push(botao);
      if (secao.id === PAINEL_APRENDER) botaoAprender = botao;
    });
    atualizarRotulos();
  }

  function aoTrocarPainel(evt) {
    var painel = evt.detail && evt.detail.panel;
    if (!painel) return;
    pilha = registrar(pilha, painel);
    atualizarRotulos();
  }

  // Em Aprender, o módulo aberto tem o próprio "← Voltar" (#learn-back).
  function aoTrocarModulo(evt) {
    var modulo = evt.detail && evt.detail.module;
    if (botaoAprender) botaoAprender.hidden = Boolean(modulo);
  }

  function iniciar() {
    inserirBotoes();
    document.addEventListener('laift:panelchange', aoTrocarPainel);
    document.addEventListener('laift:modulechange', aoTrocarModulo);
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { escopoDe: escopoDe, registrar: registrar, destinoDoVoltar: destinoDoVoltar, focarPainel: focarPainel };
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
