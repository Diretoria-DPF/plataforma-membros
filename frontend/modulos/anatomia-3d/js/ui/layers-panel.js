/**
 * layers-panel.js — painel flutuante de camadas anatômicas (WP09)
 * -----------------------------------------------------------------------
 * Um painel ancorado ao botão "Camadas" da toolbar que permite ao usuário:
 * - Ligar/desligar cada camada (7 no total)
 * - Ajustar a opacidade de cada uma (0–100%)
 * - Usar um preset "Superficial ↔ Profundo" para combos coerentes
 * - Restaurar o estado padrão
 *
 * Emite LAYER_SET para cada mudança, sincroniza com alterações externas
 * (ex.: raio-X) sem re-emitir.
 */

import { LAYERS } from '../core/contracts.js';

/**
 * Combinações de camadas para o preset "Superficial ↔ Profundo".
 * Cada posição define quais camadas ficam visíveis e com qual opacidade.
 * @type {ReadonlyArray<Readonly<Record<string, {visible: boolean, opacity: number}>>>}
 */
export const DEPTH_PRESETS = Object.freeze([
  // Posição 1: Pele (superficial)
  Object.freeze({
    pele: { visible: true, opacity: 1 },
    musculos: { visible: false, opacity: 1 },
    esqueleto: { visible: false, opacity: 1 },
    visceras: { visible: false, opacity: 1 },
    vasos: { visible: false, opacity: 1 },
    nervos: { visible: false, opacity: 1 },
    linfatico: { visible: false, opacity: 1 },
  }),
  // Posição 2: Pele + Músculos
  Object.freeze({
    pele: { visible: true, opacity: 1 },
    musculos: { visible: true, opacity: 1 },
    esqueleto: { visible: false, opacity: 1 },
    visceras: { visible: false, opacity: 1 },
    vasos: { visible: false, opacity: 1 },
    nervos: { visible: false, opacity: 1 },
    linfatico: { visible: false, opacity: 1 },
  }),
  // Posição 3: Músculos + Esqueleto
  Object.freeze({
    pele: { visible: false, opacity: 1 },
    musculos: { visible: true, opacity: 1 },
    esqueleto: { visible: true, opacity: 1 },
    visceras: { visible: false, opacity: 1 },
    vasos: { visible: false, opacity: 1 },
    nervos: { visible: false, opacity: 1 },
    linfatico: { visible: false, opacity: 1 },
  }),
  // Posição 4: Músculos(0.3) + Esqueleto + Vísceras
  Object.freeze({
    pele: { visible: false, opacity: 1 },
    musculos: { visible: true, opacity: 0.3 },
    esqueleto: { visible: true, opacity: 1 },
    visceras: { visible: true, opacity: 1 },
    vasos: { visible: false, opacity: 1 },
    nervos: { visible: false, opacity: 1 },
    linfatico: { visible: false, opacity: 1 },
  }),
  // Posição 5: Todas as camadas (profundo)
  // Pele desligada, Músculos em 0.2, resto em opacidade total
  Object.freeze({
    pele: { visible: false, opacity: 1 },
    musculos: { visible: true, opacity: 0.2 },
    esqueleto: { visible: true, opacity: 1 },
    visceras: { visible: true, opacity: 1 },
    vasos: { visible: true, opacity: 1 },
    nervos: { visible: true, opacity: 1 },
    linfatico: { visible: true, opacity: 1 },
  }),
]);

/**
 * Estado padrão (restaurar): músculos + esqueleto visíveis em opacidade total.
 */
const DEFAULT_STATE = Object.freeze({
  pele: { visible: false, opacity: 1 },
  musculos: { visible: true, opacity: 1 },
  esqueleto: { visible: true, opacity: 1 },
  visceras: { visible: false, opacity: 1 },
  vasos: { visible: false, opacity: 1 },
  nervos: { visible: false, opacity: 1 },
  linfatico: { visible: false, opacity: 1 },
});

/**
 * Cria o painel flutuante de camadas.
 * @param {HTMLElement} container - Elemento para montar o painel.
 * @param {Object} opts
 * @param {Object} opts.bus - Barramento de eventos (emite LAYER_SET).
 * @param {Object} opts.store - Store do Atlas (get, set, subscribe).
 * @param {Function} [opts.unavailable] - Retorna array de ids de camadas indisponíveis.
 * @returns {{refresh: () => void, dispose: () => void}}
 */
export function createLayersPanel(container, { bus, store, unavailable = () => [] }) {
  // Referências aos elementos da UI
  const el = {
    presetSlider: null,
    toggles: new Map(), // layerId -> input[type=switch]
    opacitySliders: new Map(), // layerId -> input[type=range]
    expandBtns: new Map(), // layerId -> button (chevron)
    opacityRows: new Map(), // layerId -> div (container do slider de opacidade)
  };

  // Estado local: qual preset está selecionado (1–5) ou null se em estado customizado
  let selectedPreset = null;

  // Inscrições para cancelar ao desmontar
  const subscriptions = [];

  // =========================================================================
  // Construção da UI
  // =========================================================================

  const panel = window.LaiftDom.h('div', { className: 'atlas-layers-panel' }, [
    // Preset slider "Superficial ↔ Profundo"
    window.LaiftDom.h('div', { className: 'atlas-layers-preset' }, [
      window.LaiftDom.h('span', { className: 'atlas-layers-preset-label', text: 'Superficial' }),
      (el.presetSlider = window.LaiftDom.h('input', {
        className: 'atlas-layers-preset-slider',
        type: 'range',
        min: '1',
        max: '5',
        value: '3', // Posição padrão: Músculos + Esqueleto
        role: 'slider',
        'aria-label': 'Profundidade anatômica: Superficial a Profundo',
      })),
      window.LaiftDom.h('span', { className: 'atlas-layers-preset-label', text: 'Profundo' }),
    ]),

    // Divisória
    window.LaiftDom.h('hr', { className: 'atlas-layers-divider' }),

    // Container para os 7 rows de camadas
    (el.layersContainer = window.LaiftDom.h('div', { className: 'atlas-layers-list' })),

    // Divisória
    window.LaiftDom.h('hr', { className: 'atlas-layers-divider' }),

    // Botão "Restaurar"
    window.LaiftDom.h('button', {
      className: 'atlas-layers-restore-btn',
      text: 'Restaurar',
      'aria-label': 'Restaurar camadas ao estado padrão',
    }),
  ]);

  // Criar os 7 rows (um por camada)
  const unavailableIds = new Set(unavailable());
  const layersRows = LAYERS.map((layer) => {
    const isUnavailable = unavailableIds.has(layer.id);

    // Criar elementos que podem ser reutilizados
    const toggleBtn = window.LaiftDom.h('button', {
      className: 'atlas-layers-toggle',
      type: 'button',
      role: 'switch',
      'aria-checked': 'false',
      'aria-label': `${layer.label}: desligado`,
      'data-layer-id': layer.id,
    });

    const expandBtn = window.LaiftDom.h('button', {
      className: 'atlas-layers-expand-btn',
      type: 'button',
      'aria-label': `Expandir opacidade de ${layer.label}`,
      'data-layer-id': layer.id,
    });

    // Guardar nas maps
    if (!isUnavailable) {
      el.toggles.set(layer.id, toggleBtn);
      el.expandBtns.set(layer.id, expandBtn);
    }

    const rowChildren = [
      // Quadrado de cor (swatch)
      window.LaiftDom.h('div', {
        className: 'atlas-layers-swatch',
        style: { backgroundColor: `var(--atlas-color-${layer.id})` },
        role: 'presentation',
      }),

      // Label da camada
      window.LaiftDom.h('span', { className: 'atlas-layers-label', text: layer.label }),
    ];

    if (isUnavailable) {
      // Se indisponível: mostrar "indisponível" e desabilitar
      rowChildren.push(
        window.LaiftDom.h('span', {
          className: 'atlas-layers-unavailable-text',
          text: 'indisponível',
          'aria-label': `${layer.label} indisponível`,
        })
      );
    } else {
      // Senão: toggle switch + expand chevron
      rowChildren.push(toggleBtn);
      rowChildren.push(expandBtn);
    }

    const row = window.LaiftDom.h('div', { className: 'atlas-layers-row' }, rowChildren);

    // Se não estiver indisponível, adicionar o container de opacidade (escondido por padrão)
    if (!isUnavailable) {
      const opacitySlider = window.LaiftDom.h('input', {
        className: 'atlas-layers-opacity-slider',
        type: 'range',
        min: '0',
        max: '100',
        value: '100',
        role: 'slider',
        'aria-label': `Opacidade de ${layer.label}`,
        'aria-valuenow': '100',
        'aria-valuemin': '0',
        'aria-valuemax': '100',
        'data-layer-id': layer.id,
      });
      const opacityValue = window.LaiftDom.h('span', {
        className: 'atlas-layers-opacity-value',
        text: '100%',
      });

      const opacityRow = window.LaiftDom.h('div', {
        className: 'atlas-layers-opacity-row',
        style: { display: 'none' },
        'data-layer-id': layer.id,
      }, [
        window.LaiftDom.h('span', { text: 'Opacidade: ' }),
        opacitySlider,
        window.LaiftDom.h('span', { text: ' ' }),
        opacityValue,
      ]);

      el.opacityRows.set(layer.id, opacityRow);
      el.opacitySliders.set(layer.id, { input: opacitySlider, display: opacityValue });

      row.appendChild(opacityRow);
    }

    return row;
  });

  window.LaiftDom.clear(el.layersContainer);
  layersRows.forEach((row) => el.layersContainer.appendChild(row));

  container.appendChild(panel);

  // =========================================================================
  // Event Listeners
  // =========================================================================

  // Preset slider
  el.presetSlider.addEventListener('change', (e) => {
    const presetIndex = parseInt(e.target.value, 10) - 1;
    applyPreset(presetIndex);
  });

  // Toggle switches
  el.toggles.forEach((toggle, layerId) => {
    toggle.addEventListener('click', () => {
      const currentState = store.get().layers;
      const newVisible = !currentState[layerId].visible;

      // Emitir evento
      bus.emit(bus.EVENTS.LAYER_SET, { layer: layerId, visible: newVisible, opacity: currentState[layerId].opacity });

      // Atualizar store
      updateLayer(layerId, newVisible, currentState[layerId].opacity);
    });
  });

  // Expand chevrons
  el.expandBtns.forEach((btn, layerId) => {
    btn.addEventListener('click', () => {
      const opacityRow = el.opacityRows.get(layerId);
      const isExpanded = opacityRow.style.display !== 'none';
      opacityRow.style.display = isExpanded ? 'none' : 'flex';
    });
  });

  // Opacity sliders
  el.opacitySliders.forEach(({ input, display }, layerId) => {
    input.addEventListener('input', (e) => {
      const opacityPercent = parseInt(e.target.value, 10);
      const opacityNorm = opacityPercent / 100;

      // Atualizar display
      display.textContent = `${opacityPercent}%`;
      input.setAttribute('aria-valuenow', String(opacityPercent));

      // Emitir evento
      const currentState = store.get().layers;
      bus.emit(bus.EVENTS.LAYER_SET, { layer: layerId, visible: currentState[layerId].visible, opacity: opacityNorm });

      // Atualizar store
      updateLayer(layerId, currentState[layerId].visible, opacityNorm);
    });
  });

  // Botão "Restaurar"
  const restoreBtn = panel.querySelector('.atlas-layers-restore-btn');
  restoreBtn.addEventListener('click', () => {
    applyState(DEFAULT_STATE);
  });

  // =========================================================================
  // Store subscription (sincronizar com alterações externas)
  // =========================================================================

  const unsubscribeLayers = store.subscribe(
    (s) => s.layers,
    (newLayers) => {
      // Refletir as mudanças na UI sem re-emitir
      syncUIToState(newLayers);
    }
  );
  subscriptions.push(unsubscribeLayers);

  // =========================================================================
  // Funções auxiliares
  // =========================================================================

  /**
   * Aplica um preset, emite LAYER_SET para cada camada que mudou,
   * e atualiza o store.
   */
  function applyPreset(index) {
    selectedPreset = index + 1; // 1–5
    applyState(DEPTH_PRESETS[index]);
  }

  /**
   * Aplica um estado completo de camadas ao store e emite eventos.
   */
  function applyState(stateObj) {
    const currentLayers = store.get().layers;
    const newLayers = { ...currentLayers };

    // Emitir evento para cada camada que mudou
    LAYERS.forEach((layer) => {
      const newLayerState = stateObj[layer.id];
      const oldLayerState = currentLayers[layer.id];

      if (newLayerState.visible !== oldLayerState.visible || newLayerState.opacity !== oldLayerState.opacity) {
        bus.emit(bus.EVENTS.LAYER_SET, {
          layer: layer.id,
          visible: newLayerState.visible,
          opacity: newLayerState.opacity,
        });
      }

      newLayers[layer.id] = { ...newLayerState };
    });

    // Atualizar store
    store.set({ layers: newLayers });
  }

  /**
   * Atualiza uma camada específica no store.
   */
  function updateLayer(layerId, visible, opacity) {
    const currentLayers = store.get().layers;
    const newLayers = {
      ...currentLayers,
      [layerId]: { visible, opacity },
    };
    store.set({ layers: newLayers });

    // Resetar o preset selecionado (usuário está customizando)
    selectedPreset = null;
    el.presetSlider.value = '3'; // volta para a posição "neutra"
  }

  /**
   * Sincroniza a UI com o estado do store (causado por mudanças externas).
   * Não emite eventos — só reflete a mudança visualmente.
   */
  function syncUIToState(layersState) {
    el.toggles.forEach((toggle, layerId) => {
      const isVisible = layersState[layerId].visible;
      toggle.setAttribute('aria-checked', String(isVisible));
      toggle.classList.toggle('atlas-layers-toggle-on', isVisible);
    });

    el.opacitySliders.forEach(({ input, display }, layerId) => {
      const opacityPercent = Math.round(layersState[layerId].opacity * 100);
      input.value = String(opacityPercent);
      display.textContent = `${opacityPercent}%`;
      input.setAttribute('aria-valuenow', String(opacityPercent));
    });
  }

  /**
   * Sincroniza a UI com o estado inicial do store.
   */
  function syncInitial() {
    syncUIToState(store.get().layers);
  }

  syncInitial();

  // =========================================================================
  // Interface pública
  // =========================================================================

  return {
    /**
     * Refresca a UI (útil se o store for alterado externamente).
     */
    refresh() {
      syncUIToState(store.get().layers);
    },

    /**
     * Desmonta o painel e cancela todas as assinantes.
     */
    dispose() {
      subscriptions.forEach((fn) => fn());
      panel.remove();
    },
  };
}
