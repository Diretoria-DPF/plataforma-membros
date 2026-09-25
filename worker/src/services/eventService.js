/**
 * eventService.js — porta fiel de src/services/EventService.gs.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

function visibilitySql(identity) {
  if (!identity) return "visibility = 'public'::event_visibility";
  if (identity.role === C.ROLES.MEMBER || identity.role === C.ROLES.ADMIN) {
    return "visibility IN ('public','authenticated','members')";
  }
  return "visibility IN ('public','authenticated')";
}

export async function listEvents(sql, identity) {
  // Cláusula de visibilidade vem de uma lista fechada de 3 strings fixas
  // (visibilitySql), nunca de entrada do usuário — por isso é seguro
  // interpolar no texto da query aqui, usando a forma de chamada
  // sql(texto, params) do driver em vez do template tag (que trataria
  // qualquer ${} como parâmetro ligado, o que quebraria a sintaxe SQL da
  // cláusula IN/=).
  const rows = await sql(
    `SELECT e.id AS id, e.title AS title, e.description AS description, e.event_date AS event_date,
            e.visibility AS visibility, e.capacity AS capacity,
            (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count
     FROM events e
     WHERE e.status = 'published'::event_status AND ${visibilitySql(identity)}
     ORDER BY e.event_date ASC`,
    []
  );

  let myRegistrations = {};
  if (identity) {
    const mine = await sql`SELECT event_id FROM event_registrations WHERE profile_id = ${identity.profileId}::uuid`;
    mine.forEach((r) => { myRegistrations[r.event_id] = true; });
  }

  return {
    success: true,
    events: rows.map((row) => {
      const spotsLeft = row.capacity === null ? null : Math.max(row.capacity - row.registered_count, 0);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        eventDate: row.event_date,
        visibility: row.visibility,
        capacity: row.capacity,
        registeredCount: row.registered_count,
        spotsLeft,
        isRegistered: !!myRegistrations[row.id],
      };
    }),
  };
}

export async function registerForEvent(sql, identity, eventId, correlationId) {
  const id = S.normalizeText(eventId);
  if (!id) throw E.ValidationError('Evento inválido.');

  // Defesa em profundidade: a mesma regra de visibilidade que filtra a
  // LISTAGEM (visibilitySql acima) também precisa valer no INSERT — sem
  // isso, alguém que descobrisse o UUID de um evento visibility='members'
  // por fora da listagem conseguiria se inscrever mesmo sem ser membro. O
  // gatilho guard_event_registration() no Postgres é a defesa autoritativa
  // (sql/004_event_visibility_guard.sql); esta checagem aqui só adianta o
  // erro com uma mensagem clara antes de tocar o banco de escrita.
  const eventRows = await sql`SELECT visibility FROM events WHERE id = ${id}::uuid`;
  if (eventRows.length && eventRows[0].visibility === 'members' && identity.role !== C.ROLES.MEMBER && identity.role !== C.ROLES.ADMIN) {
    throw E.ForbiddenError('Este evento é exclusivo para membros.');
  }

  try {
    await sql`INSERT INTO event_registrations (event_id, profile_id) VALUES (${id}::uuid, ${identity.profileId}::uuid)`;
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (msg.indexOf('event_registrations_unique') !== -1) {
      throw E.ConflictError('Você já está inscrito neste evento.');
    }
    if (msg.indexOf('exclusivo para membros') !== -1) {
      throw E.ForbiddenError('Este evento é exclusivo para membros.');
    }
    if (msg.indexOf('sem vagas') !== -1 || msg.indexOf('não está aberto') !== -1 || msg.indexOf('não autorizada') !== -1) {
      throw E.ConflictError('Não foi possível concluir a inscrição: evento sem vagas ou indisponível.');
    }
    await Logging.logError(sql, correlationId, 'EVENT_REGISTER_FAILED', 'Falha ao registrar inscrição em evento.', { eventId: id });
    throw err;
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'REGISTER_EVENT', 'event', id, 'success', null);
  return { success: true, message: 'Inscrição confirmada.' };
}

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

export async function createEvent(sql, identity, input, correlationId) {
  assertAdmin(identity);

  const title = S.normalizeText(input.title);
  const description = S.normalizeText(input.description);
  const eventDate = S.normalizeText(input.eventDate);
  const visibility = S.normalizeText(input.visibility);
  const capacity = input.capacity === '' || input.capacity === null || input.capacity === undefined ? null : Number(input.capacity);

  if (!S.isLengthValid(title, C.LIMITS.TITLE_MIN, C.LIMITS.TITLE_MAX)) throw E.ValidationError('Título inválido.');
  if (!S.isLengthValid(description, C.LIMITS.DESCRIPTION_MIN, C.LIMITS.DESCRIPTION_MAX)) throw E.ValidationError('Descrição inválida.');
  if (!eventDate || isNaN(new Date(eventDate).getTime())) throw E.ValidationError('Informe uma data válida para o evento.');
  if (['public', 'authenticated', 'members'].indexOf(visibility) === -1) throw E.ValidationError('Visibilidade inválida.');
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) throw E.ValidationError('Capacidade inválida.');

  const rows = await sql`
    INSERT INTO events (title, description, event_date, visibility, capacity, created_by, status)
    VALUES (${title}, ${description}, ${new Date(eventDate).toISOString()}, ${visibility}::event_visibility, ${capacity}, ${identity.profileId}::uuid, 'draft'::event_status)
    RETURNING id
  `;

  const id = rows[0].id;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'CREATE_EVENT', 'event', id, 'success', null);
  return { success: true, message: 'Evento criado como rascunho.', eventId: id };
}

const EVENT_TRANSITIONS = {
  draft: ['published'],
  published: ['closed', 'archived'],
  closed: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export async function updateEventStatus(sql, identity, eventId, newStatus, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(eventId);
  const status = S.normalizeText(newStatus);

  if (Object.keys(EVENT_TRANSITIONS).indexOf(status) === -1) throw E.ValidationError('Status inválido.');

  const current = await sql`SELECT status FROM events WHERE id = ${id}::uuid`;
  if (!current.length) throw E.NotFoundError('Evento não encontrado.');

  const allowed = EVENT_TRANSITIONS[current[0].status] || [];
  if (current[0].status !== status && allowed.indexOf(status) === -1) {
    throw E.ConflictError('Transição de status inválida.');
  }

  await sql`UPDATE events SET status = ${status}::event_status WHERE id = ${id}::uuid`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_EVENT_STATUS', 'event', id, 'success', { newStatus: status });
  return { success: true, message: 'Status do evento atualizado.' };
}

export async function listAllEventsAdmin(sql, identity) {
  assertAdmin(identity);
  const rows = await sql`
    SELECT e.id AS id, e.title AS title, e.status AS status, e.visibility AS visibility,
           e.event_date AS event_date, e.capacity AS capacity,
           (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count
    FROM events e ORDER BY e.event_date DESC
  `;
  return { success: true, events: rows };
}
