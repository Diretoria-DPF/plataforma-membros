/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinic-aprendizado-ui.js
 * Liga as regras de clinic-aprendizado.js à tela da Clínica: filtro por nível e plantão de 5 minutos nos leitos,
 * nota de gatilho, linha do tempo, dicas progressivas e debrief por competência. O motor (clinic-engine.js) chama
 * os ganchos onCaseStart, noteQuestion, noteExam, onTick e onResult só se este módulo existir.
 * Segurança: tudo entra no DOM por createElement/textContent. O histórico fica só neste aparelho (localStorage).
 */
(function () {
  'use strict';

  var Learn = window.ClinicLearn;
  if (!Learn) return;

  var HISTORY_KEY = 'laift_clinica_debriefs';
  var LEVEL_KEY = 'laift_clinica_nivel';
  var NOTICE_PLANTAO_END = 'O tempo do plantão acabou. Feche o diagnóstico e a conduta quando estiver pronta ou pronto.';

  var level = 'todos';
  var current = null;          // caso em atendimento
  var timelines = new Map();   // caseId -> eventos (sobrevive à pausa)
  var hintsUsed = new Map();   // caseId -> quantidade
  var questions = new Map();   // caseId -> perguntas feitas
  var plantao = null;          // { caseId, real, finished }
  var plantaoPending = false;
  var lastVitality = 100;

  function byId(id) { return document.getElementById(id); }

  function el(tag, text, className) {
    var node = document.createElement(tag);
    if (text !== undefined && text !== null) node.textContent = String(text);
    if (className) node.className = className;
    return node;
  }

  function clear(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function readStore(key) {
    try {
      var raw = JSON.parse(localStorage.getItem(key) || 'null');
      return raw;
    } catch (e) { return null; }
  }

  function writeStore(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* sem armazenamento: só não lembra */ }
  }

  function caseKey(caso) { return String((caso && caso.id) || ''); }

  // ---------------------------------------------------------------------
  // Leitos: nível e plantão
  // ---------------------------------------------------------------------
  function resolvedIds() {
    var api = window.ClinicEngine;
    return api && api.getResolvedCases ? api.getResolvedCases() : [];
  }

  function allCases() {
    return typeof clinicalCases !== 'undefined' && Array.isArray(clinicalCases) ? clinicalCases : [];
  }

  function history() {
    var h = readStore(HISTORY_KEY);
    return Array.isArray(h) ? h : [];
  }

  function refreshLevelHint() {
    var hint = byId('levelHint');
    if (!hint) return;
    var counts = Learn.countByLevel(allCases());
    var suggested = Learn.suggestLevel(history());
    var parts = ['Básico: ' + counts.basico, 'Intermediário: ' + counts.intermediario, 'Avançado: ' + counts.avancado];
    var text = 'Casos por nível. ' + parts.join(' · ') + '.';
    if (suggested) text += ' Nível sugerido pelos seus últimos atendimentos: ' + Learn.LEVEL_LABEL[suggested] + '.';
    hint.textContent = text;
  }

  function setLevel(next) {
    level = next === 'todos' || Learn.LEVELS.indexOf(next) >= 0 ? next : 'todos';
    writeStore(LEVEL_KEY, level);
    var select = byId('levelFilter');
    if (select && select.value !== level) select.value = level;
    if (window.ClinicEngine) window.ClinicEngine.renderBedsGrid();
  }

  function startPlantao() {
    var pick = Learn.pickPlantaoCase(allCases(), resolvedIds(), level);
    if (!pick || !window.ClinicEngine) return;
    plantaoPending = true;
    window.ClinicEngine.openBed(pick);
  }

  /** Usado pelo motor ao desenhar os leitos. */
  function filterCases(list) {
    return Learn.filterByLevel(list, level);
  }

  function emptyLevelMessage() {
    return 'Nenhum caso neste nível ainda. Escolha outro nível ou gere um caso novo.';
  }

  // ---------------------------------------------------------------------
  // Atendimento
  // ---------------------------------------------------------------------
  function renderTimeline(list, target) {
    var ol = target || byId('timelineList');
    if (!ol) return;
    clear(ol);
    if (!list.length) {
      ol.appendChild(el('li', 'Nada registrado ainda.', 'timeline-empty'));
      return;
    }
    list.forEach(function (ev) {
      var texto = ev.rotulo;
      if (ev.vitalidade !== null) texto += ' · estabilidade ' + ev.vitalidade + '%';
      var li = el('li', null, 'timeline-item timeline-' + ev.tipo);
      li.appendChild(el('strong', Learn.formatClock(ev.t)));
      li.appendChild(document.createTextNode(' ' + texto));
      ol.appendChild(li);
    });
  }

  function pushEvent(tipo, rotulo, state) {
    if (!current) return;
    var key = caseKey(current);
    var list = Learn.addEvent(timelines.get(key) || [], {
      t: state ? state.elapsedSeconds : 0, tipo: tipo, rotulo: rotulo, vitalidade: state ? state.vitality : null,
    });
    timelines.set(key, list);
    if (state) lastVitality = state.vitality;
    renderTimeline(list);
  }

  function renderHintButton() {
    var btn = byId('btnHint');
    if (!btn) return;
    var used = hintsUsed.get(caseKey(current)) || 0;
    btn.disabled = used >= Learn.HINTS_MAX;
    btn.textContent = used >= Learn.HINTS_MAX ? 'Dicas esgotadas' : 'Pedir dica (' + used + ' de ' + Learn.HINTS_MAX + ')';
  }

  function askHint() {
    if (!current) return;
    var key = caseKey(current);
    var used = hintsUsed.get(key) || 0;
    var hint = Learn.nextHint(current, used, {
      perguntas: questions.get(key) || 0,
      examesSolicitados: window.ClinicEngine && window.ClinicEngine.getRequestedExams ? window.ClinicEngine.getRequestedExams() : [],
    });
    if (!hint) return;
    hintsUsed.set(key, used + 1);
    var box = byId('hintText');
    if (box) box.textContent = 'Dica ' + hint.nivel + ': ' + hint.texto;
    var state = window.ClinicEngine && window.ClinicEngine.getState ? window.ClinicEngine.getState() : null;
    pushEvent('dica', 'Dica ' + hint.nivel + ' pedida', state);
    renderHintButton();
  }

  function renderPlantaoBar() {
    var bar = byId('plantaoBar');
    if (!bar) return;
    var on = !!(plantao && current && plantao.caseId === caseKey(current));
    bar.classList.toggle('hidden', !on);
    if (!on) return;
    var left = Learn.plantaoRemaining(plantao.real);
    bar.textContent = left > 0
      ? 'Plantão de 5 minutos · restam ' + Learn.formatClock(left)
      : NOTICE_PLANTAO_END;
  }

  function onCaseStart(caso, state, restored) {
    current = caso;
    var key = caseKey(caso);
    lastVitality = state ? state.vitality : 100;
    if (!restored) {
      timelines.delete(key);
      hintsUsed.delete(key);
      questions.delete(key);
    }
    if (plantaoPending && !restored) {
      plantao = { caseId: key, real: 0, finished: false };
    } else if (plantao && plantao.caseId !== key) {
      plantao = null;
    }
    plantaoPending = false;

    var note = byId('triggerNote');
    if (note) {
      var sensivel = Learn.needsTriggerNote(caso);
      note.textContent = sensivel ? Learn.TRIGGER_NOTE : '';
      note.classList.toggle('hidden', !sensivel);
    }
    var hint = byId('hintText');
    if (hint) hint.textContent = '';
    if (!restored) pushEvent('inicio', 'Chegada do paciente', state);
    else renderTimeline(timelines.get(key) || []);
    renderHintButton();
    renderPlantaoBar();
  }

  function noteQuestion(text, state) {
    if (!current) return;
    var key = caseKey(current);
    questions.set(key, (questions.get(key) || 0) + 1);
    pushEvent('pergunta', 'Pergunta: ' + text, state);
  }

  function noteExam(exam, state) {
    pushEvent('exame', 'Exame: ' + (exam && exam.nome ? exam.nome : 'solicitado'), state);
  }

  function onTick(state) {
    if (state) lastVitality = state.vitality;
    if (!plantao || !current || plantao.caseId !== caseKey(current) || (state && state.paused)) return;
    plantao.real += 1;
    if (!plantao.finished && Learn.plantaoRemaining(plantao.real) === 0) {
      plantao.finished = true;
      var tab = document.querySelector('[data-tab="fechamentoTab"]');
      if (tab) tab.click();
    }
    renderPlantaoBar();
  }

  // ---------------------------------------------------------------------
  // Debrief por competência
  // ---------------------------------------------------------------------
  var LEVEL_TEXT = {
    consolidada: 'Consolidada',
    em_desenvolvimento: 'Em desenvolvimento',
    para_treinar: 'Para treinar',
    indisponivel: 'Indisponível',
  };

  function onResult(result, outcome, info) {
    var box = byId('competencyDebrief');
    if (!box) return;
    var caso = (info && info.caso) || current || {};
    var key = caseKey(caso);
    var state = (info && info.state) || {};
    var score = result && Number.isFinite(Number(result.score)) ? Number(result.score) : null;
    var built = Learn.buildCompetencies({
      caso: caso,
      perguntas: questions.get(key) || 0,
      examesSolicitados: (info && info.exams) || [],
      vitalidadeInicial: caso.vitalidadeInicial,
      vitalidadeFinal: state.vitality !== undefined ? state.vitality : lastVitality,
      desfecho: outcome,
      score: score,
      dicas: hintsUsed.get(key) || 0,
    });

    clear(box);
    box.appendChild(el('h4', 'Debrief por competência'));
    var list = el('ul', null, 'competency-list');
    built.competencias.forEach(function (c) {
      var item = el('li', null, 'competency-item competency-' + c.nivel);
      var head = el('div', null, 'competency-head');
      head.appendChild(el('strong', c.nome));
      head.appendChild(el('span', c.valor === null ? LEVEL_TEXT[c.nivel] : c.valor + '% · ' + LEVEL_TEXT[c.nivel]));
      item.appendChild(head);
      var bar = el('div', null, 'competency-bar');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', c.nome);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      if (c.valor !== null) bar.setAttribute('aria-valuenow', String(c.valor));
      var fill = el('div', null, 'competency-fill');
      fill.style.width = (c.valor === null ? 0 : c.valor) + '%';
      bar.appendChild(fill);
      item.appendChild(bar);
      if (c.sugestao) item.appendChild(el('p', c.sugestao, 'competency-tip'));
      list.appendChild(item);
    });
    box.appendChild(list);

    var fraca = Learn.weakest(built.competencias);
    if (fraca && fraca.sugestao) box.appendChild(el('p', 'Próximo passo: treine ' + fraca.nome.toLowerCase() + '. ' + fraca.sugestao, 'competency-next'));

    box.appendChild(el('h4', 'Linha do tempo do atendimento'));
    var ol = el('ol', null, 'timeline-list');
    renderTimeline(timelines.get(key) || [], ol);
    box.appendChild(ol);
    box.classList.remove('hidden');

    if (score !== null || outcome) {
      writeStore(HISTORY_KEY, Learn.appendHistory(history(), { caseId: key, nivel: caso.dificuldade, media: built.media }));
      refreshLevelHint();
    }
  }

  function init() {
    var stored = readStore(LEVEL_KEY);
    level = typeof stored === 'string' && (stored === 'todos' || Learn.LEVELS.indexOf(stored) >= 0) ? stored : 'todos';
    var select = byId('levelFilter');
    if (select) {
      select.value = level;
      select.addEventListener('change', function () { setLevel(select.value); });
    }
    var plantaoBtn = byId('btnPlantao5');
    if (plantaoBtn) plantaoBtn.addEventListener('click', startPlantao);
    var hintBtn = byId('btnHint');
    if (hintBtn) hintBtn.addEventListener('click', askHint);
    refreshLevelHint();
  }

  window.ClinicLearnUI = {
    filterCases: filterCases,
    emptyLevelMessage: emptyLevelMessage,
    sensitiveTag: function (caso) { return Learn.needsTriggerNote(caso) ? 'Tema sensível' : ''; },
    onCaseStart: onCaseStart,
    noteQuestion: noteQuestion,
    noteExam: noteExam,
    onTick: onTick,
    onResult: onResult,
    init: init,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
