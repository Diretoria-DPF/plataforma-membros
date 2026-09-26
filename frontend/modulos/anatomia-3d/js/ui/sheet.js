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
const FLICK_VELOCITY_PX_S = 800;
const RUBBER_BAND_FACTOR = 0.35;
// Janela de amostras usada para estimar a velocidade no momento de soltar
// (ver docs/ATLAS_UX_SPEC.md §2.3) — só as amostras dos últimos N ms contam,
// para um arraste que parou antes de soltar não "herdar" velocidade antiga.
const VELOCITY_WINDOW_MS = 120;

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
  sheetEl.style[prop] = ''; // garante que a medida vem da classe/regra CSS, não de um arraste anterior
  const sizes = {};
  for (const state of STATES) {
    sheetEl.setAttribute('data-sheet-state', state);
    const rect = sheetEl.getBoundingClientRect();
    sizes[state] = axis === 'y' ? rect.height : rect.width;
  }
  sheetEl.setAttribute('data-sheet-state', prevState);
  sheetEl.style[prop] = prevInline;
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

function velocityPxPerSec() {
  const now = dragSamples[dragSamples.length - 1];
  if (!now) return 0;
  let ref = dragSamples[0];
  for (let i = dragSamples.length - 1; i >= 0; i--) {
    if (now.t - dragSamples[i].t <= VELOCITY_WINDOW_MS) ref = dragSamples[i];
    else break;
  }
  const dt = now.t - ref.t;
  if (dt <= 0) return 0;
  return ((now.size - ref.size) / dt) * 1000;
}

/** Aplica o estado resolvido: emite o evento, atualiza o store e anima via CSS. */
function commit(state, { silent } = {}) {
  if (!isValidSheetState(state)) return;
  const sizes = measureStates();
  currentState = state;
  sheetEl.style[sizeProp()] = '';
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
  if (dragSamples.length > 24) dragSamples.shift();
}

function onPointerUp(evt) {
  if (!dragging || evt.pointerId !== dragPointerId) return;
  dragging = false;
  sheetEl.style.transition = '';
  const velocity = velocityPxPerSec();
  let target;
  if (Math.abs(velocity) > FLICK_VELOCITY_PX_S) {
    // "Flick" rápido: vai direto para o estado EXTREMO na direção do gesto
    // (peek↔full), ignorando a posição — exemplo explícito do §2.3.
    target = velocity > 0 ? 'full' : 'peek';
  } else {
    const last = dragSamples[dragSamples.length - 1];
    target = nearestState(last ? last.size : dragStartSize, dragSizes);
  }
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
