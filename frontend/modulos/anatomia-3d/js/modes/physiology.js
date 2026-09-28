/**
 * physiology.js — Modo "Fisiologia & Vias"
 *
 * Implementa a interface Mode com:
 * - Segmentação Vias | Processos
 * - Lista de cartões (nome, categoria, descrição)
 * - Detalhes do item selecionado com passos, bioavailability (vias), etc.
 * - Play/Pause/Step buttons
 * - Emissão de STRUCTURE_SELECT com source='api'
 */

import { resolvePath, createPathAnimator } from './path-anim.js';
import { emit, EVENTS } from '../core/bus.js';

/**
 * Cria o modo Fisiologia & Vias.
 *
 * @param {{
 *   bus: Object,
 *   loadRoutes: () => Promise<Array>,
 *   loadProcesses: () => Promise<Array>,
 *   getBBoxCenter: (sid: string) => [number,number,number]|null,
 *   engine: Object,
 *   THREE: Object,
 *   getLabel: (sid: string) => string
 * }} opts
 * @returns {Object} implementa Mode
 */
export function createPhysiologyMode({
  bus,
  loadRoutes,
  loadProcesses,
  getBBoxCenter,
  engine,
  THREE,
  getLabel,
}) {
  const DOM = window.LaiftDom;

  let routes = [];
  let processes = [];
  let currentMode = 'vias'; // 'vias' ou 'processos'
  let selectedItem = null;
  let animator = null;
  let currentStepIndex = 0;

  function createSheetContent() {
    const container = DOM.h('div', { className: 'physiology-container', style: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' } });

    // Segmented control: Vias | Processos
    const segmentedControl = DOM.h('div', { className: 'physiology-tabs', style: { display: 'flex', gap: '8px', borderBottom: '2px solid #ccc' } },
      [
        DOM.h('button', {
          className: 'physiology-tab',
          style: {
            flex: 1,
            padding: '8px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: currentMode === 'vias' ? 'bold' : 'normal',
            borderBottom: currentMode === 'vias' ? '3px solid #0066cc' : 'none',
            color: currentMode === 'vias' ? '#0066cc' : '#666',
          },
          onClick: () => switchMode('vias'),
          text: 'Vias',
        }),
        DOM.h('button', {
          className: 'physiology-tab',
          style: {
            flex: 1,
            padding: '8px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: currentMode === 'processos' ? 'bold' : 'normal',
            borderBottom: currentMode === 'processos' ? '3px solid #0066cc' : 'none',
            color: currentMode === 'processos' ? '#0066cc' : '#666',
          },
          onClick: () => switchMode('processos'),
          text: 'Processos',
        }),
      ]
    );

    const contentArea = DOM.h('div', { className: 'physiology-content', style: { flex: 1, overflowY: 'auto' } });

    // Renderiza lista de itens baseado no modo
    function renderList() {
      DOM.clear(contentArea);
      const items = currentMode === 'vias' ? routes : processes;

      const cardsList = DOM.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        items.map((item) =>
          DOM.h('div', {
            className: 'physiology-card',
            style: {
              padding: '12px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              background: selectedItem?.id === item.id ? '#f0f0f0' : 'white',
            },
            onClick: () => selectItem(item),
          }, [
            DOM.h('div', { style: { fontWeight: 'bold', marginBottom: '4px' }, text: item.name_pt }),
            DOM.h('div', { style: { fontSize: '12px', color: '#666', marginBottom: '4px' }, text: item.system }),
            DOM.h('div', { style: { fontSize: '12px', color: '#999', lineHeight: '1.4' }, text: item.description_pt }),
          ])
        )
      );
      DOM.appendHtml(contentArea, cardsList);
    }

    function switchMode(mode) {
      currentMode = mode;
      selectedItem = null;
      currentStepIndex = 0;
      if (animator) {
        animator.stop();
      }
      renderSheet();
    }

    async function selectItem(item) {
      selectedItem = item;
      currentStepIndex = 0;
      renderSheet();
    }

    function renderSheet() {
      DOM.clear(container);

      // Re-renderiza aba
      const segmentedControl = DOM.h('div', { className: 'physiology-tabs', style: { display: 'flex', gap: '8px', borderBottom: '2px solid #ccc' } },
        [
          DOM.h('button', {
            className: 'physiology-tab',
            style: {
              flex: 1,
              padding: '8px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: currentMode === 'vias' ? 'bold' : 'normal',
              borderBottom: currentMode === 'vias' ? '3px solid #0066cc' : 'none',
              color: currentMode === 'vias' ? '#0066cc' : '#666',
            },
            onClick: () => switchMode('vias'),
            text: 'Vias',
          }),
          DOM.h('button', {
            className: 'physiology-tab',
            style: {
              flex: 1,
              padding: '8px',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: currentMode === 'processos' ? 'bold' : 'normal',
              borderBottom: currentMode === 'processos' ? '3px solid #0066cc' : 'none',
              color: currentMode === 'processos' ? '#0066cc' : '#666',
            },
            onClick: () => switchMode('processos'),
            text: 'Processos',
          }),
        ]
      );
      DOM.appendHtml(container, segmentedControl);

      if (selectedItem) {
        // Renderiza detalhes
        const detailsEl = renderDetails();
        DOM.appendHtml(container, detailsEl);
      } else {
        // Renderiza lista
        renderList();
        DOM.appendHtml(container, contentArea);
      }
    }

    function renderDetails() {
      const isRoute = currentMode === 'vias';
      const steps = isRoute ? selectedItem.anchors : selectedItem.steps;

      const detailsContainer = DOM.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

      // Título e descrição
      const titleEl = DOM.h('div', { style: { marginBottom: '12px' } }, [
        DOM.h('h3', { style: { margin: '0 0 8px 0', fontSize: '16px' }, text: selectedItem.name_pt }),
        DOM.h('p', { style: { margin: '0', fontSize: '12px', color: '#666', lineHeight: '1.5' }, text: selectedItem.description_pt }),
      ]);
      DOM.appendHtml(detailsContainer, titleEl);

      // Para vias, mostra informações extras
      if (isRoute) {
        const extraInfo = DOM.h('div', { style: { padding: '8px', background: '#f5f5f5', borderRadius: '4px', fontSize: '12px' } }, [
          DOM.h('div', { text: `Biodisponibilidade: ${selectedItem.bioavailability || 'N/A'}` }),
          DOM.h('div', { text: `Tmax: ${selectedItem.tmax || 'N/A'}` }),
          DOM.h('div', { text: `Efeito pré-sistêmico: ${selectedItem.first_pass_effect || 'Não'}` }),
        ]);
        DOM.appendHtml(detailsContainer, extraInfo);
      }

      // Lista de passos
      const stepsEl = DOM.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        steps.map((step, idx) => {
          const stepNum = idx + 1;
          const isActive = currentStepIndex === idx;
          const description = isRoute ? (step.label_pt || step.sid) : step.description_pt;
          return DOM.h('div', {
            style: {
              padding: '8px',
              border: isActive ? '2px solid #0066cc' : '1px solid #ddd',
              borderRadius: '4px',
              background: isActive ? '#e6f2ff' : 'white',
              cursor: 'pointer',
            },
            onClick: () => selectStep(idx),
          }, [
            DOM.h('div', { style: { fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }, text: `${stepNum}. ${isRoute ? 'Ponto' : 'Passo'}` }),
            DOM.h('div', { style: { fontSize: '12px', color: '#666' }, text: description }),
          ]);
        })
      );
      DOM.appendHtml(detailsContainer, stepsEl);

      // Botões de controle
      const controlsEl = DOM.h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between' } }, [
        DOM.h('button', {
          style: {
            flex: 1,
            padding: '8px',
            background: animator && animator.isPlaying() ? '#ff6666' : '#66bb6a',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
          },
          onClick: () => togglePlayPause(),
          text: animator && animator.isPlaying() ? 'Parar' : 'Reproduzir',
        }),
        DOM.h('button', {
          style: {
            flex: 0.5,
            padding: '8px',
            background: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
          onClick: () => prevStep(),
          text: '◀',
        }),
        DOM.h('button', {
          style: {
            flex: 0.5,
            padding: '8px',
            background: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
          onClick: () => nextStep(),
          text: '▶',
        }),
      ]);
      DOM.appendHtml(detailsContainer, controlsEl);

      // Botão voltar
      const backBtn = DOM.h('button', {
        style: {
          width: '100%',
          padding: '8px',
          background: '#ccc',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
        },
        onClick: () => {
          selectedItem = null;
          currentStepIndex = 0;
          if (animator) {
            animator.stop();
          }
          renderSheet();
        },
        text: 'Voltar',
      });
      DOM.appendHtml(detailsContainer, backBtn);

      return detailsContainer;
    }

    async function selectStep(stepIdx) {
      currentStepIndex = stepIdx;
      emit(EVENTS.STRUCTURE_SELECT, {
        sid: (currentMode === 'vias' ? selectedItem.anchors[stepIdx]?.sid : selectedItem.steps[stepIdx]?.anchors[0]?.sid) || null,
        source: 'api',
      });
      renderSheet();
      await playAnimation();
    }

    async function togglePlayPause() {
      if (animator && animator.isPlaying()) {
        animator.pause();
      } else {
        await playAnimation();
      }
      renderSheet();
    }

    function prevStep() {
      if (currentStepIndex > 0) {
        selectStep(currentStepIndex - 1);
      }
    }

    function nextStep() {
      const steps = currentMode === 'vias' ? selectedItem.anchors : selectedItem.steps;
      if (currentStepIndex < steps.length - 1) {
        selectStep(currentStepIndex + 1);
      }
    }

    async function playAnimation() {
      if (!selectedItem || !animator) return;

      const isRoute = currentMode === 'vias';
      const anchors = isRoute ? selectedItem.anchors : selectedItem.steps[currentStepIndex]?.anchors || [];

      const resolved = resolvePath(anchors, getBBoxCenter);
      if (resolved.length < 2) return;

      const points = resolved.map((r) => r.point);
      animator.play(points, { durationMs: 2000, loop: true });
      renderSheet();
    }

    renderSheet();
    return container;
  }

  return {
    id: 'fisiologia',
    label: 'Fisiologia & Vias',
    icon: 'route',

    async enter(ctx) {
      routes = await loadRoutes();
      processes = await loadProcesses();

      // Configura animator com o engine
      animator = createPathAnimator({
        scene: engine.scene,
        THREE,
        addTicker: (callback) => {
          // Mock: será substituído pelo engine real
          const id = setInterval(callback, 16); // ~60 FPS
          return () => clearInterval(id);
        },
        requestRender: () => engine.requestRender(),
        color: 0x00ff88,
      });
    },

    exit() {
      if (animator) {
        animator.stop();
        animator = null;
      }
      selectedItem = null;
      currentStepIndex = 0;
      emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'api' });
    },

    sheetContent() {
      return createSheetContent();
    },
  };
}
