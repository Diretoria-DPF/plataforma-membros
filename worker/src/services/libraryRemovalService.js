/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * libraryRemovalService.js
 * Pedidos de remoção de artigos publicados (migração 030): curador e mentor PEDEM, só o
 * administrador decide. Aceitar tira o artigo do ar (status removido, com o motivo do pedido)
 * e marcar o pedido como aceito numa única instrução; recusar só encerra o pedido.
 * Um pedido pendente por artigo (índice único parcial). O admin não pede: tira do ar direto
 * (libraryWorkflowService.changeStatus).
 * Quem usa: worker/src/handlers.js e frontend/admin-library*.js.
 */
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { LIBRARY_LIMITS } from '../library/limits.js';
import { isUuid } from '../library/identifiers.js';
import { can } from '../library/permissions.js';
import { libraryRolesOf, enforce, articleIdOf, loadArticle } from './libraryCurationService.js';

const LIST_LIMIT = 100;
const STATUS_FILTERS = ['pendente', 'aceito', 'recusado', 'todos'];
const DECISIONS = Object.freeze({ aceitar: 'aceito', recusar: 'recusado' });
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const MSG = Object.freeze({
  forbidden: 'Acesso não autorizado para este recurso.',
  reason: 'Informe o motivo (3 a 300 caracteres).',
  notPublished: 'Só artigos que estão no ar podem ter a remoção pedida.',
  adminDirect: 'Você é administrador: tire o artigo do ar direto.',
  duplicate: 'Já existe um pedido de remoção para este artigo.',
  invalidRequest: 'Pedido inválido.',
  badDecision: 'Decisão inválida.',
  badStatus: 'Filtro inválido.',
  notFound: 'Pedido não encontrado.',
  decided: 'Este pedido já foi decidido.',
});

async function requireCapability(sql, identity, capability) {
  const roles = await libraryRolesOf(sql, identity);
  if (!can(roles, capability)) throw E.ForbiddenError(MSG.forbidden);
  return roles;
}

function reasonOf(value) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  const valid = text.length >= LIBRARY_LIMITS.REASON_MIN && text.length <= LIBRARY_LIMITS.REASON_MAX && !CONTROL_RE.test(text);
  if (!valid) throw E.ValidationError(MSG.reason);
  return text;
}

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

function toRequest(row) {
  return {
    id: row.id,
    articleId: row.article_id,
    status: row.status,
    reason: row.reason,
    createdAt: iso(row.created_at),
    decidedAt: iso(row.decided_at),
  };
}

// ---------------------------------------------------------------------------
// requestRemoval
// ---------------------------------------------------------------------------
export async function requestRemoval(sql, identity, input = {}, correlationId) {
  const roles = await requireCapability(sql, identity, 'requestRemoval');
  const id = articleIdOf(input.id);
  const reason = reasonOf(input.reason);
  if (can(roles, 'remove')) throw E.ValidationError(MSG.adminDirect);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const article = await loadArticle(sql, id);
  if (article.status !== 'publicado') throw E.ValidationError(MSG.notPublished);
  const rows = await sql`
    INSERT INTO library_removal_requests (article_id, requested_by, reason)
    VALUES (${id}::uuid, ${identity.profileId}::uuid, ${reason})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;
  if (!rows.length) throw E.ConflictError(MSG.duplicate);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_REMOVAL_REQUEST', 'library_article', id, 'success', { requestId: rows[0].id });
  return { success: true, request: toRequest(rows[0]) };
}

// ---------------------------------------------------------------------------
// listRemovalRequests
// ---------------------------------------------------------------------------
function statusFilter(value) {
  if (value === undefined || value === null || value === '') return 'pendente';
  if (!STATUS_FILTERS.includes(value)) throw E.ValidationError(MSG.badStatus);
  return value;
}

function toListItem(row) {
  return {
    ...toRequest(row),
    articleTitle: row.title,
    articleDoi: row.doi ?? null,
    articleStatus: row.article_status,
    requestedByName: row.requested_by_name ?? null,
  };
}

/** O admin vê todos os pedidos; a equipe vê só os que ela mesma fez. */
export async function listRemovalRequests(sql, identity, input = {}) {
  const roles = await requireCapability(sql, identity, 'readQueue');
  const status = statusFilter(input.status);
  const seesAll = can(roles, 'decideRemoval');
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const [rows, pending] = await Promise.all([
    sql`
      SELECT r.*, a.title, a.doi, a.status AS article_status, p.full_name AS requested_by_name
      FROM library_removal_requests r
      JOIN library_articles a ON a.id = r.article_id
      LEFT JOIN profiles p ON p.id = r.requested_by
      WHERE (${status}::text = 'todos' OR r.status = ${status}::text)
        AND (${seesAll}::boolean OR r.requested_by = ${identity.profileId}::uuid)
      ORDER BY r.created_at DESC, r.id
      LIMIT ${LIST_LIMIT}
    `,
    sql`
      SELECT count(*)::int AS n FROM library_removal_requests
      WHERE status = 'pendente' AND (${seesAll}::boolean OR requested_by = ${identity.profileId}::uuid)
    `,
  ]);
  return { success: true, items: rows.map(toListItem), pendingCount: pending[0].n };
}

// ---------------------------------------------------------------------------
// decideRemoval (só admin)
// ---------------------------------------------------------------------------
/** Uma instrução: fecha o pedido pendente e, se aceito, tira do ar o artigo que ainda estiver publicado. */
function runDecision(sql, requestId, status, accept, profileId) {
  return sql`
    WITH r AS (
      UPDATE library_removal_requests SET status = ${status}::text, decided_by = ${profileId}::uuid, decided_at = now()
      WHERE id = ${requestId}::uuid AND status = 'pendente'
      RETURNING article_id, reason
    ), a AS (
      UPDATE library_articles SET
        status = 'removido', status_reason = (SELECT reason FROM r), status_changed_at = now(),
        status_changed_by = ${profileId}::uuid, version = version + 1
      WHERE ${accept}::boolean AND status = 'publicado' AND id = (SELECT article_id FROM r)
      RETURNING id
    )
    SELECT (SELECT count(*) FROM r)::int AS decided, (SELECT count(*) FROM a)::int AS removed
  `;
}

export async function decideRemoval(sql, identity, input = {}, correlationId) {
  await requireCapability(sql, identity, 'decideRemoval');
  if (!isUuid(input.id)) throw E.ValidationError(MSG.invalidRequest);
  const status = DECISIONS[input.decision];
  if (!status) throw E.ValidationError(MSG.badDecision);
  await enforce(sql, 'LIBRARY_CURATE', identity.profileId);
  const [outcome] = await runDecision(sql, input.id, status, status === 'aceito', identity.profileId);
  if (!outcome.decided) {
    const known = await sql`SELECT 1 FROM library_removal_requests WHERE id = ${input.id}::uuid`;
    throw known.length ? E.ConflictError(MSG.decided) : E.NotFoundError(MSG.notFound);
  }
  const articleRemoved = outcome.removed > 0;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'LIBRARY_REMOVAL_DECIDE', 'library_removal_request', input.id, 'success', { decision: status, articleRemoved });
  return { success: true, request: { id: input.id, status, articleRemoved } };
}
