/**
 * @file main.js
 * @description Ponto de entrada e orquestrador principal do Atlas Anatômico 3D LAIFT.
 * Gerencia a inicialização, carregamento de catálogos, ciclo de seleção e barramentos de evento.
 */

import { AppBus } from './core/bus.js';
import {
  normalizeStructureEntry,
  resolveContentWithPrecedence,
  ReviewStatus
} from './core/contracts.js';
import { SearchIndex } from './ui/search-index.js';
import { EngineSelection } from './engine/selection.js';
import { EngineRenderer } from './engine/renderer.js';
import { EngineCameraRig } from './engine/camera-rig.js';
import { UIInfocard } from './ui/infocard.js';
import { UISearchBox } from './ui/search-box.js';
import { UILayersPanel } from './ui/layers-panel.js';
import { UIFocusNav } from './ui/focus-nav.js';

class AtlasApp {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {boolean} Sinalizador de inicialização concluída */
    this.initialized = false;
    /** @type {SearchIndex} Instância do índice invertido de busca */
    this.searchIndex = new SearchIndex();
    /** @type {Map<string, Object>} SID -> StructureEntry normalizado */
    this.structuresMap = new Map();
    /** @type {Object|null} Mapeamento de identificadores legados */
    this.legacyIdMap = null;
    /** @type {Object|null} Glossário terminológico oficial */
    this.glossary = null;
    /** @type {Map<string, Object>} Cache de conteúdo moderno por sistema */
    this.systemContentCache = new Map();
    /** @type {Map<string, Object>} Cache de conteúdo legado por sistema */
    this.legacyContentCache = new Map();
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: init]
  /**
   * Inicializa todo o ecossistema do módulo anatômico.
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      return;
    }

    this.showGlobalLoading('Inicializando o Atlas Anatômico 3D...');

    try {
      // 1. Carregamento concorrente dos dados estruturais mínimos essenciais
      const [bootData, idMapData, glossData] = await Promise.all([
        this.fetchJson('data/atlas/generated/structures.boot.json'),
        this.fetchJson('data/atlas/legacy-id-map.json').catch(err => {
          console.warn('[Atlas] Falha ao carregar legacy-id-map.json; operando sem legado.', err);
          return { realToLegacySid: {} };
        }),
        this.fetchJson('data/atlas/glossario-pt.json').catch(err => {
          console.warn('[Atlas] Falha ao carregar glossario-pt.json; operando sem termos extras.', err);
          return {};
        })
      ]);

      this.legacyIdMap = idMapData;
      this.glossary = glossData;

      // 2. Normalização das estruturas do lote de inicialização rápida
      const rawEntries = Array.isArray(bootData) ? bootData : (bootData.structures || []);
      const canonicalEntries = [];

      for (let i = 0; i < rawEntries.length; i++) {
        const raw = rawEntries[i];
        if (!raw || !raw.sid) continue;
        const entry = normalizeStructureEntry(raw, this.glossary);
        this.structuresMap.set(entry.sid, entry);
        canonicalEntries.push(entry);
      }

      // 3. Construção do motor de busca em memória
      this.searchIndex.build(canonicalEntries);

      // 4. Inicialização do motor gráfico WebGL
      const canvasContainer = document.getElementById('atlas-canvas-container');
      if (canvasContainer) {
        await EngineRenderer.init(canvasContainer);
        EngineCameraRig.init(EngineRenderer.getCamera(), EngineRenderer.getControls());
      } else {
        console.warn('[Atlas] Contêiner "atlas-canvas-container" não encontrado no DOM.');
      }

      // 5. Instanciação e ligação dos componentes de interface
      this.initUIComponents();
      this.bindGlobalEvents();

      // 6. Finalização do estado de carga inicial
      this.hideGlobalLoading();
      this.initialized = true;

      // Notifica a prontidão do módulo para a plataforma LAIFT
      AppBus.emit('atlas:ready', {
        totalStructures: this.structuresMap.size
      });

      // 7. Carga assíncrona do catálogo exaustivo em segundo plano
      this.loadFullCatalogInBackground();
    } catch (error) {
      console.error('[Atlas] Falha crítica durante a inicialização do módulo:', error);
      this.showGlobalError('Não foi possível carregar o Atlas Anatômico. Por favor, verifique a sua conexão e recarregue a página.');
    }
  }
  // [FIM MÉTODO: init]

  // [INÍCIO MÉTODO: initUIComponents]
  /**
   * Conecta os contêineres do DOM aos respectivos controladores de interface.
   */
  initUIComponents() {
    const infocardEl = document.getElementById('atlas-infocard');
    if (infocardEl) {
      UIInfocard.init(infocardEl);
    }

    const searchBoxEl = document.getElementById('atlas-search-box');
    if (searchBoxEl) {
      UISearchBox.init(searchBoxEl, this.searchIndex);
    }

    const layersPanelEl = document.getElementById('atlas-layers-panel');
    if (layersPanelEl) {
      UILayersPanel.init(layersPanelEl);
    }

    const focusNavEl = document.getElementById('atlas-focus-nav');
    if (focusNavEl) {
      UIFocusNav.init(focusNavEl);
    }
  }
  // [FIM MÉTODO: initUIComponents]

  // [INÍCIO MÉTODO: bindGlobalEvents]
  /**
   * Inscreve os manipuladores de evento no barramento global da aplicação.
   */
  bindGlobalEvents() {
    // Evento de solicitação de seleção anatômica
    AppBus.on('structure:select', async eventData => {
      if (!eventData || !eventData.sid) return;
      await this.handleStructureSelection(eventData.sid, eventData.options || {});
    });

    // Evento de desmarcação / limpeza de seleção
    AppBus.on('structure:clear', () => {
      EngineSelection.clearSelection();
      EngineRenderer.resetHighlight();
      UIInfocard.hide();
      this.announceToScreenReader('Seleção anatômica desfeita.');
    });

    // Evento de restauração de vista padrão
    AppBus.on('view:reset', () => {
      EngineCameraRig.resetToDefaultView();
      EngineSelection.clearSelection();
      EngineRenderer.resetHighlight();
      UIInfocard.hide();
      EngineRenderer.requestRender();
      this.announceToScreenReader('Visualização do modelo anatômico restaurada.');
    });

    // Evento de redimensionamento da janela ou iframe da plataforma
    window.addEventListener('resize', () => {
      EngineRenderer.onWindowResize();
    });

    // Evento de orientação em dispositivos móveis
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        EngineRenderer.onWindowResize();
      }, 100);
    });
  }
  // [FIM MÉTODO: bindGlobalEvents]

  // [INÍCIO MÉTODO: handleStructureSelection]
  /**
   * Conduz o fluxo completo de seleção protegendo contra corridas assíncronas.
   * @param {string} sid - Identificador canônico da estrutura.
   * @param {Object} [options={}] - Parâmetros adicionais da seleção.
   * @returns {Promise<void>}
   */
  async handleStructureSelection(sid, options = {}) {
    const selectionContext = EngineSelection.beginSelection(sid, options);
    if (!selectionContext) {
      return; // Seleção bloqueada ou nula
    }

    const { sequence, signal } = selectionContext;

    // Recupera a estrutura ou gera uma entrada canônica a partir do SID
    let entry = this.structuresMap.get(sid);
    if (!entry) {
      entry = normalizeStructureEntry({ sid }, this.glossary);
    }

    // Atualização visual imediata na cena 3D e na ficha
    EngineRenderer.highlightStructure(sid);
    UIInfocard.showLoading(entry);
    this.announceToScreenReader(`Selecionado: ${entry.names.pt}, sistema ${entry.system}.`);

    // Enquadramento de câmera tridimensional
    if (entry.bounds && options.focusCamera !== false) {
      EngineCameraRig.focusOnBounds(entry.bounds);
    }

    try {
      // Busca assíncrona do conteúdo educacional do sistema
      const content = await this.fetchStructureContent(entry, signal);

      // Barreira de concorrência: verifica se a requisição ainda é a mais recente
      if (!EngineSelection.isValidSequence(sequence)) {
        return; // Requisição descartada silenciosamente
      }

      EngineSelection.commitSelection(entry, content, sequence);
      UIInfocard.render({ entry, content });
      EngineRenderer.requestRender();
    } catch (error) {
      if (error && error.name === 'AbortError') {
        return; // Cancelamento intencional por clique subsequente
      }

      console.error(`[Atlas] Falha ao recuperar ficha de ${sid}:`, error);
      if (EngineSelection.isValidSequence(sequence)) {
        EngineSelection.failSelection(sid, error, sequence);
        UIInfocard.renderError(entry, 'Não foi possível carregar as informações clínicas e anatômicas desta estrutura.');
      }
    }
  }
  // [FIM MÉTODO: handleStructureSelection]

  // [INÍCIO MÉTODO: fetchStructureContent]
  /**
   * Recupera o arquivo de conteúdo temático aplicando o resolvedor de precedência.
   * @param {Object} entry - StructureEntry canônico.
   * @param {AbortSignal} signal - Sinal para cancelamento imediato.
   * @returns {Promise<Object|null>}
   */
  async fetchStructureContent(entry, signal) {
    const { system, sid } = entry;

    // 1. Carga sob demanda da base moderna de conteúdo
    if (!this.systemContentCache.has(system)) {
      try {
        const modernData = await this.fetchJson(`data/atlas/content/${system}.json`, { signal });
        this.systemContentCache.set(system, modernData);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        this.systemContentCache.set(system, {});
      }
    }

    // 2. Carga sob demanda da base legada de conteúdo
    if (!this.legacyContentCache.has(system)) {
      try {
        const legData = await this.fetchJson(`data/atlas/legacy/content/${system}.json`, { signal });
        this.legacyContentCache.set(system, legData);
      } catch (err) {
        if (err.name === 'AbortError') throw err;
        this.legacyContentCache.set(system, {});
      }
    }

    const modernSystem = this.systemContentCache.get(system) || {};
    const legacySystem = this.legacyContentCache.get(system) || {};

    return resolveContentWithPrecedence(sid, modernSystem, legacySystem, this.legacyIdMap);
  }
  // [FIM MÉTODO: fetchStructureContent]

  // [INÍCIO MÉTODO: loadFullCatalogInBackground]
  /**
   * Carrega o arquivo structures.json exaustivo em segundo plano sem travar a interface.
   * @returns {Promise<void>}
   */
  async loadFullCatalogInBackground() {
    try {
      const fullData = await this.fetchJson('data/atlas/generated/structures.json');
      const rawFull = Array.isArray(fullData) ? fullData : (fullData.structures || []);

      for (let i = 0; i < rawFull.length; i++) {
        const raw = rawFull[i];
        if (!raw || !raw.sid) continue;

        // Atualiza ou insere registros enriquecidos
        const entry = normalizeStructureEntry(raw, this.glossary);
        this.structuresMap.set(entry.sid, entry);
      }

      // Reconstrói o índice de busca para incluir a totalidade das estruturas catalogadas
      this.searchIndex.build(Array.from(this.structuresMap.values()));
      console.log(`[Atlas] Catálogo completo indexado com êxito: ${this.structuresMap.size} estruturas ativas.`);
    } catch (err) {
      console.warn('[Atlas] Catálogo estendido indisponível; mantendo catálogo de boot.', err);
    }
  }
  // [FIM MÉTODO: loadFullCatalogInBackground]

  // [INÍCIO MÉTODO: fetchJson]
  /**
   * Executa requisição HTTP segura com verificação de status e tipagem de erro.
   * @param {string} url
   * @param {Object} [options={}]
   * @returns {Promise<any>}
   */
  async fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
      throw new Error(`Falha de requisição [HTTP ${response.status}] ao consultar "${url}"`);
    }
    return response.json();
  }
  // [FIM MÉTODO: fetchJson]

  // [INÍCIO MÉTODO: announceToScreenReader]
  /**
   * Atualiza a região aria-live polite para acessibilidade com leitores de tela.
   * @param {string} message
   */
  announceToScreenReader(message) {
    const el = document.getElementById('atlas-live-announcer');
    if (el) {
      el.textContent = message;
    }
  }
  // [FIM MÉTODO: announceToScreenReader]

  // [INÍCIO MÉTODO: showGlobalLoading]
  /**
   * Exibe o indicador de carregamento da aplicação.
   * @param {string} message
   */
  showGlobalLoading(message) {
    const overlay = document.getElementById('atlas-loading-overlay');
    const textEl = document.getElementById('atlas-loading-text');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.remove('has-error');
    }
    if (textEl) {
      textEl.textContent = message;
    }
  }
  // [FIM MÉTODO: showGlobalLoading]

  // [INÍCIO MÉTODO: hideGlobalLoading]
  /**
   * Oculta o indicador de carregamento da aplicação.
   */
  hideGlobalLoading() {
    const overlay = document.getElementById('atlas-loading-overlay');
    if (overlay) {
      overlay.classList.add('hidden');
    }
  }
  // [FIM MÉTODO: hideGlobalLoading]

  // [INÍCIO MÉTODO: showGlobalError]
  /**
   * Apresenta estado visual de erro não recuperável da aplicação.
   * @param {string} message
   */
  showGlobalError(message) {
    const overlay = document.getElementById('atlas-loading-overlay');
    const textEl = document.getElementById('atlas-loading-text');
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('has-error');
    }
    if (textEl) {
      textEl.textContent = message;
    }
  }
  // [FIM MÉTODO: showGlobalError]
}

// [INÍCIO: Execução Principal]
document.addEventListener('DOMContentLoaded', () => {
  const app = new AtlasApp();
  app.init();
});
// [FIM: Execução Principal]
