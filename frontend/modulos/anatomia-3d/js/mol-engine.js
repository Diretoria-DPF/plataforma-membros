/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/mol-engine.js                                     */
/* ========================================================================= */

/**
 * MOTOR DE VISUALIZAÇÃO NANOMOLECULAR & CRISTALOGRAFIA PDB (NÍVEL 4: NANO)
 * Ecossistema LAIFT - Módulo Master 3D
 * - Integração com a biblioteca 3Dmol.js para renderização WebGL macromolecular
 * - Conexão direta com RCSB Protein Data Bank (PDB API) para download dinâmico
 * - Modos de Projeção Biofísica: Cartoon, Stick, Sphere (VDW) e Superfície Solvente
 * - Destaque automatizado de sítio catalítico e ligantes co-cristalizados (fármacos)
 * - Controles dinâmicos de inspeção: rotação contínua, zoom e polaridade eletrostática
 */

const MolEngine = (() => {
  // Variáveis de Instância 3Dmol
  let viewer = null;
  let currentModel = null;
  let currentPdbId = null;
  let currentPdbMeta = null;

  // Estado da Renderização Molecular
  let currentStyle = "cartoon"; // 'cartoon' | 'stick' | 'sphere' | 'surface'
  let currentSurface = null;
  let isSpinning = false;
  let spinInterval = null;
  let isLigandHighlighted = false;

  // Elementos do DOM
  let container = null;
  let viewportEl = null;

  // Paleta de Cores e Estilos Elementares (Padrão CPK)
  const CPK_COLORS = {
    carbon: "#909090",
    nitrogen: "#3050f8",
    oxygen: "#ff0d0d",
    sulfur: "#ffff30",
    phosphorus: "#ff8000",
    hydrogen: "#ffffff"
  };

  // Metadados Curados para Fármacos Co-cristalizados
  const PDB_CATALOG = {
    "1SMD": {
      nome: "Amilase Salivar Humana (Ptialina)",
      sistema: "digestorio",
      liganteResiduo: "TRS",
      liganteNome: "Inibidor Oligossacarídeo (Análogo Acarbose)",
      resolucao: "1.60 Å",
      massa: "56.0 kDa",
      organismo: "Homo sapiens"
    },
    "4PEP": {
      nome: "Pepsina Gástrica",
      sistema: "digestorio",
      liganteResiduo: "IVA",
      liganteNome: "Pepstatina A (Inibidor Aspartato)",
      resolucao: "2.10 Å",
      massa: "34.6 kDa",
      organismo: "Sus scrofa / Humano"
    },
    "1E9Z": {
      nome: "Urease de Helicobacter pylori",
      sistema: "digestorio",
      liganteResiduo: "NI",
      liganteNome: "Centro Catalítico Binuclear Ni(II)",
      resolucao: "3.00 Å",
      massa: "540 kDa",
      organismo: "Helicobacter pylori"
    },
    "3LN1": {
      nome: "Ciclooxigenase-2 (COX-2) em Complexo",
      sistema: "cardiovascular",
      liganteResiduo: "CEL",
      liganteNome: "Celecoxibe (Complexo no Sítio Hidrofóbico)",
      resolucao: "2.40 Å",
      massa: "70.0 kDa",
      organismo: "Mus musculus / Alvo Humano"
    },
    "4EY7": {
      nome: "Acetilcolinesterase (AChE) Recombinante",
      sistema: "nervoso",
      liganteResiduo: "E20",
      liganteNome: "Donepezila (Aricept) no Desfiladeiro Catalítico",
      resolucao: "2.35 Å",
      massa: "65.0 kDa",
      organismo: "Homo sapiens"
    },
    "7VH8": {
      nome: "Protease Principal Mpro (SARS-CoV-2)",
      sistema: "respiratorio",
      liganteResiduo: "4WI",
      liganteNome: "Nirmatrelvir (Inibidor Covalente Reversível)",
      resolucao: "1.63 Å",
      massa: "34.0 kDa",
      organismo: "SARS-CoV-2"
    }
  };

  // =========================================================================
  // 1. INICIALIZAÇÃO DO VISUALIZADOR 3DMOL
  // =========================================================================
  function init() {
    container = document.getElementById("mol-viewport-container");
    viewportEl = document.getElementById("mol-viewport");

    if (!viewportEl) {
      console.warn("[MolEngine] Elemento #mol-viewport não localizado no DOM.");
      return;
    }

    if (typeof $3Dmol === "undefined") {
      console.error("[MolEngine] Biblioteca 3Dmol.js não carregada.");
      return;
    }

    // Configura o visualizador WebGL com fundo escuro de alto contraste
    viewer = $3Dmol.createViewer(viewportEl, {
      backgroundColor: "#020617",
      defaultcolors: $3Dmol.rasmolElementColors
    });

    // Injeta controles dinâmicos de estilo e inspeção no cabeçalho da viewport
    injectMolecularControlsUI();

    console.log("[MolEngine] Motor Nanomolecular 3Dmol.js Inicializado.");
  }

  // =========================================================================
  // 2. DOWNLOAD DINÂMICO & CARREGAMENTO DO PDB
  // =========================================================================
  /**
   * Baixa e renderiza a macromolécula tridimensional a partir do código RCSB PDB.
   * @param {String} pdbId - Código PDB de 4 caracteres (ex: '4EY7', '3LN1')
   * @param {String} optionalTitle - Título opcional para o HUD
   */
  async function loadPdb(pdbId, optionalTitle = "") {
    if (!viewer) init();
    if (!viewer) return;

    const idLimpo = pdbId.trim().toUpperCase();
    currentPdbId = idLimpo;
    currentPdbMeta = PDB_CATALOG[idLimpo] || {
      nome: optionalTitle || `Macromolécula PDB ${idLimpo}`,
      liganteResiduo: "HETATM",
      liganteNome: "Ligante Orgânico",
      resolucao: "Cristalografia Raio-X",
      massa: "N/D",
      organismo: "Estrutura Biológica"
    };

    // Exibe overlay de carregamento
    showLoading(true, `Obtendo ${idLimpo} do Protein Data Bank...`);

    try {
      // Limpa modelos, superfícies e estados prévios
      clearViewer();

      const url = `https://files.rcsb.org/download/${idLimpo}.pdb`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Servidor RCSB PDB retornou código ${response.status}`);
      }

      const pdbData = await response.text();

      // Adiciona o modelo cristalográfico ao viewer
      currentModel = viewer.addModel(pdbData, "pdb");

      // Aplica representação padrão (Cartoon espectral)
      applyStyle("cartoon");

      // Centraliza e ajusta o enquadramento de câmera com animação
      viewer.zoomTo();
      viewer.render();

      // Atualiza o painel de telemetria molecular
      updateTelemetryHUD();
      showLoading(false);

      console.log(`[MolEngine] Estrutura ${idLimpo} carregada com sucesso.`);
    } catch (err) {
      console.warn("[MolEngine] Erro no download do PDB:", err);
      showLoading(false);
      renderErrorState(idLimpo);
    }
  }

  // =========================================================================
  // 3. ESTILOS DE REPRESENTAÇÃO BIOFÍSICA
  // =========================================================================
  /**
   * Modifica a representação molecular:
   * - cartoon: Fitas secundárias (Alfa-hélices e Folhas-beta em espectro)
   * - stick: Conexões covalentes atômicas
   * - sphere: Esferas de Van der Waals densas
   * - surface: Superfície de acessibilidade ao solvente com transparência
   */
  function applyStyle(styleType) {
    if (!viewer || !currentModel) return;

    currentStyle = styleType;
    removeSurface();

    // Remove estilos anteriores da cadeia polipeptídica
    viewer.setStyle({}, {});

    switch (styleType) {
      case "cartoon":
        viewer.setStyle({ hetflag: false }, { cartoon: { color: "spectrum" } });
        break;

      case "stick":
        viewer.setStyle({ hetflag: false }, { stick: { radius: 0.15, colorscheme: "Jmol" } });
        break;

      case "sphere":
        viewer.setStyle({ hetflag: false }, { sphere: { scale: 0.75, colorscheme: "Jmol" } });
        break;

      case "surface":
        viewer.setStyle({ hetflag: false }, { cartoon: { color: "spectrum", opacity: 0.85 } });
        try {
          currentSurface = viewer.addSurface($3Dmol.SurfaceType.MS, {
            opacity: 0.65,
            color: "white"
          });
        } catch (e) {
          console.warn("[MolEngine] Superfície molecular indisponível para esta malha:", e);
        }
        break;

      default:
        viewer.setStyle({ hetflag: false }, { cartoon: { color: "spectrum" } });
    }

    // Se o ligante/fármaco estiver ativado, preserva seu realce
    if (isLigandHighlighted) {
      renderActiveSiteLigand();
    } else {
      // Hetátomos comuns aparecem em bastões discretos
      viewer.setStyle({ hetflag: true }, { stick: { radius: 0.2, colorscheme: "greenCarbon" } });
    }

    viewer.render();
    updateStyleButtonsUI(styleType);
  }

  function removeSurface() {
    if (viewer && currentSurface) {
      try {
        viewer.removeSurface(currentSurface);
      } catch (e) {}
      currentSurface = null;
    }
  }

  // =========================================================================
  // 4. DESTAQUE DO SÍTIO ATIVO & LIGANTES FARMACOLÓGICOS (DOCKING)
  // =========================================================================
  /**
   * Localiza o fármaco ou ligante no sítio ativo e projeta realce de esferas CPK
   */
  function toggleActiveSiteHighlight() {
    if (!viewer || !currentModel || !currentPdbMeta) return;

    isLigandHighlighted = !isLigandHighlighted;

    if (isLigandHighlighted) {
      renderActiveSiteLigand();

      // Aplica zoom suave no ligante do sítio ativo
      const residuo = currentPdbMeta.liganteResiduo;
      const selecao = residuo === "HETATM" ? { hetflag: true } : { resn: residuo };
      viewer.zoomTo(selecao, 600);
    } else {
      applyStyle(currentStyle);
      viewer.zoomTo({}, 600);
    }

    viewer.render();
    updateLigandButtonUI();
  }

  function renderActiveSiteLigand() {
    const residuo = currentPdbMeta.liganteResiduo;

    // Fundo semitransparente para destacar o bolso catalítico
    viewer.setStyle({ hetflag: false }, { cartoon: { color: "spectrum", opacity: 0.35 } });

    // Seleção específica do ligante/droga co-cristalizada
    const selecaoLigante = (residuo && residuo !== "HETATM")
      ? { resn: residuo }
      : { hetflag: true };

    viewer.setStyle(selecaoLigante, {
      stick: { radius: 0.3, colorscheme: "magentaCarbon" },
      sphere: { scale: 0.45, colorscheme: "element" }
    });
  }

  // =========================================================================
  // 5. ANIMAÇÕES, ROTAÇÃO & UTILITÁRIOS
  // =========================================================================
  function toggleSpin() {
    if (!viewer) return;
    isSpinning = !isSpinning;

    if (isSpinning) {
      viewer.spin("y", 1.0);
    } else {
      viewer.spin(false);
    }

    const btn = document.getElementById("btnMolSpin");
    if (btn) {
      btn.style.borderColor = isSpinning ? "#38bdf8" : "#334155";
      btn.style.color = isSpinning ? "#38bdf8" : "#94a3b8";
    }
  }

  function resetView() {
    if (!viewer) return;
    viewer.zoomTo({}, 500);
    viewer.render();
  }

  function clearViewer() {
    if (viewer) {
      viewer.spin(false);
      isSpinning = false;
      isLigandHighlighted = false;
      removeSurface();
      viewer.clear();
    }
  }

  function render() {
    if (viewer) {
      viewer.render();
    }
  }

  // =========================================================================
  // 6. INTERFACE DINÂMICA & HUD MOLECULAR
  // =========================================================================
  function injectMolecularControlsUI() {
    if (!container || document.getElementById("molControlBar")) return;

    // Barra de Ferramentas Superior da Viewport
    const bar = document.createElement("div");
    bar.id = "molControlBar";
    bar.style.cssText = `
      position: absolute;
      top: 8px;
      left: 8px;
      right: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      z-index: 25;
      pointer-events: none;
    `;

    bar.innerHTML = `
      <div style="display:flex; gap:4px; pointer-events:auto; background:rgba(2,6,23,0.88); padding:4px 8px; border-radius:6px; border:1px solid #334155; backdrop-filter:blur(6px);">
        <button type="button" class="btn-mol-style active" data-style="cartoon" onclick="MolEngine.applyStyle('cartoon')">Fita</button>
        <button type="button" class="btn-mol-style" data-style="stick" onclick="MolEngine.applyStyle('stick')">Bastão</button>
        <button type="button" class="btn-mol-style" data-style="sphere" onclick="MolEngine.applyStyle('sphere')">Esferas</button>
        <button type="button" class="btn-mol-style" data-style="surface" onclick="MolEngine.applyStyle('surface')">Superfície</button>
      </div>

      <div style="display:flex; gap:4px; pointer-events:auto;">
        <button type="button" id="btnMolLigand" class="btn-mol-action" onclick="MolEngine.toggleActiveSiteHighlight()" title="Destacar Fármaco no Sítio Ativo">
          💊 Sítio Ativo
        </button>
        <button type="button" id="btnMolSpin" class="btn-mol-action" onclick="MolEngine.toggleSpin()" title="Alternar Rotação Contínua">
          🔄 Giro
        </button>
        <button type="button" class="btn-mol-action" onclick="MolEngine.resetView()" title="Centralizar">
          🎯
        </button>
      </div>
    `;

    container.appendChild(bar);

    // Injeta estilos CSS específicos dos botões
    const styleSheet = document.createElement("style");
    styleSheet.textContent = `
      .btn-mol-style {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 0.68rem;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .btn-mol-style.active {
        background: #0284c7;
        color: #ffffff;
      }
      .btn-mol-action {
        background: rgba(2, 6, 23, 0.88);
        border: 1px solid #334155;
        color: #94a3b8;
        font-size: 0.68rem;
        font-weight: 700;
        padding: 4px 8px;
        border-radius: 6px;
        cursor: pointer;
        backdrop-filter: blur(6px);
        transition: all 0.15s;
      }
      .btn-mol-action:hover {
        border-color: #38bdf8;
        color: #ffffff;
      }
      .btn-mol-action.active {
        background: #0f766e;
        border-color: #34d399;
        color: #ffffff;
      }
    `;
    document.head.appendChild(styleSheet);
  }

  function updateTelemetryHUD() {
    const hudBox = document.getElementById("molInfoDetails");
    if (!hudBox || !currentPdbMeta) return;

    hudBox.innerHTML = `
      <div style="border-left: 3px solid #38bdf8; padding-left: 8px; margin-bottom: 8px;">
        <h4 style="color:#38bdf8; font-size:0.95rem; margin:0;">${currentPdbMeta.nome}</h4>
        <div style="font-size:0.72rem; color:#94a3b8; font-family:monospace; margin-top:2px;">
          Código PDB Oficial: <strong style="color:#facc15;">${currentPdbId}</strong> • Resolução: ${currentPdbMeta.resolucao}
        </div>
      </div>

      <div style="background:#020617; border:1px solid #334155; border-radius:6px; padding:8px; font-size:0.75rem; line-height:1.45;">
        <div style="color:#cbd5e1; margin-bottom:4px;">
          <strong>Alvo Terapêutico:</strong> Organismo <em>${currentPdbMeta.organismo}</em> (${currentPdbMeta.massa})
        </div>
        <div style="color:#34d399;">
          <strong>Co-Cristal / Fármaco:</strong> ${currentPdbMeta.liganteNome} [Resíduo: <span style="font-family:monospace;">${currentPdbMeta.liganteResiduo}</span>]
        </div>
      </div>
    `;
  }

  function updateStyleButtonsUI(activeStyle) {
    document.querySelectorAll(".btn-mol-style").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.style === activeStyle);
    });
  }

  function updateLigandButtonUI() {
    const btn = document.getElementById("btnMolLigand");
    if (btn) {
      btn.classList.toggle("active", isLigandHighlighted);
    }
  }

  function showLoading(show, message = "") {
    let overlay = document.getElementById("mol-loading-overlay");
    if (!overlay && container) {
      overlay = document.createElement("div");
      overlay.id = "mol-loading-overlay";
      overlay.style.cssText = `
        position: absolute;
        inset: 0;
        background: rgba(2, 6, 23, 0.85);
        color: #38bdf8;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 0.82rem;
        font-weight: 600;
        z-index: 30;
        backdrop-filter: blur(4px);
      `;
      container.appendChild(overlay);
    }

    if (overlay) {
      overlay.textContent = message;
      overlay.style.display = show ? "flex" : "none";
    }
  }

  function renderErrorState(pdbId) {
    const hudBox = document.getElementById("molInfoDetails");
    if (hudBox) {
      hudBox.innerHTML = `
        <div style="color:#f87171; font-size:0.8rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); padding:8px; border-radius:6px;">
          ⚠️ Não foi possível carregar a macromolécula <strong>${pdbId}</strong> diretamente do repositório RCSB PDB. Verifique sua conexão.
        </div>
      `;
    }
  }

  // =========================================================================
  // EXPOSIÇÃO DA API PÚBLICA
  // =========================================================================
  return {
    init,
    loadPdb,
    applyStyle,
    toggleActiveSiteHighlight,
    toggleSpin,
    resetView,
    render,
    clearViewer
  };
})();

// Inicialização segura com o DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", MolEngine.init);
} else {
  MolEngine.init();
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/mol-engine.js                              */
/* ========================================================================= */
