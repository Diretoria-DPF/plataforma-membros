/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * eventPrereqService.js — cursos exigidos para a inscrição num evento (sql/058; docs/cursos-operacao.md).
 * Flag event_prereq_enabled: desligada, nada muda na inscrição.
 *
 * Vale certificado não revogado, não vencido e na versão ATUAL do curso. Dispensa (event_requirement_waivers) libera
 * a pessoa naquele evento. Quem define as exigências e registra dispensa tem events.manage (gestor, com MFA, ou
 * admin); tudo vai para audit_logs. A conferência fica aqui (Worker), antes do INSERT da inscrição, para devolver a
 * lista do que falta; o gatilho do banco (004) segue como está.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { requireUuid, guarded, flagOn, isMissingTable, limitAdmin, limitRead, iso, UUID_RE } from './courseCommon.js';

const K = C.COURSES;
const MANAGE_CAP = 'events.manage';

/** Situação de cada exigência: ok | sem_certificado | vencido | versao_antiga. Pura. */
export function requirementState(row, now = Date.now()) {
  if (!row.cert_version) return 'sem_certificado';
  if (Number(row.cert_version) !== Number(row.course_version)) return 'versao_antiga';
  if (row.cert_valid_until && new Date(row.cert_valid_until).getTime() <= now) return 'vencido';
  return 'ok';
}

/** Exigências do evento e a situação da pessoa em cada uma (certificado mais recente não revogado). */
export async function statusFor(sql, profileId, eventId, now = Date.now()) {
  const rows = await sql`SELECT r.course_id, c.slug, c.title, c.version AS course_version,
      cert.course_version AS cert_version, cert.valid_until AS cert_valid_until
    FROM event_requirements r
    JOIN courses c ON c.id = r.course_id
    LEFT JOIN LATERAL (
      SELECT x.course_version, x.valid_until FROM certificates x
      WHERE x.profile_id = ${profileId}::uuid AND x.course_id = r.course_id AND x.revoked_at IS NULL
      ORDER BY x.course_version DESC, x.issued_at DESC LIMIT 1
    ) cert ON TRUE
    WHERE r.event_id = ${eventId}::uuid
    ORDER BY c.title`;
  const waiver = rows.length
    ? await sql`SELECT 1 FROM event_requirement_waivers WHERE event_id = ${eventId}::uuid AND profile_id = ${profileId}::uuid`
    : [];
  const waived = waiver.length > 0;
  const requirements = rows.map((r) => ({
    courseId: r.course_id, slug: r.slug, title: r.title, state: waived ? 'ok' : requirementState(r, now),
  }));
  return { eligible: requirements.every((r) => r.state === 'ok'), waived, requirements };
}

const REASON_TEXT = { sem_certificado: 'curso não concluído', vencido: 'certificado vencido', versao_antiga: 'versão antiga do curso' };

/**
 * Chamado pelo handler antes da inscrição. Flag desligada ou migração ausente: não faz nada. Faltando curso:
 * ConflictError com a lista no payload (missingCourses) para a tela levar direto ao curso.
 */
export async function enforceForRegistration(sql, identity, eventId) {
  if (typeof eventId !== 'string' || !UUID_RE.test(eventId)) return;
  if (!(await flagOn(sql, K.PREREQ_FLAG, identity))) return;
  let status;
  try {
    status = await statusFor(sql, identity.profileId, eventId.toLowerCase());
  } catch (err) {
    if (isMissingTable(err)) return;
    throw err;
  }
  if (status.eligible) return;
  const missing = status.requirements.filter((r) => r.state !== 'ok');
  const err = E.ConflictError('Para se inscrever, conclua antes: ' + missing.map((m) => m.title + ' (' + REASON_TEXT[m.state] + ')').join('; ') + '.');
  err.payload = { missingCourses: missing.map((m) => ({ courseId: m.courseId, slug: m.slug, title: m.title, state: m.state })) };
  throw err;
}

/** apiLearnEventPrereqStatus({ eventId }): o que a própria pessoa precisa para o evento. */
export async function myStatus(sql, identity, input) {
  const eventId = requireUuid(input.eventId, 'Evento');
  if (!(await flagOn(sql, K.PREREQ_FLAG, identity))) return { success: true, enabled: false, eligible: true, waived: false, requirements: [] };
  await limitRead(sql, identity);
  const status = await guarded(() => statusFor(sql, identity.profileId, eventId));
  return Object.assign({ success: true, enabled: true }, status);
}

/** apiAdminLearnEventSetRequirements({ eventId, courseIds }): substitui a lista de cursos exigidos. */
export async function setRequirements(sql, identity, input, correlationId) {
  S.requireCapability(identity, MANAGE_CAP);
  const eventId = requireUuid(input.eventId, 'Evento');
  if (!Array.isArray(input.courseIds) || input.courseIds.length > K.EVENT_REQUIREMENTS_MAX) {
    throw E.ValidationError('Informe de 0 a ' + K.EVENT_REQUIREMENTS_MAX + ' cursos.');
  }
  const ids = [...new Set(input.courseIds.map((id) => requireUuid(id, 'Curso')))];
  await limitAdmin(sql, identity);
  const event = await guarded(() => sql`SELECT id FROM events WHERE id = ${eventId}::uuid`);
  if (!event.length) throw E.NotFoundError('Evento não encontrado.');
  if (ids.length) {
    const found = await guarded(() => sql`SELECT id FROM courses WHERE id = ANY(${ids}::uuid[]) AND status = 'publicado'`);
    if (found.length !== ids.length) throw E.ValidationError('Só cursos publicados podem ser exigidos.');
  }
  await guarded(() => sql`DELETE FROM event_requirements WHERE event_id = ${eventId}::uuid AND NOT (course_id = ANY(${ids}::uuid[]))`);
  for (const courseId of ids) {
    await sql`INSERT INTO event_requirements (event_id, course_id, created_by) VALUES (${eventId}::uuid, ${courseId}::uuid, ${identity.profileId}::uuid)
      ON CONFLICT (event_id, course_id) DO NOTHING`;
  }
  await Logging.logAudit(sql, correlationId, identity.profileId, 'EVENT_SET_REQUIREMENTS', 'event', eventId, 'success', { courseIds: ids });
  return { success: true, courseIds: ids };
}

/** apiAdminLearnEventWaive({ eventId, profileId, reason }): dispensa auditada. */
export async function waive(sql, identity, input, correlationId) {
  S.requireCapability(identity, MANAGE_CAP);
  const eventId = requireUuid(input.eventId, 'Evento');
  const profileId = requireUuid(input.profileId, 'Pessoa');
  if (profileId === String(identity.profileId).toLowerCase()) throw E.ForbiddenError('Ninguém registra dispensa para si.');
  const reason = typeof input.reason === 'string' ? input.reason.replace(/\s+/g, ' ').trim() : '';
  if (reason.length < 5 || reason.length > 500) throw E.ValidationError('Informe o motivo da dispensa (5 a 500 caracteres).');
  await limitAdmin(sql, identity);
  try {
    await guarded(() => sql`INSERT INTO event_requirement_waivers (event_id, profile_id, granted_by, reason)
      VALUES (${eventId}::uuid, ${profileId}::uuid, ${identity.profileId}::uuid, ${reason})
      ON CONFLICT (event_id, profile_id) DO UPDATE SET reason = EXCLUDED.reason, granted_by = EXCLUDED.granted_by, granted_at = now()`);
  } catch (err) {
    if (/foreign key|violates/i.test(String(err && err.message))) throw E.NotFoundError('Evento ou pessoa não encontrados.');
    throw err;
  }
  await Logging.logAudit(sql, correlationId, identity.profileId, 'EVENT_WAIVE_REQUIREMENT', 'event', eventId, 'success', { profileId });
  return { success: true, grantedAt: iso(new Date()) };
}
