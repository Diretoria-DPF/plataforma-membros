/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * library/identifiers.js
 * Transforma o texto colado pelo membro (DOI, PMID ou link aceito) em
 * { kind, value }. Tudo o que não for um desses formatos é recusado.
 * Função pura: não faz rede e não guarda link vindo de fora.
 */
import { ValidationError } from '../errors.js';

// Cada segmento depois do "/" não pode ser vazio, "." nem "..": o DOI vai para
// o caminho de 5 hosts e "10.1234/../../funders" sairia do prefixo /works/.
// A mesma expressão está nos CHECKs de sql/029_library.sql.
export const DOI_RE = /^10\.[0-9]{4,9}\/(?!\.{1,2}(?:\/|$))[-._;():a-z0-9]+(?:\/(?!\.{1,2}(?:\/|$))[-._;():a-z0-9]+)*$/;
export const PMID_RE = /^[1-9][0-9]{0,9}$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PMC_RE = /^PMC\d{1,10}$/;

const MAX_TEXT_LENGTH = 300;
const MAX_DOI_LENGTH = 200;
const INVALID_MESSAGE = 'Informe um DOI (ex.: 10.1000/xyz) ou um PMID (só números).';
const DOI_HOSTS = new Set(['doi.org', 'dx.doi.org']);
const PUBMED_HOST = 'pubmed.ncbi.nlm.nih.gov';
const EUROPEPMC_HOST = 'europepmc.org';
const EUROPEPMC_PATH_RE = /^\/(?:article|abstract)\/MED\/([^/]+)\/?$/;
const PUBMED_PATH_RE = /^\/([^/]+)\/?$/;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;
const DOI_PREFIX_RE = /^doi:/i;

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

function invalid() {
  return ValidationError(INVALID_MESSAGE);
}

/** Texto cru: precisa ser string, sem espaços nas pontas e até 300 caracteres. */
function cleanInput(text) {
  if (typeof text !== 'string') throw invalid();
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_TEXT_LENGTH) throw invalid();
  return trimmed;
}

/** DOI após decodificação: minúsculas, até 200 caracteres, regex do Crossref. */
function toDoi(candidate) {
  const value = candidate.toLowerCase();
  if (value.length > MAX_DOI_LENGTH || !DOI_RE.test(value)) throw invalid();
  return { kind: 'doi', value };
}

function toPmid(candidate) {
  if (!PMID_RE.test(candidate)) throw invalid();
  return { kind: 'pmid', value: candidate };
}

function parseDoiLink(url) {
  const path = url.pathname.replace(/^\//, '');
  let decoded;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw invalid();
  }
  return toDoi(decoded);
}

function parsePmidLink(url) {
  if (url.hostname === PUBMED_HOST) {
    const match = PUBMED_PATH_RE.exec(url.pathname);
    if (!match) throw invalid();
    return toPmid(match[1]);
  }
  const match = EUROPEPMC_PATH_RE.exec(url.pathname);
  if (!match) throw invalid();
  return toPmid(match[1]);
}

/** Link https de um host permitido. Qualquer outro host, esquema ou credencial: recusa. */
function parseLink(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw invalid();
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid();
  if (DOI_HOSTS.has(url.hostname)) return parseDoiLink(url);
  if (url.hostname === PUBMED_HOST || url.hostname === EUROPEPMC_HOST) {
    return parsePmidLink(url);
  }
  throw invalid();
}

/** Texto sem link: "doi:" opcional, depois DOI cru ou PMID cru. */
function parseBare(raw) {
  const candidate = raw.replace(DOI_PREFIX_RE, '').trim();
  if (candidate.startsWith('10.')) return toDoi(candidate);
  return toPmid(candidate);
}

/**
 * Lê DOI, PMID ou link aceito e devolve { kind: 'doi' | 'pmid', value }.
 * Lança ValidationError para qualquer outra entrada.
 */
export function parseIdentifier(text) {
  const raw = cleanInput(text);
  if (SCHEME_RE.test(raw)) return parseLink(raw);
  return parseBare(raw);
}

/** Link oficial do DOI: cada segmento codificado. Retorna null se o DOI for inválido. */
export function doiLandingUrl(doi) {
  if (typeof doi !== 'string' || !DOI_RE.test(doi)) return null;
  return 'https://doi.org/' + doi.split('/').map(encodeURIComponent).join('/');
}

/** Link do PubMed pelo PMID. Retorna null se o PMID for inválido. */
export function pubmedLandingUrl(pmid) {
  if (typeof pmid !== 'string' || !PMID_RE.test(pmid)) return null;
  return 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/';
}

/** Link do PubMed Central pelo PMCID. Retorna null se não casar PMC + dígitos. */
export function pmcUrl(pmcid) {
  if (typeof pmcid !== 'string' || !PMC_RE.test(pmcid)) return null;
  return 'https://pmc.ncbi.nlm.nih.gov/articles/' + pmcid + '/';
}
