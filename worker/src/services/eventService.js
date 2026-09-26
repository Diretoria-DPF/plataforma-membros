/**
 * eventService.js — porta fiel de src/services/EventService.gs.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { sendEmail } from '../mailer.js';
import { getCached, setCached, invalidateCached, CACHE_KEYS, EVENTS_TTL_SECONDS } from '../cache.js';

function escapeHtmlForEmail(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatEventDateForEmail(isoDate) {
  try {
    return new Date(isoDate).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'full', timeStyle: 'short' });
  } catch (err) {
    return String(isoDate || '');
  }
}

async function sendEventRegistrationEmail(env, identity, event, correlationId, sql) {
  const when = formatEventDateForEmail(event.event_date);
  const whereLine = event.location ? 'Local: ' + event.location : 'Local: a definir — acompanhe atualizações na plataforma.';
  try {
    await sendEmail(env, {
      to: identity.email,
      subject: 'Inscrição confirmada — ' + event.title,
      text:
        'Olá, ' + identity.fullName + '. Sua inscrição no evento "' + event.title + '" foi confirmada.\n\n' +
        'Data: ' + when + '\n' + whereLine + '\n\n' + (event.description || ''),
      html:
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">' +
        '<h2>Inscrição confirmada</h2>' +
        '<p>Olá, ' + escapeHtmlForEmail(identity.fullName) + '. Sua inscrição no evento <strong>' + escapeHtmlForEmail(event.title) + '</strong> foi confirmada.</p>' +
        '<p><strong>Data:</strong> ' + escapeHtmlForEmail(when) + '<br>' +
        '<strong>' + escapeHtmlForEmail(whereLine) + '</strong></p>' +
        '<p>' + escapeHtmlForEmail(event.description || '') + '</p>' +
        '</div>',
    });
  } catch (mailErr) {
    // E-mail é uma conveniência pós-inscrição — uma falha no envio nunca
    // pode desfazer ou reportar erro numa inscrição que já foi confirmada
    // no banco (mesmo princípio do e-mail de confirmação de cadastro).
    await Logging.logError(sql, correlationId, 'MAIL_EVENT_CONFIRMATION_FAILED', 'Falha ao enviar e-mail de confirmação de inscrição em evento.', {
      profileId: identity.profileId,
      eventId: event.id,
      detail: String((mailErr && mailErr.message) || mailErr),
    });
  }
}

// Fonte única de verdade pra visibilidade — 3 camadas fixas, nunca vindas
// de entrada do usuário, por isso é seguro interpolar o texto da cláusula
// direto na query (sql(texto, params) do driver, não o template tag, que
// trataria qualquer ${} como parâmetro ligado e quebraria a sintaxe do IN).
const VISIBILITY_TIER_SQL = {
  public: "visibility = 'public'::event_visibility",
  authenticated: "visibility IN ('public','authenticated')",
  members: "visibility IN ('public','authenticated','members')",
};

function visibilityTier(identity) {
  if (!identity) return 'public';
  if (identity.role === C.ROLES.MEMBER || identity.role === C.ROLES.ADMIN) return 'members';
  return 'authenticated';
}

function tierCacheKey(tier) {
  if (tier === 'members') return CACHE_KEYS.EVENTS_MEMBERS;
  if (tier === 'authenticated') return CACHE_KEYS.EVENTS_AUTHENTICATED;
  return CACHE_KEYS.EVENTS_PUBLIC;
}

/**
 * Uma mudança em um evento pode afetar qualquer camada onde ele é visível
 * (ex.: publicar um evento 'members' só aparece na camada members, mas
 * fechar vagas de um evento 'public' afeta as 3) — mais simples e seguro
 * invalidar as 3 sempre do que calcular exatamente quais.
 */
async function invalidateEventsCache(env) {
  await Promise.all([
    invalidateCached(env, CACHE_KEYS.EVENTS_PUBLIC),
    invalidateCached(env, CACHE_KEYS.EVENTS_AUTHENTICATED),
    invalidateCached(env, CACHE_KEYS.EVENTS_MEMBERS),
  ]);
}

export async function listEvents(sql, env, identity) {
  // O catálogo de eventos (tudo exceto isRegistered) é idêntico pra
  // qualquer requisitante na mesma camada de visibilidade — cacheável por
  // camada (achado da auditoria de escala de 2026-09-25: a versão antiga
  // só cacheava o caso anônimo, que quase nunca acontece na prática,
  // porque a tela de eventos exige login). isRegistered é pessoal e NUNCA
  // entra no cache — é sempre calculado a partir de uma consulta própria,
  // pequena e barata, e mesclado depois.
  const tier = visibilityTier(identity);
  const tierKey = tierCacheKey(tier);

  let sharedEvents = await getCached(env, tierKey);
  if (!sharedEvents) {
    const rows = await sql(
      `SELECT e.id AS id, e.title AS title, e.description AS description, e.event_date AS event_date,
              e.visibility AS visibility, e.capacity AS capacity, e.status AS status, e.image_url AS image_url,
              e.location AS location,
              (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count
       FROM events e
       WHERE e.status IN ('published'::event_status, 'in_progress'::event_status) AND ${VISIBILITY_TIER_SQL[tier]}
       ORDER BY e.event_date ASC`,
      []
    );

    sharedEvents = rows.map((row) => {
      const spotsLeft = row.capacity === null ? null : Math.max(row.capacity - row.registered_count, 0);
      return {
        id: row.id,
        title: row.title,
        description: row.description,
        eventDate: row.event_date,
        visibility: row.visibility,
        capacity: row.capacity,
        status: row.status,
        imageUrl: row.image_url,
        location: row.location,
        registeredCount: row.registered_count,
        spotsLeft,
      };
    });

    await setCached(env, tierKey, sharedEvents, EVENTS_TTL_SECONDS);
  }

  let myRegistrations = {};
  if (identity) {
    const mine = await sql`SELECT event_id FROM event_registrations WHERE profile_id = ${identity.profileId}::uuid`;
    mine.forEach((r) => { myRegistrations[r.event_id] = true; });
  }

  const events = sharedEvents.map((event) => Object.assign({}, event, { isRegistered: !!myRegistrations[event.id] }));
  return { success: true, events };
}

export async function registerForEvent(sql, env, identity, eventId, correlationId) {
  const id = S.normalizeText(eventId);
  if (!id) throw E.ValidationError('Evento inválido.');

  // Defesa em profundidade: a mesma regra de visibilidade que filtra a
  // LISTAGEM (visibilitySql acima) também precisa valer no INSERT — sem
  // isso, alguém que descobrisse o UUID de um evento visibility='members'
  // por fora da listagem conseguiria se inscrever mesmo sem ser membro. O
  // gatilho guard_event_registration() no Postgres é a defesa autoritativa
  // (sql/004_event_visibility_guard.sql); esta checagem aqui só adianta o
  // erro com uma mensagem clara antes de tocar o banco de escrita, e já
  // traz os dados do evento usados depois no e-mail de confirmação.
  const eventRows = await sql`SELECT id, title, description, event_date, location, visibility FROM events WHERE id = ${id}::uuid`;
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

  await invalidateEventsCache(env);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'REGISTER_EVENT', 'event', id, 'success', null);

  // O e-mail de confirmação de inscrição é o que a preferência "Quero
  // receber notificações por e-mail" (preferences.email_notifications)
  // efetivamente controla — diferente dos e-mails de cadastro/redefinição
  // de senha, que são transacionais/de segurança e continuam sempre
  // enviados, sem opção de desativar.
  if (eventRows.length) {
    const prefRows = await sql`SELECT email_notifications FROM preferences WHERE profile_id = ${identity.profileId}::uuid`;
    const wantsEmail = !prefRows.length || prefRows[0].email_notifications !== false;
    if (wantsEmail) await sendEventRegistrationEmail(env, identity, eventRows[0], correlationId, sql);
  }
  return { success: true, message: 'Inscrição confirmada.' };
}

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

export async function createEvent(sql, env, identity, input, correlationId) {
  assertAdmin(identity);

  const title = S.normalizeText(input.title);
  const description = S.normalizeText(input.description);
  const eventDate = S.normalizeText(input.eventDate);
  const visibility = S.normalizeText(input.visibility);
  const location = S.normalizeText(input.location);
  const capacity = input.capacity === '' || input.capacity === null || input.capacity === undefined ? null : Number(input.capacity);

  if (!S.isLengthValid(title, C.LIMITS.TITLE_MIN, C.LIMITS.TITLE_MAX)) throw E.ValidationError('Título inválido.');
  if (!S.isLengthValid(description, C.LIMITS.DESCRIPTION_MIN, C.LIMITS.DESCRIPTION_MAX)) throw E.ValidationError('Descrição inválida.');
  if (!eventDate || isNaN(new Date(eventDate).getTime())) throw E.ValidationError('Informe uma data válida para o evento.');
  if (['public', 'authenticated', 'members'].indexOf(visibility) === -1) throw E.ValidationError('Visibilidade inválida.');
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) throw E.ValidationError('Capacidade inválida.');
  if (location && location.length > C.LIMITS.LOCATION_MAX) throw E.ValidationError('Local inválido.');

  const rows = await sql`
    INSERT INTO events (title, description, event_date, visibility, capacity, location, created_by, status)
    VALUES (${title}, ${description}, ${new Date(eventDate).toISOString()}, ${visibility}::event_visibility, ${capacity}, ${location || null}, ${identity.profileId}::uuid, 'draft'::event_status)
    RETURNING id
  `;

  const id = rows[0].id;
  await invalidateEventsCache(env);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'CREATE_EVENT', 'event', id, 'success', null);
  return { success: true, message: 'Evento criado como rascunho.', eventId: id };
}

const EVENT_TRANSITIONS = {
  draft: ['published'],
  published: ['in_progress', 'archived'],
  in_progress: ['closed', 'completed', 'archived'],
  closed: ['completed', 'archived'],
  completed: ['archived'],
  archived: [],
};

export async function updateEventStatus(sql, env, identity, eventId, newStatus, correlationId) {
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
  await invalidateEventsCache(env);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_EVENT_STATUS', 'event', id, 'success', { newStatus: status });
  return { success: true, message: 'Status do evento atualizado.' };
}

export async function listAllEventsAdmin(sql, identity) {
  assertAdmin(identity);
  const rows = await sql`
    SELECT e.id AS id, e.title AS title, e.status AS status, e.visibility AS visibility,
           e.event_date AS event_date, e.capacity AS capacity, e.image_url AS image_url, e.location AS location,
           (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count
    FROM events e ORDER BY e.event_date DESC
  `;
  return { success: true, events: rows };
}

/**
 * Histórico visível a membros/visitantes: os 3 eventos mais recentemente
 * concluídos (status='completed'), independente de visibility — uma vez
 * concluído, o evento vira registro histórico da liga, não mais um recurso
 * restrito por papel. Só título/data/descrição, sem inscrição/capacidade
 * (isso já foi encerrado).
 */
export async function listRecentCompletedEvents(sql) {
  const rows = await sql`
    SELECT id, title, description, event_date, image_url, location
    FROM events WHERE status = 'completed'::event_status
    ORDER BY event_date DESC LIMIT 3
  `;
  return {
    success: true,
    events: rows.map((r) => ({ id: r.id, title: r.title, description: r.description, eventDate: r.event_date, imageUrl: r.image_url, location: r.location })),
  };
}
