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
 * Depende de ../shared/safe-dom.js (LaiftDom). Uso: ver quiz/app.js.
 */
(function (global) {
  'use strict';

  var SECONDS_PER_EXAM_QUESTION = 90;
  var URGENT_SECONDS = 300;
  var API_MODE = { study: 'estudo', exam: 'prova' };

  function $(id) { return global.document.getElementById(id); }

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
    };

    // ------------------------------------------------------------------
    // Progresso local (mesmo formato de antes: { userAnswers, timestamp },
    // userAnswers indexado pela posição da questão no banco completo)
    // ------------------------------------------------------------------
    function savedAnswers() {
      var progress = readJson(cfg.storageKey);
      return progress && Array.isArray(progress.userAnswers) ? progress.userAnswers : null;
    }

    function saveProgress() {
      if (state.mode === 'exam') return;
      // Parte do que já estava salvo: estudar um tópico não apaga o
      // progresso dos outros (antes o array era recriado só com os filtrados).
      var all = new Array(state.bank.length).fill(null);
      var previous = savedAnswers();
      if (previous) previous.forEach(function (a, i) { if (i < all.length && a !== undefined) all[i] = a; });
      state.questions.forEach(function (q, i) {
        var original = bankIndexOf(q);
        if (original !== -1) all[original] = state.answers[i];
      });
      try {
        global.localStorage.setItem(cfg.storageKey, JSON.stringify({ userAnswers: all, timestamp: new Date().toISOString() }));
      } catch (e) { /* armazenamento indisponível: o simulado segue sem salvar */ }
    }

    function clearProgress() {
      try { global.localStorage.removeItem(cfg.storageKey); } catch (e) { /* idem */ }
    }

    function bankIndexOf(q) {
      for (var i = 0; i < state.bank.length; i++) if (state.bank[i].id === q.id) return i;
      return -1;
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
      if (!el.status) { if (message) global.alert(message); return; }
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
      var answers = savedAnswers() || [];
      var answered = 0, correct = 0;
      answers.forEach(function (a, i) {
        if (a === null || a === undefined) return;
        answered++;
        if (state.bank[i] && a === state.bank[i].correct) correct++;
      });
      if (el.answered) el.answered.textContent = answered;
      if (el.correct) el.correct.textContent = correct;
      if (el.progressStat) el.progressStat.textContent = (state.bank.length ? Math.round((answered / state.bank.length) * 100) : 0) + '%';
      show(el.resetBtn, answered > 0);
      show(el.continueBtn, answers.length > 0 && answered > 0);
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
    }

    function startQuiz() {
      if (!state.selected.size) { setStatus(L.noTopic, 'error'); return; }
      var questions = state.bank.filter(function (q) { return state.selected.has(q.topic); });
      if (!questions.length) { setStatus(L.noQuestions, 'error'); return; }
      setStatus('');
      if (state.mode === 'exam') shuffle(questions);
      var answers = new Array(questions.length).fill(null);
      // Modo Estudo retoma as respostas já dadas nesses tópicos.
      var saved = state.mode === 'study' ? savedAnswers() : null;
      if (saved) {
        questions.forEach(function (q, i) {
          var original = bankIndexOf(q);
          if (original !== -1 && saved[original] !== null && saved[original] !== undefined) answers[i] = saved[original];
        });
      }
      begin(questions, answers, 0);
    }

    function continueQuiz() {
      var saved = savedAnswers();
      var questions = state.bank.slice();
      var answers = new Array(questions.length).fill(null);
      if (saved) saved.forEach(function (a, i) { if (i < answers.length && a !== undefined) answers[i] = a; });
      var next = answers.indexOf(null);
      setMode('study');
      begin(questions, answers, next === -1 ? 0 : next);
    }

    function resetProgress() {
      if (!global.confirm(L.resetConfirm)) return;
      clearProgress();
      state.answers = [];
      state.active = false;
      stopTimer();
      showScreen('start');
      updateStats();
    }

    function optionButton(text, index) {
      var answered = state.answers[state.index];
      var btn = LaiftDom.h('button', {
        type: 'button', className: 'option', 'aria-pressed': answered === index ? 'true' : 'false',
        dataset: { index: String(index) }, onClick: function () { selectOption(index); },
      }, [
        LaiftDom.h('span', { className: 'option-letter', 'aria-hidden': 'true', text: String.fromCharCode(65 + index) }),
        LaiftDom.h('span', { className: 'option-text', text: text }),
      ]);
      btn.setAttribute('aria-label', 'Alternativa ' + String.fromCharCode(65 + index) + ': ' + text);
      if (answered === index) btn.classList.add('selected');
      return btn;
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
      q.options.forEach(function (text, i) { el.options.appendChild(optionButton(text, i)); });

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

    function selectOption(index) {
      if (!state.active) return;
      var q = state.questions[state.index];
      if (!q || index < 0 || index >= q.options.length) return;
      state.answers[state.index] = index;
      saveProgress();
      updateStats();
      loadQuestion();
      // O re-render troca os botões: devolve o foco à alternativa escolhida
      // para quem navega por teclado/leitor de tela não "cair" no topo.
      var chosen = el.options.querySelector('.option[data-index="' + index + '"]');
      if (chosen) chosen.focus({ preventScroll: true });
    }

    function showExplanation(token) {
      var q = state.questions[state.index];
      var userAnswer = state.answers[state.index];
      Array.prototype.forEach.call(el.options.querySelectorAll('.option'), function (opt, i) {
        opt.classList.remove('correct', 'incorrect');
        if (i === q.correct) opt.classList.add('correct');
        else if (i === userAnswer && userAnswer !== q.correct) opt.classList.add('incorrect');
      });
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
    }

    function finishQuiz() {
      if (!state.active) return;
      state.active = false;
      stopTimer();
      var score = 0, topicScores = {}, topicCounts = {};
      state.questions.forEach(function (q, i) {
        topicCounts[q.topic] = (topicCounts[q.topic] || 0) + 1;
        topicScores[q.topic] = topicScores[q.topic] || 0;
        if (state.answers[i] === q.correct) { score++; topicScores[q.topic]++; }
      });
      var duration = Math.max(1, Math.round((Date.now() - state.startedAt) / 1000));
      var statusEl = showResults(score, topicScores, topicCounts);
      submitAttempt(score, state.questions.length, duration, Object.keys(topicCounts), statusEl);
    }

    /** Envia o resultado à plataforma (Contrato 3: ponte LaiftApi). */
    function submitAttempt(correct, total, durationSeconds, topics, statusEl) {
      var payload = {
        module: cfg.module,
        mode: API_MODE[state.mode] || 'estudo',
        correct: correct,
        total: total,
        durationSeconds: durationSeconds,
        topics: topics.slice(0, 20),
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
      return Promise.resolve()
        .then(function () { return global.LaiftApi.call('apiLearnSubmitQuizAttempt', payload); })
        .then(function (res) {
          if (res && res.success) report('✔ Resultado registrado no seu desempenho da área Aprender.', 'success');
          else report('Não foi possível registrar o resultado agora' + (res && res.message ? ': ' + res.message : '.'), 'error');
          return res;
        })
        .catch(function (err) {
          console.warn('[QuizEngine] Falha ao registrar a tentativa:', err);
          report('Não foi possível registrar o resultado agora.', 'error');
          return null;
        });
    }

    function performanceText(pct) {
      return typeof L.performance === 'function' ? L.performance(pct) : '';
    }

    function colorFor(pct) {
      return pct >= 70 ? 'good' : pct >= 50 ? 'fair' : 'poor';
    }

    function showResults(score, topicScores, topicCounts) {
      var h = LaiftDom.h;
      var total = state.questions.length;
      var pct = total ? (score / total) * 100 : 0;
      LaiftDom.clear(el.results);
      showScreen('results');

      el.results.appendChild(h('h2', { text: L.resultsTitle, tabIndex: -1 }));
      el.results.appendChild(h('div', { className: 'score-display', text: score + '/' + total }));
      var extra = performanceText(pct);
      el.results.appendChild(h('div', { className: 'score-text', text: pct.toFixed(1) + '% de aproveitamento.' + (extra ? ' ' + extra : '') }));
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
      if (title) title.focus({ preventScroll: false });
      return statusEl;
    }

    function reviewWrong() {
      var wrong = state.questions.filter(function (q, i) { return state.answers[i] !== q.correct; });
      if (!wrong.length) { global.alert(L.allCorrect); return; }
      setMode('study');
      begin(wrong, new Array(wrong.length).fill(null), 0, L.reviewTimer);
    }

    function retry() {
      clearProgress();
      begin(state.questions, new Array(state.questions.length).fill(null), 0);
      updateStats();
    }

    function goHome() {
      clearProgress();
      state.answers = [];
      state.selected.clear();
      showScreen('start');
      refreshSidebar();
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
      el.finish.addEventListener('click', finishQuiz);
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
    }

    bindEvents();
    if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
    else init();

    // Exposto para os testes E2E e para depuração no console.
    return {
      state: state,
      startQuiz: startQuiz,
      selectOption: selectOption,
      finishQuiz: finishQuiz,
      setMode: setMode,
      selectTopics: function (list) { state.selected = new Set(list || allTopics()); refreshSidebar(); },
    };
  }

  global.LaiftQuizEngine = { create: create };
})(window);
