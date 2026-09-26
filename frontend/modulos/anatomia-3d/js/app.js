/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/app.js                                            */
/* VERSÃO:  2.3.0 — COMPLETA: 14 SISTEMAS, 18 VIAS, CRISE PK/PD & QUIZ 3D   */
/* ========================================================================= */

/**
 * CONTROLADOR MESTRE DE INTERFACE, NAVEGAÇÃO & INTEGRAÇÃO DE MOTORES
 * Ecossistema LAIFT - Módulo Master 3D / Bio-Twin
 * - Orquestração de abas SPA com suporte a gestos Swipe protegidos
 * - Mapeamento dinâmico dos 14 Sistemas Anatômicos na barra de chips e árvore
 * - Árvore de Dissecção Granular (Visibilidade, Sliders de Opacidade 0-100% e Foco)
 * - Seletor categorizado das 18 Vias de Administração Farmacológica
 * - Painel de Controle de Crise Toxicológica (Organofosforados, Atropina e 2-PAM)
 * - Integração do Quiz 3D Gamificado e Visualização Macromolecular PDB
 * - Busca de Protocolos de Biohacking e Emissão de Dossiê Curricular em PDF
 */

const AppController = (() => {
  // DOM seguro (../shared/safe-dom.js): html`` escapa toda interpolação e os
  // botões gerados usam data-action (sem onclick inline). A busca de
  // protocolos ecoava o texto digitado por innerHTML — XSS refletido.
  const html = LaiftDom.html;
  const setHtml = LaiftDom.setHtml;

  // -------------------------------------------------------------------------
  // 1. ESTADO DE NAVEGAÇÃO E COCKPIT SPA
  // -------------------------------------------------------------------------
  const tabs = ["view-anatomy", "view-biohacking", "view-acervo"];
  let currentTabIndex = 0;

  // Estado dos Gestos de Toque (Swipe)
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;
  let isTouchInside3D = false;
  const SWIPE_THRESHOLD_PX = 50;

  // Estado Local de Seleção
  let activeSystemId = "digestorio";
  let activeRouteId = "ORAL";
  let activeRouteCategory = "todas";

  // =========================================================================
  // 2. GESTÃO DE ABAS & CICLO DE VIDA DE TELAS
  // =========================================================================
  /**
   * Alterna a visualização ativa entre Anatomia, Biohacking e Acervo
   * @param {String} targetId - ID do contêiner da aba
   * @param {Boolean} force - Força recálculo do layout
   */
  function switchTab(targetId, force = false) {
    const targetIndex = tabs.indexOf(targetId);
    if (targetIndex === -1) return;
    if (!force && targetIndex === currentTabIndex) return;

    tabs.forEach((id) => {
      const panel = document.getElementById(id);
      if (panel) {
        if (id === targetId) {
          panel.classList.remove("hidden");
          panel.classList.add("active");
        } else {
          panel.classList.remove("active");
          panel.classList.add("hidden");
        }
      }
    });

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.target === targetId);
    });

    currentTabIndex = targetIndex;

    if (navigator.vibrate) {
      navigator.vibrate(10);
    }

    handleTabLifecycle(targetId);
  }

  function handleTabLifecycle(tabId) {
    if (tabId === "view-anatomy") {
      if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.onWindowResize === "function") {
        setTimeout(() => {
          ThreeEngine.onWindowResize();
        }, 50);
      }
    } else if (tabId === "view-biohacking") {
      renderBiohackingCards();
    } else if (tabId === "view-acervo") {
      if (typeof ApiCache !== "undefined" && typeof ApiCache.renderizarHistoricoLocal === "function") {
        ApiCache.renderizarHistoricoLocal();
      }
    }
  }

  function handleGesture() {
    if (isTouchInside3D) return;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD_PX) {
      if (deltaX > 0) {
        if (currentTabIndex > 0) {
          switchTab(tabs[currentTabIndex - 1]);
        }
      } else {
        if (currentTabIndex < tabs.length - 1) {
          switchTab(tabs[currentTabIndex + 1]);
        }
      }
    }
  }

  // =========================================================================
  // 3. BARRA DE SISTEMAS ANATÔMICOS (14 SISTEMAS DINÂMICOS)
  // =========================================================================
  function renderSystemsBar() {
    const container = document.getElementById("systemsBar");
    if (!container || typeof ATLAS_DATABASE === "undefined" || !Array.isArray(ATLAS_DATABASE.sistemas)) return;

    setHtml(container, html`${ATLAS_DATABASE.sistemas.map((sys) => {
      const isActive = sys.id === activeSystemId;
      return html`<button class="sys-chip ${isActive ? "active" : ""}" type="button" data-sys="${sys.id}" aria-pressed="${isActive ? "true" : "false"}" data-action="AppController.selectSystem" data-arg="${sys.id}"><span aria-hidden="true">${sys.icone || "🧬"}</span><span>${sys.nome}</span></button>`;
    })}`);
  }

  function selectSystem(systemId) {
    activeSystemId = systemId;

    document.querySelectorAll(".sys-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.sys === systemId);
      chip.setAttribute("aria-pressed", chip.dataset.sys === systemId ? "true" : "false");
    });

    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.selectSystem === "function") {
      ThreeEngine.selectSystem(systemId);
    }

    renderOrganTree(systemId);
  }

  // =========================================================================
  // 4. ÁRVORE ANATÔMICA GRANULAR COM SLIDERS DE OPACIDADE & FOCO
  // =========================================================================
  function renderOrganTree(systemId) {
    const container = document.getElementById("organTreeContainer");
    if (!container) return;

    if (typeof ATLAS_DATABASE === "undefined" || !Array.isArray(ATLAS_DATABASE.sistemas)) {
      setHtml(container, html`<div class="atlas-empty-msg">Base de dados anatômica indisponível.</div>`);
      return;
    }

    const sys = ATLAS_DATABASE.sistemas.find((s) => s.id === (systemId || activeSystemId));
    if (!sys) return;

    const linhas = (sys.orgaos || []).map((orgao) => {
      const organKey = orgao.meshKey || orgao.id;
      return html`
        <div class="tree-organ-row" data-organ="${organKey}">
          <input type="checkbox" checked id="chk_${orgao.id}" title="Exibir/Ocultar ${orgao.nome}" aria-label="Exibir ${orgao.nome}"
            data-action-change="AppController.onOrganVisibilityChange" data-arg="${organKey}">
          <div class="tree-organ-title" title="${orgao.nome}">${orgao.nome}</div>
          <input type="range" class="tree-organ-slider" min="0" max="1" step="0.05" value="1" title="Transparência (0% a 100%)" aria-label="Opacidade de ${orgao.nome}"
            data-action-input="AppController.onOrganOpacityChange" data-arg="${organKey}">
          <button type="button" class="btn-isolate-organ" title="Focar e isolar estrutura" aria-label="Focar ${orgao.nome}"
            data-action="AppController.onOrganIsolate" data-arg="${organKey}">Foco</button>
        </div>`;
    });

    setHtml(container, html`
      <div class="tree-system-card">
        <div class="tree-system-header">
          <strong class="tree-system-name" style="color:${sys.cor || "#38bdf8"};"><span aria-hidden="true">${sys.icone || "🧬"}</span> ${sys.nome}</strong>
          <button type="button" class="btn-isolate-organ" data-action="AppController.resetEntireTree" title="Restaurar visibilidade de todos os órgãos">Restaurar</button>
        </div>
        <div class="tree-organ-list">${linhas}</div>
      </div>`);
  }

  function onOrganVisibilityChange(organKey, isVisible) {
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.setOrganVisibility === "function") {
      ThreeEngine.setOrganVisibility(organKey, isVisible);
    }
  }

  function onOrganOpacityChange(organKey, value) {
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.setOrganOpacity === "function") {
      ThreeEngine.setOrganOpacity(organKey, parseFloat(value));
    }
  }

  function onOrganIsolate(organKey) {
    if (typeof ThreeEngine !== "undefined") {
      if (typeof ThreeEngine.isolateOrgan === "function") {
        ThreeEngine.isolateOrgan(organKey);
      }
      if (typeof ThreeEngine.highlightOrgan === "function") {
        ThreeEngine.highlightOrgan(organKey);
      }
    }
  }

  function resetEntireTree() {
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.resetOrganTree === "function") {
      ThreeEngine.resetOrganTree();
    }
    renderOrganTree(activeSystemId);
  }

  // =========================================================================
  // 5. SELETOR DAS 18 VIAS DE ADMINISTRAÇÃO FARMACOLÓGICA
  // =========================================================================
  function renderRoutesSelector() {
    const container = document.getElementById("routesSelectorContainer");
    if (!container) return;

    if (typeof ATLAS_DATABASE === "undefined" || !ATLAS_DATABASE.viasAdministracao) return;

    const vias = ATLAS_DATABASE.viasAdministracao;
    const allKeys = Object.keys(vias);

    // Filtragem por Categoria
    const filteredKeys = allKeys.filter((key) => {
      if (activeRouteCategory === "todas") return true;
      return (vias[key].categoria || "").toLowerCase() === activeRouteCategory;
    });

    const categoria = (id, rotulo) => html`<button type="button" class="route-cat-btn ${activeRouteCategory === id ? "active" : ""}" aria-pressed="${activeRouteCategory === id ? "true" : "false"}" data-action="AppController.filterRouteCategory" data-arg="${id}">${rotulo}</button>`;

    const cartoes = filteredKeys.map((key) => {
      const rota = vias[key];
      const isActive = rota.id === activeRouteId;
      return html`
        <div class="route-chip-card ${isActive ? "active" : ""}" id="route_card_${rota.id}" role="button" tabindex="0"
          data-action="AppController.selectRoute" data-arg="${rota.id}">
          <div class="route-chip-header">
            <span class="route-chip-icon" aria-hidden="true">${rota.icone}</span>
            <span class="route-badge" style="background:${rota.corFluxo}22; color:${rota.corFluxo}; border:1px solid ${rota.corFluxo};">${rota.id}</span>
          </div>
          <div class="route-chip-title">${rota.nome}</div>
          <div class="route-chip-meta">Biodisp.: ${rota.biodisponibilidadeMedia}</div>
        </div>`;
    });

    setHtml(container, html`
      <div class="tree-header">
        <h3>💉 Vias de Administração Farmacológica (${allKeys.length} Vias)</h3>
        <button type="button" class="btn-isolate-organ" data-action="AppController.stopRoute">Parar Fluxo</button>
      </div>
      <div class="routes-category-tabs" role="group" aria-label="Filtrar vias por categoria">
        ${categoria("todas", "Todas (" + allKeys.length + ")")}
        ${categoria("enteral", "Enterais")}
        ${categoria("parenteral", "Parenterais")}
        ${categoria("mucosa", "Mucosas")}
        ${categoria("topica", "Tópicas")}
      </div>
      <div class="routes-grid">${cartoes}</div>
      <div id="routeDetailsPanel" class="route-details-panel" aria-live="polite"></div>`);
    updateRouteDetailsPanel(activeRouteId);
  }

  function filterRouteCategory(cat) {
    activeRouteCategory = cat;
    renderRoutesSelector();
  }

  function selectRoute(routeId) {
    activeRouteId = routeId.toUpperCase();

    document.querySelectorAll(".route-chip-card").forEach((c) => {
      c.classList.remove("active");
    });
    const activeCard = document.getElementById(`route_card_${activeRouteId}`);
    if (activeCard) activeCard.classList.add("active");

    updateRouteDetailsPanel(activeRouteId);

    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.simulateAdministrationRoute === "function") {
      ThreeEngine.simulateAdministrationRoute(activeRouteId);
    }
  }

  function updateRouteDetailsPanel(routeId) {
    const panel = document.getElementById("routeDetailsPanel");
    if (!panel || typeof ATLAS_DATABASE === "undefined" || !ATLAS_DATABASE.viasAdministracao) return;

    const rota = ATLAS_DATABASE.viasAdministracao[routeId] || ATLAS_DATABASE.viasAdministracao["ORAL"];
    if (!rota) return;

    const primeiraPassagem = typeof rota.primeiraPassagemHepatica === "boolean" ? (rota.primeiraPassagemHepatica ? "SIM" : "NÃO") : rota.primeiraPassagemHepatica;
    setHtml(panel, html`
      <div class="route-details-top">
        <strong style="color:${rota.corFluxo};">${rota.nome}</strong>
        <span class="route-details-tmax">tMax Estimado: <strong>${rota.tMaxMedio}</strong></span>
      </div>
      <p class="route-details-desc">${rota.descricaoClinica}</p>
      <div class="route-details-barriers"><strong>Barreiras de Absorção:</strong> ${rota.barreirasBiologicas}</div>
      <div class="route-details-meta">
        <span>1ª Passagem Hepática: <strong>${primeiraPassagem}</strong></span>
        <span aria-hidden="true">•</span>
        <span>Biodisponibilidade (F): <strong>${rota.biodisponibilidadeMedia}</strong></span>
      </div>`);
  }

  function stopRoute() {
    if (typeof ThreeEngine !== "undefined" && typeof ThreeEngine.stopRouteSimulation === "function") {
      ThreeEngine.stopRouteSimulation();
    }
    document.querySelectorAll(".route-chip-card").forEach((c) => c.classList.remove("active"));
  }

  // =========================================================================
  // 6. MODO CRISE TOXICOLÓGICA (SIMULADOR CLÍNICO LAIFT)
  // =========================================================================
  function renderCrisisPanel() {
    const container = document.getElementById("crisisPanelContainer");
    if (!container) return;

    setHtml(container, html`
      <div class="crisis-panel-card">
        <div class="crisis-panel-header">
          <div class="crisis-title"><span aria-hidden="true">🚨</span><span>Simulador de Crise: Intoxicação por Organofosforados</span></div>
          <button type="button" id="btnToggleCrisis" class="btn-crisis-toggle" aria-pressed="false" data-action="AppController.toggleCrisisState">Iniciar Crise</button>
        </div>
        <div id="crisisTelemetryHUD" aria-live="polite">
          <div class="crisis-intro">Simulação de inibição irreversível da AChE, broncorreia e bradicardia severa. Clique em "Iniciar Crise" para monitorar a curva e intervir com antídotos.</div>
        </div>
        <div class="crisis-actions-row">
          <button type="button" class="btn-antidote atropina" data-action="AppController.applyAntidoteAction" data-arg="atropina" title="Antagonista competitivo muscarínico">
            <span>💉 Atropina 2mg IV</span><span class="antidote-sub">Bloqueio Receptores M2/M3</span>
          </button>
          <button type="button" class="btn-antidote pralidoxima" data-action="AppController.applyAntidoteAction" data-arg="pralidoxima" title="Reativador da acetilcolinesterase">
            <span>💉 Pralidoxima 1g IV</span><span class="antidote-sub">Reativação Enzimática AChE</span>
          </button>
        </div>
      </div>`);
  }

  function toggleCrisisState() {
    const btn = document.getElementById("btnToggleCrisis");
    if (typeof PkEngine === "undefined") return;

    if (!PkEngine.isCrisisActive()) {
      PkEngine.startCrisisSimulation("organofosforado");
      if (btn) {
        btn.innerText = "Interromper Crise";
        btn.style.background = "#64748b";
        btn.setAttribute("aria-pressed", "true");
      }
    } else {
      PkEngine.stopCrisisSimulation();
      if (btn) {
        btn.innerText = "Iniciar Crise";
        btn.style.background = "var(--danger)";
        btn.setAttribute("aria-pressed", "false");
      }
    }
  }

  function applyAntidoteAction(type) {
    if (typeof PkEngine !== "undefined" && typeof PkEngine.applyAntidote === "function") {
      PkEngine.applyAntidote(type);
    }
  }

  // =========================================================================
  // 7. QUIZ 3D GAMIFICADO & DESAFIOS CLÍNICOS
  // =========================================================================
  function renderQuizLauncher() {
    const container = document.getElementById("quizLauncherContainer");
    if (!container) return;

    setHtml(container, html`
      <div class="quiz-launcher-banner">
        <div class="quiz-launcher-info">
          <h4>🎯 Quiz 3D Interativo: Aponte e Diagnostique</h4>
          <p>Casos clínicos toxicológicos, farmacocinética e semiologia espacial.</p>
        </div>
        <button type="button" class="btn-primary quiz-launch-btn" data-action="AppController.launchQuiz">▶ Iniciar Quiz 3D</button>
      </div>`);
  }

  function launchQuiz() {
    if (typeof QuizEngine !== "undefined" && typeof QuizEngine.startQuiz === "function") {
      QuizEngine.startQuiz();
    }
  }

  // =========================================================================
  // 8. PROTOCOLOS DE BIOHACKING & OTIMIZAÇÃO METABÓLICA
  // =========================================================================
  function renderBiohackingCards(filtro = "") {
    const container = document.getElementById("biohacking-results-grid");
    if (!container) return;

    if (typeof ATLAS_DATABASE === "undefined" || !Array.isArray(ATLAS_DATABASE.protocols)) {
      setHtml(container, html`<div class="atlas-empty-msg">Nenhum protocolo disponível.</div>`);
      return;
    }

    const termo = filtro.toLowerCase().trim();
    const protocolos = ATLAS_DATABASE.protocols.filter((p) => {
      if (!termo) return true;
      return (
        p.nome.toLowerCase().includes(termo) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(termo))) ||
        (p.viaMetabolica && p.viaMetabolica.toLowerCase().includes(termo))
      );
    });

    if (protocolos.length === 0) {
      // O termo digitado volta escapado (antes: innerHTML com o texto cru).
      setHtml(container, html`<div class="atlas-empty-msg is-boxed">Nenhum protocolo encontrado para "${filtro}".</div>`);
      return;
    }

    setHtml(container, html`${protocolos.map((p) => html`
      <div class="bio-protocol-card" role="button" tabindex="0" data-action="AppController.simulateBioProtocol" data-arg="${p.id}">
        <div class="bio-protocol-top">
          <strong class="bio-protocol-name"><span aria-hidden="true">${p.icone || "⚡"}</span> ${p.nome}</strong>
          <span class="bio-protocol-route">${p.pkData ? p.pkData.route : "ORAL"}</span>
        </div>
        <div class="bio-protocol-pathway">${p.viaMetabolica}</div>
        <p class="bio-protocol-mechanism">${p.mecanismoAcao}</p>
        <div class="bio-protocol-tags">${(p.tags || []).map((t) => html`<span class="tag-bio">${t}</span>`)}</div>
        <div class="bio-protocol-cofactors">Cofatores sinérgicos: <span>${(p.cofatores || []).join(", ") || "Nenhum"}</span></div>
      </div>`)}`);
  }

  function simulateBioProtocol(protocolId) {
    if (typeof ATLAS_DATABASE === "undefined" || !Array.isArray(ATLAS_DATABASE.protocols)) return;
    const proto = ATLAS_DATABASE.protocols.find((p) => p.id === protocolId);
    if (!proto) return;

    switchTab("view-anatomy");

    if (typeof PkEngine !== "undefined" && typeof PkEngine.simulateProtocol === "function") {
      PkEngine.simulateProtocol(proto);
    }
  }

  // =========================================================================
  // 9. LISTENERS GLOBAIS & BLINDAGEM DE TOQUE
  // =========================================================================
  function initListeners() {
    // Navegação Inferior
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const target = e.currentTarget.dataset.target;
        if (target) switchTab(target);
      });
    });

    // Touch events com proteção para o canvas 3D e sliders
    const viewport = document.getElementById("main-viewport");
    const container3D = document.getElementById("canvas-3d-container");
    const containerMol = document.getElementById("mol-viewport-container");

    if (viewport) {
      viewport.addEventListener(
        "touchstart",
        (e) => {
          if (!e.changedTouches || e.changedTouches.length === 0) return;
          const touch = e.changedTouches[0];
          touchStartX = touch.screenX;
          touchStartY = touch.screenY;

          const target = e.target;
          isTouchInside3D = !!(
            (container3D && container3D.contains(target)) ||
            (containerMol && containerMol.contains(target)) ||
            (target.classList && target.classList.contains("tree-organ-slider")) ||
            target.id === "dissectionSlider"
          );
        },
        { passive: true }
      );

      viewport.addEventListener(
        "touchend",
        (e) => {
          if (!e.changedTouches || e.changedTouches.length === 0) return;
          const touch = e.changedTouches[0];
          touchEndX = touch.screenX;
          touchEndY = touch.screenY;

          handleGesture();
          isTouchInside3D = false;
        },
        { passive: true }
      );
    }

    // Busca de Protocolos
    const searchInput = document.getElementById("bio-search-input");
    const searchBtn = document.getElementById("btn-bio-search");

    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        renderBiohackingCards(e.target.value);
      });
    }

    if (searchBtn && searchInput) {
      searchBtn.addEventListener("click", () => {
        renderBiohackingCards(searchInput.value);
      });
    }
  }

  // =========================================================================
  // 10. BOOTSTRAP MASTER
  // =========================================================================
  function init() {
    console.log("[AppController v2.3] Inicializando Controlador Master LAIFT...");
    initListeners();
    renderSystemsBar();
    renderRoutesSelector();
    renderOrganTree("digestorio");
    renderCrisisPanel();
    renderQuizLauncher();
    renderBiohackingCards();

    // Inicia diretamente na aba de Anatomia 3D
    switchTab("view-anatomy", true);
  }

  return {
    init,
    switchTab,
    selectSystem,
    renderOrganTree,
    renderRoutesSelector,
    filterRouteCategory,
    selectRoute,
    stopRoute,
    toggleCrisisState,
    applyAntidoteAction,
    launchQuiz,
    renderBiohackingCards,
    simulateBioProtocol,
    onOrganVisibilityChange,
    onOrganOpacityChange,
    onOrganIsolate,
    resetEntireTree
  };
})();

// `const` no topo não vira propriedade de window: sem isto, data-action
// "AppController.x" (e o antigo onclick) não encontrariam o controlador.
window.AppController = AppController;

// Inicialização segura com o carregamento do DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", AppController.init);
} else {
  AppController.init();
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/app.js                                     */
/* ========================================================================= */
