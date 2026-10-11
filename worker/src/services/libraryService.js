/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryService.js
 * Serviço do membro e catálogo público da Biblioteca (CONTRATO-B1 §4.1):
 * as 8 funções por trás de apiLearnLibrary*. Só artigos `publicado`; flag
 * `library_enabled` fechada por padrão (falha fechada); limites de
 * ../library/limits.js (a sessão principal os registra em constants.js, mas
 * este arquivo não depende disso). Sem rede.
 * Quem usa: worker/src/handlers.js (B1-I). Consultas só em template: o
 * adaptador do PGlite não aceita sql(texto, params).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { isEnabled } from './featureFlagService.js';
import {
  LIBRARY_RATE_LIMITS, LIBRARY_LIMITS, LIBRARY_FLAGS, OPEN_REUSE_LICENSES,
} from '../library/limits.js';
import { searchNorm } from '../library/normalize.js';
import { isUuid, parseIdentifier, pmcUrl } from '../library/identifiers.js';

const CACHE_KEY = 'https://library-cache.internal/public-catalog/v1';
// Janela máxima de um artigo removido ou despublicado continuar no catálogo
// público: CACHE_TTL_SECONDS (60 s). Flag fechada: a flag é lida antes do
// cache (publicCatalog) e fica em memória por até FLAG_CACHE_TTL_MS (60 s,
// featureFlagService), então o catálogo fecha em até ~60 s por instância.
const CACHE_TTL_SECONDS = 60;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_MAX = 100;
const PUBLIC_AUTHORS_SHOWN = 3;
const YEAR_MIN = 1800;
const YEAR_MAX = 2100;
const MIN_TERM_LENGTH = 2;
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const NOTE_FORBIDDEN_RE = /[<>]|http|www\./i;
const ARTICLE_TYPES = ['artigo', 'revisao', 'revisao_sistematica', 'meta_analise', 'ensaio_clinico', 'relato_caso', 'diretriz', 'outro'];
const OPEN_ACCESS_STATUSES = ['diamond', 'gold', 'green', 'hybrid', 'bronze'];
const ALL_ROLES = [C.ROLES.VISITOR, C.ROLES.MEMBER, C.ROLES.ADMIN];
const MEMBER_ROLES = [C.ROLES.MEMBER, C.ROLES.ADMIN];
const DISABLED_MESSAGE = 'A Biblioteca ainda não está disponível.';
const SUGGEST_DISABLED_MESSAGE = 'As sugestões de artigos ainda não estão disponíveis.';

// ---------------------------------------------------------------------------
// Portão: flag, papel e limite
// ---------------------------------------------------------------------------
const disabled = (message = DISABLED_MESSAGE) => ({ success: false, disabled: true, message });

/** Falha fechada: sem saber o valor da flag (erro de banco), a Biblioteca fica desligada. */
async function flagOn(sql, identity, key = LIBRARY_FLAGS.ENABLED) {
  try {
    return await isEnabled(sql, key, identity);
  } catch (err) {
    return false;
  }
}

/** Devolve a resposta "desligada" (ou null se pode seguir); depois confere o papel. */
async function gate(sql, identity, roles, extraFlag = null) {
  if (!(await flagOn(sql, identity))) return disabled();
  if (extraFlag && !(await flagOn(sql, identity, extraFlag))) return disabled(SUGGEST_DISABLED_MESSAGE);
  S.requireRole(identity, roles);
  return null;
}

function enforce(sql, bucket, identifier) {
  const limit = LIBRARY_RATE_LIMITS[bucket];
  return S.enforceRateLimit(sql, bucket, identifier, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
function articleId(value) {
  if (!isUuid(value)) throw E.ValidationError('Artigo inválido.');
  return value;
}

function positiveInt(value, fallback, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return Math.min(n, max);
}

function yearOrNull(value) {
  const n = Number(value);
  return value !== null && value !== '' && Number.isInteger(n) && n >= YEAR_MIN && n <= YEAR_MAX ? n : null;
}

function slugOrNull(value, message) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !SLUG_RE.test(value)) throw E.ValidationError(message);
  return value;
}

function typeOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!ARTICLE_TYPES.includes(value)) throw E.ValidationError('Tipo de artigo inválido.');
  return value;
}

/** Filtro de idioma: 'pt', 'en' ou 'outros' (tudo que não é português, inclusive sem idioma informado). */
const LANGUAGE_FILTERS = ['pt', 'en', 'outros'];

function languageOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!LANGUAGE_FILTERS.includes(value)) throw E.ValidationError('Idioma inválido.');
  return value;
}

/** Termos da busca: normalizados como o search_norm; só [a-z0-9./-] sobrevivem (sem curinga de LIKE). */
function searchPatterns(q) {
  const text = typeof q === 'string' ? q.slice(0, LIBRARY_LIMITS.QUERY_MAX) : '';
  return searchNorm({ title: text })
    .split(' ')
    .filter((term) => term.length >= MIN_TERM_LENGTH)
    .slice(0, LIBRARY_LIMITS.QUERY_TERMS_MAX)
    .map((term) => `%${term}%`);
}

function parseSearchInput(input) {
  const pageSize = positiveInt(input.pageSize, PAGE_SIZE_DEFAULT, LIBRARY_LIMITS.PAGE_SIZE_MAX);
  const page = positiveInt(input.page, 1, PAGE_MAX);
  return {
    patterns: searchPatterns(input.q),
    topic: slugOrNull(input.topic, 'Área inválida.'),
    type: typeOrNull(input.type),
    language: languageOrNull(input.language),
    yearFrom: yearOrNull(input.yearFrom),
    yearTo: yearOrNull(input.yearTo),
    openAccess: input.openAccess === true || input.openAccess === 'true' ? true : null,
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------
function iso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

function authorList(value, max) {
  const list = typeof value === 'string' ? JSON.parse(value) : value;
  return (Array.isArray(list) ? list : []).slice(0, max).map((a) => ({ family: a.family, given: a.given ?? '' }));
}

function toPublicItem(r) {
  return {
    id: r.id,
    title: r.title,
    authors: authorList(r.authors, PUBLIC_AUTHORS_SHOWN),
    authorCount: Number(r.author_count),
    journal: r.journal ?? null,
    year: r.pub_year ?? null,
    doi: r.doi ?? null,
    pmid: r.pmid ?? null,
    type: r.article_type,
    topics: r.topics,
    openAccess: OPEN_ACCESS_STATUSES.includes(r.oa_status),
    license: r.license,
    landingUrl: r.landing_url,
    language: r.language ?? null,
    publishedAt: iso(r.published_at),
  };
}

/** `member` false (visitor): sem indício de resumo nem de favorito (decisão 9: só membros). */
function toListItem(r, member) {
  return { ...toPublicItem(r), hasSummary: member && r.has_summary === true, isFavorite: member && r.is_favorite === true };
}

/** O resumo só sai se o artigo está publicado e, sendo de IA, foi revisado (o CHECK do banco também exige). */
function visibleSummary(r) {
  if (!r.summary_text) return null;
  const reviewed = r.summary_origin === 'curador' || (r.summary_reviewed_at && r.summary_reviewer_name);
  if (!reviewed) return null;
  return {
    text: r.summary_text,
    origin: r.summary_origin,
    reviewerName: r.summary_reviewer_name ?? null,
    reviewedAt: iso(r.summary_reviewed_at),
  };
}

function toClinicalReview(r) {
  if (!r.clinical_reviewer_name || !r.clinical_reviewed_at) return null;
  return { reviewerName: r.clinical_reviewer_name, reviewedAt: iso(r.clinical_reviewed_at) };
}

function toArticleDetail(r, { member, collections }) {
  const summary = member ? visibleSummary(r) : null;
  return {
    ...toListItem(r, member),
    authors: authorList(r.authors, LIBRARY_LIMITS.AUTHORS_STORED_MAX),
    journalAbbrev: r.journal_abbrev ?? null,
    volume: r.volume ?? null,
    issue: r.issue ?? null,
    pages: r.pages ?? null,
    oaStatus: r.oa_status,
    pmcid: r.pmcid ?? null,
    pmcUrl: pmcUrl(r.pmcid),
    hasSummary: summary !== null,
    summary,
    clinicalReview: member ? toClinicalReview(r) : null,
    abstract: member && r.source_abstract && OPEN_REUSE_LICENSES.includes(r.license) ? r.source_abstract : null,
    collections,
    membersOnly: !member,
  };
}

// ---------------------------------------------------------------------------
// Consultas (uma lista só, para busca, favoritos e coleção)
// ---------------------------------------------------------------------------
function loadTopics(sql) {
  return sql`SELECT slug, name FROM library_topics ORDER BY sort_order, name`;
}

const toTopic = (t) => ({ slug: t.slug, name: t.name });

/**
 * Consulta fixa: cada filtro opcional vem como parâmetro e vale "sem filtro" quando nulo.
 * Favoritos ordenam pelos mais recentes; coleção, pela posição; o resto, por ano e título.
 */
function queryList(sql, p) {
  return sql`
    SELECT a.id, a.title, a.authors, a.author_count, a.journal, a.pub_year, a.doi, a.pmid,
           a.article_type, a.topics, a.license, a.oa_status, a.landing_url, a.published_at, a.language,
           (a.summary_text IS NOT NULL) AS has_summary,
           (f.article_id IS NOT NULL) AS is_favorite,
           count(*) OVER() AS total_count
    FROM library_articles a
    LEFT JOIN library_favorites f ON f.article_id = a.id AND f.profile_id = ${p.profileId}::uuid
    LEFT JOIN library_collection_items ci ON ci.collection_id = ${p.collectionId}::uuid AND ci.article_id = a.id
    WHERE a.status = 'publicado'
      AND (${p.favoritesOnly}::boolean IS NOT TRUE OR f.article_id IS NOT NULL)
      AND (${p.collectionId}::uuid IS NULL OR ci.article_id IS NOT NULL)
      AND a.search_norm LIKE ALL (${p.patterns}::text[])
      AND (${p.topic}::text IS NULL OR ${p.topic}::text = ANY(a.topics))
      AND (${p.type}::text IS NULL OR a.article_type = ${p.type}::text)
      AND (${p.language}::text IS NULL
           OR (${p.language}::text = 'outros' AND a.language IS DISTINCT FROM 'pt')
           OR a.language = ${p.language}::text)
      AND (${p.yearFrom}::int IS NULL OR a.pub_year >= ${p.yearFrom}::int)
      AND (${p.yearTo}::int IS NULL OR a.pub_year <= ${p.yearTo}::int)
      AND (${p.openAccess}::boolean IS NOT TRUE OR a.oa_status IN ('diamond', 'gold', 'green', 'hybrid', 'bronze'))
    ORDER BY (CASE WHEN ${p.favoritesOnly}::boolean THEN f.created_at END) DESC NULLS LAST,
             ci.position ASC NULLS LAST, (CASE WHEN a.language = 'pt' THEN 0 ELSE 1 END), a.pub_year DESC NULLS LAST, a.title, a.id
    LIMIT ${p.pageSize} OFFSET ${p.offset}
  `;
}

/** Uma página (ListItem) e o total; página além do fim ainda informa o total certo. */
async function listPage(sql, identity, params) {
  const base = {
    profileId: identity.profileId, favoritesOnly: false, collectionId: null, patterns: [],
    topic: null, type: null, yearFrom: null, yearTo: null, openAccess: null, ...params,
  };
  const member = identity.role !== C.ROLES.VISITOR;
  const rows = await queryList(sql, base);
  let total = rows.length ? Number(rows[0].total_count) : 0;
  if (!rows.length && base.offset > 0) {
    const first = await queryList(sql, { ...base, pageSize: 1, offset: 0 });
    total = first.length ? Number(first[0].total_count) : 0;
  }
  return { items: rows.map((r) => toListItem(r, member)), total };
}

// ---------------------------------------------------------------------------
// apiLearnLibrarySearch
// ---------------------------------------------------------------------------
export async function search(sql, identity, input = {}) {
  const off = await gate(sql, identity, ALL_ROLES);
  if (off) return off;
  await enforce(sql, 'LIBRARY_SEARCH', identity.profileId);
  const params = parseSearchInput(input);
  const [{ items, total }, topics] = await Promise.all([listPage(sql, identity, params), loadTopics(sql)]);
  return { success: true, items, total, page: params.page, pageSize: params.pageSize, topics: topics.map(toTopic) };
}

// ---------------------------------------------------------------------------
// apiLearnLibraryGetArticle
// ---------------------------------------------------------------------------
async function collectionsOf(sql, id) {
  const rows = await sql`
    SELECT c.id, c.title
    FROM library_collections c
    JOIN library_collection_items i ON i.collection_id = c.id
    WHERE i.article_id = ${id}::uuid AND c.status = 'publicada'
    ORDER BY c.sort_order, c.title
  `;
  return rows.map((c) => ({ id: c.id, title: c.title }));
}

export async function getArticle(sql, identity, input = {}) {
  const off = await gate(sql, identity, ALL_ROLES);
  if (off) return off;
  const id = articleId(input.id);
  await enforce(sql, 'LIBRARY_READ', identity.profileId);
  const rows = await sql`
    SELECT a.*, (a.summary_text IS NOT NULL) AS has_summary,
           EXISTS (SELECT 1 FROM library_favorites f WHERE f.article_id = a.id AND f.profile_id = ${identity.profileId}::uuid) AS is_favorite
    FROM library_articles a
    WHERE a.id = ${id}::uuid AND a.status = 'publicado'
  `;
  if (!rows.length) throw E.NotFoundError('Artigo não encontrado.');
  const member = identity.role !== C.ROLES.VISITOR;
  const collections = member ? await collectionsOf(sql, id) : [];
  return { success: true, article: toArticleDetail(rows[0], { member, collections }) };
}

// ---------------------------------------------------------------------------
// apiLearnLibrarySetFavorite / apiLearnLibraryListFavorites
// ---------------------------------------------------------------------------
async function assertPublished(sql, id) {
  const rows = await sql`SELECT 1 AS ok FROM library_articles WHERE id = ${id}::uuid AND status = 'publicado'`;
  if (!rows.length) throw E.NotFoundError('Artigo não encontrado.');
}

/**
 * Uma instrução só, mas NÃO atômica quanto ao teto: em READ COMMITTED o
 * count(*) de duas instruções paralelas não vê a linha da outra, então o
 * total pode passar do teto por 1 ou 2. Quem contém o abuso é o limite de
 * taxa (LIBRARY_RATE_LIMITS), não este WHERE.
 */
async function addFavorite(sql, profileId, id) {
  const max = LIBRARY_LIMITS.FAVORITES_MAX;
  const inserted = await sql`
    INSERT INTO library_favorites (profile_id, article_id)
    SELECT ${profileId}::uuid, ${id}::uuid
    WHERE (SELECT count(*) FROM library_favorites WHERE profile_id = ${profileId}::uuid) < ${max}
    ON CONFLICT DO NOTHING
    RETURNING article_id
  `;
  if (inserted.length) return;
  const existing = await sql`SELECT 1 AS ok FROM library_favorites WHERE profile_id = ${profileId}::uuid AND article_id = ${id}::uuid`;
  if (!existing.length) throw E.ValidationError(`Você atingiu o limite de ${max} favoritos.`);
}

export async function setFavorite(sql, identity, input = {}) {
  const off = await gate(sql, identity, MEMBER_ROLES);
  if (off) return off;
  const id = articleId(input.id);
  if (typeof input.favorite !== 'boolean') throw E.ValidationError('Informe se o artigo é favorito.');
  await enforce(sql, 'LIBRARY_FAVORITE', identity.profileId);
  if (!input.favorite) {
    await sql`DELETE FROM library_favorites WHERE profile_id = ${identity.profileId}::uuid AND article_id = ${id}::uuid`;
    return { success: true, favorite: false };
  }
  await assertPublished(sql, id);
  await addFavorite(sql, identity.profileId, id);
  return { success: true, favorite: true };
}

export async function listFavorites(sql, identity, input = {}) {
  const off = await gate(sql, identity, MEMBER_ROLES);
  if (off) return off;
  await enforce(sql, 'LIBRARY_READ', identity.profileId);
  const page = positiveInt(input.page, 1, PAGE_MAX);
  const pageSize = PAGE_SIZE_DEFAULT;
  const { items, total } = await listPage(sql, identity, { favoritesOnly: true, pageSize, offset: (page - 1) * pageSize });
  return { success: true, items, total, page, pageSize };
}

// ---------------------------------------------------------------------------
// apiLearnLibraryListCollections / apiLearnLibraryGetCollection
// ---------------------------------------------------------------------------
export async function listCollections(sql, identity) {
  const off = await gate(sql, identity, MEMBER_ROLES);
  if (off) return off;
  await enforce(sql, 'LIBRARY_READ', identity.profileId);
  const rows = await sql`
    SELECT c.id, c.slug, c.title, c.description, count(a.id)::int AS item_count
    FROM library_collections c
    LEFT JOIN library_collection_items i ON i.collection_id = c.id
    LEFT JOIN library_articles a ON a.id = i.article_id AND a.status = 'publicado'
    WHERE c.status = 'publicada'
    GROUP BY c.id
    ORDER BY c.sort_order, c.title
  `;
  const collections = rows.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, description: c.description ?? null, count: Number(c.item_count),
  }));
  return { success: true, collections };
}

export async function getCollection(sql, identity, input = {}) {
  const off = await gate(sql, identity, MEMBER_ROLES);
  if (off) return off;
  if (!isUuid(input.id)) throw E.ValidationError('Coleção inválida.');
  await enforce(sql, 'LIBRARY_READ', identity.profileId);
  const rows = await sql`
    SELECT id, slug, title, description FROM library_collections
    WHERE id = ${input.id}::uuid AND status = 'publicada'
  `;
  if (!rows.length) throw E.NotFoundError('Coleção não encontrada.');
  const c = rows[0];
  const { items } = await listPage(sql, identity, { collectionId: c.id, pageSize: LIBRARY_LIMITS.COLLECTION_ITEMS_MAX, offset: 0 });
  return { success: true, collection: { id: c.id, slug: c.slug, title: c.title, description: c.description ?? null }, items };
}

// ---------------------------------------------------------------------------
// apiLearnLibrarySuggest
// ---------------------------------------------------------------------------
/** Nota curta e em texto puro: sem marcação, sem link e sem caractere de controle. */
function cleanNote(raw) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw E.ValidationError('Observação inválida.');
  const text = raw.trim();
  if (!text) return null;
  if (text.length > LIBRARY_LIMITS.NOTE_MAX) {
    throw E.ValidationError(`A observação deve ter até ${LIBRARY_LIMITS.NOTE_MAX} caracteres.`);
  }
  if (CONTROL_RE.test(text) || NOTE_FORBIDDEN_RE.test(text)) {
    throw E.ValidationError('A observação não pode ter links, marcação ou caracteres especiais.');
  }
  return text;
}

/**
 * Uma instrução só, mas NÃO atômica quanto aos dois tetos de pendentes: em
 * READ COMMITTED, envios paralelos não veem as linhas uns dos outros e podem
 * passar do teto por 1 ou 2. O limite de taxa (LIBRARY_SUGGEST_DAY) contém o
 * abuso; a duplicata exata é barrada pelo UNIQUE (ON CONFLICT DO NOTHING).
 */
function insertSuggestion(sql, profileId, ident, note) {
  return sql`
    INSERT INTO library_suggestions (profile_id, identifier_kind, identifier, note)
    SELECT ${profileId}::uuid, ${ident.kind}, ${ident.value}, ${note}
    WHERE (SELECT count(*) FROM library_suggestions WHERE status = 'sugerido') < ${LIBRARY_LIMITS.SUGGESTIONS_PENDING_MAX}
      AND (SELECT count(*) FROM library_suggestions WHERE status = 'sugerido' AND profile_id = ${profileId}::uuid) < ${LIBRARY_LIMITS.SUGGESTIONS_PENDING_PER_MEMBER}
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
}

/** Nada foi gravado: explica o porquê (repetida, teto da pessoa ou fila cheia). */
async function explainRefusedSuggestion(sql, profileId, ident) {
  const dup = await sql`
    SELECT 1 AS ok FROM library_suggestions
    WHERE profile_id = ${profileId}::uuid AND identifier_kind = ${ident.kind} AND identifier = ${ident.value}
  `;
  if (dup.length) throw E.ConflictError('Você já sugeriu este artigo.');
  const mine = await sql`
    SELECT count(*)::int AS n FROM library_suggestions WHERE status = 'sugerido' AND profile_id = ${profileId}::uuid
  `;
  if (mine[0].n >= LIBRARY_LIMITS.SUGGESTIONS_PENDING_PER_MEMBER) {
    throw E.ValidationError(`Você já tem ${LIBRARY_LIMITS.SUGGESTIONS_PENDING_PER_MEMBER} sugestões aguardando análise.`);
  }
  throw E.ValidationError('A fila de sugestões está cheia. Tente de novo mais tarde.');
}

export async function suggest(sql, _env, identity, input = {}, correlationId) {
  const off = await gate(sql, identity, MEMBER_ROLES, LIBRARY_FLAGS.MEMBER_SUGGEST);
  if (off) return off;
  const ident = parseIdentifier(input.identifier);
  const note = cleanNote(input.note);
  await enforce(sql, 'LIBRARY_SUGGEST', identity.profileId);
  await enforce(sql, 'LIBRARY_SUGGEST_DAY', identity.profileId);
  const rows = await insertSuggestion(sql, identity.profileId, ident, note);
  if (!rows.length) await explainRefusedSuggestion(sql, identity.profileId, ident);
  const suggestionId = rows[0].id;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_SUGGESTION_CREATE', 'library_suggestion', suggestionId, 'success', { kind: ident.kind });
  return { success: true, suggestionId, status: 'sugerido' };
}

// ---------------------------------------------------------------------------
// apiLearnLibraryPublicCatalog (sem sessão; consumidores: a página /biblioteca ao vivo, uma chamada por
// visita, e o build do site, que grava o instantâneo da primeira pintura)
// ---------------------------------------------------------------------------
function defaultCache() {
  return typeof caches !== 'undefined' && caches && caches.default ? caches.default : null;
}

/** { payload } no acerto; {} na falta; { unusable: true } quando não há cache ou ele deu erro. */
async function cacheGet(cache) {
  if (!cache) return { unusable: true };
  try {
    const hit = await cache.match(CACHE_KEY);
    return hit ? { payload: await hit.json() } : {};
  } catch (err) {
    return { unusable: true };
  }
}

async function cachePut(cache, payload) {
  if (!cache) return;
  try {
    await cache.put(CACHE_KEY, new Response(JSON.stringify(payload), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}` },
    }));
  } catch (err) {
    // Cache é otimização: falhar aqui nunca derruba a resposta.
  }
}

async function buildCatalog(sql) {
  const [topics, rows] = await Promise.all([
    loadTopics(sql),
    sql`
      SELECT id, title, authors, author_count, journal, pub_year, doi, pmid, article_type, topics,
             license, oa_status, landing_url, published_at, language
      FROM library_articles
      WHERE status = 'publicado'
      ORDER BY (CASE WHEN language = 'pt' THEN 0 ELSE 1 END), pub_year DESC NULLS LAST, title, id
      LIMIT ${LIBRARY_LIMITS.PUBLIC_MAX_ITEMS}
    `,
  ]);
  return {
    success: true,
    enabled: true,
    generatedAt: new Date().toISOString(),
    topics: topics.map(toTopic),
    items: rows.map(toPublicItem),
  };
}

const CLOSED_CATALOG = Object.freeze({ success: true, enabled: false, topics: [], items: [] });

/**
 * A flag library_enabled vem ANTES do cache: fechada, nada é servido nem
 * gravado no cache (a flag é lida da memória por até 60 s, sem tocar o banco
 * a cada chamada). Aberta, o cache responde sem tocar o banco
 * (enforceRateLimit grava no Neon a cada chamada); só sem cache utilizável
 * valem os dois limites (por IP e global).
 */
export async function publicCatalog(sql, env, options = {}) {
  if (!(await flagOn(sql, null))) return { ...CLOSED_CATALOG };
  const cache = options.cache !== undefined ? options.cache : defaultCache();
  const cached = await cacheGet(cache);
  if (cached.payload) return cached.payload;
  if (cached.unusable) {
    await enforce(sql, 'LIBRARY_PUBLIC_IP', (env && env.clientIp) || 'unknown');
    await enforce(sql, 'LIBRARY_PUBLIC_GLOBAL', 'global');
  }
  const payload = await buildCatalog(sql);
  await cachePut(cache, payload);
  return payload;
}
