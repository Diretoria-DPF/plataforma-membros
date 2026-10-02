/**
 * structure-groups.js — uma linha por estrutura, não por arquivo/lado.
 *
 * O índice (generated/structures*.json) tem um sid por lado ("za:kidney-l",
 * "za:kidney-r") e, nos órgãos HRA, um por sexo ("za:vh-f-hilum-of-kidney-l",
 * "za:vh-m-…"). Listar cada sid deixava navegador, busca e rótulos com o
 * mesmo nome repetido até 4 vezes (crime C3 da Onda 3). Aqui as entradas
 * viram grupos por sistema + nome base; o grupo guarda todos os sids e um
 * `primary` — o que abre ao clicar.
 */

import { normalize } from './search-index.js';

const HRA_SEX_RE = /^za:vh-([mf])-/;
const SIDE_SUFFIX_RE = /-[lr]$/;

/** sid sem o sufixo de lado ("za:kidney-r" → "za:kidney"). */
export function baseSid(sid) {
  return String(sid || '').replace(SIDE_SUFFIX_RE, '');
}

/** Nome de exibição (mesmo fallback do navegador e de main.js labelFor). */
export function baseName(entry) {
  const names = (entry && entry.names) || {};
  return names.pt || names.en || names.la || (entry && entry.englishName) || baseSid(entry && entry.sid);
}

/** Chave do grupo: sistema + nome base normalizado (sem lado nem sexo). */
export function groupKeyOf(entry) {
  return `${entry.system || ''}|${normalize(baseName(entry))}`;
}

/**
 * Ordem de preferência do sid que representa o grupo: corpo Z-Anatomy antes
 * do órgão HRA; no HRA, o do sexo atual (o arquivo do outro sexo não é o
 * carregado — ver assets.findAsset); depois o lado direito, por convenção.
 */
function rank(entry, sex) {
  const hra = HRA_SEX_RE.exec(entry.sid || '');
  let r = 0;
  if (hra) r += hra[1] === String(sex || 'M').toLowerCase() ? 10 : 20;
  if (entry.side === 'l' || entry.side === 'L') r += 1;
  return r;
}

/** Lados presentes no grupo, já no rótulo PT: "E", "D" ou "E/D". */
export function sideLabel(sides) {
  const set = new Set([...(sides || [])].map((s) => String(s).toLowerCase()));
  if (set.has('l') && set.has('r')) return 'E/D';
  if (set.has('l')) return 'E';
  if (set.has('r')) return 'D';
  return '';
}

/**
 * Agrupa entradas mantendo a ordem da primeira aparição de cada grupo.
 * @param {Array<Object>} entries
 * @param {{ sex?: string }} [opts]
 * @returns {Array<{ key: string, sid: string, entry: Object, sids: string[], sides: string[], name: string, hasLeft: boolean, hasRight: boolean }>}
 */
export function groupEntries(entries, { sex } = {}) {
  const groups = new Map();
  for (const entry of entries || []) {
    if (!entry || !entry.sid) continue;
    const key = groupKeyOf(entry);
    let g = groups.get(key);
    if (!g) {
      g = { key, sid: entry.sid, entry, sids: [], sides: [], name: baseName(entry) };
      groups.set(key, g);
    } else if (rank(entry, sex) < rank(g.entry, sex)) {
      g.sid = entry.sid;
      g.entry = entry;
    }
    g.sids.push(entry.sid);
    if (entry.side && !g.sides.includes(entry.side)) g.sides.push(entry.side);
  }
  for (const g of groups.values()) {
    g.hasLeft = g.sides.some((x) => String(x).toLowerCase() === 'l') || g.sids.some((x) => x.endsWith('-l'));
    g.hasRight = g.sides.some((x) => String(x).toLowerCase() === 'r') || g.sids.some((x) => x.endsWith('-r'));
  }
  return [...groups.values()];
}

/**
 * Resultados de busca, um por grupo, na posição do melhor escore do grupo;
 * o sid é o principal do grupo e `sideText` traz o selo (E, D, E/D).
 * @param {Array<{sid: string}>} raw resultado de search() já ordenado
 * @param {Map<string, Object>} entryBySid
 * @param {{ sex?: string }} [opts]
 */
export function collapseResults(raw, entryBySid, { sex } = {}) {
  const byKey = new Map();
  for (const r of raw || []) {
    const entry = entryBySid && entryBySid.get(r.sid);
    const key = entry ? groupKeyOf(entry) : r.sid;
    if (!byKey.has(key)) byKey.set(key, { best: r, entries: [] });
    if (entry) byKey.get(key).entries.push(entry);
  }
  return [...byKey.values()].map(({ best, entries }) => {
    if (!entries.length) return best;
    const [g] = groupEntries(entries, { sex });
    return { ...best, sid: g.sid, side: g.entry.side || null, sideText: sideLabel(g.sides) };
  });
}

/**
 * sids onde procurar a ficha de `sid`, em ordem: ele mesmo, o sid sem lado
 * e os demais do mesmo grupo — a ficha gravada num lado vale para o outro.
 * @param {string} sid
 * @param {string[]} [groupSids]
 */
export function contentCandidates(sid, groupSids = []) {
  const out = [sid, baseSid(sid), ...groupSids];
  return out.filter((x, i) => x && out.indexOf(x) === i);
}
