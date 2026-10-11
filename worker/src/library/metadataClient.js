/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * library/metadataClient.js
 * Única saída de rede da Biblioteca (CONTRATO-B1 §6 e §7). Dado um DOI ou PMID
 * já validado, consulta Crossref, Europe PMC, OpenAlex (e, com e-mail de
 * contato, PubMed e Unpaywall) só em hosts fixos, uma chamada por vez, com
 * tempo limite, no máximo uma repetição e avisos no lugar de falhas. Devolve
 * um registro pronto para gravar. Nenhuma URL vinda das fontes é guardada ou
 * devolvida: o link oficial é montado por identifiers.js.
 */
import { ValidationError } from '../errors.js';
import { isValidEmail } from '../security.js';
import { DOI_RE, PMID_RE, PMC_RE, parseIdentifier, doiLandingUrl, pubmedLandingUrl } from './identifiers.js';
import { LIBRARY_LIMITS } from './limits.js';
import {
  stripMarkup, searchNorm, normalizeLicense, mostRestrictive, normalizeOaStatus,
  normalizeType, normalizeAuthors, normalizeYear, normalizeLanguage, clip,
} from './normalize.js';

const CROSSREF_HOST = 'api.crossref.org';
const EUROPEPMC_HOST = 'www.ebi.ac.uk';
const OPENALEX_HOST = 'api.openalex.org';
const PUBMED_HOST = 'eutils.ncbi.nlm.nih.gov';
const UNPAYWALL_HOST = 'api.unpaywall.org';
const ALLOWED_HOSTS = new Set([CROSSREF_HOST, EUROPEPMC_HOST, OPENALEX_HOST, PUBMED_HOST, UNPAYWALL_HOST]);

const MAX_CALLS = 6;
const RETRY_STATUSES = new Set([429, 503]);
const DEFAULT_RETRY_MS = 1000;
const MAX_RETRY_MS = 2000;
const MS_PER_SECOND = 1000;
const USER_AGENT = 'LAIFT-Biblioteca/1.0';
const PUBMED_TOOL = 'laift_biblioteca';
const TIMED_OUT = Symbol('timed-out');
// Devolvido por extract* quando o DOI da resposta não é o pedido.
const DOI_MISMATCH = Symbol('doi-mismatch');

const TITLE_MAX = 500;
const JOURNAL_MAX = 300;
const ABBREV_MAX = 120;
const VOLUME_MAX = 20;
const PAGES_MAX = 30;
const ABSTRACT_MAX = 10000;
const INDEX_MAX_POSITIONS = 5000;

const INVALID_ID_MESSAGE = 'Informe um DOI (ex.: 10.1000/xyz) ou um PMID (só números).';
const FAILURE_MESSAGES = Object.freeze({
  doi: 'Não foi possível obter os dados deste DOI agora. Tente de novo em alguns minutos.',
  pmid: 'Não foi possível obter os dados deste PMID agora. Tente de novo em alguns minutos.',
});
const STOP_WARNING = 'O cadastro atingiu o limite de tempo ou de chamadas; os dados podem estar incompletos.';
const NO_EMAIL_WARNING = 'Sem e-mail de contato configurado; PubMed e Unpaywall não foram consultados.';

// Ordem de prioridade na junção dos campos (e de metadataSources).
const SOURCE_PRIORITY = Object.freeze(['crossref', 'europepmc', 'pubmed', 'openalex', 'unpaywall']);
const SOURCE_LABELS = Object.freeze({
  crossref: 'Crossref', europepmc: 'Europe PMC', pubmed: 'PubMed', openalex: 'OpenAlex', unpaywall: 'Unpaywall',
});
const SOURCE_LOSSES = Object.freeze({
  crossref: 'título, autores e licença podem faltar',
  europepmc: 'resumo e tipo podem faltar',
  pubmed: 'título, autores e DOI podem faltar',
  openalex: 'a situação de acesso aberto pode faltar',
  unpaywall: 'a situação de acesso aberto pode faltar',
});

// ---------- hosts fixos ----------

/** Recusa qualquer URL que não seja https, sem credencial nem porta, num dos 5 hosts do contrato. */
export function assertAllowedUrl(url) {
  let parsed = null;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL fora dos hosts permitidos da Biblioteca.');
  }
  const isAllowed = parsed.protocol === 'https:' && !parsed.username && !parsed.password
    && !parsed.port && ALLOWED_HOSTS.has(parsed.hostname);
  if (!isAllowed) throw new Error('URL fora dos hosts permitidos da Biblioteca.');
}

const encodeQuery = encodeURIComponent;
const encodePath = (doi) => doi.split('/').map(encodeURIComponent).join('/');

const crossrefUrl = (doi, email) => `https://${CROSSREF_HOST}/works/${encodePath(doi)}`
  + (email ? `?mailto=${encodeQuery(email)}` : '');
const europePmcUrl = (query) => `https://${EUROPEPMC_HOST}/europepmc/webservices/rest/search`
  + `?query=${encodeQuery(query)}&resultType=core&format=json`;
const openAlexUrl = (doi) => `https://${OPENALEX_HOST}/works/doi:${encodePath(doi)}`;
const pubmedUrl = (pmid, email) => `https://${PUBMED_HOST}/entrez/eutils/esummary.fcgi`
  + `?db=pubmed&id=${pmid}&retmode=json&tool=${PUBMED_TOOL}&email=${encodeQuery(email)}`;
const unpaywallUrl = (doi, email) => `https://${UNPAYWALL_HOST}/v2/${encodePath(doi)}?email=${encodeQuery(email)}`;

// ---------- transporte ----------

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Lê o corpo como texto parando em maxBytes (null se passar do limite). */
async function readTextLimited(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') {
    const text = await res.text();
    return new TextEncoder().encode(text).length > maxBytes ? null : text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return chunks.join('');
}

async function discardBody(res) {
  try {
    if (res.body && typeof res.body.cancel === 'function') await res.body.cancel();
  } catch {
    // Corpo já fechado: nada a fazer.
  }
}

/** Parse do Retry-After em segundos: limitado a MAX_RETRY_MS; ausente ou ilegível = DEFAULT_RETRY_MS. */
function retryDelayMs(headerValue) {
  const seconds = Number(headerValue);
  if (headerValue == null || headerValue === '' || !Number.isFinite(seconds) || seconds < 0) return DEFAULT_RETRY_MS;
  return Math.min(seconds * MS_PER_SECOND, MAX_RETRY_MS);
}

async function readResponse(fetchImpl, url, signal) {
  const res = await fetchImpl(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    credentials: 'omit',
    redirect: 'error',
    signal,
  });
  if (!res || typeof res.status !== 'number') throw new Error('Resposta inválida da fonte.');
  const maxBytes = LIBRARY_LIMITS.UPSTREAM_MAX_BYTES;
  if (res.status < 200 || res.status >= 300) {
    await discardBody(res);
    return { status: res.status, retryAfter: res.headers?.get?.('retry-after') };
  }
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await discardBody(res);
    return { status: res.status, tooBig: true };
  }
  const text = await readTextLimited(res, maxBytes);
  return text === null ? { status: res.status, tooBig: true } : { status: res.status, text };
}

/** Uma troca com tempo limite. O limite vale também para fetch que ignora o sinal. */
async function exchange(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { controller.abort(); resolve(TIMED_OUT); }, timeoutMs);
  });
  const work = readResponse(fetchImpl, url, controller.signal);
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
    work.catch(() => {});
  }
}

function parseJsonObject(text) {
  try {
    const data = JSON.parse(text);
    return data !== null && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

/** Resume uma troca em { ok, data } ou { ok:false, reason, retryAfterMs? }. */
async function runExchange(fetchImpl, url, timeoutMs) {
  let result = null;
  try {
    result = await exchange(fetchImpl, url, timeoutMs);
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (result === TIMED_OUT) return { ok: false, reason: 'timeout' };
  if (result.tooBig) return { ok: false, reason: 'size' };
  if (result.text === undefined) {
    const retryAfterMs = RETRY_STATUSES.has(result.status) ? retryDelayMs(result.retryAfter) : null;
    return { ok: false, reason: 'http', retryAfterMs };
  }
  const data = parseJsonObject(result.text);
  return data ? { ok: true, data } : { ok: false, reason: 'json' };
}

/** get(url): série, no máximo MAX_CALLS chamadas e IMPORT_BUDGET_MS no total, uma repetição segura. */
function createGetter({ fetchImpl, sleep, now, timeoutMs }) {
  const startedAt = now();
  const budgetMs = LIBRARY_LIMITS.IMPORT_BUDGET_MS;
  let calls = 0;

  const remainingMs = () => budgetMs - (now() - startedAt);
  const isExhausted = () => calls >= MAX_CALLS || remainingMs() <= 0;

  async function send(url) {
    if (isExhausted()) return { ok: false, reason: 'stopped' };
    calls += 1;
    return runExchange(fetchImpl, url, Math.max(1, Math.min(timeoutMs, remainingMs())));
  }

  return async function get(url) {
    assertAllowedUrl(url);
    const first = await send(url);
    if (first.ok || first.retryAfterMs == null || isExhausted()) return first;
    await sleep(first.retryAfterMs);
    return send(url);
  };
}

// ---------- extração por fonte ----------

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const firstOf = (value) => (Array.isArray(value) ? value[0] : value);

function cleanText(value, max) {
  const text = stripMarkup(firstOf(value));
  return text ? clip(text, max) : null;
}

/** Europe PMC e PubMed terminam todo título com um ponto final que a revista não tem. */
function cleanIndexedTitle(value) {
  const title = cleanText(value, TITLE_MAX + 1);
  return title ? clip(title.replace(/\.$/, ''), TITLE_MAX) : null;
}

/** Resumo em texto puro: títulos de seção viram "Seção: ", parágrafos viram espaço. */
function cleanAbstract(raw) {
  if (typeof raw !== 'string') return null;
  const prepared = raw
    .replace(/<(?:\w+:)?title>\s*abstract\s*<\/(?:\w+:)?title>/i, '')
    .replace(/<\/(?:\w+:)?(?:title|h[1-6])>/gi, ': ')
    .replace(/<(?:\w+:)?(?:title|h[1-6])(?:\s[^>]*)?>/gi, ' ')
    .replace(/<\/(?:\w+:)?p>|<br\s*\/?>/gi, ' ');
  return cleanText(prepared, ABSTRACT_MAX);
}

function cleanDoi(value) {
  if (typeof value !== 'string') return null;
  const doi = value.trim().toLowerCase();
  return doi.length <= 200 && DOI_RE.test(doi) ? doi : null;
}

/** DOI de um corpo de resposta, que pode vir como URL ("https://doi.org/10.x/y", OpenAlex). */
function doiFromBody(value) {
  return typeof value === 'string' ? cleanDoi(value.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')) : null;
}

/** O DOI devolvido tem de ser o pedido (sem diferenciar maiúsculas); senão o registro é de outro artigo. */
const sameDoi = (returned, requested) => doiFromBody(returned) === requested;

function cleanPmid(value) {
  const pmid = value == null ? '' : String(value).trim();
  return PMID_RE.test(pmid) ? pmid : null;
}

function cleanPmcid(value) {
  const pmcid = typeof value === 'string' ? value.trim() : '';
  return PMC_RE.test(pmcid) ? pmcid : null;
}

function trailingMatch(value, pattern) {
  const match = typeof value === 'string' ? value.match(pattern) : null;
  return match ? match[1] : null;
}

function limitAuthors(list) {
  return { authors: list.slice(0, LIBRARY_LIMITS.AUTHORS_STORED_MAX), authorCount: list.length };
}

function extractCrossref(body, nowMs, requestedDoi) {
  const m = body?.message;
  if (!isObject(m)) return null;
  if (!sameDoi(m.DOI, requestedDoi)) return DOI_MISMATCH;
  return {
    title: cleanText(m.title, TITLE_MAX),
    ...normalizeAuthors('crossref', m.author),
    journal: cleanText(m['container-title'], JOURNAL_MAX),
    journalAbbrev: cleanText(m['short-container-title'], ABBREV_MAX),
    year: normalizeYear(m.issued?.['date-parts']?.[0]?.[0]),
    volume: cleanText(m.volume, VOLUME_MAX),
    issue: cleanText(m.issue, VOLUME_MAX),
    pages: cleanText(m.page, PAGES_MAX),
    language: normalizeLanguage(m.language),
    license: normalizeLicense('crossref', m.license, nowMs),
    abstract: cleanAbstract(m.abstract),
    crossrefType: m.type,
  };
}

function extractEuropePmc(body, matches) {
  const results = Array.isArray(body?.resultList?.result) ? body.resultList.result : [];
  const r = results.find((item) => isObject(item) && matches(item));
  if (!r) return null;
  const journalInfo = isObject(r.journalInfo) ? r.journalInfo : {};
  return {
    doi: cleanDoi(r.doi),
    pmid: cleanPmid(r.pmid),
    pmcid: cleanPmcid(r.pmcid),
    title: cleanIndexedTitle(r.title),
    ...normalizeAuthors('europepmc', r.authorList?.author),
    journal: cleanText(journalInfo.journal?.title, JOURNAL_MAX),
    journalAbbrev: cleanText(journalInfo.journal?.isoabbreviation, ABBREV_MAX),
    year: normalizeYear(r.pubYear),
    volume: cleanText(journalInfo.volume, VOLUME_MAX),
    issue: cleanText(journalInfo.issue, VOLUME_MAX),
    pages: cleanText(r.pageInfo, PAGES_MAX),
    language: normalizeLanguage(r.language),
    license: normalizeLicense('europepmc', r.license),
    abstract: cleanAbstract(r.abstractText),
    pubTypes: r.pubTypeList?.pubType,
  };
}

/** Reconstrói o texto do índice invertido do OpenAlex (palavra -> posições), com teto de posições. */
function abstractFromIndex(index) {
  if (!isObject(index)) return null;
  const words = [];
  let seen = 0;
  for (const [word, positions] of Object.entries(index)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      const isUsable = Number.isInteger(position) && position >= 0 && position < INDEX_MAX_POSITIONS;
      if (isUsable && seen < INDEX_MAX_POSITIONS) {
        words[position] = word;
        seen += 1;
      }
    }
  }
  return cleanText(words.filter(Boolean).join(' '), ABSTRACT_MAX);
}

function openAlexLicense(body) {
  const primary = body.primary_location?.license;
  if (primary) return primary;
  const best = body.best_oa_location;
  return best?.version === 'publishedVersion' ? best.license : null;
}

function extractOpenAlex(body, requestedDoi) {
  if (!isObject(body) || (!body.title && !body.open_access)) return null;
  if (!sameDoi(body.doi ?? body.ids?.doi, requestedDoi)) return DOI_MISMATCH;
  return {
    pmid: cleanPmid(trailingMatch(body.ids?.pmid, /(\d{1,10})\/?$/)),
    pmcid: cleanPmcid(trailingMatch(body.ids?.pmcid, /(PMC\d{1,10})\/?$/)),
    title: cleanText(body.title ?? body.display_name, TITLE_MAX),
    ...normalizeAuthors('openalex', body.authorships),
    journal: cleanText(body.primary_location?.source?.display_name, JOURNAL_MAX),
    year: normalizeYear(body.publication_year),
    language: normalizeLanguage(body.language),
    license: normalizeLicense('openalex', openAlexLicense(body)),
    oaStatus: normalizeOaStatus(body.open_access?.oa_status),
    abstract: abstractFromIndex(body.abstract_inverted_index),
    openalexType: body.type,
  };
}

/** Como no OpenAlex: a licença da melhor cópia só vale se a cópia for a versão publicada. */
function unpaywallLicense(body) {
  const best = body.best_oa_location;
  return best?.version === 'publishedVersion' ? best.license : null;
}

function extractUnpaywall(body, requestedDoi) {
  if (!isObject(body) || (body.oa_status === undefined && body.is_oa === undefined)) return null;
  if (!sameDoi(body.doi, requestedDoi)) return DOI_MISMATCH;
  return {
    oaStatus: normalizeOaStatus(body.oa_status),
    license: normalizeLicense('unpaywall', unpaywallLicense(body)),
  };
}

/** "Piwowar HA" -> sobrenome "Piwowar", iniciais "HA"; autor coletivo fica inteiro no sobrenome. */
function pubmedAuthor(a) {
  const name = cleanText(a?.name, 2 * ABBREV_MAX);
  if (!name) return null;
  const split = name.lastIndexOf(' ');
  if (a.authtype === 'CollectiveName' || split < 0) return { family: clip(name, ABBREV_MAX), given: '' };
  return { family: name.slice(0, split), given: name.slice(split + 1) };
}

function articleId(entry, type) {
  const found = Array.isArray(entry.articleids) ? entry.articleids.find((x) => x?.idtype === type) : null;
  return found ? found.value : null;
}

function extractPubmed(body, pmid) {
  const entry = body?.result?.[pmid];
  if (!isObject(entry) || !entry.title) return null;
  const doiFromLocation = trailingMatch(entry.elocationid, /^doi:\s*(\S+)$/i);
  return {
    pmid: cleanPmid(entry.uid) ?? pmid,
    doi: cleanDoi(articleId(entry, 'doi')) ?? cleanDoi(doiFromLocation),
    pmcid: cleanPmcid(articleId(entry, 'pmc')),
    title: cleanIndexedTitle(entry.title),
    ...limitAuthors((Array.isArray(entry.authors) ? entry.authors : []).map(pubmedAuthor).filter(Boolean)),
    journal: cleanText(entry.fulljournalname, JOURNAL_MAX),
    journalAbbrev: cleanText(entry.source, ABBREV_MAX),
    year: normalizeYear(entry.pubdate),
    volume: cleanText(entry.volume, VOLUME_MAX),
    issue: cleanText(entry.issue, VOLUME_MAX),
    pages: cleanText(entry.pages, PAGES_MAX),
    language: normalizeLanguage(firstOf(entry.lang)),
    pubTypes: entry.pubtype,
  };
}

// ---------- junção ----------

const hasValue = (value) => value !== undefined && value !== null && value !== '';

function pickField(parts, key) {
  const part = parts.find((p) => hasValue(p[key]));
  return part ? part[key] : null;
}

function licenseSummary(parts) {
  const entries = parts.filter((p) => typeof p.license === 'string').map((p) => ({ source: p.source, license: p.license }));
  const { license, conflict } = mostRestrictive(entries.map((e) => e.license));
  const winner = license === 'desconhecida' ? null : entries.find((e) => e.license === license);
  return { license, licenseSource: winner ? winner.source : null, licenseConflict: conflict };
}

function typeSummary(parts) {
  const byName = (name) => parts.find((p) => p.source === name);
  return normalizeType({
    europepmcPubTypes: byName('europepmc')?.pubTypes ?? byName('pubmed')?.pubTypes,
    openalexType: byName('openalex')?.openalexType,
    crossrefType: byName('crossref')?.crossrefType,
  });
}

function oaStatusSummary(parts) {
  const known = parts.find((p) => hasValue(p.oaStatus) && p.oaStatus !== 'desconhecido');
  return known ? known.oaStatus : 'desconhecido';
}

function bibliographic(parts) {
  const pick = (key) => pickField(parts, key);
  const withAuthors = parts.find((p) => Array.isArray(p.authors) && p.authors.length > 0);
  return {
    authors: withAuthors ? withAuthors.authors : [],
    authorCount: withAuthors ? withAuthors.authorCount : 0,
    journal: pick('journal'),
    journalAbbrev: pick('journalAbbrev'),
    year: pick('year'),
    volume: pick('volume'),
    issue: pick('issue'),
    pages: pick('pages'),
    language: pick('language'),
    sourceAbstract: pick('abstract'),
  };
}

function buildRecord(id, unorderedParts) {
  const parts = SOURCE_PRIORITY.flatMap((name) => unorderedParts.filter((p) => p.source === name));
  const title = pickField(parts, 'title');
  if (!title) throw ValidationError(FAILURE_MESSAGES[id.kind]);
  const doi = id.kind === 'doi' ? id.value : pickField(parts, 'doi');
  const pmid = id.kind === 'pmid' ? id.value : pickField(parts, 'pmid');
  const fields = {
    doi, pmid, pmcid: pickField(parts, 'pmcid'), title,
    ...bibliographic(parts),
    type: typeSummary(parts),
    ...licenseSummary(parts),
    oaStatus: oaStatusSummary(parts),
    landingUrl: doiLandingUrl(doi) ?? pubmedLandingUrl(pmid),
    metadataSources: SOURCE_PRIORITY.filter((name) => parts.some((p) => p.source === name)),
  };
  return Object.freeze({ ...fields, searchNorm: searchNorm(fields) });
}

// ---------- fluxo ----------

function failureWarning(source, reason) {
  if (reason === 'stopped') return STOP_WARNING;
  const label = SOURCE_LABELS[source];
  const loss = SOURCE_LOSSES[source];
  if (reason === 'timeout') return `${label} demorou demais para responder; ${loss}.`;
  if (reason === 'json' || reason === 'size') return `${label} devolveu uma resposta inválida; ${loss}.`;
  if (reason === 'empty') return `${label} não encontrou este artigo; ${loss}.`;
  if (reason === 'mismatch') return `${label} devolveu o registro de outro DOI e foi descartada; ${loss}.`;
  return `${label} não respondeu; ${loss}.`;
}

function createSession({ get, email, nowFn }) {
  const parts = [];
  const warnings = [];
  const warn = (message) => { if (!warnings.includes(message)) warnings.push(message); };

  async function consult(source, url, extract) {
    const res = await get(url);
    if (!res.ok) {
      warn(failureWarning(source, res.reason));
      return null;
    }
    let part = null;
    try {
      part = extract(res.data);
    } catch {
      part = null;
    }
    if (part === DOI_MISMATCH) {
      warn(failureWarning(source, 'mismatch'));
      return null;
    }
    if (!part) {
      warn(failureWarning(source, 'empty'));
      return null;
    }
    parts.push({ ...part, source });
    return part;
  }

  return { parts, warnings, warn, consult, email, nowFn };
}

/** OpenAlex; se falhar e houver e-mail de contato, Unpaywall (nunca os dois somados). */
async function consultOpenAccess(s, doi) {
  const openalex = await s.consult('openalex', openAlexUrl(doi), (b) => extractOpenAlex(b, doi));
  if (openalex) return;
  if (!s.email) {
    s.warn(NO_EMAIL_WARNING);
    return;
  }
  await s.consult('unpaywall', unpaywallUrl(doi, s.email), (b) => extractUnpaywall(b, doi));
}

async function collectByDoi(s, doi) {
  const crossref = await s.consult('crossref', crossrefUrl(doi, s.email), (b) => extractCrossref(b, s.nowFn(), doi));
  const europePmc = await s.consult('europepmc', europePmcUrl(`DOI:"${doi}"`),
    (b) => extractEuropePmc(b, (r) => cleanDoi(r.doi) === doi));
  if (!crossref && !europePmc) throw ValidationError(FAILURE_MESSAGES.doi);
  await consultOpenAccess(s, doi);
}

async function collectByPmid(s, pmid) {
  const europePmc = await s.consult('europepmc', europePmcUrl(`EXT_ID:${pmid} AND SRC:MED`),
    (b) => extractEuropePmc(b, (r) => cleanPmid(r.pmid) === pmid));
  let pubmed = null;
  if (!europePmc && s.email) pubmed = await s.consult('pubmed', pubmedUrl(pmid, s.email), (b) => extractPubmed(b, pmid));
  if (!europePmc && !s.email) s.warn(NO_EMAIL_WARNING);
  if (!europePmc && !pubmed) throw ValidationError(FAILURE_MESSAGES.pmid);
  const doi = europePmc?.doi ?? pubmed?.doi ?? null;
  if (!doi) return;
  await s.consult('crossref', crossrefUrl(doi, s.email), (b) => extractCrossref(b, s.nowFn(), doi));
  await consultOpenAccess(s, doi);
}

/** Aceita { kind, value } já validado (forma canônica) ou o texto cru. */
function resolveIdentifier(identifier) {
  if (typeof identifier === 'string') return parseIdentifier(identifier);
  const parsed = parseIdentifier(identifier?.value);
  if (parsed.kind !== identifier.kind || parsed.value !== identifier.value) {
    throw ValidationError(INVALID_ID_MESSAGE);
  }
  return parsed;
}

function contactEmail(env) {
  const raw = env?.LIBRARY_CONTACT_EMAIL;
  return typeof raw === 'string' && isValidEmail(raw) ? raw.trim() : null;
}

/**
 * Busca e junta os metadados de um DOI ou PMID.
 * @param {{ kind: 'doi'|'pmid', value: string } | string} identifier
 * @param {{ env?: object, fetchImpl?: Function, sleep?: Function, now?: Function, timeoutMs?: number }} [options]
 *   timeoutMs existe para os testes; o padrão é UPSTREAM_TIMEOUT_MS.
 * @returns {Promise<{ record: object, sources: string[], warnings: string[] }>}
 *   sources = fontes que responderam com dados (igual a record.metadataSources).
 */
export async function fetchMetadata(identifier, options = {}) {
  const {
    env, fetchImpl = fetch, sleep = defaultSleep, now = Date.now,
    timeoutMs = LIBRARY_LIMITS.UPSTREAM_TIMEOUT_MS,
  } = options;
  const id = resolveIdentifier(identifier);
  const get = createGetter({ fetchImpl, sleep, now, timeoutMs });
  const session = createSession({ get, email: contactEmail(env), nowFn: now });
  if (id.kind === 'doi') await collectByDoi(session, id.value);
  else await collectByPmid(session, id.value);
  const record = buildRecord(id, session.parts);
  return { record, sources: [...record.metadataSources], warnings: [...session.warnings] };
}
