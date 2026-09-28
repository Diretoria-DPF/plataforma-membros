/**
 * modes/molecules.js — Modo Moléculas: visualização de estruturas cristalográficas PDB
 *
 * Implementa Mode para exploração interativa de proteínas 3D com renderização
 * 3Dmol.js, integração com RCSB PDB e emissão de eventos de seleção de órgão.
 */

import { MODES } from '../core/contracts.js';

// Função para carregar scripts dinamicamente (padrão lazy-load)
export function createDefaultScriptLoader() {
  return {
    /**
     * Carrega um script externo no documento.
     * @param {string} src URL do script
     * @param {string} integrity SRI hash (opcional)
     * @returns {Promise<void>}
     */
    load: (src, integrity = null) => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve(); // Já carregado
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        if (integrity) script.integrity = integrity;
        script.crossOrigin = 'anonymous';
        // Sem resposta em 10 s (rede lenta ou CDN bloqueado) conta como falha:
        // o aviso de indisponível aparece em vez de esperar para sempre.
        const timer = setTimeout(() => {
          script.remove();
          reject(new Error(`Tempo esgotado ao carregar ${src}`));
        }, 10000);
        script.onload = () => { clearTimeout(timer); resolve(); };
        script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error(`Falha ao carregar ${src}`)); };
        document.head.appendChild(script);
      });
    }
  };
}

/**
 * Filtra uma lista de proteínas por nome ou ID PDB.
 * Busca é accent-insensitive e parcial.
 *
 * @param {Array<Object>} proteins Lista de proteínas { pdb, nome_pt, ... }
 * @param {string} query String de busca
 * @returns {Array<Object>} Proteínas que casam
 */
export function filterProteins(proteins, query) {
  if (!query || !query.trim()) return proteins;

  const q = query.trim().toLowerCase();
  // Remove acentos: substitui é→e, ã→a, etc.
  const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const qNorm = normalize(q);

  return proteins.filter((p) => {
    const nameNorm = normalize(p.nome_pt.toLowerCase());
    const pdbLower = p.pdb.toLowerCase();
    return nameNorm.includes(qNorm) || pdbLower.includes(q);
  });
}

/**
 * Cria o Modo Moléculas.
 *
 * @param {Object} ctx Contexto (bus, loadProteins, loadScript)
 * @returns {Mode}
 */
export function createMoleculesMode({ bus, loadProteins, loadScript = createDefaultScriptLoader() }) {
  const MODES_LIST = MODES; // Re-export MODES para acesso local

  // URLs do 3Dmol (mesmo de index.html)
  const THREEDMOL_URL = 'https://cdn.jsdelivr.net/npm/3dmol@2.5.5/build/3Dmol-min.js';
  const THREEDMOL_SRI = 'sha384-OsczYbldvrHgslr9fFp/i4GiLSeuw9l+QIlv99ITw8soOwXcoGeflFMLg+CU/X1d';

  let proteins = [];
  let currentProtein = null;
  let molEngineLoaded = false;
  let cdnUnavailable = false;
  let unsubscribe = null;

  return {
    id: 'moleculas',
    label: 'Moléculas',
    icon: 'molecule',

    /**
     * Entra no modo: carrega proteínas e lazy-loads 3Dmol + mol-engine.
     */
    async enter(ctx) {
      // Carrega lista de proteínas
      try {
        proteins = await loadProteins();
      } catch (err) {
        console.error('[molecules] Erro ao carregar proteínas:', err);
        proteins = [];
      }
    },

    /**
     * Sai do modo: limpa viewer e desconfigura listeners.
     */
    exit() {
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }

      // Limpa o viewer 3Dmol se carregado
      if (molEngineLoaded && typeof window !== 'undefined' && window.MolEngine) {
        try {
          window.MolEngine.clearViewer();
        } catch (err) {
          console.warn('[molecules] Erro ao limpar viewer:', err);
        }
      }

      currentProtein = null;
      cdnUnavailable = false;
    },

    /**
     * Conteúdo da folha: lista de proteínas + detalhe selecionado.
     * @returns {Node}
     */
    sheetContent() {
      const root = document.createElement('div');
      root.className = 'molecules-sheet';
      root.style.cssText = 'display:flex; flex-direction:column; height:100%; padding:8px; gap:8px;';

      // Barra de busca
      const searchContainer = document.createElement('div');
      searchContainer.style.cssText = 'display:flex; gap:4px;';

      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Buscar por nome ou ID PDB...';
      searchInput.style.cssText = 'flex:1; padding:6px 8px; border:1px solid #334155; border-radius:4px; background:#020617; color:#fff; font-size:0.8rem;';

      const searchBtn = document.createElement('button');
      searchBtn.textContent = '🔍';
      searchBtn.style.cssText = 'padding:6px 10px; border:1px solid #334155; border-radius:4px; background:#020617; cursor:pointer; color:#38bdf8;';

      searchContainer.appendChild(searchInput);
      searchContainer.appendChild(searchBtn);

      // Lista de proteínas
      const listContainer = document.createElement('div');
      listContainer.style.cssText = 'flex:0 1 auto; overflow-y:auto; border:1px solid #334155; border-radius:4px; padding:4px;';

      // Detalhes (vazio até seleção)
      const detailContainer = document.createElement('div');
      detailContainer.style.cssText = 'flex:1; display:none; border:1px solid #334155; border-radius:4px; overflow:hidden; background:#020617;';

      // Função para renderizar lista
      const renderList = (query = '') => {
        const filtered = filterProteins(proteins, query);
        listContainer.replaceChildren();

        if (filtered.length === 0) {
          const empty = document.createElement('div');
          empty.textContent = 'Nenhuma proteína encontrada';
          empty.style.cssText = 'padding:8px; color:#94a3b8; font-size:0.75rem; text-align:center;';
          listContainer.appendChild(empty);
          return;
        }

        filtered.forEach((protein) => {
          const item = document.createElement('div');
          item.style.cssText = 'padding:6px 8px; border-bottom:1px solid #1e293b; cursor:pointer; transition:all 0.15s; background:#020617;';
          // Atributo estável para seleção em testes
          item.setAttribute('data-pdb', protein.pdb);
          item.onmouseenter = () => item.style.background = '#0f172a';
          item.onmouseleave = () => item.style.background = '#020617';

          const title = document.createElement('div');
          title.style.cssText = 'font-size:0.8rem; color:#38bdf8; font-weight:600;';
          title.textContent = `${protein.pdb}: ${protein.nome_pt}`;

          const subtitle = document.createElement('div');
          subtitle.style.cssText = 'font-size:0.65rem; color:#94a3b8; margin-top:2px;';
          subtitle.textContent = protein.alvo;

          item.appendChild(title);
          item.appendChild(subtitle);

          item.addEventListener('click', async () => {
            currentProtein = protein;
            await renderDetail(protein);
          });

          listContainer.appendChild(item);
        });
      };

      // Função para renderizar detalhe
      const renderDetail = async (protein) => {
        detailContainer.style.display = 'flex';
        detailContainer.style.flexDirection = 'column';
        detailContainer.replaceChildren();

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding:8px; border-bottom:1px solid #334155; background:#0f172a;';

        const title = document.createElement('div');
        title.style.cssText = 'font-size:0.85rem; color:#38bdf8; font-weight:700;';
        title.textContent = `${protein.pdb} — ${protein.nome_pt}`;

        const subtitle = document.createElement('div');
        title.style.cssText = 'font-size:0.7rem; color:#94a3b8; margin-top:2px;';
        subtitle.textContent = protein.alvo;

        header.appendChild(title);
        header.appendChild(subtitle);
        detailContainer.appendChild(header);

        // Viewer container
        const viewerWrapper = document.createElement('div');
        viewerWrapper.style.cssText = 'flex:1; position:relative; min-height:260px; background:#020617;';

        const viewport = document.createElement('div');
        viewport.id = 'mol-viewport';
        viewport.style.cssText = 'width:100%; height:100%;';

        const viewportContainer = document.createElement('div');
        viewportContainer.id = 'mol-viewport-container';
        viewportContainer.style.cssText = 'width:100%; height:100%; position:relative;';
        viewportContainer.appendChild(viewport);

        viewerWrapper.appendChild(viewportContainer);
        detailContainer.appendChild(viewerWrapper);

        // Controls
        const controls = document.createElement('div');
        controls.style.cssText = 'padding:8px; border-top:1px solid #334155; display:flex; flex-wrap:wrap; gap:4px;';

        const btnCartoon = document.createElement('button');
        btnCartoon.textContent = 'Cartoon';
        btnCartoon.style.cssText = 'padding:4px 8px; font-size:0.7rem; border:1px solid #334155; border-radius:3px; background:#020617; color:#94a3b8; cursor:pointer;';
        btnCartoon.onclick = () => {
          if (window.MolEngine) window.MolEngine.applyStyle('cartoon');
        };

        const btnStick = document.createElement('button');
        btnStick.textContent = 'Bastões';
        btnStick.style.cssText = 'padding:4px 8px; font-size:0.7rem; border:1px solid #334155; border-radius:3px; background:#020617; color:#94a3b8; cursor:pointer;';
        btnStick.onclick = () => {
          if (window.MolEngine) window.MolEngine.applyStyle('stick');
        };

        const btnSphere = document.createElement('button');
        btnSphere.textContent = 'Esferas';
        btnSphere.style.cssText = 'padding:4px 8px; font-size:0.7rem; border:1px solid #334155; border-radius:3px; background:#020617; color:#94a3b8; cursor:pointer;';
        btnSphere.onclick = () => {
          if (window.MolEngine) window.MolEngine.applyStyle('sphere');
        };

        const btnSurface = document.createElement('button');
        btnSurface.textContent = 'Superfície';
        btnSurface.style.cssText = 'padding:4px 8px; font-size:0.7rem; border:1px solid #334155; border-radius:3px; background:#020617; color:#94a3b8; cursor:pointer;';
        btnSurface.onclick = () => {
          if (window.MolEngine) window.MolEngine.applyStyle('surface');
        };

        const btnSpin = document.createElement('button');
        btnSpin.textContent = 'Girar';
        btnSpin.style.cssText = 'padding:4px 8px; font-size:0.7rem; border:1px solid #334155; border-radius:3px; background:#020617; color:#94a3b8; cursor:pointer;';
        btnSpin.onclick = () => {
          if (window.MolEngine) window.MolEngine.toggleSpin();
        };

        const btnReset = document.createElement('button');
        btnReset.textContent = 'Resetar';
        btnReset.style.cssText = 'padding:4px 8px; font-size:0.7rem; border:1px solid #334155; border-radius:3px; background:#020617; color:#94a3b8; cursor:pointer;';
        btnReset.onclick = () => {
          if (window.MolEngine) window.MolEngine.resetView();
        };

        controls.appendChild(btnCartoon);
        controls.appendChild(btnStick);
        controls.appendChild(btnSphere);
        controls.appendChild(btnSurface);
        controls.appendChild(btnSpin);
        controls.appendChild(btnReset);

        detailContainer.appendChild(controls);

        // Info
        const infoDiv = document.createElement('div');
        infoDiv.id = 'molInfoDetails';
        infoDiv.style.cssText = 'padding:8px; border-top:1px solid #334155; font-size:0.7rem; color:#cbd5e1;';
        detailContainer.appendChild(infoDiv);

        // O órgão onde a proteína atua acende no corpo mesmo sem o visualizador
        // molecular (offline): a relação anatômica não depende do 3Dmol.
        if (protein.orgaoSid && bus && bus.emit) {
          bus.emit('structure:select', { sid: protein.orgaoSid, source: 'api' });
        }

        // Tenta carregar 3Dmol e mol-engine
        try {
          // Lazy-load 3Dmol
          if (!window.$3Dmol) {
            await loadScript.load(THREEDMOL_URL, THREEDMOL_SRI);
          }

          // Lazy-load mol-engine
          if (!molEngineLoaded) {
            await loadScript.load('js/mol-engine.js');
            molEngineLoaded = true;
          }

          // Inicializa o viewer
          if (window.MolEngine) {
            window.MolEngine.init();
            await window.MolEngine.loadPdb(protein.pdb, protein.nome_pt);

          }
        } catch (err) {
          console.warn('[molecules] Erro ao carregar 3Dmol:', err);
          cdnUnavailable = true;

          // Exibe mensagem de erro
          const errorMsg = document.createElement('div');
          errorMsg.style.cssText = 'padding:12px; text-align:center; color:#f87171; font-size:0.8rem;';
          errorMsg.textContent = 'Visualização molecular indisponível sem conexão (RCSB/3Dmol)';
          viewerWrapper.replaceChildren();
          viewerWrapper.appendChild(errorMsg);
        }
      };

      // Event listeners
      searchInput.addEventListener('input', (e) => {
        renderList(e.target.value);
      });

      searchBtn.addEventListener('click', () => {
        renderList(searchInput.value);
      });

      // Renderiza lista inicial
      renderList();

      root.appendChild(searchContainer);
      root.appendChild(listContainer);
      root.appendChild(detailContainer);

      return root;
    }
  };
}

// Export padrão (compatibilidade com importações esperadas)
export default { createMoleculesMode, filterProteins, createDefaultScriptLoader };
