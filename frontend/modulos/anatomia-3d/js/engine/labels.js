/**
 * labels.js — rótulos de estrutura anatômica (WP04)
 * ---------------------------------------------------------------------------
 * Gerencia até 12 rótulos sobrepostos na tela que acompanham as estruturas
 * selecionadas e as maiores visíveis. Exporta funções puras para testes e
 * a fachada `createLabels()` que integra com o motor 3D, câmera e barramento.
 */

import { on as busOn, EVENTS } from '../core/bus.js';

/**
 * Converte coordenadas NDC (normalized device coordinates, [-1, 1]) para
 * pixels na tela, incluindo profundidade.
 * @param {{x: number, y: number, z: number}} ndc
 * @param {{x: number, y: number, width: number, height: number}} rect Bounding rect do container
 * @returns {{x: number, y: number, visible: boolean}}
 */
export function projectToScreen(ndc, rect) {
  // NDC x: [-1, 1] → [0, rect.width]
  const x = ((ndc.x + 1) / 2) * rect.width;
  // NDC y: [1, -1] → [0, rect.height] (flip: NDC +Y é topo, screen +Y é base)
  const y = ((1 - ndc.y) / 2) * rect.height;

  // Invisível se atrás da câmera ou fora da tela
  const visible =
    ndc.z <= 1 &&
    x >= 0 &&
    x <= rect.width &&
    y >= 0 &&
    y <= rect.height;

  return { x, y, visible };
}

/**
 * Resolve sobreposição de rótulos usando empilhamento simples.
 * Ordena por Y da tela; se dois rótulos estão próximos (< 18px Y, < 80px X),
 * empurra o inferior para baixo em uma linha (18px).
 * @param {Array<{id?: string, sid?: string, x: number, y: number, width: number, height: number, visible: boolean}>} items
 * @returns {Array} Cópia com posições ajustadas
 */
export function resolveOverlaps(items) {
  // Cria cópia para não mutabilizar o original
  const result = items.map((item) => ({ ...item }));

  // Ordena por Y (topo para base)
  result.sort((a, b) => a.y - b.y);

  const rowHeight = 18; // altura do rótulo
  const xThreshold = 80; // proximidade horizontal antes de empurrar

  // Verifica cada par consecutivo
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1];
    const curr = result[i];

    // Se estão perto em X e Y, empurra para baixo
    if (Math.abs(curr.x - prev.x) < xThreshold && curr.y - prev.y < rowHeight) {
      curr.y = prev.y + rowHeight;
    }
  }

  return result;
}

/**
 * Escolhe até N estruturas para rótulo, prorizando selecionada e maiores visíveis.
 * @param {Array<{sid: string, size: number, visible?: boolean}>} items
 * @param {string|null} selected SID selecionado, vem primeiro se presente
 * @param {number} max Máximo de items a devolver
 * @returns {Array} Items ordenados (selecionado primeiro, depois maiores)
 */
export function pickLargest(items, selected, max) {
  // Filtra visíveis
  const visible = items.filter((i) => i.visible !== false);

  const result = [];

  // Se há selecionado e está visível, adiciona primeiro
  if (selected) {
    const selectedItem = visible.find((i) => i.sid === selected);
    if (selectedItem) {
      result.push(selectedItem);
    }
  }

  // Resto ordenado por tamanho (maior primeiro)
  const remaining = visible.filter((i) => i.sid !== selected);
  remaining.sort((a, b) => b.size - a.size);

  result.push(...remaining);

  // Limita ao máximo
  return result.slice(0, max);
}

/**
 * Calcula volume de uma caixa delimitadora.
 * @private
 */
function calculateBboxVolume(bbox) {
  const dx = bbox.max[0] - bbox.min[0];
  const dy = bbox.max[1] - bbox.min[1];
  const dz = bbox.max[2] - bbox.min[2];
  return dx * dy * dz;
}

/**
 * Cria o gerenciador de rótulos.
 * @param {{container: Element, camera: Object, registry: Object, bus: Object, getLabel: Function, addTicker: Function, requestRender: Function, THREE: Object, max?: number}} opts
 * @returns {{setEnabled: Function, setSids: Function, update: Function, dispose: Function}}
 */
export function createLabels({
  container,
  camera,
  registry,
  bus,
  getLabel,
  addTicker,
  requestRender,
  THREE,
  max = 12,
}) {
  // Cria overlay para rótulos
  const overlay = document.createElement('div');
  overlay.className = 'atlas-labels';
  overlay.style.cssText =
    'position: absolute; inset: 0; pointer-events: none; z-index: var(--atlas-z-labels, 10);';
  container.appendChild(overlay);

  // Mapa de rótulos visíveis: sid → {el, leadLine}
  const labelEls = new Map();

  // Estado
  let enabled = false;
  let selectedSid = null;
  let fixedSids = []; // Sids fixados via setSids
  let autoPickMode = false; // Se deve auto-picker os maiores

  // Rastreamento de mudanças de câmera e labels para o ticker
  let lastCameraMatrixWorld = null;
  let lastCameraProjectionMatrix = null;
  let labelsChanged = false;

  /**
   * Auto-seleciona as estruturas maiores visíveis até completar `max`.
   * @private
   */
  function autoPick() {
    const candidates = [];
    for (const item of registry.iterate()) {
      if (item.visible !== false) {
        const bbox = registry.getBBox(item.sid);
        if (bbox) {
          candidates.push({
            sid: item.sid,
            size: calculateBboxVolume(bbox),
          });
        }
      }
    }

    candidates.sort((a, b) => b.size - a.size);
    const pickedSids = candidates.slice(0, max).map((c) => c.sid);

    // Atualiza fixedSids para os selecionados
    fixedSids = pickedSids;
  }

  /**
   * Reposiciona os rótulos visíveis (renderização).
   * Chamado pelo ticker do renderizador a cada frame.
   * @private
   */
  function updateLabels() {
    if (!enabled) {
      // Desativa todos
      for (const { el, leadLine } of labelEls.values()) {
        el.style.display = 'none';
        if (leadLine) leadLine.style.display = 'none';
      }
      return;
    }

    // Coleta estruturas visíveis e seus volumes
    const visibleStructures = [];
    for (const item of registry.iterate()) {
      if (item.visible !== false) {
        const bbox = registry.getBBox(item.sid);
        if (bbox) {
          visibleStructures.push({
            sid: item.sid,
            size: calculateBboxVolume(bbox),
          });
        }
      }
    }

    // Monta lista de sids a mostrar
    let sidsToShow = [];

    // 1. Selecionado vem primeiro (se visível)
    if (selectedSid && visibleStructures.some((s) => s.sid === selectedSid)) {
      sidsToShow.push(selectedSid);
    }

    // 2. Sids fixados (via setSids)
    if (fixedSids.length > 0) {
      for (const sid of fixedSids) {
        if (sid !== selectedSid && visibleStructures.some((s) => s.sid === sid)) {
          sidsToShow.push(sid);
        }
      }
    }

    // 3. Auto-pick dos maiores se ainda há espaço e modo auto
    if (autoPickMode && sidsToShow.length < max) {
      const remaining = visibleStructures.filter((s) => !sidsToShow.includes(s.sid));
      remaining.sort((a, b) => b.size - a.size);
      const toAdd = remaining.slice(0, max - sidsToShow.length);
      sidsToShow.push(...toAdd.map((r) => r.sid));
    }

    // Remove rótulos que não estão mais visíveis
    for (const [sid, { el, leadLine }] of labelEls.entries()) {
      if (!sidsToShow.includes(sid)) {
        el.remove();
        if (leadLine) leadLine.remove();
        labelEls.delete(sid);
      }
    }

    // Cria/atualiza rótulos para sidsToShow
    const labelData = [];
    for (const sid of sidsToShow) {
      if (!labelEls.has(sid)) {
        // Cria novo rótulo
        const el = document.createElement('div');
        el.className = 'atlas-label';
        el.textContent = getLabel(sid);

        // Líder (linha fina do âncora até o rótulo)
        const leadLine = document.createElement('div');
        leadLine.className = 'atlas-label-leader';
        leadLine.style.cssText =
          'position: absolute; width: 1px; background: currentColor; opacity: 0.4;';

        overlay.appendChild(leadLine);
        overlay.appendChild(el);

        labelEls.set(sid, { el, leadLine });
      }

      // Projeta o centro da bbox
      const bbox = registry.getBBox(sid);
      if (bbox) {
        const cx = (bbox.min[0] + bbox.max[0]) / 2;
        const cy = (bbox.min[1] + bbox.max[1]) / 2;
        const cz = (bbox.min[2] + bbox.max[2]) / 2;

        const v = new THREE.Vector3(cx, cy, cz);
        v.project(camera);

        const rect = container.getBoundingClientRect();
        const screenPos = projectToScreen(v, {
          x: 0,
          y: 0,
          width: rect.width,
          height: rect.height,
        });

        labelData.push({
          sid,
          x: screenPos.x,
          y: screenPos.y,
          visible: screenPos.visible,
          width: 80,
          height: 18,
        });
      }
    }

    // Filtra os visíveis e resolve sobreposição
    const visibleLabels = labelData.filter((l) => l.visible);
    const positioned = resolveOverlaps(visibleLabels);

    // Aplica posições
    for (const item of positioned) {
      const { el, leadLine } = labelEls.get(item.sid);
      el.style.left = Math.round(item.x - item.width / 2) + 'px';
      el.style.top = Math.round(item.y - item.height) + 'px';
      el.style.display = 'block';

      // Líder: desenha uma linha da posição da tela ao rótulo
      leadLine.style.left = Math.round(item.x) + 'px';
      leadLine.style.top = Math.round(item.y) + 'px';
      leadLine.style.height = '16px';
      leadLine.style.display = 'block';
    }

    // Oculta rótulos que não estão em positioned (off-screen, etc.)
    for (const [sid, { el, leadLine }] of labelEls.entries()) {
      if (!positioned.some((p) => p.sid === sid)) {
        el.style.display = 'none';
        leadLine.style.display = 'none';
      }
    }
  }

  /**
   * Registra ticker de render (chamado a cada frame).
   * Retorna true se a câmera ou labels mudaram, false caso contrário.
   */
  const unsubscribeTicker = addTicker(() => {
    // Verifica se a câmera ou as labels mudaram
    let cameraChanged = false;

    // Compara matrizes de câmera (matrixWorld e projectionMatrix)
    if (lastCameraMatrixWorld === null || lastCameraProjectionMatrix === null) {
      // Primeira vez, precisa renderizar
      cameraChanged = true;
      lastCameraMatrixWorld = camera.matrixWorld.clone();
      lastCameraProjectionMatrix = camera.projectionMatrix.clone();
    } else {
      // Verifica se a posição/orientação da câmera mudou
      if (!lastCameraMatrixWorld.equals(camera.matrixWorld)) {
        cameraChanged = true;
        lastCameraMatrixWorld = camera.matrixWorld.clone();
      }
      // Verifica se a matriz de projeção mudou (fov, aspect, etc)
      if (!lastCameraProjectionMatrix.equals(camera.projectionMatrix)) {
        cameraChanged = true;
        lastCameraProjectionMatrix = camera.projectionMatrix.clone();
      }
    }

    // Marca se as labels devem ser atualizadas e retorna true se algo mudou
    const labelsNeedUpdate = cameraChanged || labelsChanged;
    labelsChanged = false; // Reset para o próximo frame

    if (labelsNeedUpdate) {
      updateLabels();
      return true; // Ainda precisa renderizar
    }

    return false; // Nada mudou, não precisa de outro frame
  });

  /**
   * Assina barramento.
   */
  const offLabelsSet = busOn(EVENTS.LABELS_SET, (p) => {
    enabled = p.enabled;
    labelsChanged = true; // Marca que as labels mudaram
    // Se ligou com sids vazios ou sem sids, entra em modo auto-pick
    if (enabled && (!fixedSids || fixedSids.length === 0)) {
      autoPickMode = true;
      autoPick();
    } else if (!enabled) {
      autoPickMode = false;
    }
    updateLabels();
    requestRender();
  });

  const offStructureSelect = busOn(EVENTS.STRUCTURE_SELECT, (p) => {
    selectedSid = p.sid;
    labelsChanged = true; // Marca que as labels mudaram
    updateLabels();
    requestRender();
  });

  /**
   * Ativa/desativa exibição de rótulos.
   */
  function setEnabled(bool) {
    enabled = bool;
    labelsChanged = true; // Marca que as labels mudaram
    if (enabled && fixedSids.length === 0) {
      autoPickMode = true;
      autoPick();
    } else if (!enabled) {
      autoPickMode = false;
    }
    updateLabels();
    requestRender();
  }

  /**
   * Define sids fixos para mostrar (além do selecionado).
   */
  function setSids(sids) {
    fixedSids = sids || [];
    labelsChanged = true; // Marca que as labels mudaram
    autoPickMode = fixedSids.length === 0 && enabled;
    if (autoPickMode) {
      autoPick();
    }
    updateLabels();
    requestRender();
  }

  /**
   * Reposiciona rótulos manualmente (útil entre renders).
   */
  function update() {
    updateLabels();
  }

  /**
   * Limpa recursos.
   */
  function dispose() {
    unsubscribeTicker();
    offLabelsSet();
    offStructureSelect();
    overlay.remove();
    labelEls.clear();
  }

  return {
    setEnabled,
    setSids,
    update,
    dispose,
  };
}
