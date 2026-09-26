/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/quiz-engine.js                                    */
/* VERSÃO:  1.0.0 — COMPLETA: QUIZ 3D INTERATIVO & TOXICOLOGIA CLÍNICA       */
/* ========================================================================= */

/**
 * MOTOR DE QUIZ GAMIFICADO 3D ("APONTE E DIAGNOSTIQUE")
 * Ecossistema LAIFT - Módulo Master 3D / Bio-Twin
 * - Casos clínicos interdisciplinares (Farmacologia, Toxicologia e Semiologia)
 * - Avaliação espacial em tempo real via Raycasting 3D no ThreeEngine
 * - Feedback luminoso imediato nas malhas (verde para acerto / vermelho para erro)
 * - Cronômetro decrescente por questão e cômputo dinâmico de acurácia
 * - Bonificação de horas formativas e integração com Dossiê PDF (ApiCache)
 * - Interface HUD responsiva com suporte a toque mobile
 */

const QuizEngine = (() => {
  // -------------------------------------------------------------------------
  // 1. ESTADO E VARIÁVEIS DE CONTROLE DO QUIZ
  // -------------------------------------------------------------------------
  let isQuizRunning = false;
  let currentQuestionIndex = 0;
  let score = 0;
  let correctHits = 0;
  let streak = 0;
  let maxStreak = 0;
  let timerInterval = null;
  let timeLeft = 0;
  let sessionStartedAt = 0;
  const QUESTION_TIME_SECONDS = 30;
  const html = LaiftDom.html;
  const setHtml = LaiftDom.setHtml;

  // Elementos do DOM
  let hudContainer = null;

  // -------------------------------------------------------------------------
  // 2. BANCO DE CASOS CLÍNICOS E DESAFIOS ESPACIAIS (LAIFT)
  // -------------------------------------------------------------------------
  const CLINICAL_CASES = [
    {
      id: "caso_organofosforado",
      titulo: "Emergência Toxicológica: Síndrome Colinérgica Aguda",
      descricao: "Agricultor de 42 anos admitido em coma com miose puntiforme bilateral, sialorreia profusa, broncorreia e bradicardia severa (36 bpm) após pulverização de lavoura.",
      pergunta: "Aponte no modelo 3D o órgão efetor primário onde a Atropina 2 mg IV atuará para reverter o bloqueio vagal e a bradicardia com risco de assistolia.",
      targetKey: "*heart*",
      targetNome: "Coração (Miocárdio / Receptores M2)",
      dica: "Estrutura torácica central sincicial com receptores muscarínicos M2 acoplados à proteína Gi.",
      explicacao: "A atropina é um antagonista competitivo dos receptores muscarínicos. No coração, bloqueia os receptores M2 nodais, suprimindo o tônus vagal hiperativado e restabelecendo a frequência cardíaca.",
      pontos: 150
    },
    {
      id: "caso_primeira_passagem",
      titulo: "Biofarmacotécnica: Metabolismo Pré-Sistêmico",
      descricao: "Paciente em farmacoterapia oral com propranolol requer cálculo de dose para compensar a intensa biotransformação pré-sistêmica antes de atingir a veia cava.",
      pergunta: "Aponte no modelo 3D o órgão parenquimatoso responsável pelo efeito de primeira passagem hepática mediado por isoformas do citocromo P450.",
      targetKey: "*liver*",
      targetNome: "Fígado (Sistema Porta-Hepático / CYP450)",
      dica: "Maior glândula anexa do trato gastrointestinal localizada no hipocôndrio direito.",
      explicacao: "O fígado drena o sangue venoso de todo o trato gastrointestinal através da veia porta, metabolizando intensamente os fármacos suscetíveis via reações de Fase I (oxidação/CYP) e Fase II (conjugação).",
      pontos: 120
    },
    {
      id: "caso_broncoespasmo",
      titulo: "Pneumologia: Crise Asmática Aguda",
      descricao: "Jovem de 21 anos chega à UPA com dispneia expiratória intensa, sibilos difusos e saturação periférica de oxigênio de 88% necessitando de broncodilatador de alívio rápido.",
      pergunta: "Aponte no modelo 3D os órgãos da hematose onde o Salbutamol inalatório atuará nos receptores β2-adrenérgicos do músculo liso bronquiolar.",
      targetKey: "*lung*",
      targetNome: "Pulmões (Árvore Brônquica / Alvéolos)",
      dica: "Órgãos pares torácicos expansíveis elásticos que contêm cerca de 300 milhões de alvéolos.",
      explicacao: "O salbutamol liga-se seletivamente aos receptores β2 da musculatura lisa das vias aéreas pulmonares, ativando a adenilato ciclase, elevando o AMPc e promovendo broncodilatação imediata.",
      pontos: 130
    },
    {
      id: "caso_filtro_renal",
      titulo: "Farmacocinética de Eliminação: Depuração Glomerular",
      descricao: "Idoso diabético hipertenso faz uso de metformina e aminoglicosídeo; o ajuste posológico exige avaliação da taxa de depuração plasmática da creatinina.",
      pergunta: "Aponte no modelo 3D o órgão retroperitoneal responsável pela ultrafiltração plasmática e excreção hidrossolúvel de xenobióticos.",
      targetKey: "*kidney*",
      targetNome: "Rins (Glomérulos / Néfrons)",
      dica: "Órgãos reniformes bilaterais localizados entre T12 e L3.",
      explicacao: "Os rins recebem cerca de 22% do débito cardíaco total e efetuam a ultrafiltração glomerular de fármacos não ligados a proteínas plasmáticas, além da secreção tubular ativa de ácidos e bases orgânicas.",
      pontos: 140
    },
    {
      id: "caso_bhe_neurologia",
      titulo: "Neurofarmacologia: Barreira Hematoencefálica (BHE)",
      descricao: "Paciente portador de doença neurodegenerativa necessita de suplementação mineral quelada com ácido L-treônico para otimização sináptica e receptores NMDA.",
      pergunta: "Aponte no modelo 3D o órgão central protegido por junções oclusivas endoteliais contínuas e podócitos de astrócitos.",
      targetKey: "*brain*",
      targetNome: "Encéfalo (Córtex Cerebral / SNC)",
      dica: "Estrutura alojada no interior da calvária óssea contendo bilhões de corpos neuronais.",
      explicacao: "O encéfalo é isolado da circulação sistêmica pela Barreira Hematoencefálica (BHE), formada por células endoteliais com zonula occludens e prolongamentos astrocitários, exigindo transportadores específicos ou alta lipofilicidade para passagem de solutos.",
      pontos: 150
    },
    {
      id: "caso_acidez_gastrica",
      titulo: "Gastroenterologia: Barreira Mucosa e Úlcera Péptica",
      descricao: "Indivíduo com dor epigástrica em queimação e dispepsia crônica recebe prescrição de inibidor da bomba de prótons (Omeprazol) para inibir a enzima H+/K+-ATPase.",
      pergunta: "Aponte no modelo 3D o reservatório digestivo ácido onde as células parietais oxínticas secretam ácido clorídrico.",
      targetKey: "*stomach*",
      targetNome: "Estômago (Células Parietais / Mucosa)",
      dica: "Órgão em formato de J posicionado entre o esôfago distal e o duodeno.",
      explicacao: "O estômago mantém um pH luminal ácido entre 1.5 e 2.0 por meio da ação da bomba de prótons (H+/K+-ATPase) nas células parietais, sendo o sítio primário de desnaturação proteica pela pepsina e alvo terapêutico dos IBPs.",
      pontos: 120
    },
    {
      id: "caso_neuroeixo_espinhal",
      titulo: "Anestesiologia: Bloqueio Subaracnóideo / Peridural",
      descricao: "Durante cirurgia ortopédica em membro inferior, administra-se bupivacaína hiperbárica no espaço subaracnóideo entre as vértebras L3-L4.",
      pergunta: "Aponte no modelo 3D a estrutura condutora central do neuroeixo responsável pela transmissão dos impulsos aferentes e arcos reflexos.",
      targetKey: "*spinal*",
      targetNome: "Medula Espinhal (Canal Vertebral)",
      dica: "Cordão cilíndrico nervoso que transcorre pelo forame magno até o cone medular na altura de L1-L2.",
      explicacao: "A medula espinhal conduz os impulsos aferentes espinotalâmicos e motores corticoespinhais. Anestésicos locais bloqueiam canais de sódio voltagem-dependentes (Nav1.7) nas raízes nervosas espinhais desprovidas de epineuro denso.",
      pontos: 140
    },
    {
      id: "caso_injecao_deltoide",
      titulo: "Vias Parenterais: Administração Intramuscular",
      descricao: "Em cenário de anafilaxia alimentar aguda, o protocolo de emergência preconiza a injeção imediata de Adrenalina 0.5 mg por via intramuscular profunda.",
      pergunta: "Aponte no modelo 3D a camada tecidual de músculo esquelético vascularizada ideal para rápida absorção e fluxo capilar fenestrado.",
      targetKey: "*muscl*",
      targetNome: "Musculatura Esquelética (Ventre Muscular)",
      dica: "Tecido estriado voluntário contrátil posicionado na camada intermediária de dissecção (Nível 2).",
      explicacao: "A via intramuscular garante absorção rápida devido à ampla vascularização do leito capilar muscular, assegurando níveis plasmáticos eficazes de adrenalina mais consistentes e rápidos do que a via subcutânea.",
      pontos: 130
    }
  ];

  // =========================================================================
  // 3. INICIALIZAÇÃO E MONTAGEM DA INTERFACE HUD
  // =========================================================================
  function init() {
    createQuizHUD();
    console.log("[QuizEngine] Motor de Quiz 3D Gamificado Pronto.");
  }

  function createQuizHUD() {
    if (document.getElementById("quizMasterContainer")) return;

    hudContainer = document.createElement("div");
    hudContainer.id = "quizMasterContainer";
    hudContainer.className = "hidden";
    hudContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      z-index: 45;
      pointer-events: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    // Marcação fixa do HUD; o único dado interpolado (nº de casos) é numérico.
    // "Sair" usa data-action (sem onclick inline).
    setHtml(hudContainer, html`
      <!-- Placa Superior de Telemetria -->
      <div style="background:rgba(2,6,23,0.92); border:1px solid #334155; border-radius:8px; padding:8px 12px; backdrop-filter:blur(8px); display:flex; justify-content:space-between; align-items:center; pointer-events:auto; box-shadow:0 4px 14px rgba(0,0,0,0.5);">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.1rem;">🎯</span>
          <div>
            <div style="font-size:0.75rem; font-weight:800; color:#38bdf8; text-transform:uppercase; letter-spacing:0.5px;">Quiz 3D LAIFT</div>
            <div id="quizProgressBadge" style="font-size:0.65rem; color:#94a3b8; font-family:monospace;">Caso 1 de ${CLINICAL_CASES.length}</div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:12px;">
          <div style="text-align:right;">
            <div id="quizTimerText" role="timer" style="font-size:0.85rem; font-weight:900; color:#facc15; font-family:monospace;">30s</div>
            <div id="quizScoreText" style="font-size:0.65rem; color:#34d399; font-weight:bold;">0 pts</div>
          </div>
          <button type="button" id="btnAbortQuiz" data-action="QuizEngine.stopQuiz" aria-label="Encerrar o quiz" style="background:transparent; border:1px solid #ef4444; color:#ef4444; font-size:0.68rem; padding:4px 8px; border-radius:4px; cursor:pointer; font-weight:bold;" title="Encerrar Sessão">Sair</button>
        </div>
      </div>

      <!-- Card do Caso Clínico Ativo -->
      <div id="quizQuestionCard" style="background:rgba(15,23,42,0.94); border-left:4px solid #38bdf8; border:1px solid #334155; border-left-width:4px; border-radius:8px; padding:12px; backdrop-filter:blur(8px); pointer-events:auto; box-shadow:0 6px 18px rgba(0,0,0,0.6);">
        <div id="quizCaseTitle" style="font-size:0.78rem; font-weight:800; color:#f8fafc; margin-bottom:4px;">Título do Caso</div>
        <div id="quizCaseDesc" style="font-size:0.72rem; color:#94a3b8; line-height:1.4; margin-bottom:8px;">História clínica do paciente...</div>
        <div id="quizPrompt" style="font-size:0.76rem; font-weight:700; color:#38bdf8; background:rgba(56,189,248,0.1); padding:8px; border-radius:6px; border:1px dashed rgba(56,189,248,0.3);">
          Aponte no modelo 3D...
        </div>
        <div id="quizFeedbackBox" class="hidden" role="status" aria-live="polite" style="margin-top:8px; font-size:0.72rem; padding:8px; border-radius:6px; line-height:1.4;"></div>
      </div>
      <div id="quizResultCard" class="hidden" role="region" aria-label="Resultado do quiz 3D" style="background:rgba(15,23,42,0.94); border:1px solid #334155; border-left:4px solid #10b981; border-radius:8px; padding:12px; backdrop-filter:blur(8px); pointer-events:auto; box-shadow:0 6px 18px rgba(0,0,0,0.6);"></div>
    `);

    const container3D = document.getElementById("canvas-3d-container");
    if (container3D) {
      container3D.appendChild(hudContainer);
    } else {
      document.body.appendChild(hudContainer);
    }
  }

  // =========================================================================
  // 4. CICLO DE VIDA DO QUIZ (START, NEXT, STOP, COMPLETE)
  // =========================================================================
  function startQuiz() {
    if (!hudContainer) init();

    isQuizRunning = true;
    currentQuestionIndex = 0;
    score = 0;
    correctHits = 0;
    streak = 0;
    maxStreak = 0;

    hudContainer.classList.remove("hidden");
    // "Refazer" depois do resultado: o cartão do caso volta a aparecer (antes
    // o resultado sobrescrevia o cartão e o quiz quebrava ao recomeçar).
    const questionCard = document.getElementById("quizQuestionCard");
    const resultCard = document.getElementById("quizResultCard");
    if (questionCard) questionCard.classList.remove("hidden");
    if (resultCard) resultCard.classList.add("hidden");
    sessionStartedAt = Date.now();

    // Certifica-se de que a aba da anatomia esteja ativa e pronta
    if (typeof AppController !== "undefined" && typeof AppController.switchTab === "function") {
      AppController.switchTab("view-anatomy");
    }

    // Configura o ThreeEngine para dissecção total das vísceras
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.setDissectionDepth === "function") {
      ThreeEngine.setDissectionDepth(5);
    }

    presentQuestion(currentQuestionIndex);
    console.log("[QuizEngine] Sessão de Desafios Espaciais Iniciada.");
  }

  function presentQuestion(index) {
    if (index >= CLINICAL_CASES.length) {
      completeQuiz();
      return;
    }

    const caso = CLINICAL_CASES[index];
    currentQuestionIndex = index;

    // Atualiza elementos da interface
    document.getElementById("quizProgressBadge").textContent = `Caso ${index + 1} de ${CLINICAL_CASES.length}`;
    document.getElementById("quizCaseTitle").textContent = caso.titulo;
    document.getElementById("quizCaseDesc").textContent = caso.descricao;
    document.getElementById("quizPrompt").textContent = `👉 ${caso.pergunta}`;

    const fbBox = document.getElementById("quizFeedbackBox");
    fbBox.className = "hidden";
    LaiftDom.clear(fbBox);

    // Inicia Cronômetro Decrescente
    clearInterval(timerInterval);
    timeLeft = QUESTION_TIME_SECONDS;
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      timeLeft--;
      updateTimerDisplay();

      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        handleTimeout();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const el = document.getElementById("quizTimerText");
    if (el) {
      el.textContent = `${timeLeft}s`;
      el.style.color = timeLeft <= 8 ? "#ef4444" : timeLeft <= 15 ? "#f59e0b" : "#facc15";
    }
  }

  // =========================================================================
  // 5. AVALIAÇÃO ESPACIAL DE RESPOSTA VIA RAYCASTING
  // =========================================================================
  /**
   * Chamado pelo ThreeEngine quando o usuário clica em uma malha durante o quiz
   * @param {String} hitMeshName - Nome do objeto 3D interceptado pelo raio
   */
  function evaluateUserAnswer(hitMeshName) {
    if (!isQuizRunning || timeLeft <= 0) return;

    clearInterval(timerInterval);
    const caso = CLINICAL_CASES[currentQuestionIndex];

    // Avalia correspondência através de Regex/Glob
    const isCorrect = matchesTarget(hitMeshName, caso.targetKey);

    // Feedback luminoso no ThreeEngine
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.flashOrganFeedback === "function") {
      ThreeEngine.flashOrganFeedback(caso.targetKey, isCorrect);
    }

    if (isCorrect) {
      handleCorrectAnswer(caso);
    } else {
      handleWrongAnswer(caso, hitMeshName);
    }
  }

  function matchesTarget(meshName, pattern) {
    if (!meshName || !pattern) return false;
    const cleanPattern = pattern.trim().toLowerCase().replace(/\*/g, ".*");
    const regex = new RegExp(`^${cleanPattern}$`, "i");
    return regex.test(meshName.toLowerCase().trim()) || meshName.toLowerCase().includes(pattern.replace(/\*/g, "").toLowerCase());
  }

  function handleCorrectAnswer(caso) {
    correctHits++;
    streak++;
    if (streak > maxStreak) maxStreak = streak;

    // Bônus por tempo restante e sequência de acertos
    const timeBonus = Math.round(timeLeft * 2.5);
    const streakBonus = (streak - 1) * 20;
    const pointsAwarded = caso.pontos + timeBonus + streakBonus;
    score += pointsAwarded;

    document.getElementById("quizScoreText").textContent = `${score} pts`;

    const fbBox = document.getElementById("quizFeedbackBox");
    fbBox.className = "";
    fbBox.style.background = "rgba(16, 185, 129, 0.15)";
    fbBox.style.border = "1px solid rgba(16, 185, 129, 0.4)";
    fbBox.style.color = "#34d399";
    setHtml(fbBox, html`
      <div style="font-weight:800; font-size:0.78rem; margin-bottom:2px;">✔ ACERTO CIRÚRGICO! (+${pointsAwarded} pts)</div>
      <div><strong>Estrutura:</strong> ${caso.targetNome}</div>
      <div style="font-size:0.68rem; color:#cbd5e1; margin-top:4px;">${caso.explicacao}</div>
    `);

    // Resposta tátil em dispositivos móveis compatíveis
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);

    setTimeout(() => {
      presentQuestion(currentQuestionIndex + 1);
    }, 2800);
  }

  function handleWrongAnswer(caso, hitMeshName) {
    streak = 0;
    const cleanHit = hitMeshName.replace(/mesh_/g, "").replace(/_/g, " ").replace(/[0-9]/g, "").trim();

    const fbBox = document.getElementById("quizFeedbackBox");
    fbBox.className = "";
    fbBox.style.background = "rgba(239, 68, 68, 0.15)";
    fbBox.style.border = "1px solid rgba(239, 68, 68, 0.4)";
    fbBox.style.color = "#f87171";
    // O nome da malha vem do modelo 3D (.glb): escapado como qualquer dado.
    setHtml(fbBox, html`
      <div style="font-weight:800; font-size:0.78rem; margin-bottom:2px;">❌ ESTRUTURA INCORRETA</div>
      <div>Você selecionou: <em>${cleanHit || "Tecido Adjacente"}</em></div>
      <div><strong>Alvo Correto:</strong> ${caso.targetNome}</div>
      <div style="font-size:0.68rem; color:#cbd5e1; margin-top:4px;">${caso.explicacao}</div>
    `);

    if (navigator.vibrate) navigator.vibrate(140);

    setTimeout(() => {
      presentQuestion(currentQuestionIndex + 1);
    }, 3400);
  }

  function handleTimeout() {
    streak = 0;
    const caso = CLINICAL_CASES[currentQuestionIndex];

    const fbBox = document.getElementById("quizFeedbackBox");
    fbBox.className = "";
    fbBox.style.background = "rgba(245, 158, 11, 0.15)";
    fbBox.style.border = "1px solid rgba(245, 158, 11, 0.4)";
    fbBox.style.color = "#fbbf24";
    setHtml(fbBox, html`
      <div style="font-weight:800; font-size:0.78rem; margin-bottom:2px;">⏱️ TEMPO ESGOTADO!</div>
      <div><strong>Estrutura Correta:</strong> ${caso.targetNome}</div>
      <div style="font-size:0.68rem; color:#cbd5e1; margin-top:4px;">${caso.explicacao}</div>
    `);

    setTimeout(() => {
      presentQuestion(currentQuestionIndex + 1);
    }, 3000);
  }

  // =========================================================================
  // 6. CONCLUSÃO E INTEGRAÇÃO DE CRÉDITOS FORMATIVOS (DOSSIÊ PDF)
  // =========================================================================
  function completeQuiz() {
    clearInterval(timerInterval);
    isQuizRunning = false;

    const totalQuestions = CLINICAL_CASES.length;
    const accuracy = Math.round((correctHits / totalQuestions) * 100);
    const academicHoursAwarded = accuracy >= 60 ? 1.0 : 0.5;

    // Registra o progresso no histórico do aluno
    if (typeof ApiCache !== "undefined" && typeof ApiCache.registrarSimulacao === "function") {
      ApiCache.registrarSimulacao(`Quiz 3D LAIFT (${accuracy}% Acertos)`, "RAYCASTING");
    }

    submitAttempt(correctHits, totalQuestions);

    const card = document.getElementById("quizQuestionCard");
    const resultCard = document.getElementById("quizResultCard");
    if (card) card.classList.add("hidden");
    if (!resultCard) return;
    resultCard.classList.remove("hidden");
    setHtml(resultCard, html`
      <div style="text-align:center; padding:10px 0;">
        <span style="font-size:2rem;" aria-hidden="true">🏆</span>
        <h3 style="color:#38bdf8; font-size:1.05rem; margin:6px 0 2px 0;">Sessão Concluída com Sucesso!</h3>
        <p style="color:#94a3b8; font-size:0.75rem; margin-bottom:12px;">Avaliação prática de raciocínio espacial e farmacoterapêutica.</p>

        <div style="background:#020617; border:1px solid #334155; border-radius:8px; padding:10px; margin-bottom:12px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px; font-family:monospace;">
          <div>
            <div style="color:#94a3b8; font-size:0.65rem;">PONTUAÇÃO</div>
            <div style="color:#facc15; font-size:1.1rem; font-weight:bold;">${score}</div>
          </div>
          <div>
            <div style="color:#94a3b8; font-size:0.65rem;">PRECISÃO</div>
            <div style="color:#34d399; font-size:1.1rem; font-weight:bold;">${accuracy}%</div>
          </div>
          <div>
            <div style="color:#94a3b8; font-size:0.65rem;">HORAS LAIFT</div>
            <div style="color:#38bdf8; font-size:1.1rem; font-weight:bold;">+${academicHoursAwarded}h</div>
          </div>
        </div>
        <p id="quizSubmitStatus" role="status" aria-live="polite" style="font-size:0.7rem; color:#94a3b8; margin:0 0 10px;"></p>

        <div style="display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
          <button type="button" class="btn-primary" data-action="QuizEngine.startQuiz" style="padding:8px 16px; font-size:0.76rem;">🔄 Refazer Quiz</button>
          <button type="button" class="btn-secondary" data-action="QuizEngine.stopQuiz" style="padding:8px 16px; font-size:0.76rem;">Fechar</button>
        </div>
      </div>
    `);
  }

  /**
   * Registra o resultado no desempenho da pessoa (Contrato 4:
   * apiLearnSubmitQuizAttempt com module 'anatomia', pela ponte LaiftApi).
   * O quiz é cronometrado por questão, por isso conta como modo 'prova'.
   */
  function submitAttempt(correct, total) {
    const report = (texto) => {
      const el = document.getElementById("quizSubmitStatus");
      if (el) el.textContent = texto;
    };
    if (!window.LaiftApi || typeof window.LaiftApi.call !== "function") return;
    const payload = {
      module: "anatomia",
      mode: "prova",
      correct: correct,
      total: total,
      durationSeconds: Math.max(1, Math.round((Date.now() - (sessionStartedAt || Date.now())) / 1000)),
      topics: ["Quiz 3D — anatomia aplicada"]
    };
    Promise.resolve()
      .then(() => window.LaiftApi.call("apiLearnSubmitQuizAttempt", payload))
      .then((res) => report(res && res.success ? "✔ Resultado registrado no seu desempenho." : "Não foi possível registrar o resultado agora."))
      .catch(() => report("Não foi possível registrar o resultado agora."));
  }

  function stopQuiz() {
    clearInterval(timerInterval);
    isQuizRunning = false;
    if (hudContainer) {
      hudContainer.classList.add("hidden");
    }
  }

  // =========================================================================
  // API PÚBLICA EXPOSTA
  // =========================================================================
  return {
    init,
    startQuiz,
    stopQuiz,
    evaluateUserAnswer,
    isQuizActive: () => isQuizRunning,
    // Usado pelos testes E2E para simular o fim de uma sessão.
    completeQuiz,
    getCurrentScore: () => score
  };
})();

// Exposto em window para data-action ("QuizEngine.startQuiz"): `const` no
// topo não vira propriedade de window.
window.QuizEngine = QuizEngine;

// Inicialização segura com o carregamento do DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", QuizEngine.init);
} else {
  QuizEngine.init();
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/quiz-engine.js                            */
/* ========================================================================= */
