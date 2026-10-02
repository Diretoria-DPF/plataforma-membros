/**
 * discovery.js — o aluno descobre as fichas revisadas (PR 3.2, M4).
 *  - Chip "Novo: N fichas revisadas" na barra quando há mais revisadas do
 *    que da última vez que o aluno viu (localStorage); tocar abre o
 *    navegador já filtrado em "Revisadas".
 *  - Progresso "X de N fichas revisadas exploradas" (Meu estudo), contado
 *    pelo histórico de seleções.
 * Sem fichas revisadas (N = 0), nada aparece.
 */

const SEEN_KEY = 'atlas-revisadas-vistas';

function readSeen(storage) {
  try { return Number(storage.getItem(SEEN_KEY)) || 0; } catch (e) { return 0; }
}
function writeSeen(storage, n) {
  try { storage.setItem(SEEN_KEY, String(n)); } catch (e) { /* modo privado */ }
}

/** Mostra o chip? (pura, para teste) */
export function shouldShowNewChip(count, seen) {
  return count > 0 && count > seen;
}

/**
 * @param {{ host: HTMLElement, count: number, onOpen: () => void, storage?: Storage }} p
 * @returns {HTMLElement|null} o chip, se mostrado
 */
export function mountNewReviewedChip({ host, count, onOpen, storage = globalThis.localStorage }) {
  if (!host || !shouldShowNewChip(count, readSeen(storage))) return null;
  const { h } = window.LaiftDom;
  const label = `Novo: ${count} ficha${count === 1 ? '' : 's'} revisada${count === 1 ? '' : 's'}`;
  const chip = h('button', {
    type: 'button', className: 'atlas-new-reviewed', 'aria-label': `${label} pelo conselho. Abrir no navegador.`, text: `✓ ${label}`,
    onClick: () => { writeSeen(storage, count); chip.remove(); onOpen(); },
  });
  host.appendChild(chip);
  return chip;
}

/**
 * Fichas revisadas já abertas pelo aluno (histórico de seleções).
 * @param {Array<{type?: string, sid?: string}>} history
 * @param {(sid: string) => string|null} statusOf
 * @param {number} total
 */
export function reviewedProgress(history, statusOf, total) {
  const seen = new Set();
  for (const e of history || []) if (e && e.type === 'select' && e.sid && statusOf(e.sid) === 'r') seen.add(String(e.sid).replace(/-[lr]$/, ''));
  return { visited: Math.min(seen.size, total), total };
}
