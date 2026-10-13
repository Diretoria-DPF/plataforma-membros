/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Lia: sugestões de abertura por CONTEXTO (extraído de assistant.js, que tem teto de linhas).
//   - sem sessão (tela de entrada): dúvidas gerais sobre a plataforma como um todo;
//   - logado: 3 a 4 perguntas coerentes com a tela aberta (id do painel); admin ganha as da gestão nas telas Admin.
// Cada pergunta foi escolhida por ter RESPOSTA BOA na base da Lia (regra ou acervo): o teste
// worker/test/liaSugestoes.test.js confere isso, e a lista do visitante é IGUAL à do servidor
// (worker/src/assistant/kb.js, VISITOR_SUGGESTIONS), que a devolve depois das respostas a quem não tem login.
// São só textos: o clique envia a pergunta como se a pessoa a tivesse digitado. Expõe window.LaiftAssistantSuggestions.
(function (root) {
  'use strict';

  var VISITOR = ['O que é a LAIFT?', 'O que é o blog da LAIFT?', 'O que posso fazer na plataforma?', 'Como crio minha conta?'];
  var HOME = ['O que posso fazer na plataforma?', 'Quais eventos estão abertos?', 'Quais módulos de estudo existem?', 'Meu crachá'];
  var ADMIN = ['Como abro a área de administração?', 'Como crio um evento?', 'Como aprovo uma proposta?', 'Como funciona o painel de IA?'];

  var BY_PANEL = {
    'panel-home': HOME,
    'panel-events': ['Quais eventos estão abertos?', 'Como me inscrevo em um evento?', 'Como cancelo minha inscrição?', 'Meu crachá'],
    'panel-learn': ['O que posso estudar aqui?', 'Como funciona o laboratório?', 'O que é farmacocinética?', 'Qual a diferença entre farmacologia e toxicologia?'],
    'panel-library': ['Como busco artigos?', 'Como sugiro um artigo?', 'Como salvo um artigo nos favoritos?', 'O que é a Biblioteca LAIFT?'],
    'panel-messages': ['Como mando mensagem para outro membro?', 'As mensagens são seguras?'],
    'panel-profile': ['Como ativo a verificação em duas etapas?', 'Como troco minha foto de perfil?', 'Quem vê meus dados?'],
    'panel-proposals': ['Como voto em uma proposta?', 'Como funcionam as propostas?'],
    'panel-tasks': ['Onde vejo as tarefas?', 'Como funcionam as tarefas?'],
    'panel-orgchart': ['Onde vejo a equipe da liga?', 'Como envio um pedido de amizade?', 'Como denuncio alguém?'],
    'panel-admin-library': ['Como publico um artigo na Biblioteca?', 'Como faço a curadoria da Biblioteca?'],
    'panel-admin-events': ['Como crio um evento?', 'Como funciona o terminal fiscal?'],
    'panel-admin-ai': ['Como funciona o painel de IA?', 'Como funciona a moderação da Lia?'],
  };

  /** Cópia das sugestões da tela. Sem sessão: as do visitante. Tela Admin sem lista própria: as de gestão. */
  function suggestionsFor(hasSession, panelId) {
    if (!hasSession) return VISITOR.slice();
    var id = typeof panelId === 'string' ? panelId : '';
    if (Object.prototype.hasOwnProperty.call(BY_PANEL, id)) return BY_PANEL[id].slice();
    return (id.indexOf('panel-admin') === 0 ? ADMIN : HOME).slice();
  }

  var api = { VISITOR: VISITOR, HOME: HOME, ADMIN: ADMIN, BY_PANEL: BY_PANEL, suggestionsFor: suggestionsFor };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LaiftAssistantSuggestions = api;
})(typeof window !== 'undefined' ? window : globalThis);
