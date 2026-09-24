/**
 * AuditService.gs
 * Consulta de auditoria e logs técnicos — restrita a administradores.
 * Os dados sensíveis já são minimizados na escrita (App.Logging nunca grava
 * senha/token/telefone/e-mail completo/corpo de proposta); aqui aplicamos
 * paginação e filtros por lista fechada de colunas.
 */
App.AuditService = (function () {
  const C = App.Constants;
  const S = App.Security;

  function assertAdmin(identity) {
    S.requireRole(identity, [C.ROLES.ADMIN]);
  }

  function listAuditLogs(identity, input) {
    assertAdmin(identity);

    const page = Math.max(1, parseInt(input && input.page, 10) || 1);
    const pageSize = C.LIMITS.AUDIT_LIST_PAGE_SIZE;
    const offset = (page - 1) * pageSize;
    const actionFilter = S.normalizeText(input && input.action);
    const resultFilter = S.normalizeText(input && input.result);

    const clauses = [];
    const params = [];

    if (actionFilter) {
      clauses.push('a.action ILIKE ?');
      params.push('%' + actionFilter + '%');
    }
    if (resultFilter === 'success' || resultFilter === 'failure') {
      clauses.push('a.result = ?');
      params.push(resultFilter);
    }

    const whereClause = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';

    const rows = App.Database.query(
      'SELECT a.id AS id, a.correlation_id AS correlation_id, a.action AS action, a.target_type AS target_type, ' +
        '       a.target_id AS target_id, a.result AS result, a.details AS details, a.created_at AS created_at, ' +
        '       p.full_name AS actor_name ' +
        'FROM audit_logs a LEFT JOIN profiles p ON p.id = a.actor_id ' +
        whereClause + ' ' +
        'ORDER BY a.created_at DESC LIMIT ? OFFSET ?',
      params.concat([pageSize, offset])
    );

    const countRows = App.Database.query('SELECT count(*) AS total FROM audit_logs a ' + whereClause, params);

    return { success: true, logs: rows, page: page, pageSize: pageSize, total: Number(countRows[0].total) };
  }

  function listErrorLogs(identity, input) {
    assertAdmin(identity);

    const page = Math.max(1, parseInt(input && input.page, 10) || 1);
    const pageSize = C.LIMITS.AUDIT_LIST_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const rows = App.Database.query(
      'SELECT id, correlation_id, code, message, created_at FROM error_logs ' +
        'ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );
    const countRows = App.Database.query('SELECT count(*) AS total FROM error_logs', []);

    return { success: true, logs: rows, page: page, pageSize: pageSize, total: Number(countRows[0].total) };
  }

  return {
    listAuditLogs: listAuditLogs,
    listErrorLogs: listErrorLogs,
  };
})();
