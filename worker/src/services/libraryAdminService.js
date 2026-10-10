/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryAdminService.js
 * Sugestões, coleções, áreas e equipe da Biblioteca (CONTRATO-B1 §3, §4.2, §7).
 * Papéis: sugestões, coleções e áreas são do curador (admin ou library_staff
 * 'curador'); equipe só do admin. Não olha a flag library_enabled (a curadoria
 * carrega o acervo antes do lançamento). Cada escrita é UMA instrução (sem
 * transação, o banco decide a corrida); a coleção com seus itens vai numa CTE
 * cujos conjuntos DELETE e INSERT são disjuntos de propósito. Consultas só em
 * template (o adaptador do PGlite não aceita sql(texto, params)).
 * Aceitar uma sugestão reaproveita importArticle (cadastro por DOI/PMID).
 * Auditoria sem e-mail, nome ou texto livre; target_id é UUID ou null
 * (worker/src/logging.js:15-20).
 * Quem usa: worker/src/handlers.js (B1-I) e a aba de admin do front
 * (frontend/admin-library-extras.js).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { LIBRARY_RATE_LIMITS, LIBRARY_LIMITS } from '../library/limits.js';
import { isUuid } from '../library/identifiers.js';
import { importArticle, requireLibraryRole, LIBRARY_ROLES } from './libraryCurationService.js';

const PAGE_SIZE = 20;
const PAGE_MAX = 1000;
const COLLECTIONS_MAX = 500;
const STAFF_MAX = 200;
const SORT_ORDER_MAX = 1000;
const UNIQUE_VIOLATION = '23505';
const SUGGESTION_STATUSES = ['sugerido', 'aceito', 'recusado', 'duplicado'];
const SUGGESTION_DECISIONS = ['aceitar', 'recusar'];
const COLLECTION_STATUSES = ['rascunho', 'publicada'];
const STAFF_ROLES = Object.values(LIBRARY_ROLES);
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const MSG = Object.freeze({
  forbidden: 'Acesso não autorizado para este recurso.',
  badSuggestion: 'Sugestão inválida.',
  suggestionNotFound: 'Sugestão não encontrada.',
  suggestionDecided: 'Esta sugestão já foi decidida.',
  badDecision: 'Decisão inválida.',
  badStatus: 'Estado inválido.',
  reason: 'Informe o motivo (3 a 300 caracteres).',
  badCollection: 'Coleção inválida.',
  collectionNotFound: 'Coleção não encontrada.',
  collectionStale: 'Outra pessoa alterou esta coleção. Recarregue para ver a versão nova.',
  collectionSlugTaken: 'Já existe uma coleção com este endereço.',
  onlyPublished: 'Só artigos publicados podem entrar na coleção.',
  badVersion: 'Versão inválida.',
  badItems: 'Lista de artigos inválida.',
  badTopic: 'Área inválida.',
  badEmail: 'Informe um e-mail válido.',
  badRole: 'Papel inválido.',
  badGrant: 'Informe se o acesso é dado ou retirado.',
  personNotFound: 'Pessoa não encontrada.',
});

// ---------------------------------------------------------------------------
// Papel, limite e entrada
// ---------------------------------------------------------------------------
function enforce(sql, identity) {
  const limit = LIBRARY_RATE_LIMITS.LIBRARY_CURATE;
  return S.enforceRateLimit(sql, 'LIBRARY_CURATE', identity.profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
}

function requireAdmin(identity) {
  if (identity?.role !== C.ROLES.ADMIN || !identity.profileId) throw E.ForbiddenError(MSG.forbidden);
}

const iso = (value) => (value instanceof Date ? value.toISOString() : (value ?? null));

function uuidOf(value, message) {
  if (!isUuid(value)) throw E.ValidationError(message);
  return value;
}

function positiveInt(value, fallback, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

function versionOf(value) {
  const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw E.ValidationError(MSG.badVersion);
  return n;
}

function oneLine(name, min, max, required) {
  return (value) => {
    const empty = value === null || value === undefined || value === '';
    if (empty && !required) return null;
    const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
    if (!text && !required) return null;
    if (text.length < min || text.length > max || CONTROL_RE.test(text)) throw E.ValidationError(`Campo inválido: ${name}.`);
    return text;
  };
}

function slugOf(name, min, max) {
  return (value) => {
    if (typeof value !== 'string' || !SLUG_RE.test(value) || value.length < min || value.length > max) {
      throw E.ValidationError(`Campo inválido: ${name}.`);
    }
    return value;
  };
}

function sortOrderOf(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || n < 0 || n > SORT_ORDER_MAX) throw E.ValidationError('Campo inválido: sortOrder.');
  return n;
}

// ---------------------------------------------------------------------------
// Sugestões
// ---------------------------------------------------------------------------
/** Sem profile_id: o curador não vê quem sugeriu (LGPD, CONTRATO-B1 §5). */
function toSuggestion(row) {
  return {
    id: row.id,
    identifierKind: row.identifier_kind,
    identifier: row.identifier,
    note: row.note ?? null,
    status: row.status,
    decisionReason: row.decision_reason ?? null,
    createdAt: iso(row.created_at),
    decidedAt: iso(row.decided_at),
    articleId: row.article_id ?? null,
  };
}

export async function listSuggestions(sql, identity, input = {}) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const status = input.status ?? 'sugerido';
  if (!SUGGESTION_STATUSES.includes(status)) throw E.ValidationError(MSG.badStatus);
  const page = positiveInt(input.page, 1, PAGE_MAX);
  await enforce(sql, identity);
  const [rows, count] = await Promise.all([
    sql`
      SELECT id, identifier_kind, identifier, note, status, decision_reason, created_at, decided_at, article_id
      FROM library_suggestions WHERE status = ${status}
      ORDER BY created_at, id LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    sql`SELECT count(*)::int AS n FROM library_suggestions WHERE status = ${status}`,
  ]);
  return { success: true, items: rows.map(toSuggestion), page, pageSize: PAGE_SIZE, total: count[0].n };
}

function reasonOf(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length < LIBRARY_LIMITS.REASON_MIN || text.length > LIBRARY_LIMITS.REASON_MAX || CONTROL_RE.test(text)) {
    throw E.ValidationError(MSG.reason);
  }
  return text;
}

async function loadSuggestion(sql, id) {
  const rows = await sql`SELECT * FROM library_suggestions WHERE id = ${id}::uuid`;
  if (!rows.length) throw E.NotFoundError(MSG.suggestionNotFound);
  return rows[0];
}

/** Uma instrução: se outra pessoa decidiu antes, zero linhas e conflito. */
async function markDecided(sql, id, change, profileId) {
  const rows = await sql`
    UPDATE library_suggestions SET
      status = ${change.status}::text, decision_reason = ${change.reason}::text, article_id = ${change.articleId}::uuid,
      decided_at = now(), decided_by = ${profileId}::uuid
    WHERE id = ${id}::uuid AND status = 'sugerido'
    RETURNING *
  `;
  if (!rows.length) throw E.ConflictError(MSG.suggestionDecided);
  return toSuggestion(rows[0]);
}

const duplicateIdOf = (err) => (err?.name === 'ConflictError' ? (err.payload?.articleId ?? null) : null);

async function importSuggested(sql, env, identity, cur, correlationId, fetchImpl) {
  try {
    return { imported: await importArticle(sql, env, identity, { identifier: cur.identifier }, correlationId, { fetchImpl }) };
  } catch (err) {
    const articleId = duplicateIdOf(err);
    if (!articleId) throw err;
    return { duplicateOf: articleId };
  }
}

async function acceptSuggestion(sql, env, identity, cur, correlationId, fetchImpl) {
  const { imported, duplicateOf } = await importSuggested(sql, env, identity, cur, correlationId, fetchImpl);
  if (duplicateOf) {
    const suggestion = await markDecided(sql, cur.id, { status: 'duplicado', reason: null, articleId: duplicateOf }, identity.profileId);
    return { result: 'duplicado', suggestion };
  }
  const change = { status: 'aceito', reason: null, articleId: imported.article.id };
  return { result: 'aceito', suggestion: await markDecided(sql, cur.id, change, identity.profileId), article: imported.article };
}

async function refuseSuggestion(sql, identity, cur, reason) {
  const change = { status: 'recusado', reason, articleId: null };
  return { result: 'recusado', suggestion: await markDecided(sql, cur.id, change, identity.profileId) };
}

export async function decideSuggestion(sql, env, identity, input = {}, correlationId, { fetchImpl } = {}) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const id = uuidOf(input.id, MSG.badSuggestion);
  if (!SUGGESTION_DECISIONS.includes(input.decision)) throw E.ValidationError(MSG.badDecision);
  const reason = input.decision === 'recusar' ? reasonOf(input.reason) : null;
  await enforce(sql, identity);
  const cur = await loadSuggestion(sql, id);
  if (cur.status !== 'sugerido') throw E.ConflictError(MSG.suggestionDecided);
  const done = input.decision === 'aceitar'
    ? await acceptSuggestion(sql, env, identity, cur, correlationId, fetchImpl)
    : await refuseSuggestion(sql, identity, cur, reason);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_SUGGESTION_DECIDE', 'library_suggestion', id, 'success',
    { decision: input.decision, result: done.result });
  return { success: true, suggestion: done.suggestion, ...(done.article ? { article: done.article } : {}) };
}

// ---------------------------------------------------------------------------
// Coleções
// ---------------------------------------------------------------------------
function toCollection(row, articleIds) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    sortOrder: row.sort_order,
    version: row.version,
    articleIds,
  };
}

export async function listCollections(sql, identity) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  await enforce(sql, identity);
  const rows = await sql`
    SELECT c.id, c.slug, c.title, c.description, c.status, c.sort_order, c.version,
      COALESCE((SELECT array_agg(i.article_id ORDER BY i.position, i.article_id)
                FROM library_collection_items i WHERE i.collection_id = c.id), '{}'::uuid[]) AS article_ids
    FROM library_collections c
    ORDER BY c.sort_order, c.title, c.id
    LIMIT ${COLLECTIONS_MAX}
  `;
  return { success: true, collections: rows.map((r) => toCollection(r, r.article_ids)) };
}

/** Ordem de entrada, sem repetição (a posição de cada artigo é a da primeira ocorrência). */
function articleIdsOf(value) {
  if (!Array.isArray(value) || value.length > LIBRARY_LIMITS.COLLECTION_ITEMS_MAX) throw E.ValidationError(MSG.badItems);
  if (value.some((id) => !isUuid(id))) throw E.ValidationError(MSG.badItems);
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

const collectionTitle = oneLine('title', 3, 120, true);
const collectionDescription = oneLine('description', 1, 600, false);
const collectionSlug = slugOf('slug', 2, 60);

function parseCollection(input) {
  const hasId = input.id !== undefined && input.id !== null;
  if (!COLLECTION_STATUSES.includes(input.status)) throw E.ValidationError(MSG.badStatus);
  return {
    id: hasId ? uuidOf(input.id, MSG.badCollection) : null,
    version: hasId ? versionOf(input.version) : null,
    slug: collectionSlug(input.slug),
    title: collectionTitle(input.title),
    description: collectionDescription(input.description),
    status: input.status,
    sortOrder: sortOrderOf(input.sortOrder) ?? 0,
    articleIds: articleIdsOf(input.articleIds),
  };
}

async function assertAllPublished(sql, ids) {
  if (ids.length === 0) return;
  const rows = await sql`SELECT count(*)::int AS n FROM library_articles WHERE id = ANY(${ids}::uuid[]) AND status = 'publicado'`;
  if (rows[0].n !== ids.length) throw E.ValidationError(MSG.onlyPublished);
}

function insertCollection(sql, c, profileId) {
  return sql`
    WITH c AS (
      INSERT INTO library_collections (slug, title, description, status, sort_order, created_by)
      VALUES (${c.slug}, ${c.title}, ${c.description}::text, ${c.status}, ${c.sortOrder}::smallint, ${profileId}::uuid)
      RETURNING *
    ), ins AS (
      INSERT INTO library_collection_items (collection_id, article_id, position)
      SELECT c.id, t.article_id, (t.pos - 1)::smallint
      FROM c, unnest(${c.articleIds}::uuid[]) WITH ORDINALITY AS t(article_id, pos)
    )
    SELECT * FROM c
  `;
}

/** del e ins são disjuntos: del só pega quem saiu, ins só quem fica ou entra. */
function updateCollection(sql, c) {
  return sql`
    WITH c AS (
      UPDATE library_collections SET
        slug = ${c.slug}, title = ${c.title}, description = ${c.description}::text, status = ${c.status},
        sort_order = ${c.sortOrder}::smallint, version = version + 1
      WHERE id = ${c.id}::uuid AND version = ${c.version}::int
      RETURNING *
    ), del AS (
      DELETE FROM library_collection_items
      WHERE collection_id IN (SELECT id FROM c) AND article_id <> ALL(${c.articleIds}::uuid[])
    ), ins AS (
      INSERT INTO library_collection_items (collection_id, article_id, position)
      SELECT c.id, t.article_id, (t.pos - 1)::smallint
      FROM c, unnest(${c.articleIds}::uuid[]) WITH ORDINALITY AS t(article_id, pos)
      ON CONFLICT (collection_id, article_id) DO UPDATE SET position = EXCLUDED.position
    )
    SELECT * FROM c
  `;
}

async function writeCollection(sql, c, profileId) {
  try {
    return await (c.id ? updateCollection(sql, c) : insertCollection(sql, c, profileId));
  } catch (err) {
    if (err?.code === UNIQUE_VIOLATION) throw E.ConflictError(MSG.collectionSlugTaken);
    throw err;
  }
}

/** Zero linhas no UPDATE: coleção sumiu (404) ou a versão ficou velha (conflito com code). */
async function explainMissingCollection(sql, id) {
  const rows = await sql`SELECT id FROM library_collections WHERE id = ${id}::uuid`;
  if (!rows.length) throw E.NotFoundError(MSG.collectionNotFound);
  const err = E.ConflictError(MSG.collectionStale);
  err.payload = { code: 'version_conflict' };
  throw err;
}

export async function saveCollection(sql, identity, input = {}, correlationId) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const c = parseCollection(input);
  await enforce(sql, identity);
  await assertAllPublished(sql, c.articleIds);
  const rows = await writeCollection(sql, c, identity.profileId);
  if (!rows.length) await explainMissingCollection(sql, c.id);
  const collection = toCollection(rows[0], c.articleIds);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_COLLECTION_SAVE', 'library_collection', collection.id, 'success',
    { status: c.status, items: c.articleIds.length });
  return { success: true, collection };
}

// ---------------------------------------------------------------------------
// Áreas
// ---------------------------------------------------------------------------
const topicSlug = slugOf('slug', 2, 40);
const topicName = oneLine('name', 2, 60, true);

export async function saveTopic(sql, identity, input = {}, correlationId) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const slug = topicSlug(input.slug);
  const name = topicName(input.name);
  const sortOrder = sortOrderOf(input.sortOrder);
  await enforce(sql, identity);
  const rows = await sql`
    INSERT INTO library_topics (slug, name, sort_order)
    VALUES (${slug}, ${name}, COALESCE(${sortOrder}::smallint, 0))
    ON CONFLICT (slug) DO UPDATE SET
      name = EXCLUDED.name,
      sort_order = COALESCE(${sortOrder}::smallint, library_topics.sort_order)
    RETURNING id, slug, name, sort_order
  `;
  // target_id nulo: a área não é um UUID de auditoria que valha guardar; o slug vai em details.
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_TOPIC_SAVE', 'library_topic', null, 'success', { slug });
  const row = rows[0];
  return { success: true, topic: { id: row.id, slug: row.slug, name: row.name, sortOrder: row.sort_order } };
}

// ---------------------------------------------------------------------------
// Equipe (só admin)
// ---------------------------------------------------------------------------
async function loadStaff(sql) {
  const rows = await sql`
    SELECT s.profile_id, p.full_name, s.role, s.granted_at
    FROM library_staff s JOIN profiles p ON p.id = s.profile_id
    ORDER BY lower(p.full_name), s.role
    LIMIT ${STAFF_MAX}
  `;
  return rows.map((r) => ({ profileId: r.profile_id, fullName: r.full_name, role: r.role, grantedAt: iso(r.granted_at) }));
}

export async function listStaff(sql, identity) {
  requireAdmin(identity);
  await enforce(sql, identity);
  return { success: true, staff: await loadStaff(sql) };
}

function parseStaffInput(input) {
  const email = S.normalizeText(input.email).toLowerCase();
  if (!S.isValidEmail(email)) throw E.ValidationError(MSG.badEmail);
  if (!STAFF_ROLES.includes(input.role)) throw E.ValidationError(MSG.badRole);
  if (typeof input.grant !== 'boolean') throw E.ValidationError(MSG.badGrant);
  return { email, role: input.role, grant: input.grant };
}

/** Dar acesso exige conta ativa; tirar acesso vale para qualquer conta (inclusive banida). */
async function findPerson(sql, { email, grant }) {
  const rows = await sql`
    SELECT id FROM profiles WHERE email = ${email} AND (status = 'active' OR ${grant}::boolean = false)
  `;
  if (!rows.length) throw E.NotFoundError(MSG.personNotFound);
  return rows[0].id;
}

function grantStaff(sql, profileId, role, grantedBy) {
  return sql`
    INSERT INTO library_staff (profile_id, role, granted_by)
    VALUES (${profileId}::uuid, ${role}, ${grantedBy}::uuid)
    ON CONFLICT (profile_id, role) DO NOTHING
  `;
}

function revokeStaff(sql, profileId, role) {
  return sql`DELETE FROM library_staff WHERE profile_id = ${profileId}::uuid AND role = ${role}`;
}

export async function setStaff(sql, identity, input = {}, correlationId) {
  requireAdmin(identity);
  const change = parseStaffInput(input);
  await enforce(sql, identity);
  const profileId = await findPerson(sql, change);
  if (change.grant) await grantStaff(sql, profileId, change.role, identity.profileId);
  else await revokeStaff(sql, profileId, change.role);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_STAFF_SET', 'library_staff', profileId, 'success',
    { role: change.role, grant: change.grant });
  return { success: true, staff: await loadStaff(sql) };
}
