/**
 * content-merge.js — junta as camadas de conteúdo de uma ficha (PR 3.2, D1).
 *
 *   curated/<sistema>.json  fichas curadas (curador + revisor + conselho)
 *   legacy/content/…        fichas antigas em PT (vinculadas pelo nome)
 *   content/<sistema>.json  gerado pelo pipeline (Wikidata/Wikipédia/HRA)
 *
 * Ordem de precedência: curado > legado > gerado. O pipeline nunca escreve
 * em curated/, então uma nova geração não apaga a ficha curada.
 */

function dedupeSources(list) {
  const seen = new Set();
  return list.filter((src) => {
    const k = JSON.stringify(src);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Gerado + legado (o texto PT legado vence; células do HRA ficam). */
export function mergeContent(gen, leg) {
  const merged = { ...(gen || {}), ...(leg || {}) };
  if (gen && leg) {
    merged.ids = { ...(gen.ids || {}), ...(leg.ids || {}) };
    const genCells = gen.histology && gen.histology.cells && gen.histology.cells.length;
    const legCells = leg.histology && leg.histology.cells && leg.histology.cells.length;
    if (genCells && !legCells) merged.histology = { ...(leg.histology || {}), ...gen.histology };
    if (!leg.summary_pt && gen.summary_pt) merged.summary_pt = gen.summary_pt;
    merged.sources = dedupeSources([...(leg.sources || []), ...(gen.sources || [])]);
  }
  return merged;
}

const TEXT_BLOCKS = ['summary_pt', 'anatomy', 'histology', 'clinical', 'mnemonic_pt'];

/**
 * Curado por cima de (gerado + legado). Um bloco preenchido no curado
 * substitui o bloco inteiro de baixo — e as fontes desse bloco também, para
 * nenhuma fonte antiga ficar "assinando" um texto que não escreveu.
 * @returns {Object|null}
 */
export function mergeLayers({ curated = null, generated = null, legacy = null } = {}) {
  const base = generated || legacy ? mergeContent(generated, legacy) : null;
  if (!curated) return base;
  if (!base) return { ...curated };
  const merged = { ...base, ...curated };
  merged.ids = { ...(base.ids || {}), ...(curated.ids || {}) };
  const replaced = TEXT_BLOCKS.filter((k) => curated[k] !== undefined && curated[k] !== null && curated[k] !== '');
  const keepFromBase = (base.sources || []).filter((src) => {
    const top = String((src && src.field) || '').split('.')[0];
    return !replaced.includes(top);
  });
  merged.sources = dedupeSources([...(curated.sources || []), ...keepFromBase]);
  merged.review = curated.review || base.review;
  return merged;
}
