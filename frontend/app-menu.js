/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Menu (hambúrguer) do app logado. A barra inferior fica com Início, Aprender, Eventos e Perfil; Propostas, Tarefas,
// Mensagens e Equipe moram neste painel. O botão mostra um aviso com o total de coisas em aberto (votação, tarefas,
// mensagens e solicitações), lido dos mesmos contadores que o app.js já mantém (nav-badge-*), e cada item diz o que
// está esperando. Só leitura de DOM e classes: nada de innerHTML e nada de estilo inline (a CSP não permite).
(function (root) {
  'use strict';

  var BADGE_IDS = {
    voting: 'nav-badge-voting',
    tasks: 'nav-badge-tasks',
    messages: 'nav-badge-messages',
    connections: 'nav-badge-connections',
  };

  var INFO = {
    voting: { um: 'Votação aberta', varios: 'Votação aberta' },
    tasks: { um: '1 tarefa em aberto', varios: ' tarefas em aberto' },
    messages: { um: '1 mensagem não lida', varios: ' mensagens não lidas' },
    connections: { um: '1 solicitação de conexão', varios: ' solicitações de conexão' },
  };

  var MAX_NO_AVISO = 9;

  /** Quanto cada contador vale: a votação é só presença (vale 1); os outros, o número mostrado. */
  function contagem(kind, visivel, texto) {
    if (!visivel) return 0;
    if (kind === 'voting') return 1;
    var n = parseInt(texto, 10);
    return n > 0 ? n : 0;
  }

  function totalPendencias(contagens) {
    var total = 0;
    Object.keys(BADGE_IDS).forEach(function (kind) { total += Math.max(0, Math.floor(Number(contagens[kind])) || 0); });
    return total;
  }

  /** Texto curto do aviso no botão: vazio sem pendência, "9+" acima de nove. */
  function rotuloTotal(total) {
    if (total <= 0) return '';
    return total > MAX_NO_AVISO ? MAX_NO_AVISO + '+' : String(total);
  }

  /** Nome acessível do botão, com o total por extenso. */
  function nomeDoBotao(total) {
    if (total <= 0) return 'Menu';
    return 'Menu, ' + total + (total === 1 ? ' pendência' : ' pendências');
  }

  /** Linha de apoio de cada item do menu ("2 tarefas em aberto"); vazia quando não há nada esperando. */
  function textoDoItem(kind, n) {
    var count = Math.floor(Number(n)) || 0;
    if (count <= 0 || !Object.prototype.hasOwnProperty.call(INFO, kind)) return '';
    if (kind === 'voting') return INFO.voting.um;
    return count === 1 ? INFO[kind].um : count + INFO[kind].varios;
  }

  function lerContagens(doc) {
    var out = {};
    Object.keys(BADGE_IDS).forEach(function (kind) {
      var badge = doc.getElementById(BADGE_IDS[kind]);
      out[kind] = badge ? contagem(kind, !badge.classList.contains('hidden'), badge.textContent) : 0;
    });
    return out;
  }

  function atualizar(doc) {
    var contagens = lerContagens(doc);
    var total = totalPendencias(contagens);
    var botao = doc.getElementById('app-menu-btn');
    var aviso = doc.getElementById('app-menu-badge');
    if (aviso) {
      aviso.textContent = rotuloTotal(total);
      aviso.classList.toggle('hidden', total <= 0);
    }
    if (botao) botao.setAttribute('aria-label', nomeDoBotao(total));
    Object.keys(contagens).forEach(function (kind) {
      var info = doc.getElementById('app-menu-info-' + kind);
      if (info) info.textContent = textoDoItem(kind, contagens[kind]);
    });
    // Um grupo sem nenhum item visível para o papel (ex.: visitante em "Comunicação") some inteiro.
    Array.prototype.forEach.call(doc.querySelectorAll('#app-menu [data-grupo]'), function (grupo) {
      var algum = Array.prototype.some.call(grupo.querySelectorAll('[data-panel]'), function (b) { return !b.classList.contains('hidden'); });
      grupo.classList.toggle('hidden', !algum);
    });
    // No modo admin a barra de baixo é a da administração: o menu do membro não se aplica.
    var admin = doc.getElementById('nav-group-admin');
    if (botao && admin) botao.classList.toggle('hidden', !admin.classList.contains('hidden'));
  }

  function abrir(doc) {
    var dialogo = doc.getElementById('app-menu');
    var botao = doc.getElementById('app-menu-btn');
    if (!dialogo || dialogo.open) return;
    atualizar(doc);
    if (typeof dialogo.showModal === 'function') dialogo.showModal();
    else dialogo.setAttribute('open', '');
    if (botao) botao.setAttribute('aria-expanded', 'true');
  }

  function fechar(doc) {
    var dialogo = doc.getElementById('app-menu');
    if (!dialogo || !dialogo.open) return;
    if (typeof dialogo.close === 'function') dialogo.close();
    else dialogo.removeAttribute('open');
  }

  function iniciar(doc, win) {
    var dialogo = doc.getElementById('app-menu');
    var botao = doc.getElementById('app-menu-btn');
    if (!dialogo || !botao) return;

    botao.addEventListener('click', function () { abrir(doc); });
    var fecharBtn = doc.getElementById('app-menu-fechar');
    if (fecharBtn) fecharBtn.addEventListener('click', function () { fechar(doc); });
    // Toque fora do painel (no fundo escurecido) fecha; dentro, não.
    dialogo.addEventListener('click', function (evento) { if (evento.target === dialogo) fechar(doc); });
    dialogo.addEventListener('close', function () { botao.setAttribute('aria-expanded', 'false'); });
    // Escolher um item leva ao painel (app.js) e fecha o menu.
    Array.prototype.forEach.call(dialogo.querySelectorAll('[data-panel]'), function (item) {
      item.addEventListener('click', function () { fechar(doc); });
    });

    atualizar(doc);
    if (win.MutationObserver) {
      var observador = new win.MutationObserver(function () { atualizar(doc); });
      var opcoes = { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true };
      Object.keys(BADGE_IDS).forEach(function (kind) {
        var badge = doc.getElementById(BADGE_IDS[kind]);
        if (badge) observador.observe(badge, opcoes);
      });
      Array.prototype.forEach.call(dialogo.querySelectorAll('[data-panel]'), function (item) {
        observador.observe(item, { attributes: true, attributeFilter: ['class'] });
      });
      var admin = doc.getElementById('nav-group-admin');
      if (admin) observador.observe(admin, { attributes: true, attributeFilter: ['class'] });
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      BADGE_IDS: BADGE_IDS, contagem: contagem, totalPendencias: totalPendencias, rotuloTotal: rotuloTotal,
      nomeDoBotao: nomeDoBotao, textoDoItem: textoDoItem, lerContagens: lerContagens, atualizar: atualizar,
      abrir: abrir, fechar: fechar, iniciar: iniciar,
    };
    return;
  }

  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', function () { iniciar(root.document, root); });
  } else {
    iniciar(root.document, root);
  }
})(typeof self !== 'undefined' ? self : this);
