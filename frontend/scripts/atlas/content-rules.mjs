/**
 * content-rules.mjs — regras anti-referência inventada (PR 3.2, A.5).
 *
 * - Texto de conteúdo não pode ter PMID, DOI nem URL.
 * - sources[] de obra (textbook/fipat/atlas, ou com obraId) precisa citar um
 *   obraId de data/atlas/fontes.json — fora dela só com exception=true e
 *   justificativa (≥ 20 caracteres), que a revisão humana confere.
 * - URL em sources[] só dos domínios permitidos (fontes.json).
 */
const PMID_RE = /\bPMID\s*:?\s*\d{4,}/i;
const DOI_RE = /\b(doi\s*:?\s*)?10\.\d{4,9}\/[^\s"']+/i;
const URL_RE = /\bhttps?:\/\/[^\s"')]+/i;
const BOOK_TYPES = new Set(['textbook', 'fipat', 'atlas']);

/** Tipos de referência proibida encontrados num texto. */
export function findForbiddenRefs(text) {
  if (typeof text !== 'string' || !text) return [];
  const found = [];
  if (PMID_RE.test(text)) found.push('PMID');
  if (DOI_RE.test(text)) found.push('DOI');
  if (URL_RE.test(text)) found.push('URL');
  return found;
}

/** URL dentro dos domínios permitidos (host igual ou subdomínio). */
export function isAllowedUrl(url, domains) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  return (domains || []).some((d) => host === d || host.endsWith(`.${d.replace(/^www\./, '')}`) || host === d.replace(/^www\./, ''));
}

/**
 * Confere sources[] contra fontes.json.
 * @param {Array<Object>} sources
 * @param {{ obraIds: Set<string>, domains: string[] }} fontes
 * @param {string} label
 * @returns {string[]} erros
 */
export function checkSources(sources, fontes, label) {
  const errors = [];
  for (const [i, src] of (sources || []).entries()) {
    if (!src || typeof src !== 'object') continue;
    const where = `${label} sources[${i}]`;
    const isBook = BOOK_TYPES.has(src.type) || src.obraId !== undefined;
    if (src.exception === true) {
      if (typeof src.justificativa !== 'string' || src.justificativa.trim().length < 20) {
        errors.push(`[fonte] ${where}: exception=true exige justificativa com pelo menos 20 caracteres`);
      }
    } else if (isBook) {
      if (!src.obraId) errors.push(`[fonte] ${where}: fonte de obra sem obraId (precisa existir em fontes.json)`);
      else if (!fontes.obraIds.has(src.obraId)) errors.push(`[fonte] ${where}: obraId "${src.obraId}" não existe em fontes.json`);
    }
    if (src.url) {
      if (!isAllowedUrl(src.url, fontes.domains)) errors.push(`[fonte] ${where}: URL fora dos domínios permitidos (${src.url})`);
    }
    for (const key of ['ref', 'capitulo', 'justificativa']) {
      const bad = findForbiddenRefs(src[key]).filter((k) => k !== 'URL' || key !== 'ref' || !src.url);
      if (bad.length) errors.push(`[fonte] ${where}.${key}: contém ${bad.join('/')} (proibido citar PMID/DOI/URL no texto)`);
    }
  }
  return errors;
}

/** Todos os textos de um registro, fora sources[] e ids. */
export function collectTexts(obj, path = '') {
  const out = [];
  if (typeof obj === 'string') { out.push([path, obj]); return out; }
  if (Array.isArray(obj)) { obj.forEach((v, i) => out.push(...collectTexts(v, `${path}[${i}]`))); return out; }
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'sources' || k === 'ids' || k === 'review') continue;
      out.push(...collectTexts(v, path ? `${path}.${k}` : k));
    }
  }
  return out;
}

/** Confere um registro inteiro (texto + fontes). */
export function checkRecord(record, fontes, label) {
  const errors = [];
  for (const [field, text] of collectTexts(record)) {
    const bad = findForbiddenRefs(text);
    if (bad.length) errors.push(`[fonte] ${label} ${field}: contém ${bad.join('/')} no texto (proibido)`);
  }
  errors.push(...checkSources(record && record.sources, fontes, label));
  return errors;
}

export function loadFontes(json) {
  return {
    obraIds: new Set((json.obras || []).map((o) => o.id)),
    domains: json.dominiosPermitidos || [],
  };
}
