/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — registro das operações unitárias do motor (O3).
 * Junta base + separação + análise/acabamento + farmacotécnica/CQ (O5) e oferece executar(estado, id, parametros, ctx).
 * Ordem de <script> no navegador: estado, fisica, relogio, calculos, lab-quimica, op-base, op-separacao, op-cq,
 * lab-farma-calculos, lab-cq, op-farma, operacoes.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const B = emNode ? require('./lab-motor-op-base.js') : raiz.LabMotorOpBase;
  const S = emNode ? require('./lab-motor-op-separacao.js') : raiz.LabMotorOpSeparacao;
  const Q = emNode ? require('./lab-motor-op-cq.js') : raiz.LabMotorOpCq;
  const FA = emNode ? require('./lab-motor-op-farma.js') : raiz.LabMotorOpFarma;
  const F = emNode ? require('./lab-motor-fisica.js') : raiz.LabMotorFisica;

  const OPERACOES = Object.freeze(Object.assign({}, B.OPERACOES, S.OPERACOES, Q.OPERACOES, FA.OPERACOES));

  function listar() {
    return Object.keys(OPERACOES).map((id) => ({ id, titulo: OPERACOES[id].titulo, regras: OPERACOES[id].regras.map((r) => F.regra(r)) }));
  }

  /** Executa uma operação. Lança Error (mensagem em pt-BR) se a operação ou os parâmetros forem inválidos. */
  function executar(estado, id, parametros, ctx) {
    if (!Object.prototype.hasOwnProperty.call(OPERACOES, id)) throw new Error(`operação desconhecida: ${id}`);
    if (!ctx || !ctx.especies) throw new Error('contexto sem tabela de espécies');
    const r = OPERACOES[id].aplicar(estado, parametros || {}, ctx);
    return { estado: r.estado, eventos: r.eventos.map((e) => Object.freeze(Object.assign({ operacao: id }, e))) };
  }

  const API = { OPERACOES, listar, executar };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorOperacoes = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
