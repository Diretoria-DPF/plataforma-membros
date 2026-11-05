/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — linguagem de condições dos processos (O3). Sem eval nem Function: só grandezas e
 * operadores de uma lista fechada. Condicao = { grandeza, op, valor, recipiente?, especie?, campo?, evento?, momento? }.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const E = emNode ? require('./lab-motor-estado.js') : raiz.LabMotorEstado;
  const B = emNode ? require('./lab-motor-op-base.js') : raiz.LabMotorOpBase;
  const Q = emNode ? require('./lab-motor-op-cq.js') : raiz.LabMotorOpCq;

  const OPS = Object.freeze(['==', '!=', '>=', '<=', '>', '<', 'entre', 'contem', 'naoContem']);

  function rec(c, x) {
    if (!x.recipiente) throw new Error(`condição ${x.grandeza} sem recipiente`);
    const r = c.estado.recipientes[x.recipiente];
    if (!r) throw new Error(`condição: recipiente inexistente ${x.recipiente}`);
    return r;
  }
  function ultimoEvento(c, tipo) {
    const lista = (c.eventos || []).filter((e) => e.tipo === tipo);
    return lista.length ? lista[lista.length - 1] : null;
  }
  function caminho(obj, campo) {
    return String(campo || '').split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  }

  // Cada grandeza lê o contexto { estado, especies, sessao, parametros, eventos }.
  const GRANDEZAS = Object.freeze({
    tempC: (c, x) => rec(c, x).tempC,
    massa: (c, x) => (x.especie ? E.massaEspecie(rec(c, x), x.especie, c.especies) : E.massaRecipiente(rec(c, x), c.especies)),
    massaSolido: (c, x) => E.massaConteudo(x.especie ? { [x.especie]: rec(c, x).solido[x.especie] || 0 } : rec(c, x).solido, c.especies),
    volumeMl: (c, x) => E.volumeLiquidoMl(rec(c, x), c.especies),
    concentracaoPV: (c, x) => {
      const r = rec(c, x);
      const v = E.volumeLiquidoMl(r, c.especies);
      return v > 0 ? (100 * E.massaEspecie(r, x.especie, c.especies)) / v : 0;
    },
    pH: (c, x) => B.ajudantes.phDoRecipiente(rec(c, x), { especies: c.especies }),
    fracaoEspecie: (c, x) => Q.fracoesAmostra(rec(c, x), { especies: c.especies })[x.especie] || 0,
    homogeneo: (c, x) => rec(c, x).homogeneo === true,
    esteril: (c, x) => rec(c, x).esteril === true,
    rotuloCompleto: (c, x) => {
      const r = rec(c, x).rotulo;
      const campos = Array.isArray(x.campos) ? x.campos : Q.CAMPOS_ROTULO_PADRAO;
      return !!r && campos.every((k) => typeof r[k] === 'string' && r[k].length > 0);
    },
    epi: (c) => c.estado.ambiente.epi,
    capela: (c) => c.estado.ambiente.capelaLigada,
    balancaTarada: (c, x) => (x.recipiente ? c.estado.equipamentos.balanca.recipiente === x.recipiente : c.estado.equipamentos.balanca.recipiente !== null),
    etapaConcluida: (c) => (c.sessao ? c.sessao.concluidas : []),
    tempo: (c) => c.estado.t,
    residuoConforme: (c) => c.estado.residuos.length > 0 && c.estado.residuos.every((r) => r.conforme),
    evento: (c) => (c.eventos || []).map((e) => e.tipo),
    desvio: (c) => (c.eventos || []).filter((e) => e.desvio).map((e) => e.desvio.codigo),
    leitura: (c, x) => { const e = ultimoEvento(c, x.evento); return e ? e.leitura : null; },
    tempoNaFaixa: (c) => { const e = ultimoEvento(c, 'aquecimento'); return e ? e.tempoNaFaixaMin : 0; },
    parametro: (c, x) => caminho(c.parametros, x.campo)
  });

  function comoLista(v) { return Array.isArray(v) ? v : [v]; }

  function comparar(esq, op, valor) {
    switch (op) {
      case '==': return Array.isArray(esq) ? comoLista(valor).every((v) => esq.includes(v)) : esq === valor;
      case '!=': return Array.isArray(esq) ? !comoLista(valor).every((v) => esq.includes(v)) : esq !== valor;
      case '>=': return typeof esq === 'number' && esq >= valor;
      case '<=': return typeof esq === 'number' && esq <= valor;
      case '>': return typeof esq === 'number' && esq > valor;
      case '<': return typeof esq === 'number' && esq < valor;
      case 'entre': return typeof esq === 'number' && Array.isArray(valor) && esq >= valor[0] && esq <= valor[1];
      case 'contem': return Array.isArray(esq) && comoLista(valor).every((v) => esq.includes(v));
      case 'naoContem': return Array.isArray(esq) && comoLista(valor).every((v) => !esq.includes(v));
      default: throw new Error(`operador desconhecido: ${op}`);
    }
  }

  /** Valida a forma da condição (sem avaliar). Devolve lista de erros. */
  function validarCondicao(x) {
    const erros = [];
    if (!x || typeof x !== 'object') return ['condição ausente'];
    if (!Object.prototype.hasOwnProperty.call(GRANDEZAS, x.grandeza)) erros.push(`grandeza desconhecida: ${x.grandeza}`);
    if (!OPS.includes(x.op)) erros.push(`operador desconhecido: ${x.op}`);
    if (x.op === 'entre' && !(Array.isArray(x.valor) && x.valor.length === 2 && x.valor[0] <= x.valor[1])) erros.push('entre exige [mínimo, máximo]');
    if (['massa', 'massaSolido', 'volumeMl', 'concentracaoPV', 'tempC', 'pH', 'fracaoEspecie', 'homogeneo', 'esteril', 'rotuloCompleto'].includes(x.grandeza) && !x.recipiente) erros.push(`${x.grandeza} exige recipiente`);
    if (['concentracaoPV', 'fracaoEspecie'].includes(x.grandeza) && !x.especie) erros.push(`${x.grandeza} exige especie`);
    if (x.grandeza === 'leitura' && !x.evento) erros.push('leitura exige evento');
    if (x.grandeza === 'parametro' && !x.campo) erros.push('parametro exige campo');
    if (x.momento !== undefined && !['antes', 'depois'].includes(x.momento)) erros.push(`momento inválido: ${x.momento}`);
    return erros;
  }

  function avaliar(x, contexto) {
    const erros = validarCondicao(x);
    if (erros.length) throw new Error(erros.join('; '));
    return comparar(GRANDEZAS[x.grandeza](contexto, x), x.op, x.valor);
  }

  const API = { OPS, GRANDEZAS: Object.freeze(Object.keys(GRANDEZAS)), validarCondicao, avaliar, comparar };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorCondicoes = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
