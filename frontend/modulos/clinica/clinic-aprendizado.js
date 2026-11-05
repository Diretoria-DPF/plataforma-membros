/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinic-aprendizado.js
 * Regras PURAS do aprendizado na Clínica (sem DOM, sem rede, sem relógio): linha do tempo do paciente, dicas
 * progressivas, debrief por competência, plantão de 5 minutos, casos por nível e nota de gatilho (CLI-12).
 * Nenhuma função altera o que recebe: todas devolvem valores novos. Nada aqui inventa conteúdo clínico: as dicas
 * saem só dos dados do próprio caso (exames essenciais, toxíndrome). Testado em
 * frontend/scripts/clinic-aprendizado.test.mjs. A tela fica em clinic-aprendizado-ui.js.
 */
(function (root) {
  'use strict';

  var PLANTAO_SEGUNDOS = 300;
  var TIMELINE_MAX = 60;
  var HINTS_MAX = 3;
  var QUESTIONS_TARGET = 4;
  var HISTORY_MAX = 20;
  var LABEL_MAX = 80;
  var LEVELS = ['basico', 'intermediario', 'avancado'];
  var LEVEL_LABEL = { todos: 'Todos os níveis', basico: 'Básico', intermediario: 'Intermediário', avancado: 'Avançado' };

  var TRIGGER_NOTE = 'Este caso aborda autoagressão. Se o tema pesar hoje, escolha outro caso e volte quando quiser. ' +
    'Se você ou alguém próximo precisa de apoio, ligue 188 (Centro de Valorização da Vida, 24 horas, gratuito) ' +
    'ou procure um serviço de saúde; em risco imediato, ligue 192 (SAMU).';
  var TRIGGER_RE = /autoagress|automutila|autointoxica|suicid|autoextermin|ingestao voluntaria|intencao de (morrer|se matar)|tentativa de (morte|se matar)/;

  function fold(text) {
    return String(text == null ? '' : text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function clip(text, max) {
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // ---------------------------------------------------------------------
  // Casos por nível
  // ---------------------------------------------------------------------
  function levelOf(caso) {
    var f = fold(caso && caso.dificuldade);
    return LEVELS.indexOf(f) >= 0 ? f : 'intermediario';
  }

  function filterByLevel(cases, level) {
    var list = Array.isArray(cases) ? cases : [];
    if (!level || level === 'todos') return list.slice();
    return list.filter(function (c) { return levelOf(c) === level; });
  }

  function countByLevel(cases) {
    var out = { basico: 0, intermediario: 0, avancado: 0 };
    (Array.isArray(cases) ? cases : []).forEach(function (c) { out[levelOf(c)] += 1; });
    return out;
  }

  /** Nível sugerido a partir dos últimos debriefs (média das competências medidas). Sem histórico: null. */
  function suggestLevel(history) {
    var list = (Array.isArray(history) ? history : []).slice(-3);
    if (!list.length) return null;
    var total = 0;
    list.forEach(function (h) { total += Number(h && h.media) || 0; });
    var media = total / list.length;
    var idx = LEVELS.indexOf(levelOf({ dificuldade: list[list.length - 1].nivel }));
    if (media >= 75) idx = Math.min(LEVELS.length - 1, idx + 1);
    else if (media < 50) idx = Math.max(0, idx - 1);
    return LEVELS[idx];
  }

  // ---------------------------------------------------------------------
  // Plantão de 5 minutos
  // ---------------------------------------------------------------------
  /** Escolhe o caso do plantão: primeiro ainda não resolvido do nível; senão qualquer não resolvido; senão o primeiro. */
  function pickPlantaoCase(cases, resolvedIds, level) {
    var all = Array.isArray(cases) ? cases : [];
    if (!all.length) return null;
    var done = (Array.isArray(resolvedIds) ? resolvedIds : []).map(String);
    var open = function (c) { return done.indexOf(String(c.id)) < 0; };
    var inLevel = filterByLevel(all, level);
    return inLevel.filter(open)[0] || all.filter(open)[0] || inLevel[0] || all[0];
  }

  function plantaoRemaining(realSeconds) {
    return Math.max(0, PLANTAO_SEGUNDOS - Math.max(0, Math.floor(Number(realSeconds) || 0)));
  }

  // ---------------------------------------------------------------------
  // Nota de gatilho (CLI-12)
  // ---------------------------------------------------------------------
  function needsTriggerNote(caso) {
    if (!caso) return false;
    var oculto = caso.contextoOculto || {};
    var texto = fold([caso.titulo, caso.queixaPrincipal, caso.historicoAdmissao, oculto.exposicaoReal].join(' '));
    return TRIGGER_RE.test(texto);
  }

  // ---------------------------------------------------------------------
  // Linha do tempo do paciente
  // ---------------------------------------------------------------------
  /** Devolve uma lista nova com o evento no fim. tipos: inicio | pergunta | exame | dica. */
  function addEvent(timeline, event) {
    var list = Array.isArray(timeline) ? timeline : [];
    var ev = event || {};
    var entry = {
      t: Math.max(0, Math.floor(Number(ev.t) || 0)),
      tipo: ['inicio', 'pergunta', 'exame', 'dica'].indexOf(ev.tipo) >= 0 ? ev.tipo : 'inicio',
      rotulo: clip(ev.rotulo, LABEL_MAX),
      vitalidade: Number.isFinite(Number(ev.vitalidade)) ? Math.round(Number(ev.vitalidade)) : null,
    };
    return list.concat([entry]).slice(-TIMELINE_MAX);
  }

  function formatClock(totalSeconds) {
    var s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  }

  // ---------------------------------------------------------------------
  // Dicas progressivas (3 níveis; só com dados do próprio caso)
  // ---------------------------------------------------------------------
  /**
   * @param caso  caso atual
   * @param used  quantas dicas já foram pedidas (0 a 3)
   * @param ctx   { perguntas: n, examesSolicitados: [ids] }
   * @returns {{nivel:number,texto:string}|null} null quando as 3 dicas já foram usadas
   */
  function nextHint(caso, used, ctx) {
    var n = Math.floor(Number(used) || 0);
    if (n >= HINTS_MAX) return null;
    var c = caso || {};
    var info = ctx || {};
    var level = n + 1;

    if (level === 1) {
      return {
        nivel: 1,
        texto: (Number(info.perguntas) || 0) === 0
          ? 'Comece pela anamnese: pergunte sobre início dos sintomas, remédios, exposição e sinais de alarme. Depois releia os sinais vitais de entrada.'
          : 'Releia os sinais vitais de entrada e o histórico: que padrão eles formam quando vistos juntos?',
      };
    }
    if (level === 2) {
      var requested = Array.isArray(info.examesSolicitados) ? info.examesSolicitados.map(String) : [];
      var pending = (Array.isArray(c.examesDisponiveis) ? c.examesDisponiveis : []).filter(function (e) {
        return e && e.essencial && requested.indexOf(String(e.id)) < 0;
      })[0];
      return {
        nivel: 2,
        texto: pending
          ? 'Um exame que costuma mudar a decisão neste caso: ' + String(pending.nome) + '.'
          : 'Releia os laudos já liberados e relacione cada um aos sinais vitais e à exposição relatada.',
      };
    }
    var tox = String(c.toxindrome || '').trim();
    return {
      nivel: 3,
      texto: tox && fold(tox) !== 'outra'
        ? 'O conjunto de sinais aponta para a síndrome ' + tox + '. Que agente e que conduta se encaixam nela?'
        : 'Feche uma hipótese ligando exposição, sinais vitais e laudos; depois escolha a conduta de maior prioridade.',
    };
  }

  // ---------------------------------------------------------------------
  // Debrief por competência
  // ---------------------------------------------------------------------
  function levelOfValue(value) {
    if (value === null) return 'indisponivel';
    return value >= 75 ? 'consolidada' : value >= 50 ? 'em_desenvolvimento' : 'para_treinar';
  }

  var TIPS = {
    anamnese: 'Faça ao menos quatro perguntas cobrindo início, remédios, exposição e sinais de alarme antes de decidir.',
    exames: 'Peça primeiro os exames que mudam a conduta e evite os que só gastam tempo do paciente.',
    prioridade: 'Priorize o que protege a vida antes de investigar; cada minuto gasto pesa na estabilidade do paciente.',
    raciocinio: 'Escreva o diagnóstico e a conduta ligando cada decisão a um dado do caso (sinal, exame ou exposição).',
    autonomia: 'Tente decidir antes de pedir dica; use a primeira dica só depois de reler o prontuário.',
  };

  /**
   * @param input { perguntas:n, examesSolicitados:[ids], caso, vitalidadeInicial, vitalidadeFinal, desfecho, score|null, dicas:n }
   * @returns lista de { id, nome, valor|null, nivel, sugestao } e a média das medidas
   */
  function buildCompetencies(input) {
    var i = input || {};
    var caso = i.caso || {};
    var exams = Array.isArray(caso.examesDisponiveis) ? caso.examesDisponiveis : [];
    var requested = Array.isArray(i.examesSolicitados) ? i.examesSolicitados.map(String) : [];
    var essential = exams.filter(function (e) { return e && e.essencial; });
    var gotEssential = essential.filter(function (e) { return requested.indexOf(String(e.id)) >= 0; }).length;
    var extra = requested.filter(function (id) {
      var ex = exams.filter(function (e) { return String(e.id) === id; })[0];
      return ex && !ex.essencial;
    }).length;

    var anamnese = clamp(Math.round(((Number(i.perguntas) || 0) / QUESTIONS_TARGET) * 100), 0, 100);
    var baseExames = essential.length ? Math.round((gotEssential / essential.length) * 100) : 100;
    var examesValor = clamp(baseExames - extra * 20, 0, 100);
    var inicial = Number(i.vitalidadeInicial) || 100;
    var prioridade = i.desfecho === 'obito' ? 0 : clamp(Math.round(((Number(i.vitalidadeFinal) || 0) / inicial) * 100), 0, 100);
    var score = Number(i.score);
    var raciocinio = i.score === null || i.score === undefined || !Number.isFinite(score) ? null : clamp(Math.round(score), 0, 100);
    var autonomia = clamp(100 - (Math.floor(Number(i.dicas) || 0)) * 25, 25, 100);

    var rows = [
      { id: 'anamnese', nome: 'Anamnese', valor: anamnese },
      { id: 'exames', nome: 'Escolha de exames', valor: examesValor },
      { id: 'prioridade', nome: 'Prioridade e tempo', valor: prioridade },
      { id: 'raciocinio', nome: 'Raciocínio clínico', valor: raciocinio },
      { id: 'autonomia', nome: 'Autonomia', valor: autonomia },
    ].map(function (r) {
      var nivel = levelOfValue(r.valor);
      return {
        id: r.id, nome: r.nome, valor: r.valor, nivel: nivel,
        sugestao: nivel === 'consolidada' ? '' : (nivel === 'indisponivel' ? 'A nota do preceptor não chegou; tente de novo mais tarde.' : TIPS[r.id]),
      };
    });

    var measured = rows.filter(function (r) { return r.valor !== null; });
    var sum = measured.reduce(function (acc, r) { return acc + r.valor; }, 0);
    return { competencias: rows, media: measured.length ? Math.round(sum / measured.length) : 0 };
  }

  /** Competência mais fraca entre as medidas (para o "próximo passo"). */
  function weakest(competencias) {
    var list = (Array.isArray(competencias) ? competencias : []).filter(function (r) { return r.valor !== null; });
    if (!list.length) return null;
    return list.reduce(function (a, b) { return b.valor < a.valor ? b : a; });
  }

  /** Histórico privado (aparelho): acrescenta e limita; devolve lista nova. */
  function appendHistory(history, entry) {
    var list = Array.isArray(history) ? history : [];
    var e = entry || {};
    return list.concat([{
      caseId: String(e.caseId || '').slice(0, 80),
      nivel: levelOf({ dificuldade: e.nivel }),
      media: clamp(Math.round(Number(e.media) || 0), 0, 100),
    }]).slice(-HISTORY_MAX);
  }

  root.ClinicLearn = {
    PLANTAO_SEGUNDOS: PLANTAO_SEGUNDOS,
    HINTS_MAX: HINTS_MAX,
    LEVELS: LEVELS,
    LEVEL_LABEL: LEVEL_LABEL,
    TRIGGER_NOTE: TRIGGER_NOTE,
    levelOf: levelOf,
    filterByLevel: filterByLevel,
    countByLevel: countByLevel,
    suggestLevel: suggestLevel,
    pickPlantaoCase: pickPlantaoCase,
    plantaoRemaining: plantaoRemaining,
    needsTriggerNote: needsTriggerNote,
    addEvent: addEvent,
    formatClock: formatClock,
    nextHint: nextHint,
    buildCompetencies: buildCompetencies,
    weakest: weakest,
    appendHistory: appendHistory,
  };
})(typeof window !== 'undefined' ? window : globalThis);
