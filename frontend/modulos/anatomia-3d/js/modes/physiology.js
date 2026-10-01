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
  resolveAnchorSid = (sid) => sid,
  focusPoints = () => {},
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
    const segmentedControl = DOM.h('div', { className: 'physiology-tabs', style: { display: 'flex', gap: '8px', borderBottom: '2px solid var(--laift-border)' } },
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
            borderBottom: currentMode === 'vias' ? '3px solid var(--laift-primary)' : 'none',
            color: currentMode === 'vias' ? 'var(--laift-primary)' : 'var(--laift-muted)',
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
            borderBottom: currentMode === 'processos' ? '3px solid var(--laift-primary)' : 'none',
            color: currentMode === 'processos' ? 'var(--laift-primary)' : 'var(--laift-muted)',
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
              border: '1px solid var(--laift-border)',
              borderRadius: '4px',
              cursor: 'pointer',
              background: selectedItem?.id === item.id ? 'var(--laift-primary-soft)' : 'var(--laift-surface)',
            },
            onClick: () => selectItem(item),
          }, [
            DOM.h('div', { style: { fontWeight: 'bold', marginBottom: '4px' }, text: item.name_pt }),
            DOM.h('div', { style: { fontSize: '12px', color: 'var(--laift-muted)', marginBottom: '4px' }, text: item.system }),
            DOM.h('div', { style: { fontSize: '12px', color: 'var(--laift-muted)', lineHeight: '1.4' }, text: item.description_pt }),
          ])
        )
      );
      contentArea.appendChild(cardsList);
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
      const segmentedControl = DOM.h('div', { className: 'physiology-tabs', style: { display: 'flex', gap: '8px', borderBottom: '2px solid var(--laift-border)' } },
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
              borderBottom: currentMode === 'vias' ? '3px solid var(--laift-primary)' : 'none',
              color: currentMode === 'vias' ? 'var(--laift-primary)' : 'var(--laift-muted)',
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
              borderBottom: currentMode === 'processos' ? '3px solid var(--laift-primary)' : 'none',
              color: currentMode === 'processos' ? 'var(--laift-primary)' : 'var(--laift-muted)',
            },
            onClick: () => switchMode('processos'),
            text: 'Processos',
          }),
        ]
      );
      container.appendChild(segmentedControl);

      if (selectedItem) {
        // Renderiza detalhes
        const detailsEl = renderDetails();
        container.appendChild(detailsEl);
      } else {
        // Renderiza lista
        renderList();
        container.appendChild(contentArea);
      }
    }

    function renderDetails() {
      const isRoute = currentMode === 'vias';
      const steps = isRoute ? selectedItem.anchors : selectedItem.steps;

      const detailsContainer = DOM.h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });

      // Título e descrição
      const titleEl = DOM.h('div', { style: { marginBottom: '12px' } }, [
        DOM.h('h3', { style: { margin: '0 0 8px 0', fontSize: '16px' }, text: selectedItem.name_pt }),
        DOM.h('p', { style: { margin: '0', fontSize: '12px', color: 'var(--laift-muted)', lineHeight: '1.5' }, text: selectedItem.description_pt }),
      ]);
      detailsContainer.appendChild(titleEl);

      // Para vias, mostra informações extras
      if (isRoute) {
        const extraInfo = DOM.h('div', { style: { padding: '8px', background: 'var(--laift-surface-alt)', borderRadius: '4px', fontSize: '12px' } }, [
          DOM.h('div', { text: `Biodisponibilidade: ${selectedItem.bioavailability || 'N/A'}` }),
          DOM.h('div', { text: `Tmax: ${selectedItem.tmax || 'N/A'}` }),
          DOM.h('div', { text: `Efeito pré-sistêmico: ${selectedItem.first_pass_effect || 'Não'}` }),
        ]);
        detailsContainer.appendChild(extraInfo);
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
              border: isActive ? '2px solid var(--laift-primary)' : '1px solid var(--laift-border)',
              borderRadius: '4px',
              background: isActive ? 'var(--laift-primary-soft)' : 'var(--laift-surface)',
              cursor: 'pointer',
            },
            onClick: () => selectStep(idx),
          }, [
            DOM.h('div', { style: { fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }, text: `${stepNum}. ${isRoute ? 'Ponto' : 'Passo'}` }),
            DOM.h('div', { style: { fontSize: '12px', color: 'var(--laift-muted)' }, text: description }),
          ]);
        })
      );
      detailsContainer.appendChild(stepsEl);

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
      detailsContainer.appendChild(controlsEl);

      // Botão voltar
      const backBtn = DOM.h('button', {
        style: {
          width: '100%',
          padding: '8px',
          background: 'var(--laift-border)',
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
      detailsContainer.appendChild(backBtn);

      return detailsContainer;
    }

    async function selectStep(stepIdx) {
      currentStepIndex = stepIdx;
      const key = (currentMode === 'vias' ? selectedItem.anchors[stepIdx]?.sid : selectedItem.steps[stepIdx]?.anchors[0]?.sid) || null;
      // A âncora é uma estrutura real → seleciona (destaque + câmera + ficha).
      // Senão (ponto aproximado: aorta, útero…), só leva a câmera até o ponto.
      const realSid = key ? resolveAnchorSid(key) : null;
      if (realSid) {
        emit(EVENTS.STRUCTURE_SELECT, { sid: realSid, source: 'api' });
      } else {
        emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'api' });
        const point = key ? getBBoxCenter(key) : null;
        if (point) focusPoints([point]);
      }
      renderSheet();
      await playAnimation();
    }

    async function togglePlayPause() {
      if (animator && animator.isPlaying()) {
        animator.pause();
      } else {
        await playAnimation({ frame: true });
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

    // Trajeto: numa via, os pontos dela; num processo, um ponto por passo
    // (cada passo tem uma âncora — o trajeto atravessa os passos em ordem).
    function pathPoints() {
      const anchors = currentMode === 'vias'
        ? selectedItem.anchors || []
        : (selectedItem.steps || []).map((st) => (st.anchors || [])[0]).filter(Boolean);
      const points = [];
      for (const { point } of resolvePath(anchors, getBBoxCenter)) {
        const last = points[points.length - 1];
        // Passos seguidos no mesmo lugar viram um ponto só.
        if (last && last.every((v, i) => Math.abs(v - point[i]) < 1e-4)) continue;
        points.push(point);
      }
      return points;
    }

    async function playAnimation({ frame = false } = {}) {
      if (!selectedItem || !animator) return;

      const points = pathPoints();
      if (points.length < 2) {
        // Processo que acontece num lugar só (ex.: espermatogênese): sem
        // trajeto para animar — a câmera mostra o local.
        if (frame && points.length === 1) focusPoints(points);
        return;
      }
      // Duração proporcional ao número de pontos (≈0,9 s por trecho).
      animator.play(points, { durationMs: Math.max(2000, (points.length - 1) * 900), loop: true });
      if (frame) focusPoints(points);
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
        // Ticker do próprio renderer (render sob demanda): roda a cada quadro
        // só enquanto a via toca. O antigo setInterval mexia as esferas sem
        // pedir quadro (a tela não mudava) e seguia rodando para sempre.
        addTicker: engine.addTicker,
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
