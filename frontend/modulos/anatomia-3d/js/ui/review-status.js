/**
 * review-status.js — status de revisão por estrutura, sem baixar as fichas
 * (PR 3.2, C2). Lê data/atlas/generated/review-status.json (gerado por
 * scripts/atlas/build-review-status.mjs).
 */

export const STATUS_RANK = Object.freeze({ r: 0, e: 1, l: 2, g: 3 });
/** Peso extra na busca: revisada > em revisão > demais. */
export const SEARCH_BOOST = Object.freeze({ r: 12, e: 6 });
export const STATUS_CHIP = Object.freeze({
  r: { icon: '✓', label: 'Revisada pelo conselho' },
  e: { icon: '⏳', label: 'Em revisão editorial' },
  l: { icon: '○', label: 'Conteúdo antigo' },
  g: { icon: '○', label: 'Conteúdo gerado' },
});

/**
 * @param {{ v?: number, r?: string[], e?: string[], l?: string[], g?: string[] }|null} data
 * @returns {{ statusOf: (sid: string) => ('r'|'e'|'l'|'g'|null), groupStatus: (sids: string[]) => ('r'|'e'|'l'|'g'|null), counts: Record<string, number> }}
 */
export function createReviewStatus(data) {
  const map = new Map();
  for (const k of ['g', 'l', 'e', 'r']) for (const sid of (data && data[k]) || []) map.set(sid, k);
  const statusOf = (sid) => (sid ? map.get(sid) || map.get(String(sid).replace(/-[lr]$/, '')) || null : null);
  const groupStatus = (sids) => {
    let best = null;
    for (const s of sids || []) {
      const st = statusOf(s);
      if (st && (best == null || STATUS_RANK[st] < STATUS_RANK[best])) best = st;
    }
    return best;
  };
  const counts = { r: 0, e: 0, l: 0, g: 0 };
  for (const v of map.values()) counts[v] += 1;
  return { statusOf, groupStatus, counts };
}
