/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * LAIFT — relógio de passo fixo do motor de processos (O3).
 *
 * O tempo simulado avança em passos fixos de `dtS` segundos, independente da taxa
 * de quadros. A velocidade multiplica o tempo simulado (não o intervalo real).
 * Funções puras: criarRelogio, acumular, avancar. O agendador recebe raf/caf/documento
 * por injeção (nada de acesso global), para seguir testável em Node e pausar com a aba oculta.
 */
(function (raiz) {
  'use strict';

  const DT_PADRAO_S = 5;
  const MAX_PASSOS_PADRAO = 240;

  function criarRelogio(opcoes) {
    const o = opcoes || {};
    const dtS = o.dtS === undefined ? DT_PADRAO_S : o.dtS;
    if (!(dtS > 0)) throw new Error('dtS deve ser positivo');
    const maxPassos = o.maxPassos === undefined ? MAX_PASSOS_PADRAO : o.maxPassos;
    return Object.freeze({ dtS, maxPassos, acumuladoS: 0 });
  }

  /** Soma `msReais × velocidade` ao acumulador e devolve quantos passos inteiros cabem. */
  function acumular(relogio, msReais, velocidade) {
    if (!(msReais > 0) || !(velocidade > 0)) return { relogio, passos: 0 };
    const total = relogio.acumuladoS + (msReais / 1000) * velocidade;
    let passos = Math.floor(total / relogio.dtS + 1e-9);
    let resto = total - passos * relogio.dtS;
    if (passos > relogio.maxPassos) { passos = relogio.maxPassos; resto = 0; }
    return { relogio: Object.freeze({ ...relogio, acumuladoS: Math.max(0, resto) }), passos };
  }

  /** Aplica `passo(estado, dt)` até cobrir `segundos`, em passos de `dtS` (o último pode ser parcial). */
  function avancar(estado, segundos, dtS, passo) {
    let s = estado;
    let falta = segundos;
    while (falta > 1e-9) {
      const dt = Math.min(dtS, falta);
      s = passo(s, dt);
      falta -= dt;
    }
    return s;
  }

  /**
   * criarAgendador({ raf, caf, documento, dtS, aoPassos(n, dtS) }): laço de quadros que só
   * roda com a aba visível. Ao voltar, o primeiro quadro só marca o tempo (não recupera o oculto).
   */
  function criarAgendador(deps) {
    const d = deps || {};
    if (typeof d.raf !== 'function' || typeof d.caf !== 'function') throw new Error('raf e caf obrigatórios');
    if (typeof d.aoPassos !== 'function') throw new Error('aoPassos obrigatório');
    let relogio = criarRelogio({ dtS: d.dtS });
    let velocidade = 1;
    let id = null;
    let ultimo = null;
    let ativo = false;

    function quadro(ms) {
      id = null;
      if (!ativo) return;
      if (ultimo !== null) {
        const r = acumular(relogio, ms - ultimo, velocidade);
        relogio = r.relogio;
        if (r.passos) d.aoPassos(r.passos, relogio.dtS);
      }
      ultimo = ms;
      id = d.raf(quadro);
    }
    function agendar() { if (id === null) id = d.raf(quadro); }
    function cancelar() { if (id !== null) { d.caf(id); id = null; } ultimo = null; }

    function aoMudarVisibilidade() {
      if (!d.documento) return;
      if (d.documento.hidden) cancelar();
      else if (ativo) agendar();
    }
    if (d.documento && d.documento.addEventListener) d.documento.addEventListener('visibilitychange', aoMudarVisibilidade);

    return {
      iniciar() { ativo = true; if (!(d.documento && d.documento.hidden)) agendar(); },
      parar() { ativo = false; cancelar(); },
      rodando() { return ativo && id !== null; },
      definirVelocidade(v) {
        if (!(v > 0) || v > 1000) throw new Error('velocidade inválida');
        velocidade = v;
      },
      destruir() {
        ativo = false;
        cancelar();
        if (d.documento && d.documento.removeEventListener) d.documento.removeEventListener('visibilitychange', aoMudarVisibilidade);
      }
    };
  }

  const API = { DT_PADRAO_S, criarRelogio, acumular, avancar, criarAgendador };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (raiz) raiz.LabMotorRelogio = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null));
