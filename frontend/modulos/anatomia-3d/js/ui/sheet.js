/**
 * js/ui/sheet.js — painel arrastável (bottom sheet / lateral) do Atlas v2
 * ---------------------------------------------------------------------------
 * Onda 1, WP08. Implementa docs/ATLAS_UX_SPEC.md §2 (três estados, física de
 * arraste por velocidade+posição, rubber-band, encaixe automático) sobre a
 * região #atlas-sheet de v2.html.
 *
 * Não conhece conteúdo (ficha, camadas, busca) — só o CARTÃO e seus três
 * estados. `setContent()` é o único ponto de entrada para outros pacotes
 * colocarem algo dentro dele.
 *
 * Medidas: as alturas dos três estados (peek, half, full) são calculadas
 * dinamicamente com base na altura real do container usando computeSnapHeights(H),
 * que observa redimensionamentos via ResizeObserver e mudanças de orientação.
 * Isso respeita automaticamente ajustes futuros de breakpoint/token em css/atlas.css,
 * e funciona corretamente com dvh em navegadores modernos.
 */
import { on, emit, EVENTS } from '../core/bus.js';
import { set as storeSet } from '../core/store.js';
import { isValidSheetState } from '../core/contracts.js';

const STATES = ['peek', 'half', 'full'];
const RUBBER_BAND_FACTOR = 0.35;

/**
 * Calcula as três alturas de estado (peek, half, full) com base na altura
 * real disponível H do container.
 *
 * Fórmulas:
 * - peek = clamp(72px, 12% de H, 112px)
 * - half = round(0.45 * H)
 * - full = round(0.9 * H), nunca menor que peek + 48
 *
 * @param {number} H - altura real disponível do container (px)
 * @returns {{ peek: number, half: number, full: number }} alturas dos estados
 */
export function computeSnapHeights(H) {
  // Clamp: min 72, máximo 112, valor central 12% de H
  const peek = Math.max(72, Math.min(112, Math.round(H * 0.12)));

  // Half: sempre 45% da altura disponível
  const half = Math.round(H * 0.45);

  // Full: 90% da altura, mas nunca menor que peek + 48
  const full = Math.max(peek + 48, Math.round(H * 0.9));

  return { peek, half, full };
}
// Janela de amostras usada para estimar a velocidade no momento de soltar
// (ver docs/ATLAS_UX_SPEC.md §2.3) — só as amostras dos últimos N ms contam,
// para um arraste que parou antes de soltar não "herdar" velocidade antiga.
const VELOCITY_WINDOW_MS = 120;
// Limite de velocidade para permitir "flick" que pula estados (px/ms).
// Abaixo disso, o encaixe respeita o padrão "sem pulo" (§2.3).
const FLICK_VELOCITY_THRESHOLD_PX_MS = 1.5;
// Distância mínima do arraste em px: abaixo disso, é um toque (mantém o estado).
const MIN_DRAG_DISTANCE_PX = 8;

let sheetEl = null;
let handleEl = null;
let peekEl = null;
let bodyEl = null;
let sheetParent = null;
let sheetResizeObserver = null;

let currentState = 'peek';
/** Estado antes de a busca/navegador forçarem `peek` (§2.4) — restaurado
 *  quando algo chamar {@link restoreAfterOverlay}. `null` = nada para restaurar. */
let stateBeforeOverlay = null;

let axis = 'y'; // 'y' no retrato (altura), 'x' na paisagem curta (largura) — ver isLandscapeSheet().
let dragging = false;
let dragSamples = []; // { t, size } — tamanho já com rubber-band aplicado
let dragSizes = null; // { peek, half, full } medidos no início do arraste atual
let dragStartSize = 0;
let dragStartPointerPos = 0;
let dragMoved = false;
let dragPointerId = null;

/** Alturas computadas (peek, half, full) em px, baseadas na altura real do container */
let computedHeights = { peek: 96, half: 380, full: 760 };

function isLandscapeSheet() {
  return window.matchMedia('(orientation: landscape) and (max-height: 599px)').matches;
}

/**
 * Recomputa as alturas do sheet baseado na altura real do container
 * (atlas-canvas clientHeight) e re-aplica o estado atual.
 * Chamado após resize ou orientationchange.
 *
 * IMPORTANTE: observa o canvas (atlas-canvas), não o parent do sheet, para
 * evitar feedback loop quando o sheet muda de tamanho. O canvas é o container
 * real e não depende da altura do sheet.
 */
function recomputeHeights() {
  if (!sheetParent) return;

  // Observa a altura real disponível: canvas (main#atlas-canvas), não o parent direto
  // O canvas é o viewport real e não varia com o tamanho do sheet
  const atlasCanvas = document.getElementById('atlas-canvas');
  const containerHeight = atlasCanvas ? atlasCanvas.clientHeight : sheetParent.clientHeight;

  if (containerHeight <= 0) return; // Proteção: ignore se canvas não está pronto

  const newHeights = computeSnapHeights(containerHeight);

  // Só atualiza se mudou
  if (newHeights.peek === computedHeights.peek &&
      newHeights.half === computedHeights.half &&
      newHeights.full === computedHeights.full) {
    return;
  }

  computedHeights = newHeights;

  // Re-aplica o estado atual com as novas alturas, mas APENAS se não estamos
  // já na altura certa. Evita re-aplicar altura se ela já é exata.
  if (!dragging) {
    const sizes = measureStates();
    const currentHeight = sheetEl.clientHeight;
    const targetHeight = sizes[currentState];

    // Só commit se a altura atual é significativamente diferente (>1px) da esperada
    if (Math.abs(currentHeight - targetHeight) > 1) {
      commit(currentState, { silent: true });
    }
  }
}

function sizeProp() {
  return axis === 'y' ? 'height' : 'width';
}

function pointerPos(evt) {
  return axis === 'y' ? evt.clientY : evt.clientX;
}

/**
 * Retorna as três alturas/larguras (px) baseadas na altura real do container.
 * As alturas são pré-computadas em computedHeights via computeSnapHeights().
 */
function measureStates() {
  return computedHeights;
}

function clampRubberBand(raw, sizes) {
  const min = sizes.peek;
  const max = sizes.full;
  if (raw < min) return min - (min - raw) * RUBBER_BAND_FACTOR;
  if (raw > max) return max + (raw - max) * RUBBER_BAND_FACTOR;
  return raw;
}

function nearestState(size, sizes) {
  let best = STATES[0];
  let bestDist = Infinity;
  for (const state of STATES) {
    const dist = Math.abs(size - sizes[state]);
    // Empate exato: fica com o ESTADO MAIS ABERTO (comportamento "otimista",
    // §2.3) — como STATES está em ordem peek→half→full, um dist igual ao
    // atual melhor faz a troca (o laço visita os estados nessa ordem).
    if (dist <= bestDist) { bestDist = dist; best = state; }
  }
  return best;
}

/**
 * Escolhe o próximo estado do encaixe baseado em posição, velocidade e regra de "sem pulo".
 * Exportado para uso em testes unitários (sheet-snap.test.mjs).
 *
 * @param {Object} params
 * @param {string} params.startState - estado atual ('peek'|'half'|'full')
 * @param {number} params.endHeight - altura medida ao soltar (px)
 * @param {number} params.velocity - velocidade nos últimos ~100ms (px/ms; positivo = abre)
 * @param {Object} params.heights - { peek, half, full } alturas reais medidas (px)
 * @returns {string} próximo estado
 */
export function pickSnap({ startState, endHeight, velocity, heights }) {
  // Se alturas medidas parecem inválidas (todas iguais), use fallback com computeHeights
  let h = heights;
  let usedFallback = false;
  if (heights && heights.peek === heights.half && heights.half === heights.full && typeof window !== 'undefined') {
    usedFallback = true;
    // Fallback: calcular baseado no viewport e CSS vars conhecidos
    // Note: documentElement.clientHeight é melhor que innerHeight para iframe
    const containerH = document.documentElement.clientHeight || window.innerHeight;
    h = { peek: 96, half: Math.round(containerH * 0.45), full: Math.round(containerH * 0.90) };
  }

  // Regra 4: Se o arraste foi muito pequeno (< 8px), mantém o estado atual.
  const dragDistance = Math.abs(endHeight - h[startState]);
  if (dragDistance < MIN_DRAG_DISTANCE_PX) {
    return startState;
  }

  // Regra 1: Projeção com momentum — janela de 120ms.
  const projected = endHeight + velocity * VELOCITY_WINDOW_MS;

  // Regra 2: Estado cuja altura está mais próxima da projeção.
  let target = STATES[0];
  let bestDist = Infinity;
  for (const state of STATES) {
    const dist = Math.abs(projected - h[state]);
    if (dist <= bestDist) { bestDist = dist; target = state; }
  }

  // Regra 3: Sem pulo — máximo um estado de distância, a menos que |velocidade| > 1.5 px/ms.
  const startIdx = STATES.indexOf(startState);
  const targetIdx = STATES.indexOf(target);
  const isFlick = Math.abs(velocity) > FLICK_VELOCITY_THRESHOLD_PX_MS;

  if (!isFlick && Math.abs(targetIdx - startIdx) > 1) {
    // Classa para estado adjacente na direção da intenção.
    if (targetIdx > startIdx) {
      return STATES[startIdx + 1];
    } else {
      return STATES[startIdx - 1];
    }
  }

  return target;
}

function velocityPxPerMs() {
  // Retorna a velocidade em px/ms (positivo = abre, negativo = fecha).
  // Usa as amostras dos últimos ~100ms, para não herdar velocidade antiga.
  const now = dragSamples[dragSamples.length - 1];
  if (!now) return 0;
  let ref = dragSamples[0];
  for (let i = dragSamples.length - 1; i >= 0; i--) {
    if (now.t - dragSamples[i].t <= VELOCITY_WINDOW_MS) ref = dragSamples[i];
    else break;
  }
  const dt = now.t - ref.t;
  if (dt <= 0) return 0;
  return (now.size - ref.size) / dt;
}

/** Aplica o estado resolvido: emite o evento, atualiza o store e anima via CSS. */
function commit(state, { silent } = {}) {
  if (!isValidSheetState(state)) return;
  const sizes = measureStates();
  currentState = state;
  sheetEl.setAttribute('data-sheet-state', state);
  // Define a altura diretamente com a altura computada
  const prop = sizeProp();
  sheetEl.style[prop] = `${sizes[state]}px`;
  syncAria(state);
  if (!silent) {
    const heightPx = Math.round(sizes[state]);
    storeSet({ sheetState: state });
    emit(EVENTS.SHEET_SNAP, { state, heightPx });
  }
}

function syncAria(state) {
  // aria-modal não vale em role="region" (axe: aria-allowed-attr) — o
  // painel nunca é modal, então basta não declarar.
  sheetEl.removeAttribute('aria-modal');
  if (state === 'full') {
    sheetEl.setAttribute('aria-label', 'Painel do Atlas (expandido)');
  } else {
    sheetEl.setAttribute('aria-label', 'Painel do Atlas');
  }
}

// ---------------------------------------------------------------------------
// Arraste (pointer events na alça e na área de "espiar" — §2.3).
// ---------------------------------------------------------------------------
function onPointerDown(evt) {
  if (evt.button !== undefined && evt.button !== 0) return;
  axis = isLandscapeSheet() ? 'x' : 'y';
  dragSizes = measureStates();
  dragStartSize = dragSizes[currentState];
  dragStartPointerPos = pointerPos(evt);
  dragMoved = false;
  dragging = true;
  dragPointerId = evt.pointerId;
  dragSamples = [{ t: performance.now(), size: dragStartSize }];
  sheetEl.style.transition = 'none';
  try { evt.target.setPointerCapture(evt.pointerId); } catch (e) { /* ambiente sem capture */ }
}

function onPointerMove(evt) {
  if (!dragging || evt.pointerId !== dragPointerId) return;
  const delta = pointerPos(evt) - dragStartPointerPos;
  // Abrir = arrastar para cima (retrato) ou para a esquerda (paisagem, painel
  // ancorado na borda direita) — em ambos os casos, delta NEGATIVO abre.
  const raw = dragStartSize - delta;
  if (Math.abs(delta) > 4) dragMoved = true;
  const size = clampRubberBand(raw, dragSizes);
  sheetEl.style[sizeProp()] = `${size}px`;

  dragSamples.push({ t: performance.now(), size });
  // Mantém no máximo as últimas 100 amostras para não descartar dados
  // durante arraste longo (a velocidade é calculada na janela de 120ms do final)
  if (dragSamples.length > 100) dragSamples.shift();
}

function onPointerUp(evt) {
  if (!dragging || evt.pointerId !== dragPointerId) return;
  dragging = false;
  dragMoved = false; // Reseta o flag para que o próximo click possa ciclar o estado
  sheetEl.style.transition = '';

  const last = dragSamples[dragSamples.length - 1];
  const endHeight = last ? last.size : dragStartSize;
  const velocity = velocityPxPerMs();

  // Usa pickSnap para encontrar o próximo estado respeitando as regras
  // (momentum, sem pulo, toque = sem movimento).
  const target = pickSnap({
    startState: currentState,
    endHeight: endHeight,
    velocity: velocity,
    heights: dragSizes
  });

  commit(target);
  dragSizes = null;
}

function onHandleClick() {
  if (dragMoved) { dragMoved = false; return; } // era um arraste, não um toque
  const idx = STATES.indexOf(currentState);
  commit(STATES[(idx + 1) % STATES.length]);
}

function onHandleKeydown(evt) {
  if (evt.key === 'Escape') {
    evt.preventDefault();
    commit('peek');
  }
  // Enter/Espaço já disparam "click" nativamente num <button> — onHandleClick cuida do ciclo.
}

// ---------------------------------------------------------------------------
// Encaixe automático (§2.4) — reage ao bus, não ao contrário.
// ---------------------------------------------------------------------------
function wireAutoSnapRules() {
  on(EVENTS.STRUCTURE_SELECT, ({ sid, source }) => {
    if (sid) {
      if (currentState === 'peek') commit('half');
    } else if (currentState !== 'peek' && source !== 'study') {
      // "Estudo de via" (modo Fisiologia) limpa a seleção ao passar por um
      // ponto sem estrutura: o painel do estudo fica aberto (PR 3.2).
      commit('peek');
    }
  });
  on(EVENTS.MODE_CHANGE, () => commit('peek'));
  on(EVENTS.SEARCH_OPEN, () => {
    if (currentState !== 'peek') {
      stateBeforeOverlay = currentState;
      commit('peek');
    }
  });
  // GAP DE CONTRATO (ver relatório final do WP08): bus.js não tem um evento
  // de "busca fechou" ou "navegador fechou" — SEARCH_OPEN existe, mas não um
  // par de fechamento. Assinamos um nome de evento PROPOSTO (não está em
  // EVENTS, congelado) só como melhor esforço: se WP09 vier a emitir isto,
  // o painel restaura o estado anterior; se não vier, o pior caso é o
  // painel ficar em `peek` até o usuário tocar de novo (nunca quebra).
  on('search:close', restoreAfterOverlay);
  on('navigator:close', restoreAfterOverlay);
}

function restoreAfterOverlay() {
  if (stateBeforeOverlay && stateBeforeOverlay !== currentState) {
    commit(stateBeforeOverlay);
  }
  stateBeforeOverlay = null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Vai direto para um estado (arraste, botão da toolbar ou automático). */
export function snapTo(state) {
  commit(state);
}

/** @returns {{ state: string, heightPx: number }} */
export function getState() {
  const sizes = measureStates();
  return { state: currentState, heightPx: Math.round(sizes[currentState]) };
}

/**
 * Substitui o conteúdo do painel. `peekNode`/`bodyNode` podem ser `null`
 * para deixar o conteúdo atual (ex.: só trocar o corpo, mantendo o peek).
 * `opts.label` atualiza o `aria-label` do painel (ex.: "Painel de Coração").
 */
export function setContent(peekNode, bodyNode, opts = {}) {
  if (peekNode) {
    while (peekEl.firstChild) peekEl.removeChild(peekEl.firstChild);
    peekEl.appendChild(peekNode);
  }
  if (bodyNode) {
    while (bodyEl.firstChild) bodyEl.removeChild(bodyEl.firstChild);
    bodyEl.appendChild(bodyNode);
  }
  if (opts.label) sheetEl.setAttribute('aria-label', opts.label);
}

/**
 * Liga a física de arraste + as regras de encaixe automático sobre a região
 * #atlas-sheet de v2.html. Chamado uma vez por `js/ui/v2-entry.js`.
 */
export function initSheet() {
  sheetEl = document.getElementById('atlas-sheet');
  handleEl = document.getElementById('atlas-sheet-handle');
  peekEl = document.getElementById('atlas-sheet-peek');
  bodyEl = document.getElementById('atlas-sheet-body');
  if (!sheetEl || !handleEl) return;

  sheetParent = sheetEl.parentElement;
  if (!sheetParent) return;

  currentState = isValidSheetState(sheetEl.getAttribute('data-sheet-state'))
    ? sheetEl.getAttribute('data-sheet-state')
    : 'peek';
  syncAria(currentState);

  // Computa alturas iniciais
  recomputeHeights();

  handleEl.addEventListener('pointerdown', onPointerDown);
  handleEl.addEventListener('pointermove', onPointerMove);
  handleEl.addEventListener('pointerup', onPointerUp);
  handleEl.addEventListener('pointercancel', onPointerUp);
  handleEl.addEventListener('click', onHandleClick);
  handleEl.addEventListener('keydown', onHandleKeydown);

  // A área de "espiar" (cabeçalho) também arrasta (§2.3: "alça e cabeçalho
  // são a área de arraste"); o corpo rolável (#atlas-sheet-body) não entra
  // aqui de propósito — arrastar ali rola a aba.
  peekEl.addEventListener('pointerdown', onPointerDown);
  peekEl.addEventListener('pointermove', onPointerMove);
  peekEl.addEventListener('pointerup', onPointerUp);
  peekEl.addEventListener('pointercancel', onPointerUp);

  wireAutoSnapRules();

  // Três botões .laift-sr-only antes da alça (data-action, delegados pelo
  // shell — ver js/ui/shell.js) chamam AtlasSheet.snapPeek/Half/Full.
  window.AtlasSheet = window.AtlasSheet || {};
  window.AtlasSheet.snapPeek = () => commit('peek');
  window.AtlasSheet.snapHalf = () => commit('half');
  window.AtlasSheet.snapFull = () => commit('full');

  // ResizeObserver para detectar redimensionamento do canvas (stable container)
  // Observa o canvas, não o parent direto, para evitar feedback loop quando a
  // altura do sheet muda — o canvas é o viewport real e não depende do sheet.
  if (typeof ResizeObserver !== 'undefined') {
    const atlasCanvas = document.getElementById('atlas-canvas');
    if (atlasCanvas) {
      sheetResizeObserver = new ResizeObserver(() => {
        recomputeHeights();
      });
      sheetResizeObserver.observe(atlasCanvas);
    }
  }

  // Recomputa em orientationchange
  window.addEventListener('orientationchange', () => {
    recomputeHeights();
  });

  // Fallback para navegadores sem ResizeObserver
  window.addEventListener('resize', () => {
    recomputeHeights();
  });
}
