/**
 * quiz-engine.js — motor único dos simulados de múltipla escolha LAIFT.
 *
 * Antes, quiz/app.js (Farmacologia) e toxicologia/app.js tinham ~220 linhas
 * idênticas (tópicos, modos estudo/prova, cronômetro, navegação, progresso,
 * resultados) que já tinham divergido em bugs e recursos. Agora os dois
 * módulos só configuram este motor: banco de questões, chave de progresso,
 * rótulos e as integrações próprias (RxNav/PubChem/ChEBI no quiz, OpenFDA na
 * toxicologia) via ganchos.
 *
 * Comportamento preservado dos dois módulos:
 *   - Modo Estudo: gabarito e explicação imediatos; respostas salvas no
 *     localStorage sob a chave do módulo (pharmaQuizProgress /
 *     toxicoQuizProgress — as MESMAS de antes, para ninguém perder progresso);
 *   - Modo Prova: questões embaralhadas, 90 s por questão, sem feedback até a
 *     entrega, nada salvo localmente;
 *   - "Continuar de onde parei", "Reiniciar progresso", seleção de tópicos,
 *     atalhos ← → e 1–4, revisão das erradas e refazer o simulado.
 *
 * Novo (Fase 4):
 *   - ao concluir, envia o resultado à plataforma pela ponte
 *     window.LaiftApi.call('apiLearnSubmitQuizAttempt', {...}) (Contrato 3/4
 *     de docs/PLANO_FASES_2_3_4.md) — a toxicologia nunca enviava e o quiz
 *     mandava ao Apps Script legado;
 *   - salvar o progresso de um tópico não apaga mais o dos outros;
 *   - todo texto vai por textContent (o OpenFDA entrava por innerHTML);
 *   - alternativas são <button> (teclado/leitor de tela) e avisos usam
 *     role="status" em vez de alert().
 *
 * ENG-04/05: quickStart() abre o primeiro simulado curto já na questão 1; a resposta nova anima e vibra
 * (quiz-feedback.js, opcional; respeita movimento reduzido e a preferência "Vibração").
 *
 * Depende de ../shared/safe-dom.js (LaiftDom). Uso: ver quiz/app.js.
 */
(function (global) {
  'use strict';

  var SECONDS_PER_EXAM_QUESTION = 90;
  var QUICK_START_COUNT = 5; // "Fazer o primeiro quiz" (ENG-04): questões do primeiro simulado
  var URGENT_SECONDS = 300;
  var API_MODE = { study: 'estudo', exam: 'prova' };
  var QUEUED_MESSAGE = 'Salvo neste aparelho, será enviado quando houver internet.';

  var Logic = global.LaiftQuizLogic;

  function $(id) { return global.document.getElementById(id); }

  function prefersReducedMotion() {
    try { return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }

  // QZ-02: traz o alvo para a vista (no celular a barra lateral fica acima do quiz). `block`: 'start' ou 'nearest'.
  function bringIntoView(target, block) {
    if (!target || typeof target.scrollIntoView !== 'function') return;
    try { target.scrollIntoView({ block: block || 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* navegador sem opções */ }
  }

  function shuffle(list) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function readJson(key) {
    try {
      var raw = global.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function show(el, visible) { if (el) el.hidden = !visible; }

  // Avisos e confirmações: modal acessível (LaiftDialog); sem ele, cai nos nativos.
  function dialogAlert(message) {
    if (global.LaiftDialog) return global.LaiftDialog.alert(message);
    global.alert(message);
    return Promise.resolve();
  }
  function dialogConfirm(message) {
    if (global.LaiftDialog) return global.LaiftDialog.confirm(message);
    return Promise.resolve(global.confirm(message));
  }

  /**
   * @param {object} cfg
   * @param {'farmacologia'|'toxicologia'} cfg.module  nome do módulo na API
   * @param {string} cfg.storageKey   chave do progresso no localStorage
   * @param {Function} cfg.questions  () => [{ id, topic, question, options, correct, explanation, ... }]
   * @param {object} [cfg.labels]     textos específicos do módulo
   * @param {Function} [cfg.onQuestion]     (questão) => void — ex.: desenhar a molécula
   * @param {Function} [cfg.onExplanation]  (questão, ui) => Promise|void — enriquece a explicação
   */
  function create(cfg) {
    var L = Object.assign({
      noTopic: 'Selecione pelo menos um tópico no menu lateral.',
      noQuestions: 'Nenhuma questão encontrada para os tópicos selecionados.',
      emptyBank: 'Nenhuma questão foi carregada.',
      resetConfirm: 'Tem certeza que deseja apagar todo o seu progresso salvo?',
      resultsTitle: '🎯 RESULTADOS DO SIMULADO',
      topicsTitle: '📊 Desempenho por tópico:',
      reviewLabel: '🔍 Revisar Questões Erradas',
      retryLabel: '🔄 Refazer Este Simulado',
      homeLabel: '🏠 Voltar aos Tópicos',
      allCorrect: 'Parabéns! Você acertou todas as questões!',
      studyTimer: 'Modo Estudo',
      reviewTimer: 'Modo Estudo (Revisão)',
      performance: null,
    }, cfg.labels || {});

    var el = {
      topicsGrid: $('topicsGrid'), startBtn: $('startQuiz'), selectAll: $('selectAll'), deselectAll: $('deselectAll'),
      continueBtn: $('continueBtn'), resetBtn: $('resetProgressBtn'), startScreen: $('startScreen'),
      quiz: $('quizContainer'), results: $('resultsContainer'), topic: $('currentTopic'), timer: $('timer'),
      current: $('currentQuestion'), total: $('totalQuestions'), progress: $('progress'),
      questionText: $('questionText'), options: $('optionsContainer'), explanation: $('explanation'),
      explanationText: $('explanationText'), prev: $('prevBtn'), next: $('nextBtn'), finish: $('finishBtn'),
      totalTopics: $('totalTopics'), selectedTopics: $('selectedTopics'), totalQs: $('totalQs'),
      answered: $('answeredStat'), correct: $('correctStat'), progressStat: $('progressStat'),
      totalStat: $('totalQuestionsStat'), status: $('quizStatus'),
      infoBtn: $('infoBtn'), infoModal: $('instructionsModal'), closeModal: $('closeModal'),
    };
    var modeButtons = Array.prototype.slice.call(global.document.querySelectorAll('.mode-btn'));

    var state = {
      bank: [], selected: new Set(), mode: 'study', questions: [], index: 0, answers: [],
      active: false, timeLeft: 0, timer: null, startedAt: 0, renderToken: 0, lastFocusedOption: null,
      seed: 0, // semente da ordem das alternativas (QZ-01): salva no estudo, nova a cada prova
    };

    var queue = createQueue();

    function createQueue() {
      var Q = global.LaiftQuizQueue;
      if (!Q || !global.LaiftApi || typeof global.LaiftApi.call !== 'function') return null;
      return Q.create({
        backend: Q.createDefaultBackend(global.indexedDB),
        send: function (body) { return global.LaiftApi.call('apiLearnSubmitQuizAttempt', body); },
        owner: function () {
          try { var id = global.LaiftIdentity && global.LaiftIdentity.get(); return Q.ownerTag(id && id.email); } catch (e) { return ''; }
        },
      });
    }

    // ------------------------------------------------------------------
    // Progresso local: { v: 2, byId, seed, owner, timestamp }. As respostas ficam por id da questão (inserir
    // ou reordenar questões não desloca o progresso) e valem como índice na ORDEM ORIGINAL das alternativas.
    // O formato antigo ({ userAnswers } por posição) ainda é lido e vira v2 na próxima gravação.
    // `owner` (hash local do e-mail) impede mostrar o progresso de outra conta no mesmo navegador.
    // ------------------------------------------------------------------
    function ownerNow() {
      var Q = global.LaiftQuizQueue;
      try {
        var id = global.LaiftIdentity && global.LaiftIdentity.get();
        return Q && id && id.email ? Q.ownerTag(id.email) : '';
      } catch (e) { return ''; }
    }

    function savedProgress() {
      var p = Logic.readProgress(readJson(cfg.storageKey), state.bank);
      var now = ownerNow();
      if (p.owner && now && p.owner !== now) return Logic.readProgress(null, state.bank);
      return p;
    }

    function answerFor(progress, q) {
      var a = progress.byId[String(q.id)];
      return a === undefined ? null : a;
    }

    function persist(progress) {
      try { global.localStorage.setItem(cfg.storageKey, JSON.stringify(progress)); } catch (e) { /* armazenamento indisponível: o simulado segue sem salvar */ }
    }

    function saveProgress() {
      if (state.mode === 'exam') return;
      // Parte do que já estava salvo: estudar um tópico não apaga o progresso dos outros.
      var previous = savedProgress();
      var entries = state.questions.map(function (q, i) { return { id: q.id, answer: state.answers[i] }; });
      persist(Logic.writeProgress(previous, entries, { seed: state.seed, owner: ownerNow() || previous.owner }));
    }

    /** Refazer: esquece só as respostas destas questões, sem tocar nas dos outros tópicos. */
    function forgetAnswers(questions) {
      var previous = savedProgress();
      var cleaned = Logic.withoutIds(previous, questions.map(function (q) { return q.id; }));
      persist(Logic.writeProgress(cleaned, [], { seed: state.seed, owner: ownerNow() || previous.owner }));
    }

    function clearProgress() {
      try { global.localStorage.removeItem(cfg.storageKey); } catch (e) { /* idem */ }
    }

    function savedAnswerCount(questions) {
      var progress = savedProgress();
      return questions.filter(function (q) { return answerFor(progress, q) !== null; }).length;
    }

    // ------------------------------------------------------------------
    // Barra lateral: tópicos, modos e estatísticas
    // ------------------------------------------------------------------
    function allTopics() {
      var seen = [];
      state.bank.forEach(function (q) { if (q.topic && seen.indexOf(q.topic) === -1) seen.push(q.topic); });
      return seen;
    }

    function setStatus(message, kind) {
      if (!el.status) { if (message) dialogAlert(message); return; }
      el.status.textContent = message || '';
      el.status.dataset.kind = kind || 'info';
    }

    function renderTopics() {
      LaiftDom.clear(el.topicsGrid);
      allTopics().forEach(function (topic) {
        var count = state.bank.filter(function (q) { return q.topic === topic; }).length;
        el.topicsGrid.appendChild(LaiftDom.h('button', {
          type: 'button', className: 'topic-btn', 'aria-pressed': 'false', dataset: { topic: topic },
          onClick: function () { toggleTopic(topic); },
        }, [LaiftDom.h('span', { text: topic }), LaiftDom.h('span', { className: 'topic-count', text: String(count), 'aria-label': count + ' questões' })]));
      });
    }

    function toggleTopic(topic) {
      if (state.selected.has(topic)) state.selected.delete(topic); else state.selected.add(topic);
      refreshSidebar();
    }

    function refreshSidebar() {
      Array.prototype.forEach.call(el.topicsGrid.querySelectorAll('.topic-btn'), function (btn) {
        var on = state.selected.has(btn.dataset.topic);
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      if (el.selectedTopics) el.selectedTopics.textContent = state.selected.size;
      var totalTopics = allTopics().length;
      if (el.deselectAll) {
        el.deselectAll.classList.toggle('secondary', state.selected.size === 0);
        el.deselectAll.classList.toggle('active-clear', state.selected.size > 0);
      }
      if (el.selectAll) {
        var canSelect = state.selected.size < totalTopics && totalTopics > 0;
        el.selectAll.classList.toggle('secondary', !canSelect);
        el.selectAll.classList.toggle('active-select', canSelect);
      }
      if (state.selected.size) setStatus('');
      updateStats();
    }

    function setMode(mode) {
      state.mode = mode;
      modeButtons.forEach(function (btn) {
        var on = btn.dataset.mode === mode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function updateStats() {
      var progress = savedProgress();
      var answered = 0, correct = 0;
      state.bank.forEach(function (q) {
        var a = answerFor(progress, q);
        if (a === null) return;
        answered++;
        if (a === q.correct) correct++;
      });
      if (el.answered) el.answered.textContent = answered;
      if (el.correct) el.correct.textContent = correct;
      if (el.progressStat) el.progressStat.textContent = (state.bank.length ? Math.round((answered / state.bank.length) * 100) : 0) + '%';
      show(el.resetBtn, answered > 0);
      show(el.continueBtn, answered > 0);
    }

    function showScreen(name) {
      show(el.startScreen, name === 'start');
      show(el.quiz, name === 'quiz');
      show(el.results, name === 'results');
    }

    // ------------------------------------------------------------------
    // Ciclo do simulado
    // ------------------------------------------------------------------
    function stopTimer() { clearInterval(state.timer); state.timer = null; }

    function setTimerText(text, urgent) {
      if (!el.timer) return;
      el.timer.textContent = text;
      el.timer.classList.toggle('timer-urgent', !!urgent);
    }

    function startTimer() {
      stopTimer();
      renderTimer();
      state.timer = setInterval(function () {
        state.timeLeft--;
        renderTimer();
        if (state.timeLeft <= 0) {
          stopTimer();
          if (state.active) finishQuiz();
        }
      }, 1000);
    }

    function renderTimer() {
      var t = Math.max(0, state.timeLeft);
      var mm = String(Math.floor(t / 60)).padStart(2, '0');
      var ss = String(t % 60).padStart(2, '0');
      setTimerText(mm + ':' + ss, t < URGENT_SECONDS);
      if (el.timer) el.timer.setAttribute('aria-label', 'Tempo restante: ' + Math.floor(t / 60) + ' min ' + (t % 60) + ' s');
    }

    function begin(questions, answers, index, timerLabel) {
      state.questions = questions;
      state.answers = answers;
      state.index = index;
      state.startedAt = Date.now();
      state.active = true;
      state.seed = state.mode === 'exam' ? Logic.newSeed() : (savedProgress().seed || Logic.newSeed());
      showScreen('quiz');
      stopTimer();
      if (state.mode === 'exam') {
        state.timeLeft = questions.length * SECONDS_PER_EXAM_QUESTION;
        startTimer();
      } else {
        setTimerText(timerLabel || L.studyTimer, false);
        if (el.timer) el.timer.removeAttribute('aria-label');
      }
      loadQuestion();
      if (el.questionText) el.questionText.focus({ preventScroll: true });
      bringIntoView(el.quiz, 'start');
      if (state.questions[0]) announce('Questão ' + (state.index + 1) + ' de ' + state.questions.length + '. ' + state.questions[state.index].question);
    }

    function startQuiz() {
      if (!state.selected.size) { setStatus(L.noTopic, 'error'); return; }
      var questions = state.bank.filter(function (q) { return state.selected.has(q.topic); });
      if (!questions.length) { setStatus(L.noQuestions, 'error'); return; }
      setStatus('');
      if (state.mode === 'exam') shuffle(questions);
      var answers = new Array(questions.length).fill(null);
      // Modo Estudo retoma as respostas já dadas nesses tópicos.
      if (state.mode === 'study') {
        var saved = savedProgress();
        questions.forEach(function (q, i) { answers[i] = answerFor(saved, q); });
      }
      begin(questions, answers, 0);
    }

    /**
     * Primeiro quiz em um toque (ENG-04): estudo, `count` questões de tópicos variados (a primeira de cada
     * tópico, em rodízio), já na primeira questão. Não interrompe um simulado em andamento.
     */
    function quickStart(count) {
      if (state.active || !state.bank.length) return false;
      var want = count > 0 ? count : QUICK_START_COUNT;
      var perTopic = allTopics().map(function (topic) {
        return state.bank.filter(function (q) { return q.topic === topic; });
      });
      var picked = [];
      for (var round = 0; picked.length < want && round < state.bank.length; round++) {
        for (var t = 0; t < perTopic.length && picked.length < want; t++) {
          if (perTopic[t][round]) picked.push(perTopic[t][round]);
        }
      }
      if (!picked.length) return false;
      setMode('study');
      state.selected = new Set(allTopics());
      refreshSidebar();
      setStatus('');
      begin(picked, new Array(picked.length).fill(null), 0);
      return true;
    }

    function continueQuiz() {
      var saved = savedProgress();
      var questions = state.bank.slice();
      var answers = questions.map(function (q) { return answerFor(saved, q); });
      var next = answers.indexOf(null);
      setMode('study');
      begin(questions, answers, next === -1 ? 0 : next);
    }

    function resetProgress() {
      dialogConfirm(L.resetConfirm).then(function (ok) {
        if (!ok) return;
        clearProgress();
        state.answers = [];
        state.active = false;
        stopTimer();
        showScreen('start');
        updateStats();
      });
    }

    /** Ordem de exibição das alternativas desta questão (posição exibida -> índice original). */
    function orderOf(q) {
      return Logic.optionOrder(state.seed, q.id, q.options.length);
    }

    // `position` é a posição exibida (letra); `original`, o índice no dado. O gabarito e as respostas usam o original.
    function optionButton(text, position, original) {
      var answered = state.answers[state.index];
      var letter = String.fromCharCode(65 + position);
      var btn = LaiftDom.h('button', {
        type: 'button', className: 'option', 'aria-pressed': answered === original ? 'true' : 'false',
        dataset: { index: String(position) }, onClick: function () { selectOption(position); },
      }, [
        LaiftDom.h('span', { className: 'option-letter', 'aria-hidden': 'true', text: letter }),
        LaiftDom.h('span', { className: 'option-text', text: text }),
      ]);
      btn.setAttribute('aria-label', 'Alternativa ' + letter + ': ' + text);
      if (answered === original) btn.classList.add('selected');
      return btn;
    }

    // Revisão de conteúdo é assunto da gestão: o público não vê selo nem aviso de revisão. Fica só um item discreto
    // para avisar a diretoria de um erro, no rodapé da explicação (LaiftReviewSeal.report, sem texto de "revisão").
    function reportContext(q) {
      return { kind: 'questão', module: cfg.module, id: q.id, topic: q.topic, excerpt: q.question };
    }

    function ensureReportButton() {
      if (!el.explanation || el.reportBtn || !global.LaiftReviewSeal || typeof global.LaiftReviewSeal.report !== 'function') return;
      el.reportBtn = LaiftDom.h('button', {
        type: 'button', className: 'quiz-report-btn', text: 'Reportar erro nesta questão',
        onClick: function () { var q = state.questions[state.index]; if (q) global.LaiftReviewSeal.report(reportContext(q)); },
      });
      var row = LaiftDom.h('div', { className: 'quiz-report-row' }, [el.reportBtn]);
      el.explanation.appendChild(row);
    }

    // Uma única região viva curta (QZ-12): enunciado ao trocar de questão e "Correta/Incorreta" ao responder.
    function announce(message) {
      if (!el.announce) {
        el.announce = LaiftDom.h('p', { className: 'laift-sr-only', role: 'status', 'aria-live': 'polite', id: 'quizAnnounce' });
        (el.quiz || global.document.body).appendChild(el.announce);
      }
      el.announce.textContent = message;
    }

    function loadQuestion() {
      if (!state.active || state.index >= state.questions.length) return;
      var q = state.questions[state.index];
      var token = ++state.renderToken;
      el.topic.textContent = q.topic;
      el.current.textContent = state.index + 1;
      el.total.textContent = state.questions.length;
      el.questionText.textContent = q.question;
      el.progress.style.width = (((state.index + 1) / state.questions.length) * 100) + '%';
      if (el.progress.parentElement) el.progress.parentElement.setAttribute('aria-valuenow', String(state.index + 1));
      if (el.progress.parentElement) el.progress.parentElement.setAttribute('aria-valuemax', String(state.questions.length));

      LaiftDom.clear(el.options);
      var order = orderOf(q);
      order.forEach(function (original, position) { el.options.appendChild(optionButton(q.options[original], position, original)); });
      ensureReportButton();

      el.prev.disabled = state.index === 0;
      var last = state.index === state.questions.length - 1;
      show(el.next, !last);
      show(el.finish, last);

      el.explanation.classList.remove('show');
      if (typeof cfg.onQuestion === 'function') {
        try { cfg.onQuestion(q); } catch (e) { console.warn('[QuizEngine] onQuestion:', e); }
      }
      if (state.answers[state.index] !== null && state.answers[state.index] !== undefined && state.mode === 'study') {
        showExplanation(token);
      }
    }

    // `position` é a posição exibida (letra/tecla 1–4); a resposta guardada é o índice original.
    function selectOption(position) {
      if (!state.active) return;
      var q = state.questions[state.index];
      if (!q || position < 0 || position >= q.options.length) return;
      // QZ-03: no estudo o gabarito aparece na primeira resposta; reresponder mudaria a pontuação enviada.
      if (!Logic.canAnswer(state.mode, state.answers[state.index])) return;
      state.answers[state.index] = orderOf(q)[position];
      saveProgress();
      updateStats();
      state.freshAnswer = true; // só uma resposta nova anima/vibra; navegar entre questões já respondidas, não
      loadQuestion();
      state.freshAnswer = false;
      // O re-render troca os botões: devolve o foco à alternativa escolhida
      // para quem navega por teclado/leitor de tela não "cair" no topo.
      var chosen = el.options.querySelector('.option[data-index="' + position + '"]');
      if (chosen) chosen.focus({ preventScroll: true });
      // QZ-02: o feedback e a explicação ficam abaixo das alternativas; no celular saem da tela.
      if (state.mode === 'study') bringIntoView(el.explanation, 'nearest');
    }

    function showExplanation(token) {
      var q = state.questions[state.index];
      var userAnswer = state.answers[state.index];
      var order = orderOf(q);
      Array.prototype.forEach.call(el.options.querySelectorAll('.option'), function (opt, i) {
        var original = order[i];
        opt.classList.remove('correct', 'incorrect');
        var label = opt.getAttribute('aria-label') || '';
        if (original === q.correct) {
          opt.classList.add('correct');
          opt.setAttribute('aria-label', label + (original === userAnswer ? ' (sua resposta, correta)' : ' (correta)'));
        } else if (original === userAnswer) {
          opt.classList.add('incorrect');
          opt.setAttribute('aria-label', label + ' (sua resposta, incorreta)');
        }
        opt.setAttribute('aria-disabled', 'true'); // QZ-03: resposta definitiva no estudo
      });
      if (state.freshAnswer) announce(userAnswer === q.correct ? 'Resposta correta.' : 'Resposta incorreta.');
      if (state.freshAnswer && global.LaiftQuizFeedback) {
        global.LaiftQuizFeedback.respond(global, el.options.querySelector('.option.selected'));
      }
      el.explanationText.textContent = q.explanation || '';
      el.explanation.classList.add('show');
      if (typeof cfg.onExplanation === 'function') {
        var ui = {
          explanationText: el.explanationText,
          // Ganchos assíncronos (OpenFDA) checam isto antes de escrever, para
          // não pôr o alerta de uma questão na tela da seguinte.
          isCurrent: function () { return token === state.renderToken; },
        };
        Promise.resolve().then(function () { return cfg.onExplanation(q, ui); }).catch(function (e) {
          console.warn('[QuizEngine] onExplanation:', e);
        });
      }
    }

    function go(delta) {
      var next = state.index + delta;
      if (next < 0 || next >= state.questions.length) return;
      state.index = next;
      loadQuestion();
      var q = state.questions[state.index];
      if (q) announce('Questão ' + (state.index + 1) + ' de ' + state.questions.length + '. ' + q.question);
    }

    // QZ-05: questão em branco não é erro. Pela tela, confirma antes de entregar com branco; o tempo esgotado entrega direto.
    function requestFinish() {
      if (!state.active) return;
      var blank = Logic.scoreAnswers(state.questions, state.answers).blank;
      if (!blank) { finishQuiz(); return; }
      if (blank === state.questions.length) { dialogAlert('Responda pelo menos uma questão para ver o resultado.'); return; }
      dialogConfirm(blank + (blank === 1 ? ' questão ficou em branco' : ' questões ficaram em branco') + '. Elas não contam como erro nem entram no resultado. Finalizar mesmo assim?')
        .then(function (ok) { if (ok) finishQuiz(); });
    }

    function finishQuiz() {
      if (!state.active) return;
      state.active = false;
      stopTimer();
      var r = Logic.scoreAnswers(state.questions, state.answers);
      var duration = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
      var statusEl = showResults(r.correct, r.topicScores, r.topicCounts, r.answered, r.blank);
      if (!r.answered) { statusEl.textContent = 'Nenhuma questão respondida: nada foi registrado.'; return; }
      submitAttempt(r.correct, r.answered, duration, Object.keys(r.topicCounts), statusEl, r.topicStats);
    }

    /** Envia o resultado à plataforma (Contrato 3: ponte LaiftApi). */
    function submitAttempt(correct, total, durationSeconds, topics, statusEl, topicStats) {
      var payload = {
        module: cfg.module,
        mode: API_MODE[state.mode] || 'estudo',
        correct: correct,
        total: total,
        durationSeconds: durationSeconds,
        topics: topics.slice(0, 20),
        topicStats: (topicStats || []).slice(0, 20),
      };
      function report(text, kind) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.dataset.kind = kind;
      }
      if (!global.LaiftApi || typeof global.LaiftApi.call !== 'function') {
        report('Resultado salvo só neste navegador (plataforma indisponível).', 'info');
        return Promise.resolve(null);
      }
      report('Registrando resultado no seu desempenho...', 'info');
      // A fila grava a tentativa (com idempotencyKey) antes de enviar: sem rede ela fica salva e é
      // reenviada sozinha (evento online / ao abrir o módulo); o Worker ignora a repetição da chave.
      return Promise.resolve()
        .then(function () { return queue ? queue.submit(payload) : direct(payload); })
        .then(function (out) {
          if (out.status === 'sent') report('✔ Resultado registrado no seu desempenho da área Aprender.', 'success');
          else if (out.status === 'queued') report(QUEUED_MESSAGE, 'info');
          else report('Não foi possível registrar o resultado agora' + (out.res && out.res.message ? ': ' + out.res.message : '.'), 'error');
          return out.res;
        })
        .catch(function (err) {
          console.warn('[QuizEngine] Falha ao registrar a tentativa:', err);
          report('Não foi possível registrar o resultado agora.', 'error');
          return null;
        });
    }

    /** Sem fila (biblioteca não carregada): envia direto, como antes. */
    function direct(payload) {
      return global.LaiftApi.call('apiLearnSubmitQuizAttempt', payload).then(function (res) {
        return { status: res && res.success ? 'sent' : 'rejected', res: res };
      });
    }

    /** Reenvia o que ficou pendente (offline) — chamado ao abrir o módulo e no evento online. */
    function flushPending() {
      if (!queue) return Promise.resolve(null);
      return queue.flush().then(function (summary) {
        if (summary && summary.sent > 0 && el.status) setStatus('✔ Resultado pendente enviado ao seu desempenho.', 'success');
        return summary;
      }).catch(function () { return null; });
    }

    function performanceText(pct) {
      return typeof L.performance === 'function' ? L.performance(pct) : '';
    }

    function colorFor(pct) {
      return pct >= 70 ? 'good' : pct >= 50 ? 'fair' : 'poor';
    }

    function showResults(score, topicScores, topicCounts, answered, blank) {
      var h = LaiftDom.h;
      var total = answered;
      var pct = total ? (score / total) * 100 : 0;
      LaiftDom.clear(el.results);
      showScreen('results');

      el.results.appendChild(h('h2', { text: L.resultsTitle, tabIndex: -1 }));
      el.results.appendChild(h('div', { className: 'score-display', text: score + '/' + total }));
      var extra = performanceText(pct);
      el.results.appendChild(h('div', { className: 'score-text', text: pct.toFixed(1) + '% de aproveitamento.' + (blank ? ' ' + blank + (blank === 1 ? ' questão em branco não foi contada.' : ' questões em branco não foram contadas.') : '') + (extra && total ? ' ' + extra : '') }));
      var statusEl = h('p', { className: 'quiz-status', role: 'status', 'aria-live': 'polite' });
      el.results.appendChild(statusEl);

      var breakdown = h('div', { className: 'topic-performance' });
      Object.keys(topicCounts).forEach(function (topic) {
        var tScore = topicScores[topic] || 0, tTotal = topicCounts[topic], tPct = (tScore / tTotal) * 100;
        var level = colorFor(tPct);
        breakdown.appendChild(h('div', { className: 'topic-row' }, [
          h('div', { className: 'topic-row-head' }, [
            h('span', { className: 'topic-row-name', text: topic }),
            h('span', { className: 'topic-row-score level-' + level, text: tScore + '/' + tTotal + ' (' + tPct.toFixed(0) + '%)' }),
          ]),
          h('div', { className: 'performance-bar', role: 'presentation' }, [
            h('div', { className: 'performance-fill level-' + level, style: { width: tPct + '%' } }),
          ]),
        ]));
      });
      el.results.appendChild(h('h3', { className: 'topics-title', text: L.topicsTitle }));
      el.results.appendChild(breakdown);

      el.results.appendChild(h('div', { className: 'action-buttons' }, [
        h('button', { type: 'button', className: 'restart-btn', text: L.reviewLabel, onClick: reviewWrong }),
        h('button', { type: 'button', className: 'restart-btn secondary', text: L.retryLabel, onClick: retry }),
        h('button', { type: 'button', className: 'home-btn', text: L.homeLabel, onClick: goHome }),
      ]));
      var title = el.results.querySelector('h2');
      if (title) { title.focus({ preventScroll: true }); bringIntoView(title, 'start'); }
      return statusEl;
    }

    function reviewWrong() {
      var wrong = state.questions.filter(function (q, i) { return state.answers[i] !== null && state.answers[i] !== undefined && state.answers[i] !== q.correct; });
      if (!wrong.length) { dialogAlert(L.allCorrect); return; }
      setMode('study');
      begin(wrong, new Array(wrong.length).fill(null), 0, L.reviewTimer);
    }

    // QZ-04: refazer só substitui as respostas salvas destas questões, e antes pergunta; voltar não apaga nada.
    function retry() {
      var questions = state.questions;
      function run() {
        if (state.mode === 'study') forgetAnswers(questions);
        begin(questions, new Array(questions.length).fill(null), 0);
        updateStats();
      }
      var saved = state.mode === 'study' ? savedAnswerCount(questions) : 0;
      if (!saved) { run(); return; }
      dialogConfirm('Refazer substitui as suas respostas salvas destas ' + saved + ' questões. Continuar?').then(function (ok) { if (ok) run(); });
    }

    function goHome() {
      state.answers = [];
      state.selected.clear();
      showScreen('start');
      refreshSidebar();
      bringIntoView(el.startScreen, 'start');
    }

    // ------------------------------------------------------------------
    // Modal de instruções e teclado
    // ------------------------------------------------------------------
    function openModal(modal, focusEl) {
      if (!modal) return;
      modal.hidden = false;
      modal.classList.add('open');
      modal._returnFocus = global.document.activeElement;
      (focusEl || modal.querySelector('button')).focus();
    }

    function closeModalEl(modal) {
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      modal.classList.remove('open');
      if (modal._returnFocus && modal._returnFocus.focus) modal._returnFocus.focus();
    }

    function bindEvents() {
      if (el.infoBtn) el.infoBtn.addEventListener('click', function () { openModal(el.infoModal, el.closeModal); });
      if (el.closeModal) el.closeModal.addEventListener('click', function () { closeModalEl(el.infoModal); });
      global.document.addEventListener('click', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('modal')) closeModalEl(e.target);
      });
      if (el.startBtn) el.startBtn.addEventListener('click', startQuiz);
      if (el.continueBtn) el.continueBtn.addEventListener('click', continueQuiz);
      if (el.resetBtn) el.resetBtn.addEventListener('click', resetProgress);
      if (el.selectAll) el.selectAll.addEventListener('click', function () { state.selected = new Set(allTopics()); refreshSidebar(); });
      if (el.deselectAll) el.deselectAll.addEventListener('click', function () { state.selected.clear(); refreshSidebar(); });
      el.prev.addEventListener('click', function () { go(-1); });
      el.next.addEventListener('click', function () { go(1); });
      el.finish.addEventListener('click', requestFinish);
      modeButtons.forEach(function (btn) { btn.addEventListener('click', function () { setMode(btn.dataset.mode); }); });

      global.document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          Array.prototype.forEach.call(global.document.querySelectorAll('.modal.open'), closeModalEl);
          return;
        }
        if (!state.active || e.altKey || e.ctrlKey || e.metaKey) return;
        var tag = (e.target && e.target.tagName) || '';
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
        if (global.document.querySelector('.modal.open')) return;
        switch (e.key) {
          case 'ArrowLeft': if (!el.prev.disabled) { e.preventDefault(); go(-1); } break;
          case 'ArrowRight': if (!el.next.hidden) { e.preventDefault(); go(1); } break;
          case '1': case '2': case '3': case '4': selectOption(parseInt(e.key, 10) - 1); break;
          default: break;
        }
      });
    }

    function init() {
      state.bank = (cfg.questions() || []).filter(function (q) { return q && Array.isArray(q.options); });
      showScreen('start');
      if (!state.bank.length) {
        LaiftDom.clear(el.topicsGrid);
        el.topicsGrid.appendChild(LaiftDom.h('p', { className: 'quiz-error', role: 'alert', text: '⚠ ' + L.emptyBank }));
        return;
      }
      var topics = allTopics();
      if (el.totalTopics) el.totalTopics.textContent = topics.length;
      if (el.totalQs) el.totalQs.textContent = state.bank.length;
      if (el.totalStat) el.totalStat.textContent = state.bank.length;
      renderTopics();
      setMode('study');
      refreshSidebar();
      flushPending();
    }

    bindEvents();
    global.addEventListener('online', flushPending);
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
    else init();

    // Exposto para os testes E2E e para depuração no console.
    return {
      state: state,
      startQuiz: startQuiz,
      quickStart: quickStart,
      selectOption: selectOption,
      finishQuiz: finishQuiz,
      setMode: setMode,
      selectTopics: function (list) { state.selected = new Set(list || allTopics()); refreshSidebar(); },
    };
  }

  global.LaiftQuizEngine = { create: create };
})(window);
