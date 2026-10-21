/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * privacyService.js
 * Direitos do titular (LGPD, art. 18): exportar os próprios dados e pedir a exclusão da conta.
 *
 *   - exportMyData: só os dados da PRÓPRIA pessoa, nunca segredos (hash de senha, tokens, MFA) nem material interno da
 *     comissão (resumo de IA, observações, sinais). Mensagens privadas ficam de fora: são cifradas ponta a ponta.
 *   - pedido de exclusão: registro com prazo de 180 dias, que NÃO guarda dado pessoal além do primeiro nome (rótulo para
 *     a diretoria reconhecer o pedido) e que é zerado quando a exclusão é concluída.
 *   - completeDeletion (diretoria administrativa): apaga o perfil (as chaves estrangeiras cuidam do resto), recusa apagar
 *     a própria conta e o último administrador, e audita sem dado pessoal.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { freeField } from '../selection/rules.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_STATUSES = ['requested', 'completed', 'cancelled'];
const LIST_LIMIT = 200;
const EXPORT_LIMIT = 500;
const REASON_MAX = 500;

const MSG = Object.freeze({
  needSession: 'Entre na sua conta para continuar.',
  forbidden: 'Apenas a diretoria administrativa acessa os pedidos de exclusão.',
  badId: 'Pedido inválido.',
  notFound: 'Pedido não encontrado.',
  noActive: 'Você não tem pedido de exclusão em aberto.',
  done: 'Este pedido já foi processado.',
  self: 'Você não pode concluir a exclusão da sua própria conta de administrador. Peça a outra pessoa da diretoria.',
  lastAdmin: 'Esta é a última conta de administrador ativa: não é possível removê-la.',
  reasonLong: 'O motivo deve ter no máximo ' + REASON_MAX + ' caracteres.',
});

const NOTES = Object.freeze([
  'Mensagens privadas não estão neste arquivo: são cifradas ponta a ponta e só você e quem conversa com você conseguem lê-las.',
  'Não incluímos segredos de segurança (senha, tokens, fatores de autenticação) nem anotações internas da comissão do processo seletivo.',
  'Votos e tarefas aparecem pelo título, para você reconhecê-los.',
]);

const iso = (value) => (value ? new Date(value).toISOString() : null);

function requireSession(identity) {
  if (!identity || !identity.profileId) throw E.ForbiddenError(MSG.needSession);
}

function requireAdmin(identity) {
  if (!identity || identity.role !== C.ROLES.ADMIN || !identity.profileId) throw E.ForbiddenError(MSG.forbidden);
}

async function limit(sql, key, identity) {
  const rule = C.RATE_LIMITS[key];
  await S.enforceRateLimit(sql, key, identity.profileId, rule.MAX_ATTEMPTS, rule.WINDOW_SECONDS);
}

const firstName = (fullName) => String(fullName || '').trim().split(/\s+/)[0].slice(0, 60) || null;

function toRequest(row) {
  return { id: row.id, status: row.status, requestedAt: iso(row.requested_at), dueAt: iso(row.due_at), processedAt: iso(row.processed_at) };
}

/** Uma tabela ausente (migração atrasada) esvazia a seção em vez de derrubar a exportação. */
async function section(query) {
  try { return await query(); } catch (err) { return []; }
}

function profileOut(p) {
  return {
    id: p.id, fullName: p.full_name, username: p.username || null, email: p.email, phone: p.phone, city: p.city || null,
    education: p.education || null, role: p.role, status: p.status, emailConfirmedAt: iso(p.email_confirmed_at),
    createdAt: iso(p.created_at), avatarUrl: p.avatar_url || null, linkedinUrl: p.linkedin_url || null,
    instagramHandle: p.instagram_handle || null, interests: p.interests || null, leaguePosition: p.league_position || null,
    directorate: p.directorate || null, phoneDiscoverable: !!p.phone_discoverable,
  };
}

/** Respostas da própria pessoa; nunca os sinais internos (_signals). */
function ownAnswers(data) {
  const { _signals, ...answers } = (data && typeof data === 'object') ? data : {};
  return answers;
}

/** Exporta os dados da própria pessoa. */
export async function exportMyData(sql, identity) {
  requireSession(identity);
  await limit(sql, 'PRIVACY_EXPORT', identity);
  const id = identity.profileId;
  const [profile] = await sql`
    SELECT id, full_name, username, email, phone, city, education, role, status, email_confirmed_at, created_at, avatar_url,
           linkedin_url, instagram_handle, interests, league_position, directorate, phone_discoverable
    FROM profiles WHERE id = ${id}::uuid`;
  if (!profile) throw E.NotFoundError(MSG.needSession);
  const [selection, events, votes, tasks, consents, roles] = await Promise.all([
    section(() => sql`SELECT status, step, data, receipt_code, started_at, submitted_at, decided_at, appeal_at, appeal_note
      FROM selection_applications WHERE profile_id = ${id}::uuid ORDER BY started_at DESC LIMIT ${EXPORT_LIMIT}`),
    section(() => sql`SELECT e.title, e.event_date, r.registered_at FROM event_registrations r JOIN events e ON e.id = r.event_id
      WHERE r.profile_id = ${id}::uuid ORDER BY r.registered_at DESC LIMIT ${EXPORT_LIMIT}`),
    section(() => sql`SELECT p.title, v.choice, v.complement_text, v.created_at FROM votes v JOIN proposals p ON p.id = v.proposal_id
      WHERE v.profile_id = ${id}::uuid ORDER BY v.created_at DESC LIMIT ${EXPORT_LIMIT}`),
    section(() => sql`SELECT t.title, t.status, s.signed_up_at FROM task_signups s JOIN tasks t ON t.id = s.task_id
      WHERE s.profile_id = ${id}::uuid ORDER BY s.signed_up_at DESC LIMIT ${EXPORT_LIMIT}`),
    section(() => sql`SELECT document_type, document_version, accepted_at FROM consents
      WHERE profile_id = ${id}::uuid ORDER BY accepted_at DESC LIMIT ${EXPORT_LIMIT}`),
    section(() => sql`SELECT role, granted_at FROM member_roles WHERE profile_id = ${id}::uuid LIMIT ${EXPORT_LIMIT}`),
  ]);
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    data: {
      profile: profileOut(profile),
      memberRoles: roles.map((r) => ({ role: r.role, grantedAt: iso(r.granted_at) })),
      selection: selection.map((s) => ({
        status: s.status, step: s.step, receiptCode: s.receipt_code || null, startedAt: iso(s.started_at),
        submittedAt: iso(s.submitted_at), decidedAt: iso(s.decided_at), appealAt: iso(s.appeal_at), appealNote: s.appeal_note || null,
        answers: ownAnswers(s.data),
      })),
      events: events.map((e) => ({ title: e.title, eventDate: iso(e.event_date), registeredAt: iso(e.registered_at) })),
      votes: votes.map((v) => ({ proposal: v.title, choice: v.choice, complement: v.complement_text || null, createdAt: iso(v.created_at) })),
      tasks: tasks.map((t) => ({ title: t.title, status: t.status, signedUpAt: iso(t.signed_up_at) })),
      consents: consents.map((c) => ({ document: c.document_type, version: c.document_version, acceptedAt: iso(c.accepted_at) })),
    },
    notes: NOTES.slice(),
  };
}

async function activeRequest(sql, profileId) {
  const [row] = await sql`
    SELECT id, status, requested_at, due_at, processed_at FROM account_deletion_requests
    WHERE profile_id = ${profileId}::uuid AND status = 'requested' LIMIT 1`;
  return row || null;
}

/** Pede a exclusão da conta (idempotente: repetir devolve o pedido em aberto). */
export async function requestDeletion(sql, identity, rawInput, correlationId) {
  requireSession(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  if (typeof input.reason === 'string' && input.reason.trim().length > REASON_MAX) throw E.ValidationError(MSG.reasonLong);
  await limit(sql, 'PRIVACY_REQUEST', identity);
  const existing = await activeRequest(sql, identity.profileId);
  if (existing) return { success: true, message: 'Seu pedido de exclusão já está registrado.', request: toRequest(existing), ...toRequest(existing) };
  const reason = typeof input.reason === 'string' && input.reason.trim() ? freeField(input.reason, REASON_MAX).text : null;
  const [row] = await sql`
    INSERT INTO account_deletion_requests (profile_id, profile_label, reason)
    VALUES (${identity.profileId}::uuid, ${firstName(identity.fullName)}, ${reason})
    ON CONFLICT (profile_id) WHERE status = 'requested' DO NOTHING
    RETURNING id, status, requested_at, due_at, processed_at`;
  const saved = row || await activeRequest(sql, identity.profileId);
  if (row) await Logging.logAudit(sql, correlationId, identity.profileId, 'ACCOUNT_DELETION_REQUESTED', 'account_deletion_request', saved.id, 'success', null);
  return { success: true, message: 'Pedido registrado. A diretoria conclui a exclusão em até 180 dias; você pode cancelar antes disso.', request: toRequest(saved), ...toRequest(saved) };
}

/** Situação do pedido da própria pessoa (request: null quando não há pedido em aberto). */
export async function getDeletionStatus(sql, identity) {
  requireSession(identity);
  const row = await activeRequest(sql, identity.profileId);
  return { success: true, request: row ? toRequest(row) : null };
}

/** Cancela o pedido em aberto. */
export async function cancelDeletion(sql, identity, correlationId) {
  requireSession(identity);
  const [row] = await sql`
    UPDATE account_deletion_requests SET status = 'cancelled', processed_at = now()
    WHERE profile_id = ${identity.profileId}::uuid AND status = 'requested' RETURNING id`;
  if (!row) throw E.NotFoundError(MSG.noActive);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'ACCOUNT_DELETION_CANCELLED', 'account_deletion_request', row.id, 'success', null);
  return { success: true, message: 'Pedido de exclusão cancelado.', request: null };
}

/** Fila da diretoria: id, datas e o primeiro nome como rótulo. Nada além disso. */
export async function listDeletionRequests(sql, identity, rawInput) {
  requireAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const status = LIST_STATUSES.includes(input.status) ? input.status : 'requested';
  const rows = await sql`
    SELECT id, profile_label, status, requested_at, due_at FROM account_deletion_requests
    WHERE status = ${status} ORDER BY due_at ASC LIMIT ${LIST_LIMIT}`;
  return {
    success: true, status,
    items: rows.map((r) => ({ id: r.id, label: r.profile_label || null, status: r.status, requestedAt: iso(r.requested_at), dueAt: iso(r.due_at) })),
  };
}

/** Conclui a exclusão: apaga o perfil e anonimiza o pedido. */
export async function completeDeletion(sql, identity, rawInput, correlationId) {
  requireAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!UUID.test(id)) throw E.ValidationError(MSG.badId);
  await limit(sql, 'PRIVACY_ADMIN', identity);
  const [req] = await sql`SELECT id, profile_id, status FROM account_deletion_requests WHERE id = ${id}::uuid`;
  if (!req) throw E.NotFoundError(MSG.notFound);
  if (req.status !== 'requested') throw E.ConflictError(MSG.done);
  if (req.profile_id && req.profile_id === identity.profileId) throw E.ConflictError(MSG.self);
  if (req.profile_id) {
    try {
      await sql`DELETE FROM profiles WHERE id = ${req.profile_id}::uuid`;
    } catch (err) {
      if (String((err && err.message) || '').indexOf('último administrador') !== -1) throw E.ConflictError(MSG.lastAdmin);
      throw err;
    }
  }
  await sql`
    UPDATE account_deletion_requests
    SET status = 'completed', processed_at = now(), processed_by = ${identity.profileId}::uuid, profile_id = NULL, profile_label = NULL, reason = NULL
    WHERE id = ${id}::uuid AND status = 'requested'`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'ACCOUNT_DELETION_COMPLETED', 'account_deletion_request', id, 'success', null);
  return { success: true, message: 'Conta excluída e pedido concluído.' };
}
