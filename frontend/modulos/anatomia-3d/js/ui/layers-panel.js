/**
 * @file layers-panel.js
 * @description Painel completo de dissecção anatômica por camadas e gestão dos 12 sistemas.
 * Inclui presets rápidos, modo fantasma (opacidade), isolamento e total acessibilidade.
 */

import { AppBus } from '../core/bus.js';
import { CanonicalSystems, SystemLabelsPt } from '../core/contracts.js';

/**
 * Definições acadêmicas das 5 camadas de dissecção anatômica
 */
const LAYER_DESCRIPTIONS = Object.freeze({
  1: { name: 'Camada 1: Superficial / Tegumento', desc: 'Pele, tecido celular subcutâneo e fáscias superficiais.' },
  2: { name: 'Camada 2: Muscular Superficial', desc: 'Músculos esqueléticos superficiais e vasos cutâneos.' },
  3: { name: 'Camada 3: Muscular Profunda & Troncos', desc: 'Grandes vasos, plexos nervosos e músculos profundos.' },
  4: { name: 'Camada 4: Visceral & Esqueleto Apendicular', desc: 'Órgãos torácicos/abdominais e ossos apendiculares.' },
  5: { name: 'Camada 5: Sistema Completo & Esqueleto Axial', desc: 'Visualização integral, esqueleto axial e neuroeixo central.' }
});

class LayersPanelUI {
  // [INÍCIO MÉTODO: constructor]
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {number} Nível ativo de dissecção (1 a 5) */
    this.currentLayer = 5;
    /** @type {Map<string, boolean>} Sistema -> Visibilidade */
    this.systemVisibility = new Map();
    /** @type {Map<string, boolean>} Sistema -> Modo fantasma/translúcido (true = 30% opacidade) */
    this.systemGhostMode = new Map();
    /** @type {boolean} */
    this.isExpanded = false;

    // Inicializa todos os 12 sistemas como visíveis e opacos
    CanonicalSystems.forEach(sys => {
      this.systemVisibility.set(sys, true);
      this.systemGhostMode.set(sys, false);
    });
  }
  // [FIM MÉTODO: constructor]

  // [INÍCIO MÉTODO: init]
  /**
   * Constrói o painel atrelando-o ao contêiner na interface.
   * @param {HTMLElement} containerElement
   */
  init(containerElement) {
    if (!containerElement) {
      console.warn('[LayersPanel] Contêiner não localizado.');
      return;
    }

    this.container = containerElement;
    this.container.classList.add('atlas-layers-panel');

    this.render();
    this.bindGlobalEvents();
  }
  // [FIM MÉTODO: init]

  // [INÍCIO MÉTODO: render]
  /**
   * Renderiza todos os blocos do painel: cabeçalho, presets, slider de dissecção e lista de sistemas.
   */
  render() {
    if (!this.container) return;

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    // 1. Cabeçalho do Painel com Alternância de Expansão
    const header = document.createElement('div');
    header.className = 'atlas-layers-header';

    const h3 = document.createElement('h3');
    h3.textContent = 'Camadas e Sistemas';
    header.appendChild(h3);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'atlas-layers-toggle-expand-btn';
    toggleBtn.setAttribute('aria-expanded', this.isExpanded ? 'true' : 'false');
    toggleBtn.setAttribute('aria-label', 'Recolher ou expandir painel de camadas');
    toggleBtn.textContent = this.isExpanded ? 'Recolher' : 'Expandir';
    toggleBtn.addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
      this.container.classList.toggle('is-expanded', this.isExpanded);
      toggleBtn.setAttribute('aria-expanded', this.isExpanded ? 'true' : 'false');
      toggleBtn.textContent = this.isExpanded ? 'Recolher' : 'Expandir';
    });
    header.appendChild(toggleBtn);
    this.container.appendChild(header);

    // 2. Barra de Visualizações Rápidas (Presets)
    const presetsBar = this.createPresetsBar();
    this.container.appendChild(presetsBar);

    // 3. Controle Deslizante de Profundidade de Dissecção (Camadas 1 a 5)
    const depthSection = this.createDepthSliderSection();
    this.container.appendChild(depthSection);

    // 4. Lista dos 12 Sistemas Anatômicos com Controle Fino
    const systemsList = this.createSystemsList();
    this.container.appendChild(systemsList);

    // 5. Rodapé com Ações Globais
    const footer = document.createElement('div');
    footer.className = 'atlas-layers-footer';

    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'atlas-layers-action-btn';
    showAllBtn.textContent = 'Exibir Tudo (100%)';
    showAllBtn.addEventListener('click', () => {
      this.resetAllSystems();
    });
    footer.appendChild(showAllBtn);

    this.container.appendChild(footer);
  }
  // [FIM MÉTODO: render]

  // [INÍCIO MÉTODO: createPresetsBar]
  /**
   * Cria os botões de configuração anatômica rápida.
   * @returns {HTMLElement}
   */
  createPresetsBar() {
    const bar = document.createElement('div');
    bar.className = 'atlas-layers-presets-bar';

    const presets = [
      { id: 'all', label: 'Tudo', systems: CanonicalSystems },
      { id: 'skeletal', label: 'Esqueleto', systems: ['esqueletico', 'articular'] },
      { id: 'musculo', label: 'Músculos & Ossos', systems: ['esqueletico', 'articular', 'muscular'] },
      { id: 'visceral', label: 'Visceral', systems: ['cardiovascular', 'respiratorio', 'digestorio', 'urinario'] },
      { id: 'neuro', label: 'Neurovascular', systems: ['nervoso', 'cardiovascular'] }
    ];

    presets.forEach(p => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'atlas-preset-chip';
      btn.textContent = p.label;
      btn.addEventListener('click', () => {
        this.applySystemPreset(p.systems);
      });
      bar.appendChild(btn);
    });

    return bar;
  }
  // [FIM MÉTODO: createPresetsBar]

  // [INÍCIO MÉTODO: createDepthSliderSection]
  /**
   * Constrói a seção do controle deslizante da profundidade de dissecção anatômica.
   * @returns {HTMLElement}
   */
  createDepthSliderSection() {
    const section = document.createElement('div');
    section.className = 'atlas-layers-depth-section';

    const labelContainer = document.createElement('div');
    labelContainer.className = 'atlas-depth-label-container';

    const titleSpan = document.createElement('span');
    titleSpan.className = 'atlas-depth-title';
    titleSpan.textContent = LAYER_DESCRIPTIONS[this.currentLayer].name;
    labelContainer.appendChild(titleSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'atlas-depth-desc';
    descSpan.textContent = LAYER_DESCRIPTIONS[this.currentLayer].desc;
    labelContainer.appendChild(descSpan);

    section.appendChild(labelContainer);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '5';
    slider.step = '1';
    slider.value = String(this.currentLayer);
    slider.className = 'atlas-depth-slider';
    slider.setAttribute('aria-label', 'Profundidade da dissecção anatômica');
    slider.setAttribute('aria-valuemin', '1');
    slider.setAttribute('aria-valuemax', '5');
    slider.setAttribute('aria-valuenow', String(this.currentLayer));

    slider.addEventListener('input', () => {
      this.currentLayer = parseInt(slider.value, 10);
      slider.setAttribute('aria-valuenow', String(this.currentLayer));
      titleSpan.textContent = LAYER_DESCRIPTIONS[this.currentLayer].name;
      descSpan.textContent = LAYER_DESCRIPTIONS[this.currentLayer].desc;

      AppBus.emit('scene:layer-change', { layer: this.currentLayer });
    });

    section.appendChild(slider);
    return section;
  }
  // [FIM MÉTODO: createDepthSliderSection]

  // [INÍCIO MÉTODO: createSystemsList]
  /**
   * Constrói a lista dos sistemas com alternância de visibilidade, opacidade e isolamento.
   * @returns {HTMLElement}
   */
  createSystemsList() {
    const list = document.createElement('div');
    list.className = 'atlas-layers-systems-list';

    CanonicalSystems.forEach(sysId => {
      const isVisible = this.systemVisibility.get(sysId) !== false;
      const isGhost = this.systemGhostMode.get(sysId) === true;
      const label = SystemLabelsPt[sysId] || sysId;

      const row = document.createElement('div');
      row.className = `atlas-system-row ${!isVisible ? 'is-disabled' : ''}`;

      // 1. Interruptor Principal de Visibilidade (Switch)
      const switchBtn = document.createElement('button');
      switchBtn.type = 'button';
      switchBtn.className = `atlas-system-toggle-btn ${isVisible ? 'is-on' : ''}`;
      switchBtn.setAttribute('role', 'switch');
      switchBtn.setAttribute('aria-checked', isVisible ? 'true' : 'false');
      switchBtn.setAttribute('aria-label', `Alternar visibilidade do ${label}`);

      const dot = document.createElement('span');
      dot.className = `atlas-system-bullet bullet-${sysId}`;
      dot.setAttribute('aria-hidden', 'true');
      switchBtn.appendChild(dot);

      const nameSpan = document.createElement('span');
      nameSpan.className = 'atlas-system-name-text';
      nameSpan.textContent = label;
      switchBtn.appendChild(nameSpan);

      switchBtn.addEventListener('click', () => {
        const next = !this.systemVisibility.get(sysId);
        this.systemVisibility.set(sysId, next);

        switchBtn.classList.toggle('is-on', next);
        switchBtn.setAttribute('aria-checked', next ? 'true' : 'false');
        row.classList.toggle('is-disabled', !next);

        AppBus.emit('scene:system-toggle', { system: sysId, visible: next });
      });
      row.appendChild(switchBtn);

      // 2. Controles Adicionais (Fantasma e Isolar)
      const actionsGroup = document.createElement('div');
      actionsGroup.className = 'atlas-system-actions-group';

      // Botão Fantasma / Raio-X (Opacidade Translúcida)
      const ghostBtn = document.createElement('button');
      ghostBtn.type = 'button';
      ghostBtn.className = `atlas-system-sub-btn ghost-btn ${isGhost ? 'is-active' : ''}`;
      ghostBtn.title = 'Modo Fantasma / Semi-transparente';
      ghostBtn.setAttribute('aria-label', `Modo fantasma translúcido para ${label}`);
      ghostBtn.textContent = 'Raio-X';

      ghostBtn.addEventListener('click', () => {
        const nextGhost = !this.systemGhostMode.get(sysId);
        this.systemGhostMode.set(sysId, nextGhost);
        ghostBtn.classList.toggle('is-active', nextGhost);

        AppBus.emit('scene:system-opacity', {
          system: sysId,
          opacity: nextGhost ? 0.28 : 1.0
        });
      });
      actionsGroup.appendChild(ghostBtn);

      // Botão de Isolar Sistema
      const isolateBtn = document.createElement('button');
      isolateBtn.type = 'button';
      isolateBtn.className = 'atlas-system-sub-btn isolate-btn';
      isolateBtn.title = `Isolar apenas ${label}`;
      isolateBtn.setAttribute('aria-label', `Isolar apenas o ${label}`);
      isolateBtn.textContent = 'Só este';

      isolateBtn.addEventListener('click', () => {
        this.isolateSingleSystem(sysId);
      });
      actionsGroup.appendChild(isolateBtn);

      row.appendChild(actionsGroup);
      list.appendChild(row);
    });

    return list;
  }
  // [FIM MÉTODO: createSystemsList]

  // [INÍCIO MÉTODO: isolateSingleSystem]
  /**
   * Oculta todos os sistemas exceto o sistema selecionado.
   * @param {string} targetSystemId
   */
  isolateSingleSystem(targetSystemId) {
    CanonicalSystems.forEach(sysId => {
      const match = sysId === targetSystemId;
      this.systemVisibility.set(sysId, match);
      this.systemGhostMode.set(sysId, false);
    });

    this.render();

    AppBus.emit('scene:system-isolate', { system: targetSystemId });
  }
  // [FIM MÉTODO: isolateSingleSystem]

  // [INÍCIO MÉTODO: applySystemPreset]
  /**
   * Aplica um conjunto pré-definido de sistemas anatômicos.
   * @param {string[]} enabledSystems
   */
  applySystemPreset(enabledSystems) {
    CanonicalSystems.forEach(sysId => {
      const enabled = enabledSystems.includes(sysId);
      this.systemVisibility.set(sysId, enabled);
      this.systemGhostMode.set(sysId, false);
      AppBus.emit('scene:system-toggle', { system: sysId, visible: enabled });
    });

    this.render();
  }
  // [FIM MÉTODO: applySystemPreset]

  // [INÍCIO MÉTODO: resetAllSystems]
  /**
   * Restabelece a visibilidade completa dos 12 sistemas a 100% de opacidade e Camada 5.
   */
  resetAllSystems() {
    this.currentLayer = 5;
    CanonicalSystems.forEach(sysId => {
      this.systemVisibility.set(sysId, true);
      this.systemGhostMode.set(sysId, false);
    });

    this.render();

    AppBus.emit('scene:systems-reset');
    AppBus.emit('scene:layer-change', { layer: 5 });
  }
  // [FIM MÉTODO: resetAllSystems]

  // [INÍCIO MÉTODO: bindGlobalEvents]
  /**
   * Escuta sinais de restauração originados externamente.
   */
  bindGlobalEvents() {
    AppBus.on('view:reset', () => {
      this.resetAllSystems();
    });
  }
  // [FIM MÉTODO: bindGlobalEvents]
}

export const UILayersPanel = new LayersPanelUI();
