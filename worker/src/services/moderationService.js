/**
 * moderationService.js
 * Fila de denúncias entre membros (Fase 3a). Só admin lista/resolve —
 * mesmo padrão de acesso de adminService.js.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}
function assertMemberOrAdmin(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

const REPORT_CATEGORIES = Object.values(C.REPORT_CATEGORY);

export async function submitReport(sql, identity, input, correlationId) {
  assertMemberOrAdmin(identity);
  await S.enforceRateLimit(sql, 'REPORT', identity.profileId, C.RATE_LIMITS.REPORT.MAX_ATTEMPTS, C.RATE_LIMITS.REPORT.WINDOW_SECONDS);

  const targetId = S.normalizeText(input && input.targetProfileId);
  const category = S.normalizeText(input && input.category);
  const details = S.normalizeText(input && input.details);
  const evidenceExcerpt = S.normalizeText(input && input.evidenceExcerpt);

  if (!targetId) throw E.ValidationError('Conta denunciada inválida.');
  if (targetId === identity.profileId) throw E.ValidationError('Não é possível denunciar a própria conta.');
  if (REPORT_CATEGORIES.indexOf(category) === -1) throw E.ValidationError('Categoria de denúncia inválida.');
  if (details && details.length > C.LIMITS.REPORT_DETAILS_MAX) throw E.ValidationError('Descrição da denúncia muito longa.');
  if (evidenceExcerpt && evidenceExcerpt.length > C.LIMITS.REPORT_EVIDENCE_MAX) throw E.ValidationError('Trecho de evidência muito longo.');

  // Exige vínculo prévio (pedido de conexão em qualquer direção, conexão
  // aceita, ou bloqueio) — evita que qualquer conta denuncie qualquer
  // outra sem nunca ter interagido.
  const linkRows = await sql`
    SELECT 1 FROM connections
    WHERE LEAST(requester_id, addressee_id) = LEAST(${identity.profileId}::uuid, ${targetId}::uuid)
      AND GREATEST(requester_id, addressee_id) = GREATEST(${identity.profileId}::uuid, ${targetId}::uuid)
    UNION ALL
    SELECT 1 FROM profile_blocks
    WHERE (blocker_id = ${identity.profileId}::uuid AND blocked_id = ${targetId}::uuid)
       OR (blocker_id = ${targetId}::uuid AND blocked_id = ${identity.profileId}::uuid)
    LIMIT 1
  `;
  if (!linkRows.length) throw E.ForbiddenError('Só é possível denunciar contas com quem você já teve alguma interação na plataforma.');

  try {
    await sql`
      INSERT INTO profile_reports (reporter_id, reported_profile_id, category, details, evidence_excerpt)
      VALUES (${identity.profileId}::uuid, ${targetId}::uuid, ${category}::report_category, ${details || null}, ${evidenceExcerpt || null})
    `;
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (msg.indexOf('uq_profile_reports_open_pair') !== -1) {
      throw E.ConflictError('Você já tem uma denúncia em aberto sobre esta conta.');
    }
    await Logging.logError(sql, correlationId, 'SUBMIT_REPORT_FAILED', 'Falha ao registrar denúncia.', { reporterId: identity.profileId });
    throw err;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'SUBMIT_REPORT', 'profile', targetId, 'success', { category });
  return { success: true, message: 'Denúncia enviada para análise da administração.' };
}

export async function listReports(sql, identity, input) {
  assertAdmin(identity);
  const status = S.normalizeText(input && input.status);
  const page = Math.max(1, parseInt((input && input.page) || 1, 10) || 1);
  const pageSize = C.LIMITS.REPORT_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const whereClause = status ? 'WHERE r.status = $1' : '';
  const params = status ? [status] : [];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const rows = await sql(
    `SELECT r.id AS id, r.category AS category, r.details AS details, r.evidence_excerpt AS evidence_excerpt,
            r.status AS status, r.created_at AS created_at, r.resolved_at AS resolved_at, r.resolution_note AS resolution_note,
            rep.full_name AS reporter_name, rep.username AS reporter_username,
            tgt.full_name AS reported_name, tgt.username AS reported_username
     FROM profile_reports r
     LEFT JOIN profiles rep ON rep.id = r.reporter_id
     LEFT JOIN profiles tgt ON tgt.id = r.reported_profile_id
     ${whereClause}
     ORDER BY r.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params.concat([pageSize, offset])
  );
  const countRows = await sql(`SELECT count(*) AS total FROM profile_reports r ${whereClause}`, params);

  return {
    success: true,
    reports: rows.map((r) => ({
      id: r.id, category: r.category, details: r.details, evidenceExcerpt: r.evidence_excerpt,
      status: r.status, createdAt: r.created_at, resolvedAt: r.resolved_at, resolutionNote: r.resolution_note,
      reporterName: r.reporter_name, reporterUsername: r.reporter_username,
      reportedName: r.reported_name, reportedUsername: r.reported_username,
    })),
    page, pageSize, total: Number(countRows[0].total),
  };
}

const REPORT_TRANSITIONS = {
  open: ['under_review', 'resolved', 'dismissed'],
  under_review: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

export async function resolveReport(sql, identity, reportId, input, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(reportId);
  const newStatus = S.normalizeText(input && input.status);
  const resolutionNote = S.normalizeText(input && input.resolutionNote);

  if (Object.keys(REPORT_TRANSITIONS).indexOf(newStatus) === -1) throw E.ValidationError('Status inválido.');
  if (resolutionNote && resolutionNote.length > C.LIMITS.REPORT_DETAILS_MAX) throw E.ValidationError('Nota de resolução muito longa.');

  const current = await sql`SELECT status FROM profile_reports WHERE id = ${id}::uuid`;
  if (!current.length) throw E.NotFoundError('Denúncia não encontrada.');

  const allowed = REPORT_TRANSITIONS[current[0].status] || [];
  if (current[0].status !== newStatus && allowed.indexOf(newStatus) === -1) {
    throw E.ConflictError('Transição de status de denúncia inválida.');
  }

  const isTerminal = newStatus === 'resolved' || newStatus === 'dismissed';
  if (isTerminal) {
    await sql`
      UPDATE profile_reports SET status = ${newStatus}::report_status,
        resolution_note = ${resolutionNote || null}, resolved_by = ${identity.profileId}::uuid, resolved_at = now()
      WHERE id = ${id}::uuid
    `;
  } else {
    await sql`
      UPDATE profile_reports SET status = ${newStatus}::report_status, resolution_note = ${resolutionNote || null}
      WHERE id = ${id}::uuid
    `;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'RESOLVE_REPORT', 'report', id, 'success', { newStatus });
  return { success: true, message: 'Denúncia atualizada.' };
}
