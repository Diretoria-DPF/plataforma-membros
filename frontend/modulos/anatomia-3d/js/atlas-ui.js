/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/atlas-ui.js                                       */
/* Funções de interface do atlas (tela cheia, zoom, camadas, fisiologia) e a */
/* ligação dos botões por data-action.                                       */
/* ========================================================================= */

/**
 * Antes estas funções eram um <script> inline no <head> do index.html e os
 * botões as chamavam por onclick="...". Na Fase 4 viraram este arquivo
 * externo + LaiftDom.delegateActions (lista fechada de ações), o que prepara
 * a CSP sem 'unsafe-inline' da Onda 2. Carregado por último: os motores
 * (AppController, MolEngine, PkEngine, QuizEngine, ApiCache) já existem.
 */
(function (global) {
  "use strict";

  const doc = global.document;

  global.toggleAtlasFullscreen = function () {
    const docEl = doc.documentElement;
    const requestFs = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFs) {
      if (requestFs) requestFs.call(docEl).catch((err) => console.warn("[LAIFT Fullscreen]", err));
    } else if (exitFs) {
      exitFs.call(doc).catch((err) => console.warn("[LAIFT Fullscreen]", err));
    }
  };

  doc.addEventListener("fullscreenchange", () => {
    const btn = doc.getElementById("btnFullscreenToggle");
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement;
    if (btn) {
      btn.textContent = isFs ? "⛶ Sair" : "⛶ Tela Cheia";
      btn.classList.toggle("fs-active-icon", !!isFs);
    }
  });

  global.setBiologicalZoomLevel = function (level) {
    doc.querySelectorAll(".zoom-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.level === level);
      btn.setAttribute("aria-pressed", btn.dataset.level === level ? "true" : "false");
    });

    const threeBox = doc.getElementById("canvas-3d-container");
    const molBox = doc.getElementById("mol-viewport-container");

    if (level === "nano") {
      if (threeBox) threeBox.classList.add("hidden");
      if (molBox) {
        molBox.classList.remove("hidden");
        if (global.MolEngine) {
          if (!global.MolEngine.currentPdbId) {
            global.MolEngine.loadPdb("4EY7", "Acetilcolinesterase (AChE)");
          }
          setTimeout(() => global.MolEngine.render(), 120);
        }
      }
    } else {
      if (molBox) molBox.classList.add("hidden");
      if (threeBox) {
        threeBox.classList.remove("hidden");
        if (global.ThreeEngine && typeof global.ThreeEngine.onWindowResize === "function") {
          global.ThreeEngine.onWindowResize();
        }
      }
    }
  };

  /** Catálogo PDB: muda para o zoom "nano" e carrega a estrutura. */
  global.abrirPdb = function (pdbId, nome) {
    global.setBiologicalZoomLevel("nano");
    if (global.MolEngine) global.MolEngine.loadPdb(pdbId, nome);
  };

  global.dispararFluxoSeguro = function (tipo) {
    if (global.ThreeEngine && typeof global.ThreeEngine.triggerParticleFlow === "function") {
      global.ThreeEngine.triggerParticleFlow(tipo);
    }
  };

  global.aplicarCamadaDireta = function (camadaNum) {
    if (global.ThreeEngine && typeof global.ThreeEngine.setDissectionDepth === "function") {
      global.ThreeEngine.setDissectionDepth(camadaNum);
      const slider = doc.getElementById("dissectionSlider");
      if (slider) slider.value = camadaNum;
    }
  };

  global.submeterInformacaoCustom = function () {
    const composto = doc.getElementById("inpCompostoCustom").value.trim() || "Fármaco Customizado";
    const via = doc.getElementById("selViaCustom").value;
    const dose = parseFloat(doc.getElementById("inpDoseCustom").value) || 100;

    if (global.PkEngine && typeof global.PkEngine.simulateProtocol === "function") {
      global.PkEngine.simulateProtocol({
        nome: composto,
        pkData: {
          route: via,
          dose: dose,
          vd: 35,
          halfLife: 4.0,
          ka: 1.5,
          targetOrgan: "liver"
        }
      });
    }

    if (global.ThreeEngine && typeof global.ThreeEngine.simulateAdministrationRoute === "function") {
      global.ThreeEngine.simulateAdministrationRoute(via);
    }
  };

  global.selecionarProcessoFisiologico = function (processoId) {
    if (typeof ATLAS_DATABASE === "undefined" || !ATLAS_DATABASE.processos) return;
    const proc = ATLAS_DATABASE.processos[processoId];
    if (!proc) return;

    const titleEl = doc.getElementById("timelineProcessTitle");
    const descEl = doc.getElementById("timelineProcessDesc");
    const stepsContainer = doc.getElementById("timelineStepsRow");

    if (titleEl) titleEl.textContent = `⚡ Processo: ${proc.titulo}`;
    if (descEl) descEl.textContent = proc.descricao;

    if (stepsContainer && Array.isArray(proc.etapas)) {
      LaiftDom.clear(stepsContainer);
      proc.etapas.forEach((etapa) => {
        stepsContainer.appendChild(LaiftDom.h("button", {
          type: "button",
          className: "btn-step",
          "data-action": "dispararFluxoSeguro",
          "data-arg": etapa.acaoParticulas || "oral_cavity",
          text: `${etapa.ordem}. ${etapa.fase}`
        }));
      });
    }
  };

  // Lista fechada: só estas ações podem ser disparadas por data-action*.
  LaiftDom.delegateActions(doc, [
    "toggleAtlasFullscreen", "setBiologicalZoomLevel", "abrirPdb", "dispararFluxoSeguro",
    "aplicarCamadaDireta", "submeterInformacaoCustom", "selecionarProcessoFisiologico",
    "ThreeEngine.resetOrganTree",
    "ApiCache.exportarDossiePDF", "ApiCache.renderizarHistoricoLocal",
    "AppController.selectSystem", "AppController.resetEntireTree", "AppController.onOrganVisibilityChange",
    "AppController.onOrganOpacityChange", "AppController.onOrganIsolate", "AppController.stopRoute",
    "AppController.filterRouteCategory", "AppController.selectRoute", "AppController.toggleCrisisState",
    "AppController.applyAntidoteAction", "AppController.launchQuiz", "AppController.simulateBioProtocol",
    "MolEngine.applyStyle", "MolEngine.toggleActiveSiteHighlight", "MolEngine.toggleSpin", "MolEngine.resetView",
    "QuizEngine.startQuiz", "QuizEngine.stopQuiz"
  ]);

  // Estado inicial dos botões de alternância, para leitores de tela.
  doc.querySelectorAll(".zoom-btn").forEach((btn) => {
    btn.setAttribute("aria-pressed", btn.classList.contains("active") ? "true" : "false");
  });
})(window);
