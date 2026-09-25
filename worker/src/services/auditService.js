/**
 * auditService.js — porta fiel de src/services/AuditService.gs.
 */
import * as C from '../constants.js';
import * as S from '../security.js';

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

export async function listAuditLogs(sql, identity, input) {
  assertAdmin(identity);

  const page = Math.max(1, parseInt((input && input.page) || 1, 10) || 1);
  const pageSize = C.LIMITS.AUDIT_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;
  const actionFilter = S.normalizeText(input && input.action);
  const resultFilter = S.normalizeText(input && input.result);

  const clauses = [];
  const params = [];

  if (actionFilter) {
    params.push('%' + actionFilter + '%');
    clauses.push('a.action ILIKE $' + params.length);
  }
  if (resultFilter === 'success' || resultFilter === 'failure') {
    params.push(resultFilter);
    clauses.push('a.result = $' + params.length);
  }

  const whereClause = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const rows = await sql(
    `SELECT a.id AS id, a.correlation_id AS correlation_id, a.action AS action, a.target_type AS target_type,
            a.target_id AS target_id, a.result AS result, a.details AS details, a.created_at AS created_at,
            p.full_name AS actor_name
     FROM audit_logs a LEFT JOIN profiles p ON p.id = a.actor_id
     ${whereClause}
     ORDER BY a.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params.concat([pageSize, offset])
  );

  const countRows = await sql(`SELECT count(*) AS total FROM audit_logs a ${whereClause}`, params);

  return { success: true, logs: rows, page, pageSize, total: Number(countRows[0].total) };
}

export async function listErrorLogs(sql, identity, input) {
  assertAdmin(identity);

  const page = Math.max(1, parseInt((input && input.page) || 1, 10) || 1);
  const pageSize = C.LIMITS.AUDIT_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const rows = await sql`
    SELECT id, correlation_id, code, message, created_at FROM error_logs
    ORDER BY created_at DESC LIMIT ${pageSize} OFFSET ${offset}
  `;
  const countRows = await sql`SELECT count(*) AS total FROM error_logs`;

  return { success: true, logs: rows, page, pageSize, total: Number(countRows[0].total) };
}
