/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * researchLogService.js
 * Registro das pesquisas que a Lia já fez (sql/026, tabela lia_pesquisas), para não
 * pagar de novo por uma pergunta igual:
 *  - provedor 'kb': a resposta com base de conhecimento e suas fontes. Vale enquanto a
 *    versão da base (kbVersion) for a mesma: se o conteúdo mudou, a resposta antiga não volta;
 *  - provedores externos (europepmc, pubmed, openalex, scielo): só metadados e links
 *    (título, revista, ano, url de domínio permitido e ids), nunca o resumo.
 *
 * LGPD: nada de id de pessoa. Só entra pergunta que passa por isCacheable (o mesmo filtro
 * de dado pessoal e de instrução do cache semântico). A retenção é a validade; a limpeza é
 * purgeExpired, chamada pela rotina diária (L10).
 *
 * Toda operação é tolerante a falha: tabela ausente ou erro de banco viram null, false ou 0,
 * nunca um erro para a pessoa. Nenhuma função altera a entrada que recebe.
 */
import { isCacheable, normalizeQuestion, sameMeaning } from '../ai/semanticCache.js';
import { sha256Hex } from './ragService.js';

export const RESEARCH_LOG = {
  PROVIDERS: ['kb', 'europepmc', 'pubmed', 'openalex', 'scielo'],
  TTL_DAYS: { kb: 30, external: 7 },
  SIMILARITY: 0.9,
  ITEMS_MAX: 10,
  REPLY_MAX: 4000,
  SOURCES_MAX: 4,
  ALLOWED_HOSTS: ['europepmc.org', 'www.ebi.ac.uk', 'pubmed.ncbi.nlm.nih.gov', 'doi.org', 'www.scielo.br', 'scielo.org', 'openalex.org'],
};

const OUTCOMES = ['answered', 'empty'];
const KB_VERSION_LEN = 16;
const KB_VERSION_MAX = 64;
const SIMILAR_LIMIT = 5;
const SOURCE_MAX = 100;
const SECTION_MAX = 200;
const TITLE_MAX = 300;
const JOURNAL_MAX = 200;
const DOI_MAX = 200;
const YEAR_MIN = 1800;
const YEAR_MAX = 2100;
const PMID_RE = /^\d{1,10}$/;
const PMCID_RE = /^PMC\d{1,10}$/;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** Só https, sem usuário e senha na URL, e host na lista branca. Senão, null. */
function allowedUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const ok = url.protocol === 'https:' && !url.username && !url.password
      && RESEARCH_LOG.ALLOWED_HOSTS.includes(url.hostname);
    return ok ? url.href : null;
  } catch (err) {
    return null;
  }
}

function sanitizeYear(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const year = Number(value);
  return Number.isInteger(year) && year >= YEAR_MIN && year <= YEAR_MAX ? year : null;
}

function sanitizePmid(value) {
  const s = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  return PMID_RE.test(s) ? s : null;
}

function sanitizePmcid(value) {
  return typeof value === 'string' && PMCID_RE.test(value) ? value : null;
}

function sanitizeDoi(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.slice(0, DOI_MAX) : null;
}

function sanitizeItem(raw) {
  const ids = isObject(raw.ids) ? raw.ids : {};
  return {
    title: text(raw.title, TITLE_MAX),
    journal: text(raw.journal, JOURNAL_MAX),
    year: sanitizeYear(raw.year),
    url: allowedUrl(raw.url),
    ids: { pmid: sanitizePmid(ids.pmid), pmcid: sanitizePmcid(ids.pmcid), doi: sanitizeDoi(ids.doi) },
  };
}

function sanitizeExternal(raw) {
  const items = Array.isArray(raw.items) ? raw.items : [];
  return { items: items.filter(isObject).slice(0, RESEARCH_LOG.ITEMS_MAX).map(sanitizeItem) };
}

function sanitizeKb(raw) {
  const sources = Array.isArray(raw.sources) ? raw.sources : [];
  return {
    reply: text(raw.reply, RESEARCH_LOG.REPLY_MAX),
    sources: sources.filter(isObject).slice(0, RESEARCH_LOG.SOURCES_MAX).map((s) => ({
      source: text(s.source, SOURCE_MAX),
      section: text(s.section, SECTION_MAX),
    })),
  };
}

/** Só os campos permitidos, com tamanho limitado. Não altera `results`. */
export function sanitizeResults(provider, results) {
  const raw = isObject(results) ? results : {};
  return provider === 'kb' ? sanitizeKb(raw) : sanitizeExternal(raw);
}

function docLine(doc) {
  const d = isObject(doc) ? doc : {};
  return [d.source, d.section, d.content].map((v) => String(v ?? '')).join('|');
}

/** Versão da base: 16 primeiros hexadecimais do sha256 dos trechos (source|section|content), ordenados. */
export async function kbVersion(documents) {
  const lines = (Array.isArray(documents) ? documents : []).map(docLine).sort();
  return (await sha256Hex(lines.join('\n'))).slice(0, KB_VERSION_LEN);
}

function hasContent(provider, clean) {
  return provider === 'kb' ? clean.reply.length > 0 : clean.items.length > 0;
}

function canRecord({ provider, question, version, outcome, clean }) {
  if (!RESEARCH_LOG.PROVIDERS.includes(provider) || !OUTCOMES.includes(outcome)) return false;
  if (typeof version !== 'string' || version.length > KB_VERSION_MAX) return false;
  if (!isCacheable(question)) return false;
  return outcome === 'empty' || hasContent(provider, clean);
}

function canLookup(provider, question, version) {
  return RESEARCH_LOG.PROVIDERS.includes(provider) && typeof version === 'string' && isCacheable(question);
}

/** Igualdade exata da pergunta normalizada, na mesma provedora e versão da base, ainda válida. */
async function findExact(sql, provider, version, q) {
  const rows = await sql`
    SELECT id, outcome, results FROM lia_pesquisas
    WHERE provider = ${provider} AND kb_version = ${version} AND query_norm = ${q} AND expires_at > now()
    LIMIT 1`;
  const row = rows && rows[0];
  return row ? { id: row.id, outcome: row.outcome, results: row.results, similarity: 1 } : null;
}

/** Perguntas parecidas: `%` usa o índice GIN; o corte de 0,9 e a guarda de sentido são feitos aqui. */
async function findSimilar(sql, provider, version, q) {
  const rows = await sql`
    SELECT id, outcome, results, query_norm, similarity(query_norm, ${q}) AS sim
    FROM lia_pesquisas
    WHERE provider = ${provider} AND kb_version = ${version} AND expires_at > now() AND query_norm % ${q}
    ORDER BY sim DESC
    LIMIT ${SIMILAR_LIMIT}`;
  const best = (rows || []).find((r) => Number(r.sim) >= RESEARCH_LOG.SIMILARITY && sameMeaning(q, r.query_norm));
  return best ? { id: best.id, outcome: best.outcome, results: best.results, similarity: Number(best.sim) } : null;
}

async function touch(sql, id) {
  await sql`UPDATE lia_pesquisas SET hits = hits + 1, last_hit_at = now() WHERE id = ${id}::uuid`;
}

/**
 * Procura uma pesquisa já feita. Devolve { id, outcome, results, similarity } ou null.
 * `options`: { provider, question, kbVersion? }. Soma o acerto em hits.
 */
export async function lookup(sql, options) {
  const { provider, question, kbVersion: version = '' } = options || {};
  if (!canLookup(provider, question, version)) return null;
  const q = normalizeQuestion(question);
  try {
    const hit = (await findExact(sql, provider, version, q)) || (await findSimilar(sql, provider, version, q));
    if (!hit) return null;
    await touch(sql, hit.id);
    return { id: hit.id, outcome: hit.outcome, results: sanitizeResults(provider, hit.results), similarity: hit.similarity };
  } catch (err) {
    return null;
  }
}

/**
 * Registra (ou renova) uma pesquisa. `outcome` é 'answered' (com conteúdo) ou 'empty' (sem resposta,
 * a lacuna da base). Faz upsert por (provider, query_norm, kb_version). Devolve true ou false.
 */
export async function record(sql, options) {
  const { provider, question, kbVersion: version = '', outcome, results } = options || {};
  const clean = sanitizeResults(provider, results);
  if (!canRecord({ provider, question, version, outcome, clean })) return false;
  const q = normalizeQuestion(question);
  const ttl = provider === 'kb' ? RESEARCH_LOG.TTL_DAYS.kb : RESEARCH_LOG.TTL_DAYS.external;
  try {
    await sql`
      INSERT INTO lia_pesquisas (provider, query_norm, kb_version, outcome, results, expires_at)
      VALUES (${provider}, ${q}, ${version}, ${outcome}, ${JSON.stringify(clean)}::jsonb, now() + make_interval(days => ${ttl}))
      ON CONFLICT (provider, query_norm, kb_version) DO UPDATE SET
        outcome = EXCLUDED.outcome, results = EXCLUDED.results,
        expires_at = EXCLUDED.expires_at, created_at = now()`;
    return true;
  } catch (err) {
    return false;
  }
}

/** Apaga as linhas vencidas e devolve quantas apagou (0 em caso de falha). */
export async function purgeExpired(sql) {
  try {
    const rows = await sql`
      WITH gone AS (DELETE FROM lia_pesquisas WHERE expires_at <= now() RETURNING id)
      SELECT count(*)::int AS n FROM gone`;
    return (rows && rows[0] && Number(rows[0].n)) || 0;
  } catch (err) {
    return 0;
  }
}
