/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — caderno de laboratório automático do motor (O3). Funções puras, sem DOM.
 * Cada entrada: { seq, t, etapa, tipo, texto, operacao?, leitura?, unidade?, regra?, nivelModelo?, desvio? }.
 * Texto sempre puro (a interface usa textContent). Sem dado pessoal: só o experimento.
 */
(function (raiz) {
  'use strict';

  const emNode = typeof module !== 'undefined' && module.exports;
  const F = emNode ? require('./lab-motor-fisica.js') : raiz.LabMotorFisica;

  const TIPOS = Object.freeze(['acao', 'leitura', 'calculo', 'desvio', 'bloqueio', 'incidente', 'observacao', 'etapa', 'conclusao']);
  const MAX_TEXTO = 500;
  const MAX_ENTRADAS = 2000;

  function limparTexto(v) {
    // eslint-disable-next-line no-control-regex
    return String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, MAX_TEXTO);
  }

  function criarCaderno(opcoes) {
    const o = opcoes || {};
    return Object.freeze({ titulo: limparTexto(o.titulo || 'Caderno de laboratório'), processoId: o.processoId || null, entradas: Object.freeze([]) });
  }

  function registrar(caderno, entrada) {
    if (!entrada || !TIPOS.includes(entrada.tipo)) throw new Error(`tipo de entrada inválido: ${entrada && entrada.tipo}`);
    const txt = limparTexto(entrada.texto);
    if (!txt) throw new Error('entrada sem texto');
    const e = { seq: caderno.entradas.length + 1, t: Number.isFinite(entrada.t) ? entrada.t : 0, etapa: entrada.etapa || null, tipo: entrada.tipo, texto: txt };
    for (const k of ['operacao', 'leitura', 'unidade', 'regra', 'desvio', 'ok']) if (entrada[k] !== undefined) e[k] = entrada[k];
    if (e.regra) e.nivelModelo = F.regra(e.regra).nivel;
    const lista = caderno.entradas.concat([Object.freeze(e)]);
    return Object.freeze({ ...caderno, entradas: Object.freeze(lista.length > MAX_ENTRADAS ? lista.slice(lista.length - MAX_ENTRADAS) : lista) });
  }

  /** Converte eventos de operação em entradas: desvio > leitura > ação. */
  function registrarEventos(caderno, eventos, contexto) {
    const c = contexto || {};
    let cad = caderno;
    for (const ev of eventos || []) {
      let tipo = ev.leitura !== undefined ? 'leitura' : 'acao';
      if (ev.desvio) tipo = ev.desvio.gravidade === 'incidente' ? 'incidente' : 'desvio';
      cad = registrar(cad, { tipo, t: c.t, etapa: c.etapa, texto: ev.texto, operacao: ev.operacao, leitura: ev.leitura, unidade: ev.unidade, regra: ev.regra, desvio: ev.desvio });
    }
    return cad;
  }

  function observacao(caderno, texto, contexto) {
    const c = contexto || {};
    return registrar(caderno, { tipo: 'observacao', t: c.t, etapa: c.etapa, texto });
  }

  const pesagens = (cad) => cad.entradas.filter((e) => e.operacao === 'pesar' && e.unidade === 'g');
  const desvios = (cad) => cad.entradas.filter((e) => e.desvio);

  function resumo(cad) {
    const porGravidade = { aviso: 0, nao_conforme: 0, incidente: 0 };
    desvios(cad).forEach((e) => { porGravidade[e.desvio.gravidade] = (porGravidade[e.desvio.gravidade] || 0) + 1; });
    const calculos = cad.entradas.filter((e) => e.tipo === 'calculo');
    const etapas = [];
    cad.entradas.forEach((e) => { if (e.etapa && !etapas.includes(e.etapa)) etapas.push(e.etapa); });
    return {
      totalEntradas: cad.entradas.length,
      desvios: desvios(cad).length,
      porGravidade,
      calculos: { certos: calculos.filter((e) => e.ok === true).length, errados: calculos.filter((e) => e.ok === false).length },
      etapas
    };
  }

  function relogio(t) {
    const s = Math.max(0, Math.round(t || 0));
    const p = (n) => String(n).padStart(2, '0');
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  /** Texto para leitura, impressão ou cópia (sem HTML). */
  function paraTexto(cad) {
    const linhas = [cad.titulo, ''];
    for (const e of cad.entradas) {
      const nivel = e.nivelModelo ? ` [${F.rotuloNivel(e.nivelModelo)}]` : '';
      linhas.push(`${relogio(e.t)}  ${e.etapa ? `${e.etapa}  ` : ''}${e.texto}${nivel}`);
    }
    const r = resumo(cad);
    linhas.push('', `Entradas: ${r.totalEntradas}. Desvios: ${r.desvios} (avisos ${r.porGravidade.aviso}, não conformidades ${r.porGravidade.nao_conforme}, incidentes ${r.porGravidade.incidente}). Cálculos certos: ${r.calculos.certos}; a refazer: ${r.calculos.errados}.`);
    return linhas.join('\n');
  }

  const API = { TIPOS, MAX_TEXTO, criarCaderno, registrar, registrarEventos, observacao, pesagens, desvios, resumo, relogio, paraTexto };
  if (emNode) module.exports = API;
  if (raiz) raiz.LabMotorCaderno = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
