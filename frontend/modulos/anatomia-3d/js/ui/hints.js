/**
 * hints.js — dicas contextuais do Atlas (Onda 2).
 * ---------------------------------------------------------------------------
 * Uma pílula por vez (role="status" → leitor de tela anuncia sem
 * interromper), com × de 44 px; some sozinha (6 s; a de inatividade, 10 s).
 *
 * Regras anti-aborrecimento (canShow, testadas em scripts/atlas/hints.test.mjs):
 *   - cada dica aparece 1 vez na vida (localStorage `atlas.hints.v1`);
 *   - no máximo 3 por sessão;
 *   - nunca com a apresentação aberta, com o quiz em andamento ou com o
 *     aluno digitando;
 *   - 2 s de intervalo entre uma dica e outra.
 */

export const HINTS_KEY = 'atlas.hints.v1';
export const MAX_PER_SESSION = 3;
export const GAP_MS = 2000;
export const IDLE_MS = 30000;

export const HINTS = Object.freeze({
  'primeira-selecao': { text: 'Deslize a ficha para cima para ver mais.', ms: 6000 },
  inatividade: { text: 'Toque numa estrutura para começar.', ms: 10000 },
  ferramentas: { text: 'Aqui ficam zoom, vistas, raio-X e corte.', ms: 6000 },
});

/**
 * Pode mostrar a dica `id` agora?
 * @param {string} id
 * @param {{ seen: Set<string>, sessionCount: number, onboardingOpen?: boolean, quizRunning?: boolean,
 *           typing?: boolean, activeHint?: (string|null), lastHiddenAt?: number, now?: number }} st
 */
export function canShow(id, st) {
  if (!HINTS[id] || !st) return false;
  if (st.seen && st.seen.has(id)) return false;
  if ((st.sessionCount || 0) >= MAX_PER_SESSION) return false;
  if (st.onboardingOpen || st.quizRunning || st.typing) return false;
  if (st.activeHint) return false;
  const now = st.now != null ? st.now : Date.now();
  if (st.lastHiddenAt && now - st.lastHiddenAt < GAP_MS) return false;
  return true;
}

/**
 * Que dica o evento pede (antes das regras de canShow)?
 * @param {{ type: 'select'|'tools-open'|'idle', sid?: string, idleMs?: number, hasSelection?: boolean }} event
 * @returns {(string|null)}
 */
export function hintFor(event) {
  if (!event) return null;
  if (event.type === 'select' && event.sid) return 'primeira-selecao';
  if (event.type === 'tools-open') return 'ferramentas';
  if (event.type === 'idle' && !event.hasSelection && (event.idleMs || 0) >= IDLE_MS) return 'inatividade';
  return null;
}

/** Dica a mostrar para o evento, já aplicando as regras (null = nenhuma). */
export function nextHint(st, event) {
  const id = hintFor(event);
  return id && canShow(id, st) ? id : null;
}

export function readSeen(storage) {
  try {
    const raw = storage && storage.getItem(HINTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : []);
  } catch (e) {
    return new Set();
  }
}
export function writeSeen(storage, seen) {
  try { if (storage) storage.setItem(HINTS_KEY, JSON.stringify([...seen])); } catch (e) { /* bloqueado */ }
}

/**
 * @param {{ bus: Object, store: Object, storage?: Storage, isOnboardingOpen?: () => boolean }} opts
 */
export function createHints({ bus, store, storage, isOnboardingOpen = () => false }) {
  const { h } = window.LaiftDom;
  const seen = readSeen(storage);
  let sessionCount = 0;
  let activeHint = null;
  let lastHiddenAt = 0;
  let hideTimer = null;
  let pending = null; // dica barrada só por "agora não" (intervalo, apresentação)
  let lastInteraction = Date.now();

  const text = h('span', { className: 'atlas-hint-text' }, []);
  const closeBtn = h('button', { type: 'button', className: 'atlas-hint-close', 'aria-label': 'Dispensar dica' }, ['×']);
  const pill = h('div', { className: 'atlas-hint', role: 'status', hidden: true }, [text, closeBtn]);
  closeBtn.addEventListener('click', () => hide());
  document.body.appendChild(pill);

  const typing = () => {
    const a = document.activeElement;
    return !!(a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)));
  };
  const state = () => ({
    seen, sessionCount, activeHint, lastHiddenAt, now: Date.now(),
    onboardingOpen: isOnboardingOpen(),
    quizRunning: store.get().mode === 'quiz',
    typing: typing(),
  });

  function show(id) {
    activeHint = id;
    sessionCount += 1;
    seen.add(id);
    writeSeen(storage, seen);
    text.textContent = HINTS[id].text;
    pill.dataset.hint = id;
    pill.hidden = false;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HINTS[id].ms);
  }
  function hide() {
    if (!activeHint) return;
    clearTimeout(hideTimer);
    pill.hidden = true;
    activeHint = null;
    lastHiddenAt = Date.now();
    if (pending) setTimeout(flush, GAP_MS);
  }
  function offer(event) {
    const id = nextHint(state(), event);
    if (id) { pending = null; show(id); return; }
    // Barrada só por um "agora não"? Guarda para tentar de novo.
    const wanted = hintFor(event);
    if (wanted && !seen.has(wanted) && sessionCount < MAX_PER_SESSION) pending = event;
  }
  function flush() {
    if (pending) { const ev = pending; pending = null; offer(ev); }
  }

  const offs = [
    bus.on(bus.EVENTS.STRUCTURE_SELECT, ({ sid }) => { lastInteraction = Date.now(); if (sid) offer({ type: 'select', sid }); }),
    bus.on('tools:open', () => offer({ type: 'tools-open' })),
  ];
  const touch = () => { lastInteraction = Date.now(); };
  ['pointerdown', 'keydown', 'wheel', 'focusin'].forEach((t) => document.addEventListener(t, touch, true));
  document.addEventListener('scroll', touch, true);
  // Inatividade: confere a cada 5 s até a dica sair (ou já ter saído antes).
  const idleTimer = setInterval(() => {
    if (seen.has('inatividade')) { clearInterval(idleTimer); return; }
    offer({ type: 'idle', idleMs: Date.now() - lastInteraction, hasSelection: !!store.get().selectedSid });
  }, 5000);

  return {
    flush,
    hide,
    getActive: () => activeHint,
    destroy() {
      offs.forEach((off) => typeof off === 'function' && off());
      clearInterval(idleTimer);
      pill.remove();
    },
  };
}
