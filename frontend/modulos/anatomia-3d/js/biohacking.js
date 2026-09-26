/* ========================================================================= */
/* ARQUIVO: anatomia-3d/js/biohacking.js                                     */
/* ========================================================================= */

/**
 * MOTOR DE INTERFACE: BIOHACKING, VIAS ENERGÉTICAS & OTIMIZAÇÃO CELULAR
 * Ecossistema LAIFT - Módulo Master 3D
 * - Pesquisa e filtragem inteligente de protocolos e suplementação mineral
 * - Renderização de cartões iterativos (mecanismos moleculares e cofatores)
 * - Integração direta com PKEngine (curvas de concentração) e ThreeEngine (3D)
 * - Compatibilidade híbrida com cache local e consultas externas
 */

const BiohackingController = (() => {
  // Referências do DOM
  let searchInput = null;
  let searchBtn = null;
  let resultsGrid = null;
  let activeCategory = "todas";

  // =========================================================================
  // 1. INICIALIZAÇÃO
  // =========================================================================
  function init() {
    console.log("[BiohackingController] Inicializando Motor de Otimização Celular...");

    searchInput = document.getElementById("bio-search-input");
    searchBtn = document.getElementById("btn-bio-search");
    
    // Suporte defensivo a ambos os IDs de contêiner (atual e consolidado)
    resultsGrid = document.getElementById("biohacking-results-grid") || 
                  document.getElementById("biohackingGrid");

    if (!resultsGrid) {
      console.warn("[BiohackingController] Contêiner de resultados não localizado no DOM.");
      return;
    }

    // Configuração de eventos de pesquisa
    if (searchBtn) {
      searchBtn.addEventListener("click", handleSearch);
    }

    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSearch();
        }
      });
    }

    // Renderização inicial de todos os protocolos cadastrados
    renderAllProtocols();
  }

  // =========================================================================
  // 2. MOTOR DE BUSCA & FILTRAGEM
  // =========================================================================
  async function handleSearch() {
    if (!searchInput) return;
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
      renderAllProtocols();
      return;
    }

    renderLoadingState();

    try {
      let resultados = [];

      // 1. Tenta consulta ao interceptor inteligente ApiCache
      if (typeof ApiCache !== "undefined" && typeof ApiCache.buscarProtocolo === "function") {
        resultados = await ApiCache.buscarProtocolo(query);
      } 
      // 2. Fallback direto na base unificada
      else if (typeof ATLAS_DATABASE !== "undefined" && Array.isArray(ATLAS_DATABASE.protocols)) {
        resultados = ATLAS_DATABASE.protocols.filter((p) =>
          p.nome.toLowerCase().includes(query) ||
          p.viaMetabolica.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query)) ||
          p.mecanismoAcao.toLowerCase().includes(query)
        );
      } 
      // 3. Fallback no BioDatabase de retrocompatibilidade
      else if (typeof BioDatabase !== "undefined" && Array.isArray(BioDatabase.protocols)) {
        resultados = BioDatabase.protocols.filter((p) =>
          p.nome.toLowerCase().includes(query) ||
          p.viaMetabolica.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query))
        );
      }

      if (!resultados || resultados.length === 0) {
        renderEmptyState(`Nenhum protocolo ou mineral encontrado para "${query}".`);
      } else {
        renderProtocolCards(resultados);
      }
    } catch (err) {
      console.error("[BiohackingController] Falha na busca de protocolos:", err);
      renderEmptyState("Erro ao consultar repositório de biohacking. Verifique a consola.");
    }
  }

  function renderAllProtocols() {
    const list = getAvailableProtocols();
    if (list.length === 0) {
      renderEmptyState("A carregar base de conhecimento de biohacking...");
      return;
    }
    renderProtocolCards(list);
  }

  function getAvailableProtocols() {
    if (typeof ATLAS_DATABASE !== "undefined" && Array.isArray(ATLAS_DATABASE.protocols)) {
      return ATLAS_DATABASE.protocols;
    }
    if (typeof BioDatabase !== "undefined" && Array.isArray(BioDatabase.protocols)) {
      return BioDatabase.protocols;
    }
    return [];
  }

  // =========================================================================
  // 3. RENDERIZAÇÃO DE CARTÕES (INTERATIVOS & RESPONSIVOS)
  // =========================================================================
  function renderProtocolCards(protocols) {
    if (!resultsGrid) return;
    resultsGrid.innerHTML = "";

    protocols.forEach((item) => {
      const card = document.createElement("div");
      card.className = "bio-protocol-card";

      // Formatação de tags
      const tagsHtml = (item.tags || [])
        .map((tag) => `<span class="tag-bio">${tag}</span>`)
        .join("");

      // Formatação de cofatores metabólicos
      const cofactorsHtml = (item.cofatores && item.cofatores.length > 0)
        ? `<div style="margin-top: 8px; font-size: 0.72rem; color: #64748b;">
             <strong style="color: #94a3b8;">Cofatores Sinérgicos:</strong> ${item.cofatores.join(", ")}
           </div>`
        : "";

      // Parâmetros Farmacocinéticos resumidos
      const pkSummary = item.pkData
        ? `<div style="display: flex; gap: 8px; margin-top: 8px; font-size: 0.68rem; font-family: monospace; color: #38bdf8;">
             <span>Dose: ${item.pkData.dose}mg</span>
             <span>•</span>
             <span>t½: ${item.pkData.halfLife}h</span>
             <span>•</span>
             <span>Via: ${item.pkData.route}</span>
           </div>`
        : "";

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <h3 style="font-size: 1.05rem; color: #f8fafc; margin: 0;">${item.nome}</h3>
            <span style="font-size: 0.72rem; color: #34d399; font-weight: 600;">${item.viaMetabolica || "Otimização Celular"}</span>
          </div>
          <span style="font-size: 1.4rem; line-height: 1;">${item.icone || "🧬"}</span>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 8px;">
          ${tagsHtml}
        </div>

        <p style="font-size: 0.8rem; color: #94a3b8; line-height: 1.45; margin: 0;">
          ${item.mecanismoAcao || item.indicacao || "Mecanismo em processo de catalogação."}
        </p>

        ${cofactorsHtml}
        ${pkSummary}

        <button 
          type="button" 
          class="btn-primary" 
          style="width: 100%; margin-top: 10px; padding: 8px 10px; font-size: 0.76rem; border-radius: 6px; display: flex; justify-content: center; align-items: center; gap: 6px;"
          onclick="BiohackingController.triggerSimulation('${item.id}')"
        >
          ⚡ Simular Biodisponibilidade & Alvo 3D
        </button>
      `;

      resultsGrid.appendChild(card);
    });
  }

  function renderEmptyState(message) {
    if (!resultsGrid) return;
    resultsGrid.innerHTML = `
      <div style="text-align: center; color: #64748b; padding: 24px 12px; background: rgba(2, 6, 23, 0.4); border: 1px dashed #334155; border-radius: 8px;">
        <span style="font-size: 1.8rem; display: block; margin-bottom: 6px;">🔬</span>
        <p style="font-size: 0.82rem; margin: 0;">${message}</p>
      </div>
    `;
  }

  function renderLoadingState() {
    if (!resultsGrid) return;
    resultsGrid.innerHTML = `
      <div style="text-align: center; color: #38bdf8; padding: 20px; font-size: 0.8rem;">
        <span style="display: inline-block; animation: spin 1s linear infinite;">⚙️</span>
        A mapear vias metabólicas e parâmetros de biodisponibilidade...
      </div>
    `;
  }

  // =========================================================================
  // 4. DISPARO DE SIMULAÇÃO (INTEGRAÇÃO COM PKENGINE & THREEENGINE)
  // =========================================================================
  function triggerSimulation(protocolId) {
    const list = getAvailableProtocols();
    const item = list.find((p) => p.id === protocolId);

    if (!item) {
      alert("Protocolo não localizado na base de dados.");
      return;
    }

    if (!item.pkData) {
      alert("Parâmetros farmacocinéticos ainda não definidos para este composto.");
      return;
    }

    // 1. Transita para a visualização anatómica principal se existir AppController
    if (typeof AppController !== "undefined" && typeof AppController.switchTab === "function") {
      AppController.switchTab("view-anatomy");
    }

    // 2. Se o Atlas estiver em modo unificado, ativa o sistema e o órgão correspondente
    if (item.sistema && typeof ThreeEngine !== "undefined" && typeof ThreeEngine.selectSystem === "function") {
      ThreeEngine.selectSystem(item.sistema);
    }

    // 3. Dispara o cálculo e o gráfico de concentração-tempo no PKEngine
    if (typeof PKEngine !== "undefined" && typeof PKEngine.simulateDrug === "function") {
      const route = item.pkData.route || "ORAL";
      PKEngine.simulateDrug(item.nome, item.pkData, route);
    }

    // 4. Acende o tecido ou órgão alvo no modelo 3D
    const targetMesh = item.targetMesh || (item.pkData && item.pkData.targetOrgan);
    if (targetMesh && typeof ThreeEngine !== "undefined" && typeof ThreeEngine.highlightOrgan === "function") {
      ThreeEngine.highlightOrgan(targetMesh);
    }
  }

  return {
    init,
    handleSearch,
    renderAllProtocols,
    triggerSimulation
  };
})();

// Inicialização segura
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", BiohackingController.init);
} else {
  BiohackingController.init();
}

/* ========================================================================= */
/* FIM DO ARQUIVO: anatomia-3d/js/biohacking.js                              */
/* ========================================================================= */
