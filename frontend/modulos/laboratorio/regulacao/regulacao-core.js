/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * regulacao-core.js — regras puras do balcão simulado de controlados (Portaria SVS/MS 344/98).
 *
 * Sem DOM e sem rede: conferência de receituário, livro de registro (saldo), balanço, enchimento de
 * cápsulas, controle de qualidade por peso e progresso no aparelho. Os valores regulatórios vêm dos
 * JSON em data/ (cada um com fonte); nada aqui afirma prazo ou limite da norma.
 * Funciona como <script> comum (window.LaiftRegulacao) e como módulo CommonJS (testes).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.LaiftRegulacao = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  var DECISOES = ['dispensar', 'recusar', 'contatar_prescritor'];
  var TIPOS_MOVIMENTO = ['entrada', 'saida', 'perda', 'ajuste'];
  var CHAVE_PROGRESSO = 'laift_regulacao_v1';

  /** Flag local: desligada por padrão; liga por ?flags=nome ou window.__labFlags = { nome: true }. */
  function flagLigada(nome, search, overrides) {
    var ligada = false;
    if (overrides && typeof overrides === 'object' && nome in overrides) ligada = !!overrides[nome];
    var bruto = '';
    var m = /[?&]flags=([^&]*)/.exec(search || '');
    if (m) { try { bruto = decodeURIComponent(m[1]); } catch (e) { bruto = ''; } }
    bruto.split(',').forEach(function (parte) {
      var p = parte.trim();
      if (p.replace(/^[-+]/, '') === nome) ligada = p.charAt(0) !== '-';
    });
    return ligada;
  }

  function unicos(lista) {
    return lista.filter(function (x, i) { return lista.indexOf(x) === i; });
  }

  /**
   * Compara o que a pessoa apontou com o gabarito do caso.
   * caso.campos[].problema marca o campo com defeito; caso.decisao_correta é a conduta certa.
   */
  function conferirReceita(caso, resposta) {
    var vazio = { aprovado: false, faltaram: [], excedentes: [], decisaoCorreta: false, nota: 0 };
    if (!caso || !Array.isArray(caso.campos) || !resposta || !Array.isArray(resposta.problemas)) return vazio;
    var esperados = caso.campos.filter(function (c) { return c.problema; }).map(function (c) { return c.id; });
    var dados = unicos(resposta.problemas.map(String));
    var faltaram = esperados.filter(function (id) { return dados.indexOf(id) < 0; });
    var excedentes = dados.filter(function (id) { return esperados.indexOf(id) < 0; });
    var decisaoCorreta = DECISOES.indexOf(resposta.decisao) >= 0 && resposta.decisao === caso.decisao_correta;
    var total = Math.max(1, esperados.length + 1);
    var erros = faltaram.length + excedentes.length + (decisaoCorreta ? 0 : 1);
    var nota = Math.max(0, Math.round((1 - erros / total) * 100) / 100);
    var aprovado = !faltaram.length && !excedentes.length && decisaoCorreta;
    return { aprovado: aprovado, faltaram: faltaram, excedentes: excedentes, decisaoCorreta: decisaoCorreta, nota: aprovado ? 1 : Math.min(nota, 0.99) };
  }

  /** Saldo corrente do livro. Entrada soma; saída e perda subtraem; ajuste tem sinal próprio. */
  function calcularSaldo(estoqueInicial, movimentos) {
    if (typeof estoqueInicial !== 'number' || !isFinite(estoqueInicial) || estoqueInicial < 0) throw new RangeError('estoque inicial inválido');
    var saldo = estoqueInicial;
    var primeiroNegativo = -1;
    var linhas = (movimentos || []).map(function (mov, i) {
      if (!mov || TIPOS_MOVIMENTO.indexOf(mov.tipo) < 0) throw new TypeError('tipo de movimento desconhecido');
      if (typeof mov.qtd !== 'number' || !isFinite(mov.qtd) || (mov.tipo !== 'ajuste' && mov.qtd < 0)) throw new RangeError('quantidade inválida');
      saldo += mov.tipo === 'entrada' ? mov.qtd : mov.tipo === 'ajuste' ? mov.qtd : -mov.qtd;
      if (saldo < 0 && primeiroNegativo < 0) primeiroNegativo = i;
      return Object.assign({}, mov, { saldo: saldo });
    });
    return { linhas: linhas, final: saldo, primeiroNegativo: primeiroNegativo };
  }

  /** Balanço: saldo escriturado e divergência (contagem física menos saldo do livro). */
  function conferirBalanco(exercicio, resposta) {
    var s = calcularSaldo(exercicio.estoque_inicial, exercicio.movimentos);
    var esperado = { saldo_escriturado: s.final, divergencia: exercicio.contagem_fisica - s.final };
    var r = resposta || {};
    var aprovado = r.saldo_escriturado === esperado.saldo_escriturado && r.divergencia === esperado.divergencia;
    return { aprovado: aprovado, esperado: esperado };
  }

  /** Enchimento de cápsulas: o insumo é corrigido pelo teor; o excipiente completa a massa. */
  function calcularEnchimento(p) {
    var n = p && p.n, dose = p && p.dose_mg, teor = p && p.teor_pc, massa = p && p.massa_cap_mg;
    if (!Number.isInteger(n) || n < 1) throw new RangeError('n deve ser inteiro positivo');
    if (!(dose > 0) || !(massa > 0)) throw new RangeError('dose e massa devem ser positivas');
    if (!(teor > 0) || teor > 100) throw new RangeError('teor entre 0 e 100');
    var porCapsula = dose / (teor / 100);
    if (porCapsula > massa) throw new RangeError('a dose corrigida não cabe na cápsula');
    var insumo = n * porCapsula;
    var total = n * massa;
    return { insumo_mg: insumo, excipiente_mg: total - insumo, total_mg: total };
  }

  /** Controle de qualidade por peso: média e unidades fora de ±tolerância (%) do peso alvo. */
  function avaliarPesos(pesos, alvo, tolPc) {
    if (!Array.isArray(pesos) || !pesos.length || pesos.some(function (x) { return !(x > 0); })) throw new RangeError('pesos inválidos');
    var media = pesos.reduce(function (a, b) { return a + b; }, 0) / pesos.length;
    var fora = [];
    pesos.forEach(function (peso, indice) {
      var desvio = ((peso - alvo) / alvo) * 100;
      if (Math.abs(desvio) > tolPc) fora.push({ indice: indice, peso: peso, desvio_pc: desvio });
    });
    return { n: pesos.length, media: media, fora: fora, aprovado: fora.length === 0 };
  }

  function lerJson(storage) {
    try {
      var bruto = storage && storage.getItem(CHAVE_PROGRESSO);
      var obj = bruto ? JSON.parse(bruto) : null;
      if (obj && typeof obj === 'object' && obj.itens && typeof obj.itens === 'object') return obj;
    } catch (e) { /* storage bloqueado ou JSON corrompido: começa vazio */ }
    return { versao: 1, itens: {} };
  }

  /** Progresso só no aparelho (localStorage). Qualquer falha de storage vira no-op. */
  function criarProgresso(storage) {
    return {
      obter: function () { return lerJson(storage); },
      registrar: function (id, nota) {
        if (typeof id !== 'string' || !id || typeof nota !== 'number' || !(nota >= 0 && nota <= 1)) return false;
        var atual = lerJson(storage);
        var ant = atual.itens[id] || { melhor: 0, tentativas: 0 };
        var itens = Object.assign({}, atual.itens);
        itens[id] = { melhor: Math.max(ant.melhor, nota), tentativas: ant.tentativas + 1, ultima: nota };
        try { storage.setItem(CHAVE_PROGRESSO, JSON.stringify({ versao: 1, itens: itens })); return true; } catch (e) { return false; }
      },
      resumo: function (ids) {
        var itens = lerJson(storage).itens;
        var concluidos = (ids || []).filter(function (id) { return itens[id] && itens[id].melhor >= 1; }).length;
        return { concluidos: concluidos, total: (ids || []).length };
      },
    };
  }

  return {
    DECISOES: DECISOES, flagLigada: flagLigada, conferirReceita: conferirReceita, calcularSaldo: calcularSaldo,
    conferirBalanco: conferirBalanco, calcularEnchimento: calcularEnchimento, avaliarPesos: avaliarPesos,
    criarProgresso: criarProgresso,
  };
});
