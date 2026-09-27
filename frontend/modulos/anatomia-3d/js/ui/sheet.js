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
 * Medidas: em vez de reimplementar em JS a conta de `dvh`/`min(40vw,400px)`
 * dos tokens (frágil e duplicaria css/tokens-atlas.css), cada estado é
 * MEDIDO de verdade no DOM: alterna `data-sheet-state` nos três valores e lê
 * `getBoundingClientRect()` de cada um, tudo dentro do mesmo tick de script
 * (sem `await` no meio) — o navegador só pinta depois que o script termina,
 * então não há "flicker" visível. Isso também significa que qualquer ajuste
 * futuro de breakpoint/token em css/atlas.css é respeitado automaticamente,
 * sem precisar tocar este arquivo.
 */
import { on, emit, EVENTS } from '../core/bus.js';
import { set as storeSet } from '../core/store.js';
import { isValidSheetState } from '../core/contracts.js';

const STATES = ['peek', 'half', 'full'];
const RUBBER_BAND_FACTOR = 0.35;
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

function isLandscapeSheet() {
  return window.matchMedia('(orientation: landscape) and (max-height: 599px)').matches;
}

function sizeProp() {
  return axis === 'y' ? 'height' : 'width';
}

function pointerPos(evt) {
  return axis === 'y' ? evt.clientY : evt.clientX;
}

/** Mede as três alturas/larguras reais (px) para o breakpoint/eixo atuais. */
function measureStates() {
  const prop = sizeProp();
  const prevState = sheetEl.getAttribute('data-sheet-state');
  const prevInline = sheetEl.style[prop];

  // Ensure inline style is removed before measuring
  sheetEl.style[prop] = '';
  // Force browser to recalculate layout
  void sheetEl.offsetHeight;

  const sizes = {};
  for (const state of STATES) {
    sheetEl.setAttribute('data-sheet-state', state);
    // Force browser to recalculate after attribute change
    void sheetEl.offsetHeight;
    const rect = sheetEl.getBoundingClientRect();
    sizes[state] = axis === 'y' ? rect.height : rect.width;
  }

  sheetEl.setAttribute('data-sheet-state', prevState);
  sheetEl.style[prop] = prevInline;

  // Fallback: se as medições falharam ou retornaram valores iguais (problema com dvh/CSS vars),
  // use valores calculados baseado no viewport (igual ao fallback em pickSnap)
  if (sizes.peek === sizes.half && sizes.half === sizes.full) {
    const containerH = document.documentElement.clientHeight || window.innerHeight;
    const containerW = document.documentElement.clientWidth || window.innerWidth;
    const dim = axis === 'y' ? containerH : containerW;
    sizes.peek = 96;
    sizes.half = Math.round(dim * 0.45);
    sizes.full = Math.round(dim * 0.90);
  }

  return sizes;
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
  // Limpa o height inline ANTES de medir, senão a regra CSS [data-sheet-state] não será aplicada
  sheetEl.style[sizeProp()] = '';
  const sizes = measureStates();
  currentState = state;
  sheetEl.setAttribute('data-sheet-state', state);
  syncAria(state);
  if (!silent) {
    const heightPx = Math.round(sizes[state]);
    storeSet({ sheetState: state });
    emit(EVENTS.SHEET_SNAP, { state, heightPx });
  }
}

function syncAria(state) {
  sheetEl.setAttribute('aria-modal', 'false');
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
  on(EVENTS.STRUCTURE_SELECT, ({ sid }) => {
    if (sid) {
      if (currentState === 'peek') commit('half');
    } else if (currentState !== 'peek') {
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

  currentState = isValidSheetState(sheetEl.getAttribute('data-sheet-state'))
    ? sheetEl.getAttribute('data-sheet-state')
    : 'peek';
  syncAria(currentState);

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

  window.addEventListener('resize', () => {
    // Só remedimos/realinhamos se não estiver no meio de um arraste.
    if (!dragging) commit(currentState, { silent: true });
  });
}
