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
import { ownAvatarKey } from './mediaService.js';
import { isMissingTable } from './featureFlagService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIST_STATUSES = ['requested', 'completed', 'cancelled'];
const LIST_LIMIT = 200;
const EXPORT_LIMIT = 500;
const REASON_MAX = 500;
const MEDIA_LIST_PAGES = 5;

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
  stepUp: 'Esta ação exige reautenticação.',
});

const NOTES = Object.freeze([
  'Mensagens privadas não estão neste arquivo: são cifradas ponta a ponta e só você e quem conversa com você conseguem lê-las.',
  'Não incluímos segredos de segurança (senha, tokens, fatores de autenticação) nem anotações internas da comissão do processo seletivo.',
  'Votos e tarefas aparecem pelo título, para você reconhecê-los. Conexões e bloqueios mostram só o nome de usuário da outra pessoa.',
  'A memória de estudo de Guia fica em um banco separado e tem exportação própria, no cartão da memória de estudo do seu perfil.',
  'Registros técnicos (sessões, limites de uso, registros de auditoria e de uso da IA) não entram: servem à segurança da plataforma e são apagados nos prazos da política de privacidade.',
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

/**
 * Uma tabela ausente (migração atrasada) esvazia a seção em vez de derrubar a exportação. Qualquer outro erro também
 * esvazia a seção, mas fica registrado em error_logs (sem dado pessoal), para uma consulta quebrada não sumir em silêncio.
 */
async function section(sql, correlationId, name, query) {
  try {
    return await query();
  } catch (err) {
    if (!isMissingTable(err)) await Logging.logError(sql, correlationId,'PRIVACY_EXPORT_SECTION_FAILED', name + ': ' + ((err && err.message) || 'erro'), null);
    return [];
  }
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
/** Consultas das seções da exportação: só linhas da própria pessoa, cada uma com teto de EXPORT_LIMIT. */
function exportQueries(sql, id) {
  return {
    selection: () => sql`SELECT status, step, data, receipt_code, started_at, submitted_at, decided_at, appeal_at, appeal_note
      FROM selection_applications WHERE profile_id = ${id}::uuid ORDER BY started_at DESC LIMIT ${EXPORT_LIMIT}`,
    events: () => sql`SELECT e.title, e.event_date, r.registered_at, r.checked_in_at FROM event_registrations r JOIN events e ON e.id = r.event_id
      WHERE r.profile_id = ${id}::uuid ORDER BY r.registered_at DESC LIMIT ${EXPORT_LIMIT}`,
    votes: () => sql`SELECT p.title, v.choice, v.complement_text, v.created_at FROM votes v JOIN proposals p ON p.id = v.proposal_id
      WHERE v.profile_id = ${id}::uuid ORDER BY v.created_at DESC LIMIT ${EXPORT_LIMIT}`,
    tasks: () => sql`SELECT t.title, t.status, s.signed_up_at FROM task_signups s JOIN tasks t ON t.id = s.task_id
      WHERE s.profile_id = ${id}::uuid ORDER BY s.signed_up_at DESC LIMIT ${EXPORT_LIMIT}`,
    consents: () => sql`SELECT document_type, document_version, accepted_at FROM consents
      WHERE profile_id = ${id}::uuid ORDER BY accepted_at DESC LIMIT ${EXPORT_LIMIT}`,
    roles: () => sql`SELECT role, granted_at FROM member_roles WHERE profile_id = ${id}::uuid LIMIT ${EXPORT_LIMIT}`,
    connections: () => sql`SELECT o.username, c.status, c.requested_via, c.created_at, c.responded_at, (c.requester_id = ${id}::uuid) AS sent
      FROM connections c JOIN profiles o ON o.id = CASE WHEN c.requester_id = ${id}::uuid THEN c.addressee_id ELSE c.requester_id END
      WHERE c.requester_id = ${id}::uuid OR c.addressee_id = ${id}::uuid ORDER BY c.created_at DESC LIMIT ${EXPORT_LIMIT}`,
    blocks: () => sql`SELECT o.username, b.created_at FROM profile_blocks b JOIN profiles o ON o.id = b.blocked_id
      WHERE b.blocker_id = ${id}::uuid ORDER BY b.created_at DESC LIMIT ${EXPORT_LIMIT}`,
    feedback: () => sql`SELECT message, created_at FROM feedback WHERE profile_id = ${id}::uuid ORDER BY created_at DESC LIMIT ${EXPORT_LIMIT}`,
    assistantMessages: () => sql`SELECT topic, source, answer, created_at FROM assistant_messages
      WHERE profile_id = ${id}::uuid ORDER BY created_at DESC LIMIT ${EXPORT_LIMIT}`,
    assistantFeedback: () => sql`SELECT rating, category, comment, created_at FROM assistant_feedback
      WHERE profile_id = ${id}::uuid ORDER BY created_at DESC LIMIT ${EXPORT_LIMIT}`,
    learning: () => sql`SELECT module, activity, score, max_score, duration_seconds, created_at FROM learning_attempts
      WHERE profile_id = ${id}::uuid ORDER BY created_at DESC LIMIT ${EXPORT_LIMIT}`,
    libraryFavorites: () => sql`SELECT a.title, f.created_at FROM library_favorites f JOIN library_articles a ON a.id = f.article_id
      WHERE f.profile_id = ${id}::uuid ORDER BY f.created_at DESC LIMIT ${EXPORT_LIMIT}`,
    librarySuggestions: () => sql`SELECT identifier_kind, identifier, note, status, created_at, decided_at FROM library_suggestions
      WHERE profile_id = ${id}::uuid ORDER BY created_at DESC LIMIT ${EXPORT_LIMIT}`,
    activityDays: () => sql`SELECT day FROM activity_days WHERE profile_id = ${id}::uuid ORDER BY day DESC LIMIT ${EXPORT_LIMIT}`,
    preferences: () => sql`SELECT theme, density, email_notifications, updated_at FROM preferences WHERE profile_id = ${id}::uuid`,
  };
}

const dateOnly = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/** Formata as seções novas (B-08) para a exportação. */
function activityOut(r) {
  return {
    connections: r.connections.map((c) => ({ with: c.username || null, status: c.status, sent: !!c.sent, via: c.requested_via, createdAt: iso(c.created_at), respondedAt: iso(c.responded_at) })),
    blocks: r.blocks.map((b) => ({ blocked: b.username || null, createdAt: iso(b.created_at) })),
    feedback: r.feedback.map((f) => ({ message: f.message, createdAt: iso(f.created_at) })),
    assistantMessages: r.assistantMessages.map((m) => ({ topic: m.topic || null, source: m.source, answer: m.answer, createdAt: iso(m.created_at) })),
    assistantFeedback: r.assistantFeedback.map((f) => ({ rating: f.rating, category: f.category || null, comment: f.comment || null, createdAt: iso(f.created_at) })),
    learning: r.learning.map((l) => ({ module: l.module, activity: l.activity, score: l.score, maxScore: l.max_score, durationSeconds: l.duration_seconds, createdAt: iso(l.created_at) })),
    libraryFavorites: r.libraryFavorites.map((f) => ({ title: f.title, createdAt: iso(f.created_at) })),
    librarySuggestions: r.librarySuggestions.map((s) => ({ kind: s.identifier_kind, identifier: s.identifier, note: s.note || null, status: s.status, createdAt: iso(s.created_at), decidedAt: iso(s.decided_at) })),
    activityDays: r.activityDays.map((d) => dateOnly(d.day)),
    preferences: r.preferences[0] ? { theme: r.preferences[0].theme, density: r.preferences[0].density, emailNotifications: !!r.preferences[0].email_notifications, updatedAt: iso(r.preferences[0].updated_at) } : null,
  };
}

/** Exporta os dados da própria pessoa. */
export async function exportMyData(sql, identity, correlationId) {
  requireSession(identity);
  await limit(sql, 'PRIVACY_EXPORT', identity);
  const id = identity.profileId;
  const [profile] = await sql`
    SELECT id, full_name, username, email, phone, city, education, role, status, email_confirmed_at, created_at, avatar_url,
           linkedin_url, instagram_handle, interests, league_position, directorate, phone_discoverable
    FROM profiles WHERE id = ${id}::uuid`;
  if (!profile) throw E.NotFoundError(MSG.needSession);
  const cid = correlationId || crypto.randomUUID();
  const queries = exportQueries(sql, id);
  const names = Object.keys(queries);
  const results = await Promise.all(names.map((name) => section(sql, cid, name, queries[name])));
  const r = Object.fromEntries(names.map((name, i) => [name, results[i]]));
  return {
    success: true,
    generatedAt: new Date().toISOString(),
    data: {
      profile: profileOut(profile),
      memberRoles: r.roles.map((x) => ({ role: x.role, grantedAt: iso(x.granted_at) })),
      selection: r.selection.map((s) => ({
        status: s.status, step: s.step, receiptCode: s.receipt_code || null, startedAt: iso(s.started_at),
        submittedAt: iso(s.submitted_at), decidedAt: iso(s.decided_at), appealAt: iso(s.appeal_at), appealNote: s.appeal_note || null,
        answers: ownAnswers(s.data),
      })),
      events: r.events.map((e) => ({ title: e.title, eventDate: iso(e.event_date), registeredAt: iso(e.registered_at), checkedInAt: iso(e.checked_in_at) })),
      votes: r.votes.map((v) => ({ proposal: v.title, choice: v.choice, complement: v.complement_text || null, createdAt: iso(v.created_at) })),
      tasks: r.tasks.map((t) => ({ title: t.title, status: t.status, signedUpAt: iso(t.signed_up_at) })),
      consents: r.consents.map((c) => ({ document: c.document_type, version: c.document_version, acceptedAt: iso(c.accepted_at) })),
      ...activityOut(r),
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

/**
 * Reautenticação recente (senha e, se houver, segundo fator) fornecida pelo handler em options.stepUp, como em banir ou
 * mudar papel. Sem ela a exclusão é recusada; a falha é auditada (sem a senha) e nada é apagado.
 */
async function requireStepUp(sql, options, correlationId, identity, requestId) {
  if (!options || typeof options.stepUp !== 'function') throw E.ForbiddenError(MSG.stepUp);
  try {
    await options.stepUp();
  } catch (err) {
    await Logging.logAudit(sql, correlationId, identity.profileId, 'ACCOUNT_DELETION_COMPLETED', 'account_deletion_request', requestId, 'failure', { reason: 'step_up' });
    throw err;
  }
}

/** Chaves do R2 que são desta pessoa: o avatar atual e qualquer avatar antigo que tenha ficado (avatars/<id>-*). */
async function ownMediaKeys(env, profileId, avatarUrl) {
  const keys = new Set();
  const current = ownAvatarKey(env, profileId, avatarUrl);
  if (current) keys.add(current);
  if (typeof env.MEDIA_BUCKET.list === 'function') {
    let cursor;
    for (let page = 0; page < MEDIA_LIST_PAGES; page += 1) {
      const listed = await env.MEDIA_BUCKET.list({ prefix: 'avatars/' + profileId + '-', cursor });
      ((listed && listed.objects) || []).forEach((o) => keys.add(o.key));
      if (!listed || !listed.truncated) break;
      cursor = listed.cursor;
    }
  }
  return [...keys];
}

/** Melhor esforço: falha do R2 nunca bloqueia a exclusão (o perfil já foi apagado); só fica registrada. */
async function deleteMedia(sql, env, profileId, avatarUrl, correlationId) {
  if (!env || !env.MEDIA_BUCKET) return;
  try {
    const keys = await ownMediaKeys(env, profileId, avatarUrl);
    if (keys.length) await env.MEDIA_BUCKET.delete(keys);
  } catch (err) {
    await Logging.logError(sql, correlationId, 'PRIVACY_MEDIA_CLEANUP_FAILED', (err && err.message) || 'falha no R2', null);
  }
}

/** Conclui a exclusão: apaga o perfil, os arquivos dela no R2 e anonimiza o pedido. Exige reautenticação (options.stepUp). */
export async function completeDeletion(sql, identity, rawInput, correlationId, options) {
  requireAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const id = typeof input.id === 'string' ? input.id.trim() : '';
  if (!UUID.test(id)) throw E.ValidationError(MSG.badId);
  await limit(sql, 'PRIVACY_ADMIN', identity);
  const [req] = await sql`SELECT id, profile_id, status FROM account_deletion_requests WHERE id = ${id}::uuid`;
  if (!req) throw E.NotFoundError(MSG.notFound);
  if (req.status !== 'requested') throw E.ConflictError(MSG.done);
  if (req.profile_id && req.profile_id === identity.profileId) throw E.ConflictError(MSG.self);
  await requireStepUp(sql, options, correlationId, identity, id);
  if (req.profile_id) {
    const [profile] = await sql`SELECT avatar_url FROM profiles WHERE id = ${req.profile_id}::uuid`;
    try {
      await sql`DELETE FROM profiles WHERE id = ${req.profile_id}::uuid`;
    } catch (err) {
      if (String((err && err.message) || '').indexOf('último administrador') !== -1) throw E.ConflictError(MSG.lastAdmin);
      throw err;
    }
    await deleteMedia(sql, options && options.env, req.profile_id, profile ? profile.avatar_url : null, correlationId);
  }
  await sql`
    UPDATE account_deletion_requests
    SET status = 'completed', processed_at = now(), processed_by = ${identity.profileId}::uuid, profile_id = NULL, profile_label = NULL, reason = NULL
    WHERE id = ${id}::uuid AND status = 'requested'`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'ACCOUNT_DELETION_COMPLETED', 'account_deletion_request', id, 'success', null);
  return { success: true, message: 'Conta excluída e pedido concluído.' };
}
