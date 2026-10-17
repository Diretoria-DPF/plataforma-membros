/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryWorkflowService.js
 * Ações de fluxo da Biblioteca que a tela de curadoria usa em lote ou com poder de admin:
 * publicar vários artigos de uma vez (publishMany), mudar o estado de qualquer artigo
 * (changeStatus, só admin) e pôr áreas em vários artigos (setAreas).
 * Reaproveita as regras de ../library/transitions.js e os helpers de libraryCurationService.js.
 * Cada escrita é UMA instrução com a versão no WHERE (o banco decide a corrida); o lote segue item
 * a item e devolve o resultado de cada um, então um item que falha não derruba os outros.
 * Quem usa: worker/src/handlers.js e frontend/admin-library*.js.
 */
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import {
  STATUSES, assertTransition, preconditionFailure, reasonFailureFor, needsClinicalReview, needsSummaryApproval,
} from '../library/transitions.js';
import { can } from '../library/permissions.js';
import {
  libraryRolesOf, enforce, articleIdOf, versionOf, loadArticle, requireRow, assertVersion, toAdminArticle,
  toArticleState, runStatusUpdate, reasonFor, displayName, topicsRule, assertTopicsExist,
} from './libraryCurationService.js';

const PUBLISH_MAX = 50;
const AREAS_MAX_ITEMS = 50;
const TOPICS_MAX = 5;
const PUBLISHABLE = ['em_triagem', 'aprovado'];
const KNOWN_FAILURES = ['ValidationError', 'ConflictError', 'NotFoundError'];

const MSG = Object.freeze({
  forbidden: 'Acesso não autorizado para este recurso.',
  notAllowed: 'Mudança de estado não permitida.',
  notPublishable: 'Só artigos para revisar ou aprovados podem ser publicados.',
  notFound: 'Artigo não encontrado.',
  stale: 'Outra pessoa alterou este artigo. Recarregue para ver a versão nova.',
  noTopic: 'Escolha ao menos uma área.',
  tooManyTopics: `Escolha no máximo ${TOPICS_MAX} áreas.`,
  badMode: 'Modo inválido.',
});

async function requireCapability(sql, identity, capability) {
  const roles = await libraryRolesOf(sql, identity);
  if (!can(roles, capability)) throw E.ForbiddenError(MSG.forbidden);
  return roles;
}

/** Lista de ids sem repetição, de 1 a `max`; cada um precisa ser um uuid. */
function idListOf(value, max) {
  if (!Array.isArray(value) || value.length < 1 || value.length > max) {
    throw E.ValidationError(`Informe de 1 a ${max} artigos.`);
  }
  return [...new Set(value.map(articleIdOf))];
}

// ---------------------------------------------------------------------------
// publishMany
// ---------------------------------------------------------------------------
/** Artigo clínico sem revisor: sai só como referência (sem resumo), como na migração 030. */
function runReference(sql, cur) {
  return sql`
    UPDATE library_articles SET summary_text = NULL, summary_origin = NULL, reference_only = TRUE, version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

/** Quem publica diz que leu o resumo de IA: registra a aprovação com nome e data. */
function runSummaryApproval(sql, cur, identity) {
  const name = displayName(identity);
  return sql`
    UPDATE library_articles SET
      summary_reviewed_at = now(), summary_reviewed_by = ${identity.profileId}::uuid,
      summary_reviewer_name = ${name}::text, version = version + 1
    WHERE id = ${cur.id}::uuid AND version = ${cur.version}::int AND status = ${cur.status}::text
    RETURNING *
  `;
}

async function prepareSummary(sql, identity, row, options) {
  let next = row;
  if (options.clinicalAsReference && needsClinicalReview(toArticleState(next))) {
    next = requireRow(await runReference(sql, next));
  }
  const state = toArticleState(next);
  if (options.approveAiSummaries && !needsClinicalReview(state) && needsSummaryApproval(state)) {
    next = requireRow(await runSummaryApproval(sql, next, identity));
  }
  return next;
}

async function advanceToPublished(sql, identity, roles, cur, options, progress) {
  if (!PUBLISHABLE.includes(cur.status)) throw E.ValidationError(MSG.notPublishable);
  let row = cur;
  if (row.status === 'em_triagem') {
    assertTransition(toArticleState(row), 'aprovado', roles);
    row = requireRow(await runStatusUpdate(sql, row, 'aprovado', null, identity));
    progress.status = row.status;
  }
  row = await prepareSummary(sql, identity, row, options);
  assertTransition(toArticleState(row), 'publicado', roles);
  return requireRow(await runStatusUpdate(sql, row, 'publicado', null, identity));
}

function failureOf(progress, err) {
  const base = { id: progress.id, title: progress.title, ok: false, status: progress.status };
  if (err?.payload?.code === 'rate_limited') return { ...base, code: 'rate_limited', message: err.message };
  if (KNOWN_FAILURES.includes(err?.name)) return { ...base, message: err.message };
  throw err;
}

async function publishItem(sql, identity, roles, id, options, correlationId) {
  const progress = { id, title: null, status: null };
  try {
    await enforce(sql, 'LIBRARY_PUBLISH', identity.profileId);
    const cur = await loadArticle(sql, id);
    Object.assign(progress, { title: cur.title, status: cur.status });
    const row = await advanceToPublished(sql, identity, roles, cur, options, progress);
    await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_STATUS', 'library_article', id, 'success', { from: cur.status, to: 'publicado', batch: true });
    return { id, title: row.title, ok: true, status: row.status, referenceOnly: row.reference_only === true };
  } catch (err) {
    return failureOf(progress, err);
  }
}

export async function publishMany(sql, identity, input = {}, correlationId) {
  const roles = await requireCapability(sql, identity, 'publish');
  const ids = idListOf(input.ids, PUBLISH_MAX);
  const options = { approveAiSummaries: input.approveAiSummaries === true, clinicalAsReference: input.clinicalAsReference === true };
  const results = [];
  for (const id of ids) {
    const last = results.at(-1);
    if (last?.code === 'rate_limited') {
      results.push({ id, title: null, ok: false, status: null, code: 'rate_limited', message: last.message });
      continue;
    }
    results.push(await publishItem(sql, identity, roles, id, options, correlationId));
  }
  const published = results.filter((r) => r.ok).length;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_PUBLISH_MANY', 'library_article', null, 'success', { requested: ids.length, published, ...options });
  return { success: true, results, published, failed: results.length - published };
}

// ---------------------------------------------------------------------------
// changeStatus (só admin)
// ---------------------------------------------------------------------------
function statusTarget(value) {
  if (!STATUSES.includes(value)) throw E.ValidationError(MSG.notAllowed);
  return value;
}

/** Falha de pré-condição do destino (e do passo "aprovado" que o publicado exige, quando vem de outro estado). */
function changeFailure(cur, to, reason, viaApproved) {
  const state = toArticleState(cur);
  return (viaApproved ? preconditionFailure(state, 'aprovado') : null)
    ?? preconditionFailure(state, to)
    ?? reasonFailureFor(to, reason);
}

export async function changeStatus(sql, identity, input = {}, correlationId) {
  await requireCapability(sql, identity, 'changeStatus');
  const id = articleIdOf(input.id);
  const version = versionOf(input.version);
  const to = statusTarget(input.to);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const cur = await loadArticle(sql, id);
  assertVersion(cur, version);
  if (cur.status === to) throw E.ValidationError(MSG.notAllowed);
  const viaApproved = to === 'publicado' && cur.status !== 'aprovado';
  const failure = changeFailure(cur, to, input.reason, viaApproved);
  if (failure) throw E.ValidationError(failure);
  const base = viaApproved ? requireRow(await runStatusUpdate(sql, cur, 'aprovado', null, identity)) : cur;
  const row = requireRow(await runStatusUpdate(sql, base, to, reasonFor(to, input.reason), identity));
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_ARTICLE_STATUS', 'library_article', id, 'success', { from: cur.status, to, byAdmin: true });
  return { success: true, article: toAdminArticle(row) };
}

// ---------------------------------------------------------------------------
// setAreas
// ---------------------------------------------------------------------------
function modeOf(value) {
  if (value === undefined || value === null || value === 'add') return 'add';
  if (value === 'replace') return 'replace';
  throw E.ValidationError(MSG.badMode);
}

function nextTopics(current, wanted, mode) {
  return mode === 'replace' ? wanted : [...new Set([...(current ?? []), ...wanted])];
}

async function areasItem(sql, id, cur, wanted, mode) {
  if (!cur) return { id, ok: false, message: MSG.notFound };
  const topics = nextTopics(cur.topics, wanted, mode);
  if (topics.length > TOPICS_MAX) return { id, ok: false, message: MSG.tooManyTopics };
  const rows = await sql`
    UPDATE library_articles SET topics = ${topics}::text[], version = version + 1
    WHERE id = ${id}::uuid AND version = ${cur.version}::int
    RETURNING id
  `;
  return rows.length ? { id, ok: true, topics } : { id, ok: false, message: MSG.stale };
}

export async function setAreas(sql, identity, input = {}, correlationId) {
  await requireCapability(sql, identity, 'edit');
  const ids = idListOf(input.ids, AREAS_MAX_ITEMS);
  const wanted = topicsRule(input.topics);
  if (!wanted.length) throw E.ValidationError(MSG.noTopic);
  const mode = modeOf(input.mode);
  await assertTopicsExist(sql, wanted);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const found = await sql`SELECT id, version, topics FROM library_articles WHERE id = ANY(${ids}::uuid[])`;
  const byId = new Map(found.map((r) => [r.id, r]));
  const results = [];
  for (const id of ids) results.push(await areasItem(sql, id, byId.get(id), wanted, mode));
  const changed = results.filter((r) => r.ok).length;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_SET_AREAS', 'library_article', null, 'success', { requested: ids.length, changed, mode, topics: wanted });
  return { success: true, results, changed };
}
