/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinic-core.js
 * Funções PURAS do motor da Clínica (sem DOM, sem rede, sem relógio): estado do atendimento, passagem do tempo,
 * pausa, contexto enviado ao servidor e limites de tamanho. O clinic-engine.js só liga estas funções à tela.
 * Nada aqui altera o objeto recebido: cada função devolve um objeto novo. Testado em
 * frontend/scripts/clinic-engine.test.mjs.
 */
(function (root) {
  'use strict';

  var CONTEXT_MAX_BYTES = 4096;
  var ANSWER_KEY_MAX_BYTES = 4096;
  var UNAVAILABLE_MESSAGE = 'Esta função está indisponível agora. Tente de novo em instantes.';
  var OUTCOME_TO_SERVER = { EM_ANDAMENTO: 'concluido', OBITO: 'obito', ABANDONO: 'abandono' };

  function byteLength(value) {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  }

  /** Cópia do objeto com o campo de texto mais longo encurtado até caber em `maxBytes` (o servidor recusaria). */
  function fitToBytes(obj, maxBytes) {
    var out = Object.assign({}, obj);
    var guard = 0;
    while (byteLength(out) > maxBytes && guard++ < 40) {
      var longestKey = null;
      Object.keys(out).forEach(function (k) {
        if (typeof out[k] === 'string' && (!longestKey || out[k].length > out[longestKey].length)) longestKey = k;
      });
      if (!longestKey || out[longestKey].length < 20) break;
      out[longestKey] = out[longestKey].slice(0, Math.floor(out[longestKey].length * 0.8));
    }
    return out;
  }

  function caseSourceOf(c) {
    return c && (c.caseSource === 'acervo' || c.caseSource === 'ia') ? c.caseSource : 'builtin';
  }

  // ---------------------------------------------------------------------
  // Estado do atendimento: { vitality, patience, elapsedSeconds, paused, outcome }
  // ---------------------------------------------------------------------
  function newState(caso) {
    var c = caso || {};
    return {
      vitality: c.vitalidadeInicial || 100,
      patience: c.pacienciaInicial || 100,
      elapsedSeconds: 0,
      paused: false,
      outcome: 'EM_ANDAMENTO',
    };
  }

  function withOutcome(state) {
    if (state.outcome !== 'EM_ANDAMENTO') return state;
    if (state.vitality <= 0) return Object.assign({}, state, { outcome: 'OBITO' });
    if (state.patience <= 0) return Object.assign({}, state, { outcome: 'ABANDONO' });
    return state;
  }

  /** Desconta vitalidade e paciência (valores positivos). Em pausa ou encerrado, nada muda. */
  function applyDecay(state, deltaVitality, deltaPatience) {
    if (state.paused || state.outcome !== 'EM_ANDAMENTO') return state;
    return withOutcome(Object.assign({}, state, {
      vitality: Math.max(0, state.vitality - (Number(deltaVitality) || 0)),
      patience: Math.max(0, state.patience - (Number(deltaPatience) || 0)),
    }));
  }

  /** Um segundo de relógio. Em pausa (ou encerrado) o relógio e os medidores ficam congelados. */
  function tick(state, taxaDecaimento) {
    if (state.paused || state.outcome !== 'EM_ANDAMENTO') return state;
    var next = Object.assign({}, state, { elapsedSeconds: state.elapsedSeconds + 1 });
    if (next.elapsedSeconds % 60 === 0 && taxaDecaimento) {
      return applyDecay(next, taxaDecaimento.vitalidadePorMinuto || 1, taxaDecaimento.pacienciaPorMinuto || 1);
    }
    return next;
  }

  /** Solicitar exame: o tempo virtual soma ao relógio e o impacto desconta dos medidores. */
  function applyExam(state, exam) {
    if (state.paused || state.outcome !== 'EM_ANDAMENTO') return state;
    var advanced = Object.assign({}, state, { elapsedSeconds: state.elapsedSeconds + (Number(exam.custoTempoMin) || 5) * 60 });
    return applyDecay(advanced, Math.abs(Number(exam.impactoVitalidade) || 0), Math.abs(Number(exam.impactoPaciencia) || 0));
  }

  function pause(state) {
    return state.paused ? state : Object.assign({}, state, { paused: true });
  }

  function resume(state) {
    return state.paused ? Object.assign({}, state, { paused: false }) : state;
  }

  function formatClock(totalSeconds) {
    var s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    var mins = Math.floor(s / 60);
    var secs = s % 60;
    return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }

  function vitalityLevel(value) {
    return value > 60 ? 'status-healthy' : value > 25 ? 'status-warning' : 'status-danger';
  }

  function patienceLevel(value) {
    return value > 50 ? 'status-patient' : value > 20 ? 'status-warning' : 'status-danger';
  }

  // ---------------------------------------------------------------------
  // Dados enviados ao servidor
  // ---------------------------------------------------------------------
  function examNames(caso, requestedExams) {
    var list = (caso && caso.examesDisponiveis) || [];
    return requestedExams.map(function (id) {
      var ex = list.find(function (e) { return e.id === id; });
      return ex ? String(ex.nome) : String(id);
    });
  }

  /** Contexto do paciente para casos que vivem no navegador (embutidos/gerados). */
  function buildPatientContext(caso, requestedExams, state) {
    var c = caso || {};
    var pac = c.paciente || {};
    var oculto = c.contextoOculto || {};
    return fitToBytes({
      nome: pac.nome || '',
      idade: pac.idade !== undefined ? String(pac.idade) : '',
      profissao: pac.profissao || oculto.pacienteProfissao || '',
      genero: pac.genero || '',
      queixaPrincipal: c.queixaPrincipal || '',
      exposicaoReal: oculto.exposicaoReal || '',
      sintomas: oculto.sintomas || '',
      temperamento: oculto.temperamento || '',
      comportamento: oculto.comportamento || '',
      regrasFala: oculto.regrasFala || '',
      nivelConsciencia: oculto.nivelConsciencia || '',
      sinaisVitais: c.sinaisVitais || {},
      vitalidadeAtual: Math.round(state.vitality),
      pacienciaAtual: Math.round(state.patience),
      examesJaLiberados: examNames(c, requestedExams || []).slice(0, 15),
    }, CONTEXT_MAX_BYTES - 200);
  }

  function answerKeyForServer(caso) {
    var gab = caso && caso.gabaritoPreceptor;
    if (!gab) return undefined;
    return fitToBytes({
      diagnostico: String(gab.diagnostico || ''),
      conduta: String(gab.conduta || ''),
      palavrasChave: Array.isArray(gab.palavrasChave) ? gab.palavrasChave.slice(0, 12).map(String) : [],
    }, ANSWER_KEY_MAX_BYTES - 100);
  }

  function outcomeTitle(outcome) {
    if (outcome === 'obito') return 'Desfecho Crítico: Óbito';
    return outcome === 'abandono' ? 'Desfecho: Abandono da Consulta' : 'Atendimento Finalizado';
  }

  root.ClinicCore = {
    UNAVAILABLE_MESSAGE: UNAVAILABLE_MESSAGE,
    OUTCOME_TO_SERVER: OUTCOME_TO_SERVER,
    byteLength: byteLength,
    fitToBytes: fitToBytes,
    caseSourceOf: caseSourceOf,
    newState: newState,
    applyDecay: applyDecay,
    applyExam: applyExam,
    tick: tick,
    pause: pause,
    resume: resume,
    formatClock: formatClock,
    vitalityLevel: vitalityLevel,
    patienceLevel: patienceLevel,
    buildPatientContext: buildPatientContext,
    answerKeyForServer: answerKeyForServer,
    outcomeTitle: outcomeTitle,
  };
})(typeof window !== 'undefined' ? window : globalThis);
