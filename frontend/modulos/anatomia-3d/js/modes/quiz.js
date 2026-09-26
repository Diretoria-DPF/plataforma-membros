/**
 * quiz.js — modo Quiz do Atlas v2 (Onda 2)
 * Implementa o contrato Mode: carregamento de casos, cronômetro, avaliação de respostas,
 * e integração com a API de submissão de tentativas.
 */

/**
 * Calcula pontos para uma resposta.
 * @param {Object} quizCase - Caso com propriedade `pontos` (pontos base)
 * @param {number} elapsedMs - Tempo decorrido em milissegundos
 * @param {boolean} correct - Se a resposta foi correta
 * @returns {number} Pontos ganhos
 */
export function scoreFor(quizCase, elapsedMs, correct) {
  if (!correct) return 0;
  const timeLeft = Math.max(0, 60000 - elapsedMs); // 60 segundos em ms
  const timeBonus = Math.round(timeLeft / 1000 * 2.5); // mesma fórmula do legacy: timeLeft(s) * 2.5
  return quizCase.pontos + timeBonus;
}

/**
 * Verifica se a resposta está correta (sid está em correctSid ou é array).
 * @param {Object} quizCase - Caso com `correctSid` (string ou array de strings)
 * @param {string} sid - Sid selecionado
 * @returns {boolean}
 */
export function isCorrect(quizCase, sid) {
  if (typeof quizCase.correctSid === 'string') {
    return quizCase.correctSid === sid;
  }
  if (Array.isArray(quizCase.correctSid)) {
    return quizCase.correctSid.includes(sid);
  }
  return false;
}

/**
 * Cria o modo Quiz.
 * @param {Object} opts
 * @param {Object} opts.bus - barramento (import { emit, on, EVENTS } from 'js/core/bus.js')
 * @param {Object} opts.store - estado (import { get, set } from 'js/core/store.js')
 * @param {Object} [opts.api=window.LaiftApi] - API para submissão
 * @param {Function} opts.getLabel - (sid) => string de rótulo
 * @param {Function} opts.loadCases - () => Promise<Array> carrega quiz-cases.json
 * @returns {Object} Implementação do contrato Mode
 */
export function createQuizMode({ bus, store, api = window.LaiftApi, getLabel, loadCases }) {
  const { on, emit, EVENTS } = bus;
  const { get: storeGet, set: storeSet } = store;

  let isRunning = false;
  let cases = [];
  let currentIndex = 0;
  let score = 0;
  let correctCount = 0;
  let totalCount = 0;
  let timerInterval = null;
  let timerStart = 0;
  let unsubscribeStructure = null;
  let sheetNode = null;
  let sessionStartedAt = null;

  const QUESTION_TIME_MS = 60000; // 60 segundos

  /**
   * Embaralha array de forma determinística com seed fixa (para testes).
   * @param {Array} arr
   * @param {number} seed
   * @returns {Array}
   */
  function shuffleWithSeed(arr, seed = 42) {
    const shuffled = [...arr];
    // Simples LCG-based shuffle determinístico
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  function renderQuizCard() {
    if (!sheetNode) return;

    const { html, setHtml } = window.LaiftDom;
    const caso = cases[currentIndex];

    if (!caso) {
      renderResultCard();
      return;
    }

    totalCount = cases.length;

    const cardContent = html`
      <div style="padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">
          Caso ${currentIndex + 1} de ${totalCount}
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: #f8fafc;">
          ${caso.prompt_pt.substring(0, 80)}...
        </div>
        <div style="font-size: 0.72rem; color: #cbd5e1; line-height: 1.4;">
          ${caso.prompt_pt}
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
          <div style="font-size: 0.8rem; color: #38bdf8; font-weight: 600;">
            <span id="quizTimer">60s</span> | <span id="quizScore">${score}</span> pts
          </div>
          <button type="button" id="quizHintBtn" style="padding: 4px 10px; font-size: 0.7rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 4px; color: #3b82f6; cursor: pointer; font-weight: 600;">
            💡 Dica
          </button>
        </div>
        <div id="quizFeedback" style="display: none; margin-top: 8px; padding: 8px; border-radius: 4px; font-size: 0.72rem; line-height: 1.4;"></div>
      </div>
    `;

    setHtml(sheetNode, cardContent);

    // Delegação de ações
    const hintBtn = sheetNode.querySelector('#quizHintBtn');
    if (hintBtn) {
      hintBtn.addEventListener('click', () => {
        const feedbackEl = sheetNode.querySelector('#quizFeedback');
        if (feedbackEl) {
          const { html: html2, setHtml: setHtml2 } = window.LaiftDom;
          setHtml2(feedbackEl, html2`💡 ${caso.dica}`);
          feedbackEl.style.display = 'block';
          feedbackEl.style.background = 'rgba(251, 191, 36, 0.15)';
          feedbackEl.style.borderLeft = '3px solid #fbbf24';
        }
      });
    }

    startTimer();
  }

  function startTimer() {
    timerStart = Date.now();
    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - timerStart;
      const remaining = Math.max(0, QUESTION_TIME_MS - elapsed);
      const seconds = Math.ceil(remaining / 1000);

      const timerEl = sheetNode?.querySelector('#quizTimer');
      if (timerEl) {
        timerEl.textContent = `${seconds}s`;
        timerEl.style.color = seconds <= 8 ? '#ef4444' : seconds <= 15 ? '#f59e0b' : '#38bdf8';
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 100);
  }

  function handleStructureSelect(payload) {
    if (!isRunning || !cases[currentIndex]) return;
    const { sid, source } = payload;
    if (source !== 'pick' || !sid) return;

    clearInterval(timerInterval);
    const caso = cases[currentIndex];
    const elapsed = Date.now() - timerStart;
    const correct = isCorrect(caso, sid);

    if (correct) {
      correctCount++;
      const points = scoreFor(caso, elapsed, true);
      score += points;
    }

    emit(EVENTS.QUIZ_ANSWER, { caseId: caso.id, sid, correct });
    showFeedback(caso, sid, correct);
  }

  function showFeedback(caso, sid, correct) {
    const feedbackEl = sheetNode?.querySelector('#quizFeedback');
    if (!feedbackEl) return;

    const { html, setHtml } = window.LaiftDom;
    let content, bgColor, borderColor, textColor;

    if (correct) {
      content = html`✔ Acerto! Estrutura: ${caso.prompt_pt.substring(0, 50)}...`;
      bgColor = 'rgba(16, 185, 129, 0.15)';
      borderColor = '#10b981';
      textColor = '#34d399';
    } else {
      const correctLabel = getLabel(typeof caso.correctSid === 'string' ? caso.correctSid : caso.correctSid[0]);
      content = html`❌ Incorreto. Correto: ${correctLabel}`;
      bgColor = 'rgba(239, 68, 68, 0.15)';
      borderColor = '#ef4444';
      textColor = '#f87171';
    }

    setHtml(feedbackEl, content);
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = bgColor;
    feedbackEl.style.borderLeft = `3px solid ${borderColor}`;
    feedbackEl.style.color = textColor;

    const scoreEl = sheetNode?.querySelector('#quizScore');
    if (scoreEl) scoreEl.textContent = score;

    setTimeout(() => {
      currentIndex++;
      renderQuizCard();
    }, 2500);
  }

  function handleTimeout() {
    const caso = cases[currentIndex];
    const feedbackEl = sheetNode?.querySelector('#quizFeedback');
    if (!feedbackEl) return;

    const { html, setHtml } = window.LaiftDom;
    const correctLabel = getLabel(typeof caso.correctSid === 'string' ? caso.correctSid : caso.correctSid[0]);
    setHtml(feedbackEl, html`⏱️ Tempo esgotado. Correto: ${correctLabel}`);
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(245, 158, 11, 0.15)';
    feedbackEl.style.borderLeft = '3px solid #f59e0b';
    feedbackEl.style.color = '#fbbf24';

    setTimeout(() => {
      currentIndex++;
      renderQuizCard();
    }, 2500);
  }

  function renderResultCard() {
    if (!sheetNode) return;

    const { html, setHtml } = window.LaiftDom;
    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    const resultContent = html`
      <div style="padding: 12px; text-align: center; display: flex; flex-direction: column; gap: 10px;">
        <div style="font-size: 1.8rem;">🏆</div>
        <div style="font-size: 0.9rem; font-weight: 700; color: #38bdf8;">Sessão Concluída!</div>
        <div style="background: rgba(2, 6, 23, 0.6); border: 1px solid #334155; border-radius: 6px; padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem;">
          <div>
            <div style="color: #94a3b8; font-weight: 600;">PONTUAÇÃO</div>
            <div style="color: #facc15; font-size: 1rem; font-weight: 700;">${score}</div>
          </div>
          <div>
            <div style="color: #94a3b8; font-weight: 600;">PRECISÃO</div>
            <div style="color: #34d399; font-size: 1rem; font-weight: 700;">${accuracy}%</div>
          </div>
        </div>
        <div style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap;">
          <button type="button" data-action="QuizEngine.startQuiz" id="quizRefazerBtn" style="padding: 6px 12px; font-size: 0.75rem; background: rgba(59, 130, 246, 0.2); border: 1px solid rgba(59, 130, 246, 0.5); border-radius: 4px; color: #3b82f6; cursor: pointer; font-weight: 600;">
            🔄 Refazer
          </button>
        </div>
      </div>
    `;

    setHtml(sheetNode, resultContent);

    // Submete a tentativa
    submitQuizAttempt();
  }

  function submitQuizAttempt() {
    if (!api || typeof api.call !== 'function') return;

    const durationSeconds = sessionStartedAt ? Math.round((Date.now() - sessionStartedAt) / 1000) : 0;
    const payload = {
      module: 'anatomia',
      mode: 'prova',
      correct: correctCount,
      total: totalCount,
      durationSeconds: Math.max(1, durationSeconds),
      topics: ['Quiz 3D — anatomia aplicada']
    };

    Promise.resolve()
      .then(() => api.call('apiLearnSubmitQuizAttempt', payload))
      .catch(() => {
        // Falha silenciosa
      });
  }

  return {
    id: 'quiz',
    label: 'Quiz',
    icon: 'check',

    async enter(ctx) {
      isRunning = true;
      currentIndex = 0;
      score = 0;
      correctCount = 0;
      totalCount = 0;
      sessionStartedAt = Date.now();

      // Carrega casos
      try {
        const loaded = await loadCases();
        cases = shuffleWithSeed(loaded, 42);
      } catch (err) {
        console.error('[QuizMode] Erro ao carregar casos:', err);
        cases = [];
      }

      // Assina STRUCTURE_SELECT
      unsubscribeStructure = on(EVENTS.STRUCTURE_SELECT, handleStructureSelect);

      // Renderiza o primeiro caso
      renderQuizCard();
    },

    exit() {
      isRunning = false;
      clearInterval(timerInterval);
      if (unsubscribeStructure) unsubscribeStructure();
    },

    sheetContent() {
      if (!sheetNode) {
        sheetNode = window.document.createElement('div');
        sheetNode.id = 'quizQuestionCard';
      }
      return sheetNode;
    }
  };
}
