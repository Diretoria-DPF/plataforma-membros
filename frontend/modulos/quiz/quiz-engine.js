/**
 * MOTOR DE EXECUÇÃO DO QUIZ DE FARMACOLOGIA & TOXICOLOGIA (LAIFT)
 * Integração: SmilesDrawer, QuizAPIEngine (RxNav/PubChem/ChEBI) e Google Sheets.
 */
const QuizEngine = {
  indiceAtual: 0,
  acertos: 0,
  tempoInicio: null,
  bloqueado: false,
  questoes: [],
  smilesDrawerInstance: null,

  /**
   * Inicializa o motor e o renderizador vetorial
   */
  iniciar(questoes = (typeof QUIZ_FARMACOLOGIA_DB !== 'undefined' ? QUIZ_FARMACOLOGIA_DB : [])) {
    this.questoes = questoes;
    this.indiceAtual = 0;
    this.acertos = 0;
    this.tempoInicio = Date.now();
    this.initDrawer();
    this.renderizarQuestao();
  },

  /**
   * Configuração do SmilesDrawer para projeção 2D
   */
  initDrawer() {
    if (typeof SmilesDrawer !== "undefined" && !this.smilesDrawerInstance) {
      this.smilesDrawerInstance = new SmilesDrawer.Drawer({
        width: 220,
        height: 140,
        bondThickness: 1.4,
        bondLength: 14,
        shortBondLength: 0.85,
        compactDrawing: true,
        themes: {
          dark: {
            C: "#e2e8f0",
            O: "#ef4444",
            N: "#38bdf8",
            F: "#4ade80",
            CL: "#facc15",
            BR: "#fb923c",
            I: "#c084fc",
            P: "#f97316",
            S: "#eab308",
            BACKGROUND: "transparent"
          }
        }
      });
    }
  },

  /**
   * Renderiza a pergunta ativa e projeta a estrutura química
   */
  async renderizarQuestao() {
    this.bloqueado = false;
    const q = this.questoes[this.indiceAtual];
    if (!q) return this.finalizarQuiz();

    // Atualização de cabeçalhos
    const elModulo = document.getElementById("quizModulo");
    const elProgresso = document.getElementById("quizProgresso");
    const elEnunciado = document.getElementById("quizEnunciado");

    if (elModulo) elModulo.textContent = `${q.modulo} • Nível ${q.nivel}`;
    if (elProgresso) elProgresso.textContent = `Questão ${this.indiceAtual + 1} de ${this.questoes.length}`;
    if (elEnunciado) elEnunciado.textContent = q.enunciado;

    // Resolução e Projeção Estrutural da Molécula
    await this.carregarEstruturaVisual(q);

    // Renderização das Alternativas
    const container = document.getElementById("quizAlternativas");
    if (container) {
      container.innerHTML = "";
      q.alternativas.forEach((alt) => {
        const btn = document.createElement("button");
        btn.className = "quiz-alt-btn";
        btn.innerHTML = `<strong>${alt.letra})</strong> <span>${alt.texto}</span>`;
        btn.onclick = () => this.responder(alt, btn);
        container.appendChild(btn);
      });
    }

    const feedbackArea = document.getElementById("quizFeedbackArea");
    if (feedbackArea) feedbackArea.style.display = "none";
  },

  /**
   * Projeção 2D com fallback dinâmico via PubChem se o SMILES não for fornecido
   */
  async carregarEstruturaVisual(q) {
    const canvas = document.getElementById("quizMolCanvas");
    const label = document.getElementById("quizMolLabel");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);

    let smiles = q.smiles;
    let cid = q.pubchemCid;

    // Se a questão não tiver SMILES estático, busca dinamicamente via QuizAPIEngine
    if (!smiles && q.farmacoAlvo && typeof QuizAPIEngine !== "undefined") {
      if (label) label.textContent = "Buscando estrutura...";
      const info = await QuizAPIEngine.buscarEstruturaMolecular(q.farmacoAlvo);
      if (info) {
        smiles = info.smiles;
        cid = info.cid;
      }
    }

    if (label) {
      label.textContent = q.farmacoAlvo ? `${q.farmacoAlvo} ${cid ? `(CID: ${cid})` : ''}` : "--";
    }

    if (smiles && typeof SmilesDrawer !== "undefined") {
      this.initDrawer();
      SmilesDrawer.parse(smiles, (tree) => {
        this.smilesDrawerInstance.draw(tree, canvas, "dark", false);
      }, (err) => {
        console.warn("Erro ao renderizar SMILES do quiz:", err);
      });
    }
  },

  /**
   * Processamento de resposta com feedback técnico e link para Ficha Técnica
   */
  responder(altSelecionada, btnElemento) {
    if (this.bloqueado) return;
    this.bloqueado = true;

    const q = this.questoes[this.indiceAtual];
    const acertou = Boolean(altSelecionada.correta);

    if (acertou) {
      this.acertos++;
      btnElemento.classList.add("alt-correta");
    } else {
      btnElemento.classList.add("alt-incorreta");
      const botoes = document.querySelectorAll(".quiz-alt-btn");
      q.alternativas.forEach((alt, idx) => {
        if (alt.correta && botoes[idx]) botoes[idx].classList.add("alt-correta");
      });
    }

    // Exibição do feedback estruturado
    const feedbackBox = document.getElementById("quizFeedbackArea");
    if (feedbackBox) {
      feedbackBox.innerHTML = `
        <div class="feedback-status ${acertou ? 'txt-sucesso' : 'txt-erro'}">
          ${acertou ? "✔ Resposta Correta!" : "✖ Resposta Incorreta"}
        </div>
        <p class="feedback-justificativa">${altSelecionada.feedback}</p>
        <div class="feedback-analogia">
          💡 <strong>Analogia Prática:</strong> ${q.analogiaDidatica || "A correlação clínica guia a conduta terapêutica ideal."}
        </div>
        
        <div style="display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap;">
          <button class="btn btn-clear" style="font-size: 0.75rem;" onclick="QuizEngine.abrirDossieFarmaco('${q.farmacoAlvo}')">
            📋 Ficha Clínica (RxNav / ChEBI)
          </button>
          <button class="btn btn-play" style="font-size: 0.75rem;" onclick="QuizEngine.avancar()">
            ${this.indiceAtual + 1 < this.questoes.length ? "Próxima Questão ➔" : "Ver Desempenho Final"}
          </button>
        </div>
      `;
      feedbackBox.style.display = "block";
    }
  },

  avancar() {
    this.indiceAtual++;
    this.renderizarQuestao();
  },

  /**
   * Consulta e exibe a ficha farmacológica em tempo real via APIs abertas
   */
  async abrirDossieFarmaco(nomeFarmaco) {
    if (!nomeFarmaco || typeof QuizAPIEngine === "undefined") {
      alert("Ficha técnica indisponível para este composto.");
      return;
    }

    let modal = document.getElementById("modalDossieQuiz");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "modalDossieQuiz";
      modal.className = "manual-modal";
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="manual-content">
        <h3 style="color: #38bdf8;">📋 Consultando Bases Biomédicas...</h3>
        <p style="font-size: 0.8rem; color: #94a3b8;">Buscando classes na NLM (RxNav) e ontologia no ChEBI para <strong>${nomeFarmaco}</strong>...</p>
      </div>
    `;
    modal.style.display = "flex";

    const dossie = await QuizAPIEngine.gerarDossieFarmaco(nomeFarmaco);

    modal.innerHTML = `
      <div class="manual-content">
        <h3 style="color: #38bdf8; margin-top: 0;">📋 Ficha Farmacológica: ${dossie.farmaco}</h3>
        <div style="font-size: 0.8rem; line-height: 1.5; color: #cbd5e1; text-align: left;">
          <p><strong>Classes ATC (RxClass):</strong> <span style="color: #4ade80;">${dossie.classesATC}</span></p>
          <p><strong>Identificador RxCUI:</strong> <code>${dossie.rxcui}</code></p>
          <p><strong>Nomenclatura IUPAC:</strong> <span style="font-family: var(--font-mono); color: #94a3b8;">${dossie.iupac}</span></p>
          <p><strong>Fórmula / Massa:</strong> ${dossie.formula} • ${dossie.pesoMolecular} g/mol</p>
          <p><strong>Papel Biológico / Mecanismo (ChEBI):</strong><br><span style="font-style: italic; color: #cbd5e1;">${dossie.definicao}</span></p>
        </div>
        <button class="close-manual" style="margin-top: 14px;" onclick="document.getElementById('modalDossieQuiz').style.display='none'">Fechar Ficha</button>
      </div>
    `;
  },

  /**
   * Finalização com cálculo de métricas e envio consolidado ao Google Apps Script
   */
  async finalizarQuiz() {
    const tempoGastoSegundos = Math.max(1, Math.round((Date.now() - this.tempoInicio) / 1000));
    const aproveitamento = Math.round((this.acertos / this.questoes.length) * 100);

    // Recupera dados do aluno autenticado
    let alunoIdentificador = "Visitante";
    let alunoNome = "Aluno Virtual";
    try {
      const sessao = JSON.parse(localStorage.getItem("laift_student_session") || "{}");
      if (sessao.identifier) alunoIdentificador = sessao.identifier;
      if (sessao.name) alunoNome = sessao.name;
    } catch (e) {}

    // Extrai a lista de tópicos/fármacos únicos abordados no teste
    const topicosUnicos = Array.from(
      new Set(this.questoes.map(q => q.farmacoAlvo || q.modulo).filter(Boolean))
    ).join(", ");

    const moduloPrincipal = this.questoes[0]?.modulo || "Farmacologia & Toxicologia";

    // Exibição do resumo final
    const container = document.getElementById("quizCard");
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 24px;">
          <h2 style="color: #f8fafc; margin-top: 0;">Sessão Finalizada</h2>
          <div style="font-size: 2.5rem; font-weight: 800; color: ${aproveitamento >= 70 ? 'var(--neon-green)' : '#f59e0b'}; margin: 12px 0;">
            ${aproveitamento}%
          </div>
          <p style="color: #cbd5e1; font-size: 0.9rem;">
            Você acertou <strong>${this.acertos}</strong> de <strong>${this.questoes.length}</strong> questões.
          </p>
          <p style="color: var(--text-secondary); font-size: 0.78rem;">
            Tempo total: ${tempoGastoSegundos}s • Fármacos avaliados: ${topicosUnicos}
          </p>
          <button class="btn btn-reset" onclick="QuizEngine.iniciar()" style="margin-top: 16px; padding: 8px 20px;">
            🔄 Refazer Treinamento
          </button>
        </div>
      `;
    }

    // Persistência na aba 'Metricas_Quiz_Farmaco'
    const gateway = typeof APPS_SCRIPT_GATEWAY !== "undefined" ? APPS_SCRIPT_GATEWAY : window.APPS_SCRIPT_GATEWAY;
    if (gateway) {
      try {
        await fetch(gateway, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({
            acao: "registrarMetricasQuiz",
            identificador: alunoIdentificador,
            nome: alunoNome,
            modulo: moduloPrincipal,
            modo: "Treinamento Interativo",
            acertos: this.acertos,
            total: this.questoes.length,
            aproveitamento: aproveitamento,
            tempoGasto: tempoGastoSegundos,
            topicos: topicosUnicos
          })
        });
      } catch (err) {
        console.warn("[Quiz Engine] Falha ao sincronizar métricas:", err);
      }
    }
  }
};
