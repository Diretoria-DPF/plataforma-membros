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
  // Casos sem `pontos` valem 100 (antes somava undefined e virava NaN).
  const base = Number.isFinite(quizCase.pontos) ? quizCase.pontos : 100;
  return base + timeBonus;
}

/**
 * Verifica se a resposta está correta. Conta como acerto:
 * - `correctSid` (string ou array, formato antigo);
 * - qualquer sid de `correctSids` (todas as malhas do órgão — tocar o
 *   ventrículo esquerdo responde "coração");
 * - qualquer estrutura do sistema `correctSystem`, se `opts.systemOf` souber
 *   o sistema do sid tocado.
 * `opts.resolve` normaliza sids antigos (aliases) antes de comparar.
 * @param {Object} quizCase
 * @param {string} sid - Sid tocado
 * @param {{ resolve?: (sid: string) => string, systemOf?: (sid: string) => (string|null) }} [opts]
 * @returns {boolean}
 */
export function isCorrect(quizCase, sid, opts = {}) {
  if (!quizCase || !sid) return false;
  const resolve = typeof opts.resolve === 'function' ? opts.resolve : (s) => s;
  const accepted = new Set();
  const add = (s) => { if (typeof s === 'string' && s) { accepted.add(s); accepted.add(resolve(s)); } };
  if (Array.isArray(quizCase.correctSid)) quizCase.correctSid.forEach(add);
  else add(quizCase.correctSid);
  if (Array.isArray(quizCase.correctSids)) quizCase.correctSids.forEach(add);
  if (accepted.has(sid) || accepted.has(resolve(sid))) return true;
  if (quizCase.correctSystem && typeof opts.systemOf === 'function') {
    return opts.systemOf(sid) === quizCase.correctSystem;
  }
  return false;
}

/** Semente fixa do embaralhamento: a ordem dos casos é a mesma a cada sessão. */
export const QUIZ_SEED = 42;

/**
 * Onde retomar um quiz salvo (js/ui/session.js). Retoma pelo ID do caso, não
 * pelo índice — se a lista de casos mudar (Onda 3), o índice apontaria para
 * outro caso.
 * @param {Array<{id:string}>} cases casos já embaralhados
 * @param {{caseId?:string, sessionSeed?:number, score?:number, correct?:number, answered?:number}|null} progress
 * @param {number} [seed]
 * @returns {{ index:number, score:number, correct:number, answered:number, notice:(string|null) }}
 */
export function resolveResume(cases, progress, seed = QUIZ_SEED) {
  const fresh = { index: 0, score: 0, correct: 0, answered: 0, notice: null };
  if (!progress || !progress.caseId || !Array.isArray(cases)) return fresh;
  const index = cases.findIndex((c) => c && c.id === progress.caseId);
  if (index < 0) return { ...fresh, notice: 'O caso em que você parou não está mais disponível. Começando de novo.' };
  const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    index,
    score: num(progress.score),
    correct: num(progress.correct),
    answered: num(progress.answered),
    notice: progress.sessionSeed !== seed ? 'A ordem dos casos mudou desde a última vez.' : 'Continuando o quiz de onde você parou.',
  };
}

/** Sid principal da resposta (nome no feedback, foco da câmera). */
export function mainSid(quizCase) {
  if (!quizCase) return null;
  if (Array.isArray(quizCase.correctSid)) return quizCase.correctSid[0] || null;
  return quizCase.correctSid || (Array.isArray(quizCase.correctSids) ? quizCase.correctSids[0] : null) || null;
}

/**
 * Cria o modo Quiz.
 * @param {Object} opts
 * @param {Object} opts.bus - barramento (import { emit, on, EVENTS } from 'js/core/bus.js')
 * @param {Object} opts.store - estado (import { get, set } from 'js/core/store.js')
 * @param {Object} [opts.api=window.LaiftApi] - API para submissão
 * @param {Function} opts.getLabel - (sid) => string de rótulo
 * @param {Function} opts.loadCases - () => Promise<Array> carrega quiz-cases.json
 * @param {Function} [opts.resolveSid] - (sid) => sid canônico (aliases antigos)
 * @param {Function} [opts.systemOf] - (sid) => id do sistema, para `correctSystem`
 * @param {Function} [opts.prepareCase] - (caso) => void; carrega e mostra os
 *   sistemas da resposta, para a estrutura certa estar no corpo e poder ser tocada
 * @returns {Object} Implementação do contrato Mode
 */
export function createQuizMode({ bus, store, api = window.LaiftApi, getLabel, loadCases, resolveSid, systemOf, prepareCase }) {
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
  // O caso atual já foi respondido (feedback na tela): evita pontuar duas
  // vezes com um segundo toque e faz a retomada começar pelo PRÓXIMO caso.
  let answeredCurrent = false;
  let resumeNotice = null;

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

  // main.js chama enter() ANTES de sheetContent(): sem criar o nó aqui, a
  // primeira pergunta era desenhada em lugar nenhum e o Quiz abria vazio.
  function ensureSheetNode() {
    if (!sheetNode) {
      sheetNode = window.document.createElement('div');
      sheetNode.id = 'quizQuestionCard';
    }
    return sheetNode;
  }

  function renderQuizCard() {
    ensureSheetNode();
    answeredCurrent = false;

    const { html, setHtml } = window.LaiftDom;
    const caso = cases[currentIndex];

    if (!caso) {
      renderResultCard();
      return;
    }

    totalCount = cases.length;
    if (typeof prepareCase === 'function') {
      try { prepareCase(caso); } catch (err) { console.error('[QuizMode] prepareCase:', err); }
    }

    const cardContent = html`
      <div style="padding: 12px; display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 0.75rem; color: var(--laift-muted); font-weight: 600;">
          Caso ${currentIndex + 1} de ${totalCount}
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--laift-text);">
          ${caso.prompt_pt.substring(0, 80)}...
        </div>
        <div style="font-size: 0.72rem; color: var(--laift-text); line-height: 1.4;">
          ${caso.prompt_pt}
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 8px;">
          <div style="font-size: 0.8rem; color: var(--laift-text); font-weight: 600;">
            <span id="quizTimer">60s</span> | <span id="quizScore">${score}</span> pts
          </div>
          <button type="button" id="quizHintBtn" style="min-height: 44px; padding: 4px 12px; font-size: 0.8rem; background: transparent; border: 1px solid var(--module-accent); border-radius: 6px; color: var(--laift-text); cursor: pointer; font-weight: 600;">
            💡 Dica
          </button>
        </div>
        <div id="quizFeedback" style="display: none; margin-top: 8px; padding: 8px; border-radius: 4px; font-size: 0.72rem; line-height: 1.4;"></div>
      </div>
    `;

    setHtml(sheetNode, cardContent);
    if (resumeNotice) {
      sheetNode.prepend(window.LaiftDom.h('p', { className: 'quiz-resume-notice', role: 'status', text: resumeNotice }));
      resumeNotice = null;
    }

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
        // Urgência pelo peso da fonte, não só pela cor (contraste em
        // qualquer tema — WCAG 1.4.1/1.4.3).
        timerEl.style.fontWeight = seconds <= 15 ? '800' : '600';
      }

      if (remaining <= 0) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 100);
  }

  function handleStructureSelect(payload) {
    if (!isRunning || !cases[currentIndex] || answeredCurrent) return;
    const { sid, source } = payload;
    if (source !== 'pick' || !sid) return;

    clearInterval(timerInterval);
    answeredCurrent = true;
    const caso = cases[currentIndex];
    const elapsed = Date.now() - timerStart;
    const correct = isCorrect(caso, sid, { resolve: resolveSid, systemOf });

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
    let content, bgColor, borderColor;

    if (correct) {
      content = html`✔ Acerto! ${getLabel(sid)}${caso.explanation_pt ? ` — ${caso.explanation_pt}` : ''}`;
      bgColor = 'rgba(16, 185, 129, 0.15)';
      borderColor = '#10b981';
    } else {
      const correctLabel = getLabel(mainSid(caso));
      content = html`❌ Incorreto. Correto: ${correctLabel}${caso.explanation_pt ? ` — ${caso.explanation_pt}` : ''}`;
      bgColor = 'rgba(239, 68, 68, 0.15)';
      borderColor = '#ef4444';
    }

    setHtml(feedbackEl, content);
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = bgColor;
    feedbackEl.style.borderLeft = `3px solid ${borderColor}`;
    feedbackEl.style.color = 'var(--laift-text)';

    const scoreEl = sheetNode?.querySelector('#quizScore');
    if (scoreEl) scoreEl.textContent = score;

    setTimeout(() => {
      if (!isRunning) return;
      currentIndex++;
      renderQuizCard();
    }, 2500);
  }

  function handleTimeout() {
    answeredCurrent = true;
    const caso = cases[currentIndex];
    const feedbackEl = sheetNode?.querySelector('#quizFeedback');
    if (!feedbackEl) return;

    const { html, setHtml } = window.LaiftDom;
    const correctLabel = getLabel(mainSid(caso));
    setHtml(feedbackEl, html`⏱️ Tempo esgotado. Correto: ${correctLabel}`);
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(245, 158, 11, 0.15)';
    feedbackEl.style.borderLeft = '3px solid #f59e0b';
    feedbackEl.style.color = 'var(--laift-text)';

    setTimeout(() => {
      if (!isRunning) return;
      currentIndex++;
      renderQuizCard();
    }, 2500);
  }

  function renderResultCard() {
    ensureSheetNode();

    const { html, setHtml } = window.LaiftDom;
    const accuracy = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    const resultContent = html`
      <div style="padding: 12px; text-align: center; display: flex; flex-direction: column; gap: 10px;">
        <div style="font-size: 1.8rem;">🏆</div>
        <div style="font-size: 0.9rem; font-weight: 700; color: #38bdf8;">Sessão Concluída!</div>
        <div style="background: rgba(2, 6, 23, 0.6); border: 1px solid var(--laift-border); border-radius: 6px; padding: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.75rem;">
          <div>
            <div style="color: var(--laift-muted); font-weight: 600;">PONTUAÇÃO</div>
            <div style="color: #facc15; font-size: 1rem; font-weight: 700;">${score}</div>
          </div>
          <div>
            <div style="color: var(--laift-muted); font-weight: 600;">PRECISÃO</div>
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
        cases = shuffleWithSeed(loaded, QUIZ_SEED);
      } catch (err) {
        console.error('[QuizMode] Erro ao carregar casos:', err);
        cases = [];
      }

      // Retomada (js/main.js passa o progresso salvo na sessão).
      resumeNotice = null;
      if (ctx && ctx.resumeFrom) {
        const r = resolveResume(cases, ctx.resumeFrom, QUIZ_SEED);
        currentIndex = r.index;
        score = r.score;
        correctCount = r.correct;
        resumeNotice = r.notice;
      }

      // Assina STRUCTURE_SELECT
      unsubscribeStructure = on(EVENTS.STRUCTURE_SELECT, handleStructureSelect);

      // Renderiza o primeiro caso
      renderQuizCard();
    },

    /**
     * Progresso para salvar na sessão — o caso que o aluno vai responder a
     * seguir (se o atual já foi respondido, o próximo). null fora do quiz ou
     * com a rodada concluída.
     */
    getProgress() {
      if (!isRunning) return null;
      const next = currentIndex + (answeredCurrent ? 1 : 0);
      if (!cases[next]) return null;
      return { caseId: cases[next].id, sessionSeed: QUIZ_SEED, score, correct: correctCount, answered: next };
    },

    exit() {
      isRunning = false;
      clearInterval(timerInterval);
      if (unsubscribeStructure) unsubscribeStructure();
    },

    /**
     * Encerra a sessão imediatamente, respondendo corretamente a todos os
     * casos restantes (sem esperar os 2.5 s de feedback por questão) e
     * submetendo a tentativa — usado por integrações/testes que precisam
     * de um resultado determinístico e rápido, sem depender de cliques
     * reais no corpo 3D (ver `js/compat/legacy-api.js`, `window.QuizEngine`).
     */
    completeQuiz() {
      if (cases.length === 0) return;
      for (let i = currentIndex; i < cases.length; i++) {
        totalCount++;
        correctCount++;
        score += scoreFor(cases[i], 0, true);
      }
      currentIndex = cases.length;
      clearInterval(timerInterval);
      renderResultCard();
    },

    sheetContent() {
      return ensureSheetNode();
    }
  };
}
