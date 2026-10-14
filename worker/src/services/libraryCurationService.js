/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryCurationService.js
 * Curadoria de artigos da Biblioteca (CONTRATO-B1 §2, §3, §4.2, §6, §7):
 * cadastro por DOI/PMID sem duplicar, fila, edição com versão, mudança de
 * estado pela máquina de ../library/transitions.js e revisão clínica.
 * Papéis: curador (admin ou library_staff 'curador') e revisor_clinico
 * (library_staff; admin NÃO vira revisor). As ações de curadoria não olham a
 * flag library_enabled (a curadoria carrega o acervo antes do lançamento).
 * Cada escrita é UMA instrução (UPDATE ... WHERE id AND version AND status
 * RETURNING *; INSERT ... ON CONFLICT DO NOTHING): sem transação, o banco
 * decide a corrida. Consultas só em template (o adaptador do PGlite não
 * aceita sql(texto, params)).
 * Quem usa: worker/src/handlers.js (B1-I), libraryAdminService.js (B1-S5) e
 * a aba de curadoria (frontend/admin-library.js).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { LIBRARY_RATE_LIMITS, LIBRARY_LIMITS } from '../library/limits.js';
import { searchNorm } from '../library/normalize.js';
import { isUuid, parseIdentifier } from '../library/identifiers.js';
import { fetchMetadata } from '../library/metadataClient.js';
import {
  STATUSES, allowedTransitions, assertTransition, assertClinicalReviewer, hasClinicalTerms,
} from '../library/transitions.js';
import { can, capabilitiesOf, rolesFor, permissionTable } from '../library/permissions.js';

export const LIBRARY_ROLES = Object.freeze({ CURATOR: 'curador', CLINICAL_REVIEWER: 'revisor_clinico', MENTOR: 'mentor' });

// Ordem em que os papéis aparecem e quem lê a fila (capacidade readQueue em library/permissions.js).
const ROLE_ORDER = Object.freeze(['admin', LIBRARY_ROLES.CURATOR, LIBRARY_ROLES.CLINICAL_REVIEWER, LIBRARY_ROLES.MENTOR]);
const QUEUE_ROLES = ROLE_ORDER;

const QUEUE_PAGE_SIZE = 20;
const QUEUE_PAGE_SIZE_MAX = 100;
const PAGE_MAX = 1000;
const FALLBACK_NAME = 'Curadoria LAIFT';
const YEAR_MIN = 1800;
const YEAR_MAX = 2100;
const TOPICS_MAX = 5;
const REVIEWABLE_STATUSES = ['em_triagem', 'aprovado'];
const DECISIONS = ['aprovar', 'devolver'];
const ARTICLE_TYPES = ['artigo', 'revisao', 'revisao_sistematica', 'meta_analise', 'ensaio_clinico', 'relato_caso', 'diretriz', 'outro'];
const LICENSES = ['cc0', 'pd', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd', 'outra', 'desconhecida'];
const OA_STATUSES = ['diamond', 'gold', 'green', 'hybrid', 'bronze', 'closed', 'desconhecido'];
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const LANGUAGE_RE = /^[a-z]{2}$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const SUMMARY_CONTROL_RE = /[\u0000-\u0009\u000b-\u001f\u007f]/;

const MSG = Object.freeze({
  forbidden: 'Acesso não autorizado para este recurso.',
  duplicate: 'Este artigo já está na Biblioteca.',
  stale: 'Outra pessoa alterou este artigo. Recarregue para ver a versão nova.',
  notFound: 'Artigo não encontrado.',
  invalidId: 'Artigo inválido.',
  invalidVersion: 'Versão inválida.',
  invalidTopic: 'Área inválida.',
  notAllowed: 'Mudança de estado não permitida.',
  clinical: 'Este resumo fala de conduta, dose ou interação: precisa de revisor clínico. Para desmarcar, informe o motivo (3 a 300 caracteres).',
  noTopic: 'Escolha ao menos uma área.',
  noFields: 'Nenhuma alteração informada.',
  badField: 'Campo não permitido.',
  badDecision: 'Decisão inválida.',
  reason: 'Informe o motivo (3 a 300 caracteres).',
  notReviewable: 'Este artigo não está disponível para revisão clínica.',
  noClinicalSummary: 'Este artigo não tem resumo clínico para revisar.',
  invalidType: 'Tipo de artigo inválido.',
});

// ---------------------------------------------------------------------------
// Papéis e limite
// ---------------------------------------------------------------------------
/**
 * Papéis da Biblioteca de quem chama: library_staff (compat), curador para o admin e para quem tem a capacidade
 * library.curate (cargo curador com MFA ativo, ADR 0010). Nunca revisor clínico por cargo.
 */
export async function libraryRolesOf(sql, identity) {
  if (!identity?.profileId) return [];
  const staff = await sql`SELECT role FROM library_staff WHERE profile_id = ${identity.profileId}::uuid`;
  const roles = new Set(staff.map((r) => r.role));
  if (identity.role === C.ROLES.ADMIN) roles.add('admin');
  if (S.hasCapability(identity, 'library.curate')) roles.add(LIBRARY_ROLES.CURATOR);
  return ROLE_ORDER.filter((role) => roles.has(role));
}

/** Exige UM dos papéis; devolve todos os papéis da pessoa (para allowedTransitions). */
async function requireAnyLibraryRole(sql, identity, allowed) {
  const roles = await libraryRolesOf(sql, identity);
  if (!roles.some((role) => allowed.includes(role))) throw E.ForbiddenError(MSG.forbidden);
  return roles;
}

export function requireLibraryRole(sql, identity, role) {
  return requireAnyLibraryRole(sql, identity, [role]);
}

/** Limite de taxa; o erro leva `code: 'rate_limited'` para a tela pausar um lote (B3). */
export async function enforce(sql, bucket, identifier) {
  const limit = LIBRARY_RATE_LIMITS[bucket];
  try {
    await S.enforceRateLimit(sql, bucket, identifier, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') err.payload = { code: 'rate_limited' };
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------
export function articleIdOf(value) {
  if (!isUuid(value)) throw E.ValidationError(MSG.invalidId);
  return value;
}

export function versionOf(value) {
  const n = typeof value === 'string' && /^[0-9]+$/.test(value) ? Number(value) : value;
  if (!Number.isInteger(n) || n < 1 || n > 2147483647) throw E.ValidationError(MSG.invalidVersion);
  return n;
}

function positiveInt(value, fallback, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}

function statusOf(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!STATUSES.includes(value)) throw E.ValidationError(MSG.notAllowed);
  return value;
}

const nullable = (value) => (value === undefined ? null : value);

/** Texto de uma linha: apara, colapsa espaços, recusa controles. Vazio vira null (ou erro se obrigatório). */
function oneLine(name, max, required = false) {
  return (value) => {
    const empty = value === null || value === undefined || value === '';
    if (empty && !required) return null;
    if (typeof value !== 'string') throw E.ValidationError(`Campo inválido: ${name}.`);
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text && !required) return null;
    if (!text || text.length > max || CONTROL_RE.test(text)) throw E.ValidationError(`Campo inválido: ${name}.`);
    return text;
  };
}

function summaryRule(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw E.ValidationError('Campo inválido: summaryText.');
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length > LIBRARY_LIMITS.SUMMARY_MAX || SUMMARY_CONTROL_RE.test(text)) {
    throw E.ValidationError('Campo inválido: summaryText.');
  }
  return text || null;
}

function yearRule(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < YEAR_MIN || n > YEAR_MAX) throw E.ValidationError('Campo inválido: year.');
  return n;
}

function languageRule(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!LANGUAGE_RE.test(text)) throw E.ValidationError('Campo inválido: language.');
  return text;
}

function oneOf(name, list, message) {
  return (value) => {
    if (!list.includes(value)) throw E.ValidationError(message ?? `Campo inválido: ${name}.`);
    return value;
  };
}

function booleanRule(value) {
  if (typeof value !== 'boolean') throw E.ValidationError('Campo inválido: isClinical.');
  return value;
}

function topicsRule(value) {
  if (!Array.isArray(value) || value.some((slug) => typeof slug !== 'string' || !SLUG_RE.test(slug))) {
    throw E.ValidationError(MSG.invalidTopic);
  }
  const unique = [...new Set(value)];
  if (unique.length > TOPICS_MAX) throw E.ValidationError(`Escolha no máximo ${TOPICS_MAX} áreas.`);
  return unique;
}

const FIELD_RULES = Object.freeze({
  title: oneLine('title', 500, true),
  journal: oneLine('journal', 300),
  journalAbbrev: oneLine('journalAbbrev', 120),
  year: yearRule,
  volume: oneLine('volume', 20),
  issue: oneLine('issue', 20),
  pages: oneLine('pages', 30),
  language: languageRule,
  type: oneOf('type', ARTICLE_TYPES, MSG.invalidType),
  topics: topicsRule,
  license: oneOf('license', LICENSES),
  oaStatus: oneOf('oaStatus', OA_STATUSES),
  isClinical: booleanRule,
  summaryText: summaryRule,
});

/** Só os campos conhecidos; cada um validado pela sua regra. Devolve um objeto novo. */
function parseFields(fields) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw E.ValidationError(MSG.noFields);
  const names = Object.keys(fields);
  if (names.length === 0) throw E.ValidationError(MSG.noFields);
  if (names.some((name) => !Object.hasOwn(FIELD_RULES, name))) throw E.ValidationError(MSG.badField);
  return Object.fromEntries(names.map((name) => [name, FIELD_RULES[name](fields[name])]));
}

async function assertTopicsExist(sql, topics) {
  if (topics.length === 0) return;
  const rows = await sql`SELECT slug FROM library_topics WHERE slug = ANY(${topics}::text[])`;
  if (rows.length !== topics.length) throw E.ValidationError(MSG.invalidTopic);
}

// ---------------------------------------------------------------------------
// Saída (AdminArticle e AdminListItem: as colunas em camelCase, sem search_norm)
// ---------------------------------------------------------------------------
// Lista de INCLUSÃO: coluna nova na tabela não vai para a tela sem ser listada
// aqui. Fora de propósito: search_norm (índice interno) e os ids de pessoa
// (created_by, status_changed_by, summary_updated_by, summary_reviewed_by,
// clinical_reviewed_by, approved_by): a aba admin só usa os nomes e as datas.
const ADMIN_COLUMNS = new Set([
  'id', 'doi', 'pmid', 'pmcid', 'title', 'authors', 'author_count', 'journal', 'journal_abbrev',
  'pub_year', 'volume', 'issue', 'pages', 'language', 'article_type', 'topics',
  'license', 'license_source', 'license_conflict', 'oa_status', 'landing_url', 'source_abstract',
  'metadata_sources', 'metadata_fetched_at',
  'status', 'status_reason', 'status_changed_at', 'is_clinical',
  'summary_text', 'summary_origin', 'summary_updated_at', 'summary_reviewed_at', 'summary_reviewer_name',
  'clinical_reviewed_at', 'clinical_reviewer_name',
  'approved_at', 'approver_name', 'published_at',
  'version', 'created_at', 'updated_at',
]);

// Só para as regras do servidor (assertClinicalReviewer compara quem escreveu o resumo).
const STATE_ONLY_COLUMNS = new Set(['summary_updated_by']);

const toCamel = (column) => column.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());

function outValue(column, value) {
  if (value instanceof Date) return value.toISOString();
  if (column === 'authors') return typeof value === 'string' ? JSON.parse(value) : value;
  return value;
}

function mapColumns(row, allowed) {
  return Object.fromEntries(
    Object.entries(row)
      .filter(([column]) => allowed(column))
      .map(([column, value]) => [toCamel(column), outValue(column, value)]),
  );
}

/** O que a tela recebe (AdminArticle). */
export function toAdminArticle(row) {
  return mapColumns(row, (column) => ADMIN_COLUMNS.has(column));
}

/** O artigo para as regras de ../library/transitions.js: AdminArticle mais summaryUpdatedBy. Nunca sai na resposta. */
function toArticleState(row) {
  return mapColumns(row, (column) => ADMIN_COLUMNS.has(column) || STATE_ONLY_COLUMNS.has(column));
}

function authorsOf(row) {
  const list = typeof row.authors === 'string' ? JSON.parse(row.authors) : row.authors;
  return Array.isArray(list) ? list : [];
}

// ---------------------------------------------------------------------------
// Leitura e versão
// ---------------------------------------------------------------------------
export async function loadArticle(sql, id) {
  const rows = await sql`SELECT * FROM library_articles WHERE id = ${id}::uuid`;
  if (!rows.length) throw E.NotFoundError(MSG.notFound);
  return rows[0];
}

/** `payload.code` deixa a tela distinguir conflito de versão de outras falhas. */
export function versionConflict() {
  const err = E.ConflictError(MSG.stale);
  err.payload = { code: 'version_conflict' };
  return err;
}

export function assertVersion(row, version) {
  if (row.version !== version) throw versionConflict();
}

/** Resultado de um UPDATE ... RETURNING: zero linhas = alguém mudou antes (versão ou estado). */
export function requireRow(rows) {
  if (!rows.length) throw versionConflict();
  return rows[0];
}

export const displayName = (identity) => {
  const name = typeof identity.fullName === 'string' ? identity.fullName.trim() : '';
  return name || FALLBACK_NAME;
};

// ---------------------------------------------------------------------------
// importArticle
// ---------------------------------------------------------------------------
function findDuplicate(sql, doi, pmid) {
  return sql`
    SELECT id FROM library_articles
    WHERE (${doi}::text IS NOT NULL AND doi = ${doi}::text)
       OR (${pmid}::text IS NOT NULL AND pmid = ${pmid}::text)
    LIMIT 1
  `;
}

function makeDuplicate(articleId) {
  const err = E.ConflictError(MSG.duplicate);
  if (articleId) err.payload = { articleId };
  return err;
}

async function assertNotDuplicate(sql, doi, pmid) {
  const rows = await findDuplicate(sql, doi, pmid);
  if (rows.length) throw makeDuplicate(rows[0].id);
}

/** Uma instrução: duas pessoas cadastrando o mesmo DOI/PMID ao mesmo tempo, só uma grava. */
function insertImported(sql, r, profileId) {
  return sql`
    INSERT INTO library_articles (
      doi, pmid, pmcid, title, authors, author_count, journal, journal_abbrev, pub_year, volume, issue, pages,
      language, article_type, license, license_source, license_conflict, oa_status, landing_url, source_abstract,
      metadata_sources, metadata_fetched_at, search_norm, status, status_changed_by, created_by
    ) VALUES (
      ${nullable(r.doi)}, ${nullable(r.pmid)}, ${nullable(r.pmcid)}, ${r.title}, ${JSON.stringify(r.authors ?? [])}::jsonb,
      ${r.authorCount ?? 0}, ${nullable(r.journal)}, ${nullable(r.journalAbbrev)}, ${nullable(r.year)},
      ${nullable(r.volume)}, ${nullable(r.issue)}, ${nullable(r.pages)}, ${nullable(r.language)},
      ${r.type ?? 'artigo'}, ${r.license ?? 'desconhecida'}, ${nullable(r.licenseSource)}, ${r.licenseConflict === true},
      ${r.oaStatus ?? 'desconhecido'}, ${r.landingUrl}, ${nullable(r.sourceAbstract)},
      ${r.metadataSources ?? []}::text[], now(), ${r.searchNorm}, 'em_triagem', ${profileId}::uuid, ${profileId}::uuid
    )
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
}

export async function importArticle(sql, env, identity, input = {}, correlationId, { fetchImpl } = {}) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const ident = parseIdentifier(input.identifier);
  await enforce(sql, 'LIBRARY_IMPORT', identity.profileId);
  await enforce(sql, 'LIBRARY_IMPORT_GLOBAL', 'global');
  const isDoi = ident.kind === 'doi';
  await assertNotDuplicate(sql, isDoi ? ident.value : null, isDoi ? null : ident.value);
  const { record, warnings } = await fetchMetadata(ident, { env, fetchImpl });
  const rows = await insertImported(sql, record, identity.profileId);
  if (!rows.length) throw makeDuplicate((await findDuplicate(sql, nullable(record.doi), nullable(record.pmid)))[0]?.id);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_IMPORT', 'library_article', rows[0].id, 'success', { kind: ident.kind });
  return { success: true, article: toAdminArticle(rows[0]), warnings };
}

// ---------------------------------------------------------------------------
// listQueue e getAdminArticle
// ---------------------------------------------------------------------------
async function loadCounts(sql) {
  const rows = await sql`SELECT status, count(*)::int AS n FROM library_articles GROUP BY status`;
  const found = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  return Object.fromEntries(STATUSES.map((status) => [status, found[status] ?? 0]));
}

export async function listQueue(sql, identity, input = {}) {
  await requireAnyLibraryRole(sql, identity, QUEUE_ROLES);
  const status = statusOf(input.status, 'em_triagem');
  const page = positiveInt(input.page, 1, PAGE_MAX);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const offset = (page - 1) * QUEUE_PAGE_SIZE;
  const [rows, counts, topics] = await Promise.all([
    sql`SELECT * FROM library_articles WHERE status = ${status} ORDER BY created_at DESC, id LIMIT ${QUEUE_PAGE_SIZE} OFFSET ${offset}`,
    loadCounts(sql),
    sql`SELECT slug, name FROM library_topics ORDER BY sort_order, name`,
  ]);
  return {
    success: true,
    items: rows.map(toAdminArticle),
    counts,
    topics: topics.map((t) => ({ slug: t.slug, name: t.name })),
    page,
    pageSize: QUEUE_PAGE_SIZE,
    total: counts[status],
  };
}

export async function getAdminArticle(sql, identity, input = {}) {
  const roles = await requireAnyLibraryRole(sql, identity, QUEUE_ROLES);
  const id = articleIdOf(input.id);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const row = await loadArticle(sql, id);
  const favorites = await sql`SELECT count(*)::int AS n FROM library_favorites WHERE article_id = ${id}::uuid`;
  const article = toAdminArticle(row);
  return { success: true, article, allowedTransitions: allowedTransitions(article, roles), favoriteCount: favorites[0].n };
}

// ---------------------------------------------------------------------------
// updateArticle
// ---------------------------------------------------------------------------
const sameText = (a, b) => (a ?? '') === (b ?? '');
const timeOf = (value) => new Date(value).getTime();

const AI_ORIGINS = ['ia', 'ia_editado'];

/**
 * Resumo: mudou? texto e origem finais. Quem edita é o curador: origem 'curador',
 * exceto quando o texto anterior veio da IA (B3): aí vira 'ia_editado' e continua
 * precisando da revisão registrada (decisão 11), que o UPDATE zera ao mudar o texto.
 */
function planSummary(cur, patch) {
  const given = Object.hasOwn(patch, 'summaryText');
  const text = given ? patch.summaryText : cur.summary_text;
  const changed = given && !sameText(patch.summaryText, cur.summary_text);
  const editedOrigin = AI_ORIGINS.includes(cur.summary_origin) ? 'ia_editado' : 'curador';
  const origin = changed ? (text ? editedOrigin : null) : cur.summary_origin;
  return { text: text ?? null, origin: origin ?? null, changed };
}

/** Motivo de 3 a 300 caracteres sem controles (ou null). */
function unmarkReasonOf(reason) {
  if (typeof reason !== 'string') return null;
  const text = reason.replace(/\s+/g, ' ').trim();
  const valid = text.length >= LIBRARY_LIMITS.REASON_MIN && text.length <= LIBRARY_LIMITS.REASON_MAX;
  return valid && !CONTROL_RE.test(text) ? text : null;
}

/**
 * Resumo com conduta, dose ou interação (hasClinicalTerms) força isClinical.
 * Só desmarca quem pede isClinical:false COM motivo (3 a 300), que vai para a
 * auditoria. Resumo que não mudou e já estava desmarcado continua assim (a
 * desmarcação anterior, com motivo, não some numa edição de outro campo).
 * Devolve { isClinical, unmarkReason }.
 */
function planClinical(cur, patch, summary, reason) {
  const asked = Object.hasOwn(patch, 'isClinical');
  if (!summary.text || !hasClinicalTerms(summary.text)) {
    return { isClinical: asked ? patch.isClinical : cur.is_clinical, unmarkReason: null };
  }
  if (asked && patch.isClinical === false) {
    const unmarkReason = unmarkReasonOf(reason);
    if (!unmarkReason) throw E.ValidationError(MSG.clinical);
    return { isClinical: false, unmarkReason };
  }
  const keepsUnmarked = !asked && !summary.changed && cur.is_clinical === false;
  return { isClinical: !keepsUnmarked, unmarkReason: null };
}

function hasValidClinicalReview(cur) {
  if (!cur.clinical_reviewer_name || !cur.clinical_reviewed_at) return false;
  return !cur.summary_updated_at || timeOf(cur.clinical_reviewed_at) >= timeOf(cur.summary_updated_at);
}

/** Publicado sai do ar se o resumo mudou ou se virou clínico sem revisão válida (o CHECK do banco exigiria). */
function needsDemotion(cur, summary, isClinical) {
  if (cur.status !== 'publicado') return false;
  if (summary.changed) return true;
  return isClinical && !cur.is_clinical && Boolean(summary.text) && !hasValidClinicalReview(cur);
}

function planLicense(cur, patch) {
  const changed = Object.hasOwn(patch, 'license') && patch.license !== cur.license;
  return {
    license: changed ? patch.license : cur.license,
    licenseSource: changed ? 'curador' : cur.license_source,
    licenseConflict: changed ? false : cur.license_conflict,
  };
}

/** Valores finais de todas as colunas editáveis (objeto novo; a linha lida não é tocada). */
function planUpdate(cur, patch, reason) {
  const pick = (key, column) => (Object.hasOwn(patch, key) ? patch[key] : cur[column]);
  const summary = planSummary(cur, patch);
  const { isClinical, unmarkReason } = planClinical(cur, patch, summary, reason);
  const topics = pick('topics', 'topics');
  if (['aprovado', 'publicado'].includes(cur.status) && topics.length === 0) throw E.ValidationError(MSG.noTopic);
  const demoted = needsDemotion(cur, summary, isClinical);
  const fields = {
    title: pick('title', 'title'),
    journal: pick('journal', 'journal'),
    journalAbbrev: pick('journalAbbrev', 'journal_abbrev'),
    pubYear: pick('year', 'pub_year'),
    volume: pick('volume', 'volume'),
    issue: pick('issue', 'issue'),
    pages: pick('pages', 'pages'),
    language: pick('language', 'language'),
    articleType: pick('type', 'article_type'),
    oaStatus: pick('oaStatus', 'oa_status'),
    topics,
    isClinical,
    unmarkReason,
    ...planLicense(cur, patch),
    summaryText: summary.text,
    summaryOrigin: summary.origin,
    summaryChanged: summary.changed,
    status: demoted ? 'aprovado' : cur.status,
    demoted,
  };
  const searchText = searchNorm({
    title: fields.title, authors: authorsOf(cur), journal: fields.journal, journalAbbrev: fields.journalAbbrev, doi: cur.doi, pmid: cur.pmid,
  });
  return { ...fields, searchNorm: searchText };
}

function runUpdate(sql, cur, n, profileId) {
  return sql`
    UPDATE library_articles SET
      title = ${n.title}, journal = ${n.journal}, journal_abbrev = ${n.journalAbbrev},
      pub_year = ${n.pubYear}::smallint, volume = ${n.volume}, issue = ${n.issue}, pages = ${n.pages},
      language = ${n.language}, article_type = ${n.articleType}, topics = ${n.topics}::text[],
      license = ${n.license}, license_source = ${n.licenseSource}::text, license_conflict = ${n.licenseConflict}::boolean,
      oa_status = ${n.oaStatus}, is_clinical = ${n.isClinical}::boolean,
      summary_text = ${n.summaryText}::text, summary_origin = ${n.summaryOrigin}::text,
      summary_updated_at = CASE WHEN ${n.summaryChanged}::boolean THEN now() ELSE summary_updated_at END,
      summary_updated_by = CASE WHEN ${n.summaryChanged}::boolean THEN ${profileId}::uuid ELSE summary_updated_by END,
      summary_reviewed_at = CASE WHEN ${n.summaryChanged}::boolean THEN NULL ELSE summary_reviewed_at END,
      summary_reviewed_by = CASE WHEN ${n.summaryChanged}::boolean THEN NULL ELSE summary_reviewed_by END,
      summary_reviewer_name = CASE WHEN ${n.summaryChanged}::boolean THEN NULL ELSE summary_reviewer_name END,
      status = ${n.status}::text,
      status_changed_at = CASE WHEN ${n.demoted}::boolean THEN now() ELSE status_changed_at END,
      status_changed_by = CASE WHEN ${n.demoted}::boolean THEN ${profileId}::uuid ELSE status_changed_by END,
      search_norm = ${n.searchNorm}, version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

export async function updateArticle(sql, identity, input = {}, correlationId) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const id = articleIdOf(input.id);
  const version = versionOf(input.version);
  const patch = parseFields(input.fields);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const cur = await loadArticle(sql, id);
  assertVersion(cur, version);
  if (Object.hasOwn(patch, 'topics')) await assertTopicsExist(sql, patch.topics);
  const next = planUpdate(cur, patch, input.reason);
  const row = requireRow(await runUpdate(sql, cur, next, identity.profileId));
  const details = { fields: Object.keys(patch), ...(next.unmarkReason ? { clinicalUnmarkReason: next.unmarkReason } : {}) };
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_UPDATE', 'library_article', id, 'success', details);
  if (next.demoted) {
    await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_STATUS', 'library_article', id, 'success', { from: cur.status, to: next.status });
  }
  return { success: true, article: toAdminArticle(row) };
}

// ---------------------------------------------------------------------------
// setStatus
// ---------------------------------------------------------------------------
/** Uma instrução; o que cada destino grava ou limpa está na tabela do contrato §2. */
function runStatusUpdate(sql, cur, to, reason, identity) {
  const name = displayName(identity);
  return sql`
    UPDATE library_articles SET
      status = ${to}::text, status_changed_at = now(), status_changed_by = ${identity.profileId}::uuid,
      status_reason = ${reason}::text,
      approved_at = CASE ${to}::text WHEN 'aprovado' THEN now() WHEN 'em_triagem' THEN NULL ELSE approved_at END,
      approved_by = CASE ${to}::text WHEN 'aprovado' THEN ${identity.profileId}::uuid WHEN 'em_triagem' THEN NULL ELSE approved_by END,
      approver_name = CASE ${to}::text WHEN 'aprovado' THEN ${name}::text WHEN 'em_triagem' THEN NULL ELSE approver_name END,
      published_at = CASE ${to}::text WHEN 'publicado' THEN now() WHEN 'em_triagem' THEN NULL ELSE published_at END,
      version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

const reasonFor = (to, reason) => (['rejeitado', 'removido'].includes(to) ? String(reason).trim() : null);

export async function setStatus(sql, identity, input = {}, correlationId) {
  const roles = await requireLibraryRole(sql, identity, LIBRARY_ROLES.CURATOR);
  const id = articleIdOf(input.id);
  const version = versionOf(input.version);
  const to = statusOf(input.to, null);
  if (!to) throw E.ValidationError(MSG.notAllowed);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const cur = await loadArticle(sql, id);
  assertVersion(cur, version);
  assertTransition(toArticleState(cur), to, roles, input.reason);
  const row = requireRow(await runStatusUpdate(sql, cur, to, reasonFor(to, input.reason), identity));
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_STATUS', 'library_article', id, 'success', { from: cur.status, to });
  return { success: true, article: toAdminArticle(row) };
}

// ---------------------------------------------------------------------------
// clinicalReview
// ---------------------------------------------------------------------------
function noteFor(decision, note) {
  const text = typeof note === 'string' ? note.trim() : '';
  const valid = text.length >= LIBRARY_LIMITS.REASON_MIN && text.length <= LIBRARY_LIMITS.REASON_MAX && !CONTROL_RE.test(text);
  if (decision === 'devolver' && !valid) throw E.ValidationError(MSG.reason);
  return decision === 'devolver' ? text : null;
}

function assertReviewable(cur) {
  if (!REVIEWABLE_STATUSES.includes(cur.status)) throw E.ValidationError(MSG.notReviewable);
  if (!cur.is_clinical || !cur.summary_text) throw E.ValidationError(MSG.noClinicalSummary);
}

function runApproval(sql, cur, identity) {
  const name = displayName(identity);
  return sql`
    UPDATE library_articles SET
      clinical_reviewed_at = now(), clinical_reviewed_by = ${identity.profileId}::uuid,
      clinical_reviewer_name = ${name}::text, version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

function runReturn(sql, cur, note, profileId) {
  return sql`
    UPDATE library_articles SET
      status = 'em_triagem', status_reason = ${note}::text, status_changed_at = now(), status_changed_by = ${profileId}::uuid,
      approved_at = NULL, approved_by = NULL, approver_name = NULL,
      clinical_reviewed_at = NULL, clinical_reviewed_by = NULL, clinical_reviewer_name = NULL,
      version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

export async function clinicalReview(sql, identity, input = {}, correlationId) {
  await requireLibraryRole(sql, identity, LIBRARY_ROLES.CLINICAL_REVIEWER);
  const id = articleIdOf(input.id);
  const version = versionOf(input.version);
  if (!DECISIONS.includes(input.decision)) throw E.ValidationError(MSG.badDecision);
  const note = noteFor(input.decision, input.note);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const cur = await loadArticle(sql, id);
  assertVersion(cur, version);
  assertReviewable(cur);
  if (input.decision === 'aprovar') assertClinicalReviewer(toArticleState(cur), identity);
  const rows = input.decision === 'aprovar'
    ? await runApproval(sql, cur, identity)
    : await runReturn(sql, cur, note, identity.profileId);
  const row = requireRow(rows);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_CLINICAL_REVIEW', 'library_article', id, 'success', { decision: input.decision });
  return { success: true, article: toAdminArticle(row) };
}
