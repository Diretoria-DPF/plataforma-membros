/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/pk-engine.js                                      */
/* VERSÃO:  2.0.0 — COMPLETA: PK/PD HÍBRIDO, HILL EMAX & MODO CRISE         */
/* ========================================================================= */

/**
 * MOTOR DE MODELAGEM FARMACOCINÉTICA & FARMACODINÂMICA (PK/PD)
 * Ecossistema LAIFT - Módulo Master 3D / Bio-Twin
 * - Modelagem Compartimental PK:
 *     * IV Bolus (Decaimento Monoexponencial)
 *     * Vias Extravasculares (Equação Biexponencial de Bateman)
 * - Modelagem Farmacodinâmica (PD):
 *     * Curva Sigmoide de Hill (Emax, EC50 e Coeficiente de Hill gamma)
 *     * Cálculo de Ocupação de Receptores e Efeito Clínico %
 * - Simulador de Crises Toxicológicas LAIFT:
 *     * Intoxicação Aguda por Organofosforados (Crise Colinérgica)
 *     * Reversão com Antídotos em Tempo Real (Atropina + Pralidoxima / 2-PAM)
 * - Renderização Gráfica Vetorial Responsiva via Chart.js (Eixo Duplo PK/PD)
 * - Sincronização Bidirecional com o Motor 3D (ThreeEngine) e Registro de Horas (ApiCache)
 */

const PkEngine = (() => {
  // -------------------------------------------------------------------------
  // 1. ESTADO E VARIÁVEIS DE CONTROLE
  // -------------------------------------------------------------------------
  let chartInstance = null;
  let currentProtocol = null;
  let simulationInterval = null;

  // Parâmetros PK Basais
  let doseMg = 100;
  let routeType = "ORAL";
  let bioavailabilityF = 0.75;
  let volumeDistribuicaoL = 40;
  let meiaVidaHoras = 4.0;
  let constanteAbsorcaoKa = 1.5; // h^-1
  let targetOrganKey = "liver";

  // Parâmetros PD Basais (Modelo Sigmoide de Hill)
  let eMaxPercent = 100;
  let ec50MgL = 1.25;
  let hillGamma = 1.5;

  // Estado do Modo Crise Toxicológica
  let isCrisisSimulating = false;
  let crisisElapsedMin = 0;
  let crisisToxicityIndex = 0; // 0 a 100%
  let antidoteDosesApplied = { atropina: 0, pralidoxima: 0 };

  // Paleta Visual Científica Dark
  const THEME = {
    bgCanvas: "rgba(2, 6, 23, 0.95)",
    linePk: "#38bdf8",
    fillPk: "rgba(56, 189, 248, 0.15)",
    linePd: "#10b981",
    fillPd: "rgba(16, 185, 129, 0.10)",
    lineToxic: "#ef4444",
    grid: "rgba(51, 65, 85, 0.4)",
    text: "#94a3b8"
  };

  // =========================================================================
  // 2. INICIALIZAÇÃO E SETUP DO GRÁFICO (CHART.JS)
  // =========================================================================
  function init() {
    const canvas = document.getElementById("pkChartCanvas");
    if (!canvas || typeof Chart === "undefined") {
      console.warn("[PkEngine] Canvas #pkChartCanvas ou biblioteca Chart.js indisponível.");
      return;
    }

    const ctx = canvas.getContext("2d");

    chartInstance = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Concentração Plasmática (mg/L)",
            yAxisID: "y-pk",
            data: [],
            borderColor: THEME.linePk,
            backgroundColor: THEME.fillPk,
            borderWidth: 2.5,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHitRadius: 8
          },
          {
            label: "Efeito Farmacológico / Emax (%)",
            yAxisID: "y-pd",
            data: [],
            borderColor: THEME.linePd,
            backgroundColor: THEME.fillPd,
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHitRadius: 8
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: "top",
            labels: {
              color: THEME.text,
              font: { size: 10, weight: "bold" },
              boxWidth: 12,
              padding: 8
            }
          },
          tooltip: {
            backgroundColor: "rgba(2, 6, 23, 0.95)",
            titleColor: "#38bdf8",
            bodyColor: "#f8fafc",
            borderColor: "#334155",
            borderWidth: 1,
            padding: 8,
            displayColors: true,
            callbacks: {
              label: (context) => {
                const label = context.dataset.label || "";
                const val = context.parsed.y.toFixed(2);
                return `${label}: ${val}`;
              }
            }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Tempo Decorrido (Horas)",
              color: THEME.text,
              font: { size: 10, weight: "bold" }
            },
            grid: { color: THEME.grid },
            ticks: { color: THEME.text, font: { size: 9 }, maxTicksLimit: 12 }
          },
          "y-pk": {
            type: "linear",
            position: "left",
            title: {
              display: true,
              text: "Cp (mg/L)",
              color: THEME.linePk,
              font: { size: 10, weight: "bold" }
            },
            grid: { color: THEME.grid },
            ticks: { color: THEME.linePk, font: { size: 9 } },
            beginAtZero: true
          },
          "y-pd": {
            type: "linear",
            position: "right",
            min: 0,
            max: 100,
            title: {
              display: true,
              text: "Efeito (%)",
              color: THEME.linePd,
              font: { size: 10, weight: "bold" }
            },
            grid: { drawOnChartArea: false },
            ticks: { color: THEME.linePd, font: { size: 9 } }
          }
        }
      }
    });

    console.log("[PkEngine] Motor PK/PD Chart.js inicializado.");
  }

  // =========================================================================
  // 3. EQUAÇÕES MATEMÁTICAS FUNDAMENTAIS (BATEMAN + HILL)
  // =========================================================================
  /**
   * Calcula a constante de eliminação de primeira ordem (ke)
   * ke = ln(2) / t1/2
   */
  function calcularKe(meiaVida) {
    return Math.LN2 / Math.max(0.01, meiaVida);
  }

  /**
   * Resolve a Concentração Plasmática no tempo t: C(t)
   * - Via Intravenosa: Modelo de decaimento monoexponencial
   * - Vias Extravasculares: Equação biexponencial de Bateman
   */
  function resolverConcentracao(t, dose, f, vd, ke, ka, isIv) {
    if (t < 0) return 0;

    if (isIv) {
      const c0 = (dose * 1.0) / vd;
      return c0 * Math.exp(-ke * t);
    }

    // Equação de Bateman
    if (Math.abs(ka - ke) < 0.0001) ka = ke + 0.0001; // Previne divisão por zero
    const fator = (f * dose * ka) / (vd * (ka - ke));
    const conc = fator * (Math.exp(-ke * t) - Math.exp(-ka * t));
    return Math.max(0, conc);
  }

  /**
   * Equação Sigmoide de Hill para Farmacodinâmica (Efeito Clínico %):
   * E(C) = (Emax * C^gamma) / (EC50^gamma + C^gamma)
   */
  function resolverEfeitoHill(conc, eMax, ec50, gamma) {
    if (conc <= 0) return 0;
    const cPow = Math.pow(conc, gamma);
    const ec50Pow = Math.pow(ec50, gamma);
    const efeito = (eMax * cPow) / (ec50Pow + cPow);
    return Math.min(100, Math.max(0, efeito));
  }

  // =========================================================================
  // 4. SIMULAÇÃO DE CURVA E PROJEÇÃO DINÂMICA
  // =========================================================================
  /**
   * Simula o perfil PK/PD completo a partir de um protocolo clínico ou parâmetros customizados
   */
  function simulateProtocol(protocolData) {
    if (!chartInstance) init();
    if (!chartInstance) return;

    currentProtocol = protocolData;

    // Extração de Parâmetros Farmacocinéticos do Protocolo
    if (protocolData && protocolData.pkData) {
      const pk = protocolData.pkData;
      doseMg = pk.dose || 100;
      routeType = (pk.route || "ORAL").toUpperCase();
      volumeDistribuicaoL = pk.vd || 40;
      meiaVidaHoras = pk.halfLife || 4.0;
      constanteAbsorcaoKa = pk.ka || 1.5;
      targetOrganKey = pk.targetOrgan || protocolData.targetMesh || "liver";
    }

    // Ajuste de Biodisponibilidade F por Via
    const isIv = routeType === "IV" || routeType === "INTRAVENOSA";
    if (isIv) {
      bioavailabilityF = 1.0;
      constanteAbsorcaoKa = 0;
    } else if (routeType === "SUBLINGUAL") {
      bioavailabilityF = 0.80;
      constanteAbsorcaoKa = 4.5;
    } else if (routeType === "NASAL") {
      bioavailabilityF = 0.65;
      constanteAbsorcaoKa = 3.5;
    } else if (routeType === "INTRAMUSCULAR") {
      bioavailabilityF = 0.90;
      constanteAbsorcaoKa = 2.2;
    } else {
      bioavailabilityF = 0.70;
    }

    const ke = calcularKe(meiaVidaHoras);
    const tempoTotalSimulacaoH = Math.max(12, Math.min(72, meiaVidaHoras * 5));
    const passoTempoH = tempoTotalSimulacaoH / 60;

    const labels = [];
    const pkValues = [];
    const pdValues = [];

    let cMax = 0;
    let tMax = 0;

    for (let t = 0; t <= tempoTotalSimulacaoH; t += passoTempoH) {
      const cp = resolverConcentracao(t, doseMg, bioavailabilityF, volumeDistribuicaoL, ke, constanteAbsorcaoKa, isIv);
      const efeito = resolverEfeitoHill(cp, eMaxPercent, ec50MgL, hillGamma);

      labels.push(t.toFixed(1) + "h");
      pkValues.push(Number(cp.toFixed(3)));
      pdValues.push(Number(efeito.toFixed(1)));

      if (cp > cMax) {
        cMax = cp;
        tMax = t;
      }
    }

    // Atualiza Gráfico
    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].data = pkValues;
    chartInstance.data.datasets[1].data = pdValues;
    chartInstance.update();

    // Sincronização 3D: Destaca o órgão-alvo correspondente
    if (typeof ThreeEngine !== "undefined") {
      if (typeof ThreeEngine.simulateAdministrationRoute === "function") {
        ThreeEngine.simulateAdministrationRoute(routeType);
      }
      if (typeof ThreeEngine.highlightOrgan === "function") {
        ThreeEngine.highlightOrgan(targetOrganKey);
      }
    }

    // Registro da Sessão no IndexedDB e Histórico Acadêmico
    if (typeof ApiCache !== "undefined" && typeof ApiCache.registrarSimulacao === "function") {
      const nomeComposto = protocolData ? protocolData.nome : "Fármaco Genérico";
      ApiCache.registrarSimulacao(nomeComposto, routeType);
    }

    console.log(`[PkEngine] Simulação PK/PD Concluída. Cmax: ${cMax.toFixed(2)} mg/L em t: ${tMax.toFixed(1)} h`);
    return { cMax, tMax, labels, pkValues, pdValues };
  }

  // =========================================================================
  // 5. MODO CRISE TOXICOLÓGICA (INTOXICAÇÃO POR ORGANOFOSFORADOS & ANTÍDOTOS)
  // =========================================================================
  /**
   * Dispara o cenário clínico de intoxicação aguda por inibidores da colinesterase
   */
  function startCrisisSimulation(crisisName = "organofosforado") {
    if (!chartInstance) init();
    if (!chartInstance) return;

    stopCrisisSimulation();
    isCrisisSimulating = true;
    crisisElapsedMin = 0;
    crisisToxicityIndex = 20; // Início agudo
    antidoteDosesApplied = { atropina: 0, pralidoxima: 0 };

    // Ativa alarme visual no ThreeEngine
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.setCrisisMode === "function") {
      ThreeEngine.setCrisisMode(true, "colinergica");
    }

    // Prepara dados do gráfico para linha do tempo em minutos
    const labels = [];
    const cpTox = [];
    const effectAch = [];

    chartInstance.data.labels = labels;
    chartInstance.data.datasets[0].label = "Carga de Xenobiótico Tóxico (ppm)";
    chartInstance.data.datasets[0].borderColor = THEME.lineToxic;
    chartInstance.data.datasets[0].backgroundColor = "rgba(239, 68, 68, 0.2)";
    chartInstance.data.datasets[0].data = cpTox;

    chartInstance.data.datasets[1].label = "Hiperativação Colinérgica Muscarínica (%)";
    chartInstance.data.datasets[1].borderColor = "#f59e0b";
    chartInstance.data.datasets[1].data = effectAch;

    // Loop de Telemetria de Emergência a cada 800ms (1 min simulado por tick)
    simulationInterval = setInterval(() => {
      crisisElapsedMin += 1;

      // Dinâmica de agravamento sem intervenção
      if (antidoteDosesApplied.atropina === 0 && antidoteDosesApplied.pralidoxima === 0) {
        crisisToxicityIndex = Math.min(100, crisisToxicityIndex + 2.8);
      } else {
        // Redução proporcional às doses de antídotos
        const fatorReversao = antidoteDosesApplied.atropina * 1.8 + antidoteDosesApplied.pralidoxima * 2.5;
        crisisToxicityIndex = Math.max(5, crisisToxicityIndex - fatorReversao);
      }

      labels.push(crisisElapsedMin + " min");
      cpTox.push(Number((crisisToxicityIndex * 0.85).toFixed(1)));
      effectAch.push(Number(crisisToxicityIndex.toFixed(1)));

      if (labels.length > 25) {
        labels.shift();
        cpTox.shift();
        effectAch.shift();
      }

      chartInstance.update("none");

      // Atualiza telemetria da crise no DOM se o HUD existir
      updateCrisisHUD();

      // Condição de parada ou estabilização
      if (crisisToxicityIndex <= 15 && (antidoteDosesApplied.atropina > 0 || antidoteDosesApplied.pralidoxima > 0)) {
        console.log("[PkEngine] 🛡️ Paciente estabilizado pelo protocolo de antídotos.");
        if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.setCrisisMode === "function") {
          ThreeEngine.setCrisisMode(false);
        }
      }
    }, 800);
  }

  /**
   * Aplicação clínica de antídotos para reversão da crise
   */
  function applyAntidote(type) {
    if (!isCrisisSimulating) return;

    if (type === "atropina") {
      antidoteDosesApplied.atropina += 1;
      console.log(`[PkEngine] 💉 Atropina 2mg IV administrada (Total: ${antidoteDosesApplied.atropina} doses). Bloqueio competitivo M2/M3.`);
      if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.highlightOrgan === "function") {
        ThreeEngine.highlightOrgan("heart", 0x10b981, 1500);
      }
    } else if (type === "pralidoxima") {
      antidoteDosesApplied.pralidoxima += 1;
      console.log(`[PkEngine] 💉 Pralidoxima 1g IV administrada (Total: ${antidoteDosesApplied.pralidoxima} doses). Reativação da AChE.`);
      if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.highlightOrgan === "function") {
        ThreeEngine.highlightOrgan("brain", 0x38bdf8, 1500);
      }
    }

    updateCrisisHUD();
  }

  function stopCrisisSimulation() {
    if (simulationInterval) {
      clearInterval(simulationInterval);
      simulationInterval = null;
    }
    isCrisisSimulating = false;
    crisisElapsedMin = 0;
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.setCrisisMode === "function") {
      ThreeEngine.setCrisisMode(false);
    }
  }

  function updateCrisisHUD() {
    const hud = document.getElementById("crisisTelemetryHUD");
    if (!hud) return;

    const gravidade = crisisToxicityIndex > 70 ? "CRÍTICA / PARADA IMINENTE" : crisisToxicityIndex > 40 ? "MODERADA / BRONCORREIA" : "ESTÁVEL / CONTROLADA";
    const corGravidade = crisisToxicityIndex > 70 ? "#ef4444" : crisisToxicityIndex > 40 ? "#f59e0b" : "#10b981";

    LaiftDom.setHtml(hud, LaiftDom.html`
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <span style="font-weight:bold; color:${corGravidade}; font-size:0.75rem;">Status: ${gravidade}</span>
        <span style="font-family:monospace; font-size:0.7rem; color:#94a3b8;">Tempo: ${crisisElapsedMin} min</span>
      </div>
      <div style="font-size:0.7rem; color:#cbd5e1; display:flex; gap:12px;">
        <span>Atropina: <strong>${antidoteDosesApplied.atropina * 2} mg</strong></span>
        <span>Pralidoxima: <strong>${antidoteDosesApplied.pralidoxima * 1} g</strong></span>
        <span>Hiperestimulação ACh: <strong>${crisisToxicityIndex.toFixed(0)}%</strong></span>
      </div>
    `);
  }

  // =========================================================================
  // API PÚBLICA DO MOTOR
  // =========================================================================
  return {
    init,
    simulateProtocol,
    startCrisisSimulation,
    applyAntidote,
    stopCrisisSimulation,
    resolverConcentracao,
    resolverEfeitoHill,
    getChartInstance: () => chartInstance,
    isCrisisActive: () => isCrisisSimulating
  };
})();

// `const` no topo não vira propriedade de window: sem isto a simulação
// customizada (que testava window.PkEngine) nunca rodava.
window.PkEngine = PkEngine;

// Inicialização segura com o DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", PkEngine.init);
} else {
  PkEngine.init();
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/pk-engine.js                              */
/* ========================================================================= */
