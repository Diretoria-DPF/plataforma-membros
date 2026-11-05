/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// "Para hoje" unificado (A3): UMA definição dos itens do dia, usada pelo Aprender v2 (learn-v2.js) e pela Início v3
// (home-v3.js). Primeiro vem a revisão dos erros que vencem hoje (revisao-espacada.js, guardada no aparelho), depois o
// quiz do dia; cada tela acrescenta o que é dela (simulado e caso clínico no Aprender; evento e votação na Início).
// Só funções puras: sem DOM, sem rede, sem armazenamento. Expõe window.LaiftParaHoje; em Node, module.exports.
(function (root) {
  'use strict';

  /** Máximo de itens da lista (a revisão e o quiz sempre entram antes dos extras). */
  var MAX_ITEMS = 4;

  function plural(n, one, many) { return n === 1 ? one : many; }

  /** Item "Revisar N erros": só quando algo venceu. `module` é o id do catálogo do módulo com mais erros vencidos. */
  function reviewItem(review) {
    var due = review && review.due > 0 ? review.due : 0;
    if (!due || !review.next) return null;
    var breakdown = review.modules ? review.modules.filter(function (m) { return m.due > 0; })
      .map(function (m) { return m.name + ' ' + m.due; }).join(' · ') : '';
    return {
      kind: 'review', icon: 'clock', module: review.next,
      title: 'Revisar ' + due + ' ' + plural(due, 'erro', 'erros'),
      sub: breakdown || 'Reveja o que errou antes de esquecer',
    };
  }

  /** Item "Quiz do dia": só com dados de engajamento do servidor. */
  function quizItem(eng) {
    if (!eng) return null;
    return {
      kind: 'quiz', icon: 'star', title: 'Quiz do dia',
      sub: eng.dailyQuizDone ? 'Feito hoje. Toque para rever' : '5 questões · cerca de 3 min',
    };
  }

  /**
   * Lista do dia. `extras` são os itens próprios da tela (já prontos). Revisão e quiz do dia vêm primeiro; o total
   * respeita MAX_ITEMS (os extras que sobrarem ficam de fora, o mais importante primeiro).
   */
  function build(eng, review, extras) {
    var items = [reviewItem(review), quizItem(eng)].concat(Array.isArray(extras) ? extras : [])
      .filter(function (item) { return !!item; });
    return items.slice(0, MAX_ITEMS);
  }

  var api = { MAX_ITEMS: MAX_ITEMS, reviewItem: reviewItem, quizItem: quizItem, build: build };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftParaHoje = api;
})(typeof window !== 'undefined' ? window : globalThis);
