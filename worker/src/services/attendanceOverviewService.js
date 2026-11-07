/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * attendanceOverviewService.js — visão geral da presença (Portaria > Visão geral) e ficha de presença do evento.
 *
 * Só quem tem a capacidade attendance.manage (admin, ou cargo gestor/secretaria com MFA) enxerga. A resposta traz
 * nome, papel e contagens: nunca e-mail nem telefone. Reunião é um evento comum. Tarefa só tem inscrição; quando está
 * ligada a um evento, o balanço mostra quantos dos inscritos compareceram a esse evento. Eventos futuros não entram
 * na conta de faltas. A tela só lê (sem registro); a exportação em PDF deixa uma linha na auditoria, sem nomes.
 *
 * apiAdminAttendanceOverview({ days: 30 | 90 | 0 (tudo), forExport? })
 * apiAdminAttendanceSheet({ eventId })
 */
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_DAYS = 90;
const ALLOWED_DAYS = [0, 30, 90];
const MEMBERS_LIMIT = 500;
const LIST_LIMIT = 100;
const SHEET_LIMIT = 500;
const COUNTED_EVENT_STATUSES = ['published', 'in_progress', 'closed', 'completed'];
const ROLE_LABELS = { visitor: 'Visitante', member: 'Membro', admin: 'Administrador' };

function assertAllowed(identity) {
  S.requireCapability(identity, 'attendance.manage'); // admin ou cargo com a capacidade (ADR 0010)
}

/** Período em dias; qualquer valor fora de 0/30/90 cai no padrão. 0 = tudo. */
function parseDays(value) {
  const n = Number(value);
  return ALLOWED_DAYS.indexOf(n) !== -1 && value !== '' && value !== null ? n : DEFAULT_DAYS;
}

function percent(present, registered) {
  return registered > 0 ? Math.round((present / registered) * 100) : null;
}

/** apiAdminAttendanceOverview — balanço por pessoa, por evento (inclui reuniões) e por tarefa. */
export async function overview(sql, identity, input, correlationId) {
  assertAllowed(identity);
  const days = parseDays((input || {}).days);
  const since = days === 0 ? null : new Date(Date.now() - days * 86400000).toISOString();

  const members = await sql`
    SELECT p.id AS id, p.full_name AS full_name, p.role AS role, p.league_position AS league_position,
           count(e.id)::int AS registered,
           count(e.id) FILTER (WHERE r.checked_in_at IS NOT NULL)::int AS present,
           (SELECT count(*)::int FROM task_signups ts
             WHERE ts.profile_id = p.id AND (${since}::timestamptz IS NULL OR ts.signed_up_at >= ${since}::timestamptz)) AS tasks
    FROM profiles p
    LEFT JOIN event_registrations r ON r.profile_id = p.id
    LEFT JOIN events e ON e.id = r.event_id
         AND e.status::text = ANY(${COUNTED_EVENT_STATUSES}::text[])
         AND e.event_date <= now()
         AND (${since}::timestamptz IS NULL OR e.event_date >= ${since}::timestamptz)
    WHERE p.status = 'active'
    GROUP BY p.id
    HAVING p.role IN ('member', 'admin')
        OR count(e.id) FILTER (WHERE r.checked_in_at IS NOT NULL) > 0
    ORDER BY lower(p.full_name)
    LIMIT ${MEMBERS_LIMIT}
  `;

  const events = await sql`
    SELECT e.id AS id, e.title AS title, e.event_date AS event_date, e.status AS status,
           count(r.id)::int AS registered,
           count(r.checked_in_at)::int AS present
    FROM events e
    LEFT JOIN event_registrations r ON r.event_id = e.id
    WHERE e.status::text = ANY(${COUNTED_EVENT_STATUSES}::text[])
      AND e.event_date <= now()
      AND (${since}::timestamptz IS NULL OR e.event_date >= ${since}::timestamptz)
    GROUP BY e.id
    ORDER BY e.event_date DESC
    LIMIT ${LIST_LIMIT}
  `;

  const tasks = await sql`
    SELECT t.id AS id, t.title AS title, t.status AS status, t.due_date AS due_date,
           (t.event_id IS NOT NULL) AS linked,
           count(ts.id)::int AS signups,
           CASE WHEN t.event_id IS NULL THEN NULL ELSE
             (SELECT count(*)::int FROM event_registrations r
               WHERE r.event_id = t.event_id AND r.checked_in_at IS NOT NULL
                 AND r.profile_id IN (SELECT profile_id FROM task_signups WHERE task_id = t.id))
           END AS signups_present
    FROM tasks t
    LEFT JOIN task_signups ts ON ts.task_id = t.id
    WHERE t.status::text <> 'draft'
      AND (${since}::timestamptz IS NULL OR t.created_at >= ${since}::timestamptz)
    GROUP BY t.id
    ORDER BY t.created_at DESC
    LIMIT ${LIST_LIMIT}
  `;

  const memberRows = members.map((m) => ({
    profileId: m.id,
    fullName: m.full_name,
    role: m.role,
    roleLabel: ROLE_LABELS[m.role] || m.role,
    leaguePosition: m.league_position || null,
    registered: Number(m.registered) || 0,
    present: Number(m.present) || 0,
    pct: percent(Number(m.present) || 0, Number(m.registered) || 0),
    tasks: Number(m.tasks) || 0,
  }));
  const eventRows = events.map((e) => ({
    id: e.id,
    title: e.title,
    eventDate: e.event_date,
    status: e.status,
    registered: Number(e.registered) || 0,
    present: Number(e.present) || 0,
    pct: percent(Number(e.present) || 0, Number(e.registered) || 0),
  }));
  const taskRows = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.due_date || null,
    linked: !!t.linked,
    signups: Number(t.signups) || 0,
    signupsPresent: t.signups_present === null || t.signups_present === undefined ? null : Number(t.signups_present),
  }));
  const registered = eventRows.reduce((sum, e) => sum + e.registered, 0);
  const present = eventRows.reduce((sum, e) => sum + e.present, 0);

  if (input && input.forExport === true) {
    await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_OVERVIEW_EXPORT', 'attendance', null, 'success', {
      days, members: memberRows.length, events: eventRows.length, tasks: taskRows.length,
    });
  }

  return {
    success: true,
    days,
    generatedAt: new Date().toISOString(),
    totals: { members: memberRows.length, events: eventRows.length, tasks: taskRows.length, registered, present, pct: percent(present, registered) },
    members: memberRows,
    events: eventRows,
    tasks: taskRows,
  };
}

/** apiAdminAttendanceSheet — ficha nominal de presença de um evento (sem e-mail), para o PDF. */
export async function sheet(sql, identity, input, correlationId) {
  assertAllowed(identity);
  const eventId = typeof (input || {}).eventId === 'string' ? input.eventId.trim().toLowerCase() : '';
  if (!UUID_RE.test(eventId)) throw E.ValidationError('Selecione um evento válido.');

  const eventRows = await sql`SELECT id, title, event_date, status FROM events WHERE id = ${eventId}::uuid`;
  if (!eventRows.length) throw E.NotFoundError('Evento não encontrado.');
  const event = eventRows[0];

  const rows = await sql`
    SELECT p.full_name AS full_name, p.role AS role, p.league_position AS league_position,
           r.checked_in_at AS checked_in_at
    FROM event_registrations r
    JOIN profiles p ON p.id = r.profile_id
    WHERE r.event_id = ${eventId}::uuid
    ORDER BY (r.checked_in_at IS NULL) ASC, p.full_name ASC
    LIMIT ${SHEET_LIMIT}
  `;
  const mapped = rows.map((r) => ({
    fullName: r.full_name,
    role: r.role,
    roleLabel: r.league_position ? 'Diretoria' : (ROLE_LABELS[r.role] || r.role),
    present: !!r.checked_in_at,
    checkedInAt: r.checked_in_at || null,
  }));
  const present = mapped.filter((r) => r.present).length;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'ATTENDANCE_SHEET', 'event', eventId, 'success', {
    rows: mapped.length, present,
  });

  return {
    success: true,
    event: { id: event.id, title: event.title, eventDate: event.event_date, status: event.status },
    totals: { registered: mapped.length, present },
    rows: mapped,
  };
}
