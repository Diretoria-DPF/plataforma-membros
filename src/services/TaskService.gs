/**
 * TaskService.gs
 * Tarefas: somente member/admin ativos e confirmados podem ver e aderir.
 * Tarefas não publicadas não aparecem em consultas comuns (filtradas no
 * servidor, nunca ocultadas só na interface).
 */
App.TaskService = (function () {
  const C = App.Constants;
  const S = App.Security;
  const E = App.Errors;

  function listTasks(identity) {
    S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);

    const rows = App.Database.query(
      'SELECT t.id AS id, t.title AS title, t.description AS description, t.due_date AS due_date, ' +
        '       (s.id IS NOT NULL) AS already_signed_up, ' +
        '       (SELECT count(*) FROM task_signups s2 WHERE s2.task_id = t.id) AS signup_count ' +
        'FROM tasks t ' +
        'LEFT JOIN task_signups s ON s.task_id = t.id AND s.profile_id = ?::uuid ' +
        "WHERE t.status = 'published'::task_status " +
        'ORDER BY t.due_date ASC NULLS LAST',
      [identity.profileId]
    );

    return {
      success: true,
      tasks: rows.map(function (r) {
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          dueDate: r.due_date,
          alreadySignedUp: r.already_signed_up === true || r.already_signed_up === 't',
          signupCount: r.signup_count,
        };
      }),
    };
  }

  function signupForTask(identity, taskId, correlationId) {
    S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
    const id = S.normalizeText(taskId);

    try {
      App.Database.execute('INSERT INTO task_signups (task_id, profile_id) VALUES (?::uuid, ?::uuid)', [id, identity.profileId]);
    } catch (err) {
      const msg = String(err && err.message || '');
      if (msg.indexOf('task_signups_unique') !== -1) throw E.ConflictError('Você já aderiu a esta tarefa.');
      if (msg.indexOf('não está disponível') !== -1 || msg.indexOf('não autorizada') !== -1) {
        throw E.ConflictError('Esta tarefa não está mais disponível para adesão.');
      }
      App.Logging.logError(correlationId, 'TASK_SIGNUP_FAILED', 'Falha ao aderir a tarefa.', { taskId: id });
      throw err;
    }

    App.Logging.logAudit(correlationId, identity.profileId, 'SIGNUP_TASK', 'task', id, 'success', null);
    return { success: true, message: 'Adesão confirmada.' };
  }

  // ---------------------------------------------------------------------------
  // Administração
  // ---------------------------------------------------------------------------
  function assertAdmin(identity) {
    S.requireRole(identity, [C.ROLES.ADMIN]);
  }

  function createTask(identity, input, correlationId) {
    assertAdmin(identity);

    const title = S.normalizeText(input.title);
    const description = S.normalizeText(input.description);
    const dueDate = S.normalizeText(input.dueDate);
    const eventId = S.normalizeText(input.eventId) || null;

    if (!S.isLengthValid(title, C.LIMITS.TITLE_MIN, C.LIMITS.TITLE_MAX)) throw E.ValidationError('Título inválido.');
    if (!S.isLengthValid(description, C.LIMITS.TASK_DESCRIPTION_MIN, C.LIMITS.DESCRIPTION_MAX)) throw E.ValidationError('Descrição inválida.');

    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (dueDate && isNaN(parsedDueDate.getTime())) throw E.ValidationError('Prazo inválido.');

    const inserted = App.Database.query(
      "INSERT INTO tasks (event_id, title, description, due_date, created_by, status) " +
        "VALUES (?::uuid, ?, ?, ?, ?::uuid, 'draft'::task_status) RETURNING id",
      [eventId, title, description, parsedDueDate ? parsedDueDate.toISOString() : null, identity.profileId]
    );

    const id = inserted[0].id;
    App.Logging.logAudit(correlationId, identity.profileId, 'CREATE_TASK', 'task', id, 'success', null);
    return { success: true, message: 'Tarefa criada como rascunho.', taskId: id };
  }

  const TASK_TRANSITIONS = {
    draft: ['published'],
    published: ['completed', 'archived'],
    completed: ['archived'],
    archived: [],
  };

  function updateTaskStatus(identity, taskId, newStatus, correlationId) {
    assertAdmin(identity);
    const id = S.normalizeText(taskId);
    const status = S.normalizeText(newStatus);

    if (Object.keys(TASK_TRANSITIONS).indexOf(status) === -1) throw E.ValidationError('Status inválido.');

    const current = App.Database.query('SELECT status FROM tasks WHERE id = ?::uuid', [id]);
    if (!current.length) throw E.NotFoundError('Tarefa não encontrada.');

    const allowed = TASK_TRANSITIONS[current[0].status] || [];
    if (current[0].status !== status && allowed.indexOf(status) === -1) {
      throw E.ConflictError('Transição de status inválida.');
    }

    App.Database.execute('UPDATE tasks SET status = ?::task_status WHERE id = ?::uuid', [status, id]);
    App.Logging.logAudit(correlationId, identity.profileId, 'UPDATE_TASK_STATUS', 'task', id, 'success', { newStatus: status });
    return { success: true, message: 'Status da tarefa atualizado.' };
  }

  function listAllTasksAdmin(identity) {
    assertAdmin(identity);
    const rows = App.Database.query(
      'SELECT t.id AS id, t.title AS title, t.status AS status, t.due_date AS due_date, ' +
        '       (SELECT count(*) FROM task_signups s WHERE s.task_id = t.id) AS signup_count ' +
        'FROM tasks t ORDER BY t.due_date ASC NULLS LAST',
      []
    );
    return { success: true, tasks: rows };
  }

  return {
    listTasks: listTasks,
    signupForTask: signupForTask,
    createTask: createTask,
    updateTaskStatus: updateTaskStatus,
    listAllTasksAdmin: listAllTasksAdmin,
  };
})();
