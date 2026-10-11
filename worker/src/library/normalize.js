/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */

// Funções puras: limpam texto e convertem metadados de Crossref, Europe PMC,
// OpenAlex, Unpaywall e PubMed para os valores aceitos pelo banco (CONTRATO-B1 §1 e §5).

const SEARCH_MAX = 4000;
const TEXT_MAX = 150;
const AUTHORS_MAX = 30;
const TAG_RE = /<[^>]*>/g;
const WHITESPACE_CONTROL_RE = /[\t\n\r\f\v]/g;
const CONTROL_RE = /[\u0000-\u001f]/g;
const ENTITY_RE = /&(amp|lt|gt|quot|apos|#[xX][0-9a-fA-F]{1,6}|#[0-9]{1,7});/g;
const ENTITY_MAP = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
]);
const LICENSE_RANK = [
  'cc0', 'pd', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc',
  'cc-by-nc-sa', 'cc-by-nc-nd', 'outra', 'desconhecida',
];
const KNOWN_CC_SLUGS = new Set([
  'cc0', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd',
]);
const CC_URL_RE = /creativecommons\.org\/licenses\/(by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)\//i;
const CC_ZERO_RE = /creativecommons\.org\/publicdomain\/zero\//i;
const CC_MARK_RE = /creativecommons\.org\/publicdomain\/mark/i;
const OA_STATUSES = new Set(['diamond', 'gold', 'green', 'hybrid', 'bronze', 'closed']);
const LANGUAGE_3_TO_2 = new Map([
  ['eng', 'en'],
  ['por', 'pt'],
  ['spa', 'es'],
  ['fra', 'fr'],
  ['deu', 'de'],
  ['ita', 'it'],
]);

// Regras de tipo do Europe PMC, na ordem da tabela do contrato (§5).
const EPMC_TYPE_RULES = [
  { type: 'meta_analise', test: (t) => t === 'meta-analysis' },
  { type: 'revisao_sistematica', test: (t) => t === 'systematic review' },
  { type: 'revisao', test: (t) => t === 'review' },
  { type: 'ensaio_clinico', test: (t) => t.includes('clinical trial') || t === 'randomized controlled trial' },
  { type: 'relato_caso', test: (t) => t === 'case reports' },
  { type: 'diretriz', test: (t) => t.includes('guideline') },
  { type: 'artigo', test: (t) => t === 'journal article' || t === 'research-article' },
];

const AUTHOR_PARSERS = new Map([
  ['crossref', crossrefAuthor],
  ['europepmc', europePmcAuthor],
  ['openalex', openAlexAuthor],
]);

/**
 * Remove tags, decodifica entidades, tira controles e colapsa espaços.
 * @param {unknown} text
 * @returns {string | null} null quando a entrada não é texto
 */
export function stripMarkup(text) {
  if (typeof text !== 'string') return null;
  return decodeEntities(text.replace(TAG_RE, ''))
    .replace(WHITESPACE_CONTROL_RE, ' ')
    .replace(CONTROL_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Texto de busca: NFD, sem acento, minúsculas, pontuação vira espaço, até 4000 caracteres.
 * @param {{ title?: unknown, authors?: Array<{family?: string}>, journal?: unknown, journalAbbrev?: unknown, doi?: unknown, pmid?: unknown }} [record]
 * @returns {string}
 */
export function searchNorm(record) {
  const r = record ?? {};
  const families = Array.isArray(r.authors) ? r.authors.map((a) => a?.family) : [];
  const parts = [r.title, ...families, r.journal, r.journalAbbrev, r.doi, r.pmid]
    .filter((p) => p != null)
    .map(String);
  return parts.join(' ')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, SEARCH_MAX)
    .trim();
}

/**
 * Converte a licença declarada por uma fonte para um valor do CHECK de licença.
 * @param {'crossref'|'europepmc'|'openalex'|'unpaywall'} source
 * @param {unknown} raw
 * @param {number} [now] epoch em ms (para o início futuro do Crossref)
 * @returns {string}
 */
export function normalizeLicense(source, raw, now = Date.now()) {
  if (source === 'crossref') return licenseFromCrossref(raw, now);
  if (source === 'europepmc' || source === 'openalex' || source === 'unpaywall') {
    return licenseFromSlug(raw);
  }
  throw new TypeError(`Fonte de licença desconhecida: ${source}`);
}

/**
 * Escolhe a licença mais restritiva de uma lista e diz se as fontes discordam.
 * @param {string[]} list
 * @returns {{ license: string, conflict: boolean }}
 */
export function mostRestrictive(list) {
  const known = (Array.isArray(list) ? list : [])
    .filter((v) => v !== 'desconhecida' && LICENSE_RANK.includes(v));
  if (known.length === 0) return { license: 'desconhecida', conflict: false };
  const license = known.reduce((worst, v) => (rankOf(v) > rankOf(worst) ? v : worst));
  return { license, conflict: new Set(known).size > 1 };
}

/**
 * @param {unknown} raw
 * @returns {'diamond'|'gold'|'green'|'hybrid'|'bronze'|'closed'|'desconhecido'}
 */
export function normalizeOaStatus(raw) {
  const text = lower(raw);
  return OA_STATUSES.has(text) ? text : 'desconhecido';
}

/**
 * Tipo do artigo: Europe PMC primeiro (ordem da tabela), depois OpenAlex, depois Crossref.
 * @param {{ europepmcPubTypes?: unknown, openalexType?: unknown, crossrefType?: unknown }} [sources]
 * @returns {string}
 */
export function normalizeType(sources) {
  const s = sources ?? {};
  const epmcTypes = lowerList(s.europepmcPubTypes);
  const fromEpmc = EPMC_TYPE_RULES.find((rule) => epmcTypes.some((t) => rule.test(t)));
  if (fromEpmc) return fromEpmc.type;
  const openalex = lower(s.openalexType);
  if (openalex === 'review') return 'revisao';
  if (openalex === 'article') return 'artigo';
  return lower(s.crossrefType) === 'journal-article' ? 'artigo' : 'outro';
}

/**
 * Autores normalizados: até 30 na lista, authorCount é a contagem real de válidos.
 * @param {'crossref'|'europepmc'|'openalex'} source
 * @param {unknown} raw lista de autores como vem da fonte
 * @returns {{ authors: Array<{family: string, given: string}>, authorCount: number }}
 */
export function normalizeAuthors(source, raw) {
  const parse = AUTHOR_PARSERS.get(source);
  if (!parse) throw new TypeError(`Fonte de autores desconhecida: ${source}`);
  const list = Array.isArray(raw) ? raw : [];
  const valid = list.map(parse).filter(Boolean);
  return { authors: valid.slice(0, AUTHORS_MAX), authorCount: valid.length };
}

/**
 * @param {unknown} value número ou texto que começa com o ano
 * @returns {number | null} ano entre 1800 e 2100
 */
export function normalizeYear(value) {
  const year = typeof value === 'number' ? value : parseLeadingYear(value);
  return Number.isInteger(year) && year >= 1800 && year <= 2100 ? year : null;
}

/**
 * @param {unknown} value
 * @returns {string | null} código de duas letras minúsculas
 */
export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const primary = value.trim().toLowerCase().split(/[-_]/)[0];
  if (/^[a-z]{2}$/.test(primary)) return primary;
  return LANGUAGE_3_TO_2.get(primary) ?? null;
}

/**
 * @param {unknown} text
 * @param {number} max
 * @returns {string | null}
 */
export function clip(text, max) {
  return typeof text === 'string' ? text.slice(0, max) : null;
}

// ---------- internos ----------

function lower(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function lowerList(value) {
  const items = Array.isArray(value) ? value : [value];
  return items.map(lower).filter(Boolean);
}

function rankOf(license) {
  return LICENSE_RANK.indexOf(license);
}

function decodeEntities(text) {
  return text.replace(ENTITY_RE, (_match, name) => decodeEntity(name));
}

function decodeEntity(name) {
  if (ENTITY_MAP.has(name)) return ENTITY_MAP.get(name);
  const isHex = name[1] === 'x' || name[1] === 'X';
  const code = isHex ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
  return isValidCodePoint(code) ? String.fromCodePoint(code) : '';
}

function isValidCodePoint(code) {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
}

function parseLeadingYear(value) {
  const match = typeof value === 'string' ? value.trim().match(/^(\d{4})(?!\d)/) : null;
  return match ? Number(match[1]) : NaN;
}

function licenseFromSlug(raw) {
  const slug = lower(raw).replace(/\s+/g, '-');
  if (!slug) return 'desconhecida';
  if (slug === 'public-domain') return 'pd';
  return KNOWN_CC_SLUGS.has(slug) ? slug : 'outra';
}

function licenseFromCrossref(raw, now) {
  if (!Array.isArray(raw)) return 'desconhecida';
  const values = raw
    .filter((item) => isUsableCrossrefLicense(item, now))
    .map((item) => licenseFromUrl(item.URL));
  return mostRestrictive(values).license;
}

function isUsableCrossrefLicense(item, now) {
  if (!item || typeof item.URL !== 'string') return false;
  if (!['vor', 'unspecified'].includes(item['content-version'])) return false;
  return !startsInFuture(item.start, now);
}

function startsInFuture(start, now) {
  const ts = start?.timestamp ?? Date.parse(start?.['date-time'] ?? '');
  return Number.isFinite(ts) && ts > now;
}

function licenseFromUrl(url) {
  const cc = url.match(CC_URL_RE);
  if (cc) return `cc-${cc[1].toLowerCase()}`;
  if (CC_ZERO_RE.test(url)) return 'cc0';
  if (CC_MARK_RE.test(url)) return 'pd';
  return 'outra';
}

function crossrefAuthor(a) {
  if (!a || typeof a !== 'object') return null;
  return typeof a.family === 'string' ? person(a.family, a.given) : person(a.name, '');
}

function europePmcAuthor(a) {
  if (!a || typeof a !== 'object') return null;
  return a.lastName ? person(a.lastName, a.firstName) : person(a.collectiveName, '');
}

function openAlexAuthor(a) {
  const name = stripMarkup(a?.author?.display_name);
  if (!name) return null;
  const words = name.split(' ');
  return person(words[words.length - 1], words.slice(0, -1).join(' '));
}

function person(family, given) {
  const familyText = clip(stripMarkup(family), TEXT_MAX);
  if (!familyText) return null;
  return { family: familyText, given: clip(stripMarkup(given), TEXT_MAX) ?? '' };
}
