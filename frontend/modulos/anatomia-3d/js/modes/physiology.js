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

import { resolvePath, createPathAnimator, buildTimeline } from './path-anim.js';
import { emit, EVENTS } from '../core/bus.js';
import { ATLAS_FLAGS } from '../core/flags.js';

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
/**
 * Tempos da animação (PR 3.2, Bloco D), em ms, para buildTimeline.
 *  - Via: duração total = soma de phaseTiming (segundos de animação, dado
 *    com fonte), entre 3 s e 20 s — a via IV corre, a oral demora; pausa
 *    longa no ponto final (órgão-alvo) e curta nos intermediários.
 *  - Processo: ~0,9 s por trecho e pausa em cada passo (cada ponto é um
 *    evento do processo).
 *  - Sem phaseTiming: o ritmo antigo (≈0,9 s por trecho).
 * @param {Object} item via ou processo
 * @param {'vias'|'processos'|string} mode
 * @param {number} nPoints pontos do trajeto (já sem repetidos)
 * @returns {{ totalMs: number, dwellMs: number[] }}
 */
export function animationTiming(item, mode, nPoints) {
  const n = Math.max(0, nPoints | 0);
  const base = Math.max(2000, (n - 1) * 900);
  if (mode === 'vias') {
    const pt = item && item.phaseTiming;
    const secs = pt ? Object.values(pt).filter((v) => Number.isFinite(v) && v > 0).reduce((a, b) => a + b, 0) : 0;
    const totalMs = secs > 0 ? Math.min(20000, Math.max(3000, secs * 1000)) : base;
    const dwellMs = Array.from({ length: n }, (_, i) => (i === n - 1 ? 1200 : i === 0 ? 0 : 250));
    return { totalMs, dwellMs };
  }
  return { totalMs: base, dwellMs: Array.from({ length: n }, (_, i) => (i === 0 ? 0 : 600)) };
}

/**
 * Visão sistêmica (PR 3.2, Bloco D): grafo dos processos ligados por
 * `interageCom`. Nós em círculo, agrupados por sistema; arestas sem
 * duplicata (A–B = B–A) e só entre processos que existem.
 * @param {Array<Object>} processes
 * @param {{ size?: number }} [opts]
 * @returns {{ nodes: Array<{id: string, label: string, system: string, x: number, y: number}>, edges: Array<{from: string, to: string}> }}
 */
export function buildSystemGraph(processes, { size = 320 } = {}) {
  const list = [...(processes || [])].filter((p) => p && p.id)
    .sort((a, b) => String(a.system).localeCompare(String(b.system)) || String(a.id).localeCompare(String(b.id)));
  const ids = new Set(list.map((p) => p.id));
  const r = size / 2 - 40;
  const c = size / 2;
  const nodes = list.map((p, i) => {
    const ang = (2 * Math.PI * i) / Math.max(1, list.length) - Math.PI / 2;
    return { id: p.id, label: p.name_pt || p.id, system: p.system || '', x: +(c + r * Math.cos(ang)).toFixed(1), y: +(c + r * Math.sin(ang)).toFixed(1) };
  });
  const seen = new Set();
  const edges = [];
  for (const p of list) {
    for (const other of p.interageCom || []) {
      const to = typeof other === 'string' ? other : other && (other.id || other.processo);
      if (!ids.has(to) || to === p.id) continue;
      const key = [p.id, to].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ from: p.id, to });
    }
  }
  return { nodes, edges };
}

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

      // Re-renderiza abas: Vias | Processos | Visão sistêmica
      const tab = (mode, label) => DOM.h('button', {
        className: 'physiology-tab',
        type: 'button',
        'aria-pressed': currentMode === mode ? 'true' : 'false',
        dataset: { tab: mode },
        style: {
          flex: 1,
          padding: '8px',
          minHeight: '44px',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: currentMode === mode ? 'bold' : 'normal',
          borderBottom: currentMode === mode ? '3px solid var(--laift-primary)' : 'none',
          color: currentMode === mode ? 'var(--laift-primary)' : 'var(--laift-muted)',
        },
        onClick: () => switchMode(mode),
        text: label,
      });
      const segmentedControl = DOM.h('div', { className: 'physiology-tabs', style: { display: 'flex', gap: '8px', borderBottom: '2px solid var(--laift-border)' } },
        [tab('vias', 'Vias'), tab('processos', 'Processos'), ATLAS_FLAGS.systemic ? tab('sistemica', 'Visão sistêmica') : null].filter(Boolean));
      container.appendChild(segmentedControl);

      if (currentMode === 'sistemica') {
        container.appendChild(renderSystemic());
      } else if (selectedItem) {
        // Renderiza detalhes
        const detailsEl = renderDetails();
        container.appendChild(detailsEl);
      } else {
        // Renderiza lista
        renderList();
        container.appendChild(contentArea);
      }
    }

    function renderSystemic() {
      const size = 320;
      const { nodes, edges } = buildSystemGraph(processes, { size });
      const wrap = DOM.h('div', { className: 'physiology-systemic', style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      DOM.appendHtml(wrap, DOM.html`<p style="margin:0; font-size:12px; color:var(--laift-muted);">Como os processos se influenciam (campo "interage com" de cada processo). Toque num processo para estudá-lo.</p>`);
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', `Grafo com ${nodes.length} processos e ${edges.length} interações`);
      svg.style.cssText = 'width:100%; max-width:420px; align-self:center;';
      const pos = new Map(nodes.map((n) => [n.id, n]));
      for (const e of edges) {
        const a = pos.get(e.from); const b = pos.get(e.to);
        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
        line.setAttribute('stroke', 'var(--laift-muted)'); line.setAttribute('stroke-width', '1');
        svg.appendChild(line);
      }
      for (const n of nodes) {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'systemic-node');
        g.setAttribute('data-process', n.id);
        g.style.cursor = 'pointer';
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', n.x); circle.setAttribute('cy', n.y); circle.setAttribute('r', '7');
        circle.setAttribute('fill', 'var(--laift-primary)');
        const title = document.createElementNS(NS, 'title');
        title.textContent = n.label;
        const text = document.createElementNS(NS, 'text');
        text.setAttribute('x', n.x); text.setAttribute('y', n.y + (n.y > size / 2 ? 18 : -11));
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '8');
        text.setAttribute('fill', 'var(--laift-text)');
        text.textContent = n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label;
        g.append(title, circle, text);
        svg.appendChild(g);
      }
      wrap.appendChild(svg);
      // Lista acessível equivalente ao grafo (leitor de tela e teclado).
      const list = DOM.h('ul', { className: 'systemic-list', style: { margin: 0, paddingLeft: '18px', fontSize: '12px' } },
        nodes.map((n) => {
          const links = edges.filter((e) => e.from === n.id || e.to === n.id).map((e) => (e.from === n.id ? e.to : e.from));
          const names = links.map((id) => (pos.get(id) || {}).label).filter(Boolean);
          return DOM.h('li', {}, [
            DOM.h('button', { type: 'button', className: 'systemic-open', dataset: { process: n.id }, style: { background: 'none', border: 'none', padding: '4px 0', color: 'var(--laift-primary)', cursor: 'pointer', textAlign: 'left', minHeight: '32px' }, text: n.label }),
            DOM.h('span', { style: { color: 'var(--laift-muted)' }, text: names.length ? ` — interage com: ${names.join(', ')}` : ' — sem interações registradas' }),
          ]);
        }));
      wrap.appendChild(list);
      const open = (id) => {
        const item = processes.find((p) => p.id === id);
        if (!item) return;
        currentMode = 'processos';
        selectItem(item);
      };
      wrap.addEventListener('click', (ev) => {
        const el = ev.target.closest && ev.target.closest('[data-process]');
        if (el) open(el.getAttribute('data-process'));
      });
      return wrap;
    }

    /** "Estudo de via": o passo atual com a explicação e a correlação clínica. */
    function renderStudyStep(isRoute, steps) {
      const step = steps[currentStepIndex] || {};
      const n = steps.length;
      const last = currentStepIndex === n - 1;
      const title = isRoute ? (step.label_pt || 'Ponto da via') : `Passo ${currentStepIndex + 1}`;
      const body = isRoute ? '' : (step.description_pt || '');
      const clinica = isRoute ? (last ? selectedItem.clinicalNotes || '' : '') : (step.clinica_pt || '');
      const box = DOM.h('section', { className: 'physiology-study', 'aria-live': 'polite', style: { padding: '10px', border: '1px solid var(--laift-primary)', borderRadius: '6px', background: 'var(--laift-primary-soft)', fontSize: '13px' } });
      DOM.appendHtml(box, DOM.html`
        <div class="physiology-study-count" style="font-size:11px; color:var(--laift-muted); margin-bottom:4px;">${isRoute ? 'Ponto' : 'Passo'} ${currentStepIndex + 1} de ${n}</div>
        <div style="font-weight:600; margin-bottom:4px;">${title}</div>
        ${body ? DOM.html`<p style="margin:0 0 6px; line-height:1.5;">${body}</p>` : ''}
        ${clinica ? DOM.html`<p class="physiology-study-clinica" style="margin:0; line-height:1.5;"><strong>Na clínica:</strong> ${clinica}</p>` : ''}
      `);
      return box;
    }

    function renderSources() {
      const sources = (selectedItem.sources || []).filter((x) => x && x.ref);
      if (!sources.length) return null;
      const wrap = DOM.h('div');
      DOM.appendHtml(wrap, DOM.html`<details class="physiology-sources" style="font-size:12px;"><summary style="cursor:pointer;">Fontes (${sources.length})</summary><ul style="margin:4px 0 0; padding-left:18px;">${sources.map((x) => DOM.html`<li>${x.field}: ${x.ref}</li>`)}</ul></details>`);
      return wrap;
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
        // Campos do schema (bioavailabilityF, tmax, firstPass); antes lia
        // nomes que não existem e mostrava sempre "N/A".
        const it = selectedItem;
        const fText = Number.isFinite(it.bioavailabilityF) ? `${Math.round(it.bioavailabilityF * 100)}%` : 'depende do fármaco';
        const tText = Number.isFinite(it.tmax) ? `${String(it.tmax).replace('.', ',')} min` : 'depende do fármaco';
        const fpText = it.firstPass === true ? 'Sim' : it.firstPass === false ? 'Não' : '—';
        const extraInfo = DOM.h('div', { className: 'route-pk', style: { padding: '8px', background: 'var(--laift-surface-alt)', borderRadius: '4px', fontSize: '12px' } }, [
          DOM.h('div', { text: `Biodisponibilidade típica: ${fText}` }),
          DOM.h('div', { text: `Tmax típico: ${tText}` }),
          DOM.h('div', { text: `Efeito de primeira passagem: ${fpText}` }),
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
      detailsContainer.appendChild(renderStudyStep(isRoute, steps));
      detailsContainer.appendChild(stepsEl);
      const srcEl = renderSources();
      if (srcEl) detailsContainer.appendChild(srcEl);

      // Botões de controle
      const controlsEl = DOM.h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'space-between' } }, [
        DOM.h('button', {
          style: {
            flex: 1,
            padding: '8px',
            background: animator && animator.isPlaying() ? '#c62828' : '#2e7d32', // contraste AA com texto branco
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
            background: '#1565c0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
          onClick: () => prevStep(),
          'aria-label': 'Passo anterior',
          className: 'physiology-prev',
          text: '◀',
        }),
        DOM.h('button', {
          style: {
            flex: 0.5,
            padding: '8px',
            background: '#1565c0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          },
          onClick: () => nextStep(),
          'aria-label': 'Próximo passo',
          className: 'physiology-next',
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
        emit(EVENTS.STRUCTURE_SELECT, { sid: null, source: 'study' });
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
        // Chegou ao fim do estudo: entra no histórico de "Meu estudo".
        if (currentStepIndex + 1 === steps.length - 1) {
          const first = currentMode === 'vias' ? (steps[0] || {}).sid : ((steps[0] || {}).anchors || [])[0]?.sid;
          emit(EVENTS.STUDY_PATH, { kind: currentMode === 'vias' ? 'route' : 'process', id: selectedItem.id, label: selectedItem.name_pt, sid: first ? resolveAnchorSid(first) : null });
        }
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
      // Velocidade da via (phaseTiming) e pausas nos órgãos (PR 3.2, Bloco D).
      animator.play(points, { timeline: buildTimeline(points, animationTiming(selectedItem, currentMode, points.length)), loop: true });
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
