/**
 * EventService.gs
 * Eventos: consulta pública/autenticada com filtro de visibilidade no
 * servidor, inscrição única e protegida por concorrência (UNIQUE + trigger de
 * vagas em sql/002_functions_and_triggers.sql), e gestão administrativa
 * (criar, editar, transições de status).
 */
App.EventService = (function () {
  const C = App.Constants;
  const S = App.Security;
  const E = App.Errors;

  function visibilityClauseFor(identity) {
    if (!identity) return "visibility = 'public'::event_visibility";
    if (identity.role === C.ROLES.MEMBER || identity.role === C.ROLES.ADMIN) {
      return "visibility IN ('public','authenticated','members')";
    }
    return "visibility IN ('public','authenticated')";
  }

  /** Lista eventos publicados visíveis para o solicitante (identity pode ser null = anônimo). */
  function listEvents(identity) {
    const rows = App.Database.query(
      'SELECT e.id AS id, e.title AS title, e.description AS description, e.event_date AS event_date, ' +
        '       e.visibility AS visibility, e.capacity AS capacity, ' +
        '       (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count ' +
        'FROM events e ' +
        "WHERE e.status = 'published'::event_status AND " + visibilityClauseFor(identity) + ' ' +
        'ORDER BY e.event_date ASC',
      []
    );

    let myRegistrations = {};
    if (identity) {
      const mine = App.Database.query(
        'SELECT event_id FROM event_registrations WHERE profile_id = ?::uuid',
        [identity.profileId]
      );
      mine.forEach(function (r) { myRegistrations[r.event_id] = true; });
    }

    return {
      success: true,
      events: rows.map(function (row) {
        const spotsLeft = row.capacity === null ? null : Math.max(row.capacity - row.registered_count, 0);
        return {
          id: row.id,
          title: row.title,
          description: row.description,
          eventDate: row.event_date,
          visibility: row.visibility,
          capacity: row.capacity,
          registeredCount: row.registered_count,
          spotsLeft: spotsLeft,
          isRegistered: !!myRegistrations[row.id],
        };
      }),
    };
  }

  function registerForEvent(identity, eventId, correlationId) {
    const id = S.normalizeText(eventId);
    if (!id) throw E.ValidationError('Evento inválido.');

    try {
      App.Database.execute('INSERT INTO event_registrations (event_id, profile_id) VALUES (?::uuid, ?::uuid)', [id, identity.profileId]);
    } catch (err) {
      const msg = String(err && err.message || '');
      if (msg.indexOf('event_registrations_unique') !== -1) {
        throw E.ConflictError('Você já está inscrito neste evento.');
      }
      if (msg.indexOf('sem vagas') !== -1 || msg.indexOf('não está aberto') !== -1 || msg.indexOf('não autorizada') !== -1) {
        throw E.ConflictError('Não foi possível concluir a inscrição: evento sem vagas ou indisponível.');
      }
      App.Logging.logError(correlationId, 'EVENT_REGISTER_FAILED', 'Falha ao registrar inscrição em evento.', { eventId: id });
      throw err;
    }

    App.Logging.logAudit(correlationId, identity.profileId, 'REGISTER_EVENT', 'event', id, 'success', null);
    return { success: true, message: 'Inscrição confirmada.' };
  }

  // ---------------------------------------------------------------------------
  // Administração
  // ---------------------------------------------------------------------------
  function assertAdmin(identity) {
    S.requireRole(identity, [C.ROLES.ADMIN]);
  }

  function createEvent(identity, input, correlationId) {
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

    const inserted = App.Database.query(
      'INSERT INTO events (title, description, event_date, visibility, capacity, created_by, status) ' +
        "VALUES (?, ?, ?, ?::event_visibility, ?, ?::uuid, 'draft'::event_status) RETURNING id",
      [title, description, new Date(eventDate).toISOString(), visibility, capacity, identity.profileId]
    );

    const id = inserted[0].id;
    App.Logging.logAudit(correlationId, identity.profileId, 'CREATE_EVENT', 'event', id, 'success', null);
    return { success: true, message: 'Evento criado como rascunho.', eventId: id };
  }

  const EVENT_TRANSITIONS = {
    draft: ['published'],
    published: ['closed', 'archived'],
    closed: ['completed', 'archived'],
    completed: ['archived'],
    archived: [],
  };

  function updateEventStatus(identity, eventId, newStatus, correlationId) {
    assertAdmin(identity);
    const id = S.normalizeText(eventId);
    const status = S.normalizeText(newStatus);

    if (Object.keys(EVENT_TRANSITIONS).indexOf(status) === -1) throw E.ValidationError('Status inválido.');

    const current = App.Database.query('SELECT status FROM events WHERE id = ?::uuid', [id]);
    if (!current.length) throw E.NotFoundError('Evento não encontrado.');

    const allowed = EVENT_TRANSITIONS[current[0].status] || [];
    if (current[0].status !== status && allowed.indexOf(status) === -1) {
      throw E.ConflictError('Transição de status inválida.');
    }

    App.Database.execute('UPDATE events SET status = ?::event_status WHERE id = ?::uuid', [status, id]);
    App.Logging.logAudit(correlationId, identity.profileId, 'UPDATE_EVENT_STATUS', 'event', id, 'success', { newStatus: status });
    return { success: true, message: 'Status do evento atualizado.' };
  }

  function listAllEventsAdmin(identity) {
    assertAdmin(identity);
    const rows = App.Database.query(
      'SELECT e.id AS id, e.title AS title, e.status AS status, e.visibility AS visibility, ' +
        '       e.event_date AS event_date, e.capacity AS capacity, ' +
        '       (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id) AS registered_count ' +
        'FROM events e ORDER BY e.event_date DESC',
      []
    );
    return { success: true, events: rows };
  }

  return {
    listEvents: listEvents,
    registerForEvent: registerForEvent,
    createEvent: createEvent,
    updateEventStatus: updateEventStatus,
    listAllEventsAdmin: listAllEventsAdmin,
  };
})();
