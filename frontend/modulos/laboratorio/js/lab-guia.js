/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * lab-guia.js — regras puras da "Ajuda no processo" do Laboratório (O1), sem DOM.
 *
 * - Três níveis: Completa ("!" pulsante sobre o controle correto + balão), Só dica (só o balão) e Prova (nada).
 * - Preferência guardada no aparelho (localStorage, sempre com try/catch).
 * - Roteiro = lista de passos; cada passo diz qual controle usar (`alvo`), o que fazer (`texto`), a dica da Guia
 *   (`dica`), o porquê técnico do Preceptor (`porque`) e quando está feito (`feito(estado)`). O passo avança por
 *   evento: quem age é a pessoa; o sistema só aponta.
 * - `estado` é um retrato da bancada: { selecionado, qtd, adicionado: {id: quantidade}, agitador, modoTermico, tempAlvo }.
 * Carregado antes de script.js (window.LabGuia) e também em Node (testes).
 */
(function (raiz) {
  'use strict';

  var CHAVE_AJUDA = 'laift_lab_ajuda_v1';
  var NIVEIS = ['completa', 'dica', 'prova'];
  var ROTULOS_NIVEL = { completa: 'Completa', dica: 'Só dica', prova: 'Prova' };
  var PADRAO = { ligada: true, nivel: 'completa' };

  // Chaves de recurso locais (rollback sem republicar tudo): a URL aceita ?flags=-labGuiado.
  // labMotor (O3): "Processo guiado" com o motor novo, ligado por padrão (?flags=-labMotor desliga).
  var FLAGS_PADRAO = { labGuiado: true, labMotor: true, labProdutos: true, labRegulacao: true };

  function flagLigada(nome, search, sobrescritas) {
    if (!(nome in FLAGS_PADRAO)) return false;
    var ligada = FLAGS_PADRAO[nome];
    if (sobrescritas && typeof sobrescritas === 'object' && nome in sobrescritas) ligada = !!sobrescritas[nome];
    var bruto = '';
    try { bruto = new URLSearchParams(search || '').get('flags') || ''; } catch (e) { bruto = ''; }
    bruto.split(',').forEach(function (parte) {
      var p = parte.trim();
      if (p.replace(/^[-+]/, '') === nome) ligada = p.charAt(0) !== '-';
    });
    return ligada;
  }

  function normalizarPreferencia(bruto) {
    var ligada = bruto && typeof bruto.ligada === 'boolean' ? bruto.ligada : PADRAO.ligada;
    var nivel = bruto && NIVEIS.indexOf(bruto.nivel) >= 0 ? bruto.nivel : PADRAO.nivel;
    return { ligada: ligada, nivel: nivel };
  }

  function lerPreferencia(armazenamento) {
    try {
      var texto = armazenamento && armazenamento.getItem(CHAVE_AJUDA);
      return normalizarPreferencia(texto ? JSON.parse(texto) : null);
    } catch (e) {
      return normalizarPreferencia(null);
    }
  }

  function salvarPreferencia(armazenamento, pref) {
    try {
      armazenamento.setItem(CHAVE_AJUDA, JSON.stringify(normalizarPreferencia(pref)));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** O que a preferência permite mostrar: o "!" no controle e o balão com a dica. */
  function apoioDaPreferencia(pref) {
    var p = normalizarPreferencia(pref);
    if (!p.ligada || p.nivel === 'prova') return { marca: false, balao: false };
    return { marca: p.nivel === 'completa', balao: true };
  }

  // ---------------------------------------------------------------------------
  // Roteiro: síntese da aspirina (mesmos valores do "Comece aqui" anterior; proporção 1:1 em mol)
  // ---------------------------------------------------------------------------
  function perto(valor, alvo, tolerancia) {
    return typeof valor === 'number' && isFinite(valor) && Math.abs(valor - alvo) <= tolerancia;
  }
  function quantidade(e, id) {
    var v = e && e.adicionado && e.adicionado[id];
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }
  function escolhido(id) {
    return function (e) { return e.selecionado === id || quantidade(e, id) > 0; };
  }
  function digitado(id, valor) {
    return function (e) { return quantidade(e, id) > 0 || perto(e.qtd, valor, 0.005); };
  }
  function adicionou(id, minimo) {
    return function (e) { return quantidade(e, id) >= minimo; };
  }

  var PASSOS_ASPIRINA = [
    {
      id: 'sel-salicilico', alvo: 'reagente:AcidoSalicilico_s', competencia: 'Reagentes',
      texto: 'Escolha o ácido salicílico no catálogo de reagentes.',
      dica: 'Comece pelo reagente limitante: é ele que define quanto produto se forma.',
      porque: 'O reagente limitante é o que acaba primeiro. Aqui a proporção com o anidrido acético é 1:1 em mol.',
      feito: escolhido('AcidoSalicilico_s')
    },
    {
      id: 'qtd-salicilico', alvo: '#qtdInput', competencia: 'Pesagem e cálculo',
      texto: 'Digite 2,76 no campo de quantidade (gramas).',
      dica: '2,76 g de ácido salicílico equivalem a 20 mmol (massa molar 138,12 g/mol).',
      porque: 'Mol = massa ÷ massa molar: 2,76 ÷ 138,12 = 0,020 mol.',
      feito: digitado('AcidoSalicilico_s', 2.76)
    },
    {
      id: 'add-salicilico', alvo: '#btnStartAdd', competencia: 'Técnica de bancada',
      texto: 'Toque em Adicionar.',
      dica: 'Na carga total, a massa entra de uma vez. Confira o volume e o registro depois.',
      porque: 'O modo de adição muda a velocidade com que o reagente entra, não a quantidade final.',
      feito: adicionou('AcidoSalicilico_s', 2.7)
    },
    {
      id: 'sel-anidrido', alvo: 'reagente:AnidridoAcetico_l', competencia: 'Reagentes',
      texto: 'Escolha o anidrido acético no catálogo.',
      dica: 'O anidrido acético é o agente acetilante: entrega o grupo acetila ao ácido salicílico.',
      porque: 'A acetilação da hidroxila fenólica do ácido salicílico forma o éster, a aspirina.',
      feito: escolhido('AnidridoAcetico_l')
    },
    {
      id: 'qtd-anidrido', alvo: '#qtdInput', competencia: 'Pesagem e cálculo',
      texto: 'Digite 2 no campo de quantidade (mililitros).',
      dica: '2 mL de anidrido acético (1,08 g/mL; 102,09 g/mol) valem cerca de 21 mmol: excesso de 5 %.',
      porque: 'Um pequeno excesso do anidrido garante que todo o ácido salicílico reaja.',
      feito: digitado('AnidridoAcetico_l', 2)
    },
    {
      id: 'add-anidrido', alvo: '#btnStartAdd', competencia: 'Técnica de bancada',
      texto: 'Toque em Adicionar.',
      dica: 'Os dois precursores já estão no vaso. Falta o catalisador.',
      porque: 'Sem catalisador e sem calor a acetilação é lenta demais para a bancada.',
      feito: adicionou('AnidridoAcetico_l', 1.9)
    },
    {
      id: 'sel-sulfurico', alvo: 'reagente:H2SO4_aq', competencia: 'Reagentes',
      texto: 'Escolha o ácido sulfúrico concentrado no catálogo.',
      dica: 'O ácido sulfúrico entra só como catalisador: 0,1 mL bastam.',
      porque: 'O catalisador ácido acelera a reação sem ser consumido.',
      feito: escolhido('H2SO4_aq')
    },
    {
      id: 'qtd-sulfurico', alvo: '#qtdInput', competencia: 'Pesagem e cálculo',
      texto: 'Digite 0,1 no campo de quantidade (mililitros).',
      dica: 'É uma quantidade pequena de propósito. Cuidado: o ácido concentrado é corrosivo.',
      porque: 'Catalisador não entra na proporção estequiométrica; por isso a quantidade é mínima.',
      feito: digitado('H2SO4_aq', 0.1)
    },
    {
      id: 'add-sulfurico', alvo: '#btnStartAdd', competencia: 'Técnica de bancada',
      texto: 'Toque em Adicionar.',
      dica: 'Depois desta adição, o vaso tem tudo o que a reação precisa. Falta controlar agitação e temperatura.',
      porque: 'A reação precisa de mistura e de calor dentro de uma faixa de trabalho.',
      feito: adicionou('H2SO4_aq', 0.09)
    },
    {
      id: 'agitador', alvo: '#btnAgitador', competencia: 'Condições de reação',
      texto: 'Ligue o agitador.',
      dica: 'A agitação mistura o sólido ao líquido e uniformiza a temperatura.',
      porque: 'Sem agitação, o sólido reage só na superfície e a síntese não avança.',
      feito: function (e) { return !!e.agitador; }
    },
    {
      id: 'temp-alvo', alvo: '#tempAlvo', competencia: 'Condições de reação',
      texto: 'Digite 70 no campo de temperatura alvo (°C).',
      dica: 'A faixa de trabalho desta síntese é de 60 a 80 °C.',
      porque: 'Fora dessa faixa, a simulação não faz a síntese avançar.',
      feito: function (e) { return perto(e.tempAlvo, 70, 0.5); }
    },
    {
      id: 'termostato', alvo: '#btnThermostat', competencia: 'Condições de reação',
      texto: 'Toque em "Alvo" para o termostato aquecer e manter a temperatura.',
      dica: 'O termostato aquece até o valor alvo e depois o mantém.',
      porque: 'Aquecer sem controle ultrapassa a faixa de trabalho.',
      feito: function (e) { return e.modoTermico === 'termostato'; }
    }
  ];

  var ROTEIROS = {
    aspirina: {
      id: 'aspirina',
      titulo: 'Síntese da aspirina',
      objetivo: 'Monte a síntese da aspirina: ácido salicílico + anidrido acético, com ácido sulfúrico como catalisador, agitação e 70 °C.',
      conclusao: 'Montagem concluída. A bancada simula o tempo mais depressa: acompanhe o andamento, em porcentagem, no registro. ' +
        'Rendimento teórico: 20 mmol = 3,60 g de aspirina; com 85 % de rendimento, cerca de 3,06 g.',
      passos: PASSOS_ASPIRINA
    }
  };

  // Missão (índice na lista de missões) -> roteiro. Só a síntese da aspirina tem passos nesta etapa.
  var ROTEIRO_POR_MISSAO = { 4: 'aspirina' };
  function roteiroDaMissao(indice) {
    return Object.prototype.hasOwnProperty.call(ROTEIRO_POR_MISSAO, indice) ? ROTEIRO_POR_MISSAO[indice] : null;
  }

  function passoPendente(roteiro, estado, pulados) {
    var pulos = pulados || [];
    for (var i = 0; i < roteiro.passos.length; i++) {
      var p = roteiro.passos[i];
      if (pulos.indexOf(p.id) >= 0) continue;
      if (!p.feito(estado || {})) return { indice: i, passo: p };
    }
    return null;
  }

  /** Passo atual: { concluido, indice, total, passo }. Os passos pulados contam como resolvidos. */
  function passoAtual(roteiro, estado, pulados) {
    var total = roteiro.passos.length;
    var achado = passoPendente(roteiro, estado, pulados);
    if (!achado) return { concluido: true, indice: total, total: total, passo: null };
    return { concluido: false, indice: achado.indice, total: total, passo: achado.passo };
  }

  function progressoPct(roteiro, estado, pulados) {
    var pulos = pulados || [];
    var feitos = 0;
    roteiro.passos.forEach(function (p) {
      if (pulos.indexOf(p.id) >= 0 || p.feito(estado || {})) feitos++;
    });
    return Math.round((feitos / roteiro.passos.length) * 100);
  }

  // Controles de ação da bancada: acionar um deles fora de hora recebe aviso (sem bloquear).
  var CONTROLES_DE_ACAO = ['btnStartAdd', 'btnHeat', 'btnCool', 'btnThermostat', 'btnAgitador'];

  function acaoForaDeOrdem(passo, idControle) {
    if (!passo || CONTROLES_DE_ACAO.indexOf(idControle) < 0) return false;
    return passo.alvo !== '#' + idControle;
  }

  function mensagemEtapaErrada(passo) {
    return 'Ainda não é esta etapa. Agora: ' + (passo ? passo.texto : 'conclua o passo indicado.');
  }

  var API = {
    CHAVE_AJUDA: CHAVE_AJUDA, NIVEIS: NIVEIS, ROTULOS_NIVEL: ROTULOS_NIVEL, ROTEIROS: ROTEIROS,
    CONTROLES_DE_ACAO: CONTROLES_DE_ACAO,
    flagLigada: flagLigada, lerPreferencia: lerPreferencia, salvarPreferencia: salvarPreferencia,
    normalizarPreferencia: normalizarPreferencia, apoioDaPreferencia: apoioDaPreferencia,
    passoAtual: passoAtual, progressoPct: progressoPct, roteiroDaMissao: roteiroDaMissao,
    acaoForaDeOrdem: acaoForaDeOrdem, mensagemEtapaErrada: mensagemEtapaErrada
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabGuia = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
