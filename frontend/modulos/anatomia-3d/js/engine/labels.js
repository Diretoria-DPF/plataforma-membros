/**
 * labels.js — rótulos de estrutura anatômica (WP04)
 * ---------------------------------------------------------------------------
 * Gerencia até 6 rótulos (1 a cada 100 px de largura) que acompanham a estrutura
 * selecionada e as maiores visíveis — um por estrutura (os dois lados viram
 * um rótulo com selo E/D) e nunca sobrepostos: cada rótulo é medido de
 * verdade e, se não couber sem cobrir outro, fica oculto. Exporta funções puras para testes e
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
 * Posiciona rótulos já medidos, em ordem de prioridade, sem sobreposição.
 * Cada rótulo tenta ficar logo acima da âncora; se colidir, tenta descer ou
 * subir uma linha por vez (até `maxShift`); se ainda colidir ou sair da
 * área, fica oculto (`shown: false`) — melhor faltar um rótulo do que
 * empilhar texto ilegível (crime C5).
 * @param {Array<{sid: string, x: number, y: number, width: number, height: number}>} items
 * @param {{width: number, height: number}} bounds
 * @param {{gap?: number, maxShift?: number}} [opts]
 * @returns {Array<Object>} items com `left`, `top` e `shown`
 */
export function placeLabels(items, bounds, { gap = 4, maxShift = 2 } = {}) {
  const placed = [];
  const offsets = [0];
  for (let k = 1; k <= maxShift; k++) offsets.push(-k, k);
  return items.map((it) => {
    const maxLeft = Math.max(0, bounds.width - it.width);
    const left = Math.max(0, Math.min(it.x - it.width / 2, maxLeft));
    for (const k of offsets) {
      const top = it.y - it.height - gap + k * (it.height + gap);
      if (top < 0 || top + it.height > bounds.height) continue;
      const r = { left, top, right: left + it.width, bottom: top + it.height };
      const hit = placed.some((p) =>
        r.left < p.right + gap && r.right + gap > p.left && r.top < p.bottom + gap && r.bottom + gap > p.top);
      if (hit) continue;
      placed.push(r);
      return { ...it, left, top, shown: true };
    }
    return { ...it, shown: false };
  });
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
 * `groupOf(sid)` (opcional) devolve `{ key, name, sideText }` — sids do
 * mesmo grupo (lados, versões M/F) dividem um rótulo só.
 * @param {{container: Element, camera: Object, registry: Object, bus: Object, getLabel: Function, groupOf?: Function, addTicker: Function, requestRender: Function, THREE: Object, max?: number}} opts
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
  groupOf = () => null,
  max = 6,
}) {
  // Quantos rótulos cabem: no máximo `max` (6) e 1 a cada 100 px de largura
  // (390 px → 3) — 12 rótulos empilhados no celular eram ilegíveis (C5).
  const limit = () => Math.max(1, Math.min(max, Math.floor((container.clientWidth || 600) / 100)));
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
    const pickedSids = candidates.slice(0, limit()).map((c) => c.sid);

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

    // Monta lista de sids a mostrar — um por grupo (lado E e D da mesma
    // estrutura dividem um rótulo; o selecionado fica com o seu lado).
    const cap = limit();
    const visibleSet = new Set(visibleStructures.map((s) => s.sid));
    const sidsToShow = [];
    const usedGroups = new Set();
    const tryAdd = (sid) => {
      if (sidsToShow.length >= cap || !visibleSet.has(sid) || sidsToShow.includes(sid)) return;
      const g = groupOf(sid);
      const key = g && g.key ? g.key : sid;
      if (usedGroups.has(key)) return;
      usedGroups.add(key);
      sidsToShow.push(sid);
    };

    // 1. Selecionado vem primeiro (se visível)
    if (selectedSid) tryAdd(selectedSid);

    // 2. Sids fixados (via setSids)
    for (const sid of fixedSids) tryAdd(sid);

    // 3. Auto-pick dos maiores se ainda há espaço e modo auto
    if (autoPickMode && sidsToShow.length < cap) {
      const remaining = visibleStructures.filter((s) => !sidsToShow.includes(s.sid));
      remaining.sort((a, b) => b.size - a.size);
      for (const r of remaining) {
        if (sidsToShow.length >= cap) break;
        tryAdd(r.sid);
      }
    }

    // Remove rótulos que não estão mais visíveis
    for (const [sid, { el, leadLine, isSelected }] of labelEls.entries()) {
      // Recria quando muda entre "selecionado" (nome com lado) e "grupo"
      // (nome base + selo E/D).
      if (!sidsToShow.includes(sid) || isSelected !== (sid === selectedSid)) {
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
        const g = sid === selectedSid ? null : groupOf(sid);
        if (g && g.name) {
          el.textContent = g.name;
          if (g.sideText) {
            const badge = document.createElement('span');
            badge.className = 'atlas-label-side';
            badge.textContent = g.sideText;
            badge.title = g.sideText === 'E/D' ? 'Os dois lados' : g.sideText === 'E' ? 'Lado esquerdo' : 'Lado direito';
            el.appendChild(badge);
          }
        } else {
          el.textContent = getLabel(sid);
        }

        // Líder (linha fina do âncora até o rótulo)
        const leadLine = document.createElement('div');
        leadLine.className = 'atlas-label-leader';
        leadLine.style.cssText =
          'position: absolute; width: 1px; background: currentColor; opacity: 0.4;';

        overlay.appendChild(leadLine);
        overlay.appendChild(el);

        // Mede uma vez (o texto não muda): sem medida real, a sobreposição
        // era estimada com 80×18 px e rótulos longos se cobriam.
        el.style.visibility = 'hidden';
        el.style.display = 'block';
        const width = el.offsetWidth || 80;
        const height = el.offsetHeight || 18;
        el.style.display = 'none';
        el.style.visibility = '';

        labelEls.set(sid, { el, leadLine, width, height, isSelected: sid === selectedSid });
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

        const { width, height } = labelEls.get(sid);
        labelData.push({
          sid,
          x: screenPos.x,
          y: screenPos.y,
          visible: screenPos.visible,
          width,
          height,
        });
      }
    }

    // Filtra os visíveis e posiciona sem sobreposição (ordem = prioridade)
    const visibleLabels = labelData.filter((l) => l.visible);
    const box = container.getBoundingClientRect();
    const positioned = placeLabels(visibleLabels, { width: box.width, height: box.height })
      .filter((p) => p.shown);

    // Aplica posições
    for (const item of positioned) {
      const { el, leadLine } = labelEls.get(item.sid);
      el.style.left = Math.round(item.left) + 'px';
      el.style.top = Math.round(item.top) + 'px';
      el.style.display = 'block';

      // Líder: linha vertical da âncora até a borda mais próxima do rótulo
      const bottom = item.top + item.height;
      const fromY = bottom <= item.y ? bottom : item.y;
      const toY = bottom <= item.y ? item.y : item.top;
      leadLine.style.left = Math.round(item.x) + 'px';
      leadLine.style.top = Math.round(fromY) + 'px';
      leadLine.style.height = Math.max(0, Math.round(toY - fromY)) + 'px';
      leadLine.style.display = toY - fromY > 2 ? 'block' : 'none';
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
    // Matriz da câmera atualizada ANTES de comparar: o ticker roda antes do
    // render, e a matriz do quadro anterior deixava os rótulos um quadro
    // atrasados — o que obrigava a pedir outro quadro a cada mudança.
    camera.updateMatrixWorld();
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

    if (labelsNeedUpdate && (enabled || selectedSid)) {
      updateLabels();
    }

    // Rótulos só ACOMPANHAM a câmera: quem a move (tween, inércia, gesto)
    // já pede os próprios quadros. Devolver true aqui a cada mudança de
    // câmera fazia qualquer movimento residual virar redesenho sem fim.
    return false;
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
