/**
 * AdminService.gs
 * Dashboard, gestão de contas (busca paginada, promover/rebaixar/banir/
 * desbanir) e leitura de feedback. A proteção da última conta admin ativa é
 * garantida pelo gatilho guard_last_active_admin() (sql/002); aqui apenas
 * traduzimos a exceção do banco em mensagem amigável.
 *
 * Minimização: a listagem de usuários devolve só os campos necessários para
 * a tarefa de gestão de papel/status (nome, e-mail, papel, status) — nunca
 * telefone, cidade, escolaridade ou hash de senha.
 */
App.AdminService = (function () {
  const C = App.Constants;
  const S = App.Security;
  const E = App.Errors;

  function assertAdmin(identity) {
    S.requireRole(identity, [C.ROLES.ADMIN]);
  }

  function dashboard(identity) {
    assertAdmin(identity);

    const rows = App.Database.query(
      "SELECT " +
        "(SELECT count(*) FROM profiles WHERE role = 'member'::user_role AND status = 'active'::account_status) AS active_members, " +
        "(SELECT count(*) FROM profiles WHERE role = 'admin'::user_role AND status = 'active'::account_status) AS active_admins, " +
        "(SELECT count(*) FROM profiles WHERE status = 'banned'::account_status) AS banned_accounts, " +
        "(SELECT count(*) FROM events WHERE status = 'published'::event_status) AS published_events, " +
        "(SELECT count(*) FROM proposals WHERE status = 'submitted'::proposal_status) AS proposals_pending, " +
        "(SELECT count(*) FROM proposals WHERE status = 'voting_open'::proposal_status) AS proposals_voting, " +
        "(SELECT count(*) FROM tasks WHERE status = 'published'::task_status) AS tasks_open " +
        "",
      []
    );

    return { success: true, indicators: rows[0] };
  }

  const USER_SORT_COLUMNS = { created_at: 'created_at', full_name: 'full_name', email: 'email' };
  const USER_SORT_DIRECTIONS = { ASC: 'ASC', DESC: 'DESC' };

  function listUsers(identity, input) {
    assertAdmin(identity);

    const search = S.normalizeText(input && input.search);
    const page = Math.max(1, parseInt(input && input.page, 10) || 1);
    const pageSize = C.LIMITS.ADMIN_LIST_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const sortColumn = USER_SORT_COLUMNS[input && input.sortBy] || USER_SORT_COLUMNS.created_at;
    const sortDirection = USER_SORT_DIRECTIONS[input && input.sortDir] || USER_SORT_DIRECTIONS.DESC;

    const whereClause = search ? 'WHERE full_name ILIKE ? OR email ILIKE ?' : '';
    const params = search ? ['%' + search + '%', '%' + search + '%'] : [];

    const rows = App.Database.query(
      'SELECT id, full_name, email, role, status, email_confirmed_at, created_at ' +
        'FROM profiles ' + whereClause + ' ' +
        'ORDER BY ' + sortColumn + ' ' + sortDirection + ' ' +
        'LIMIT ? OFFSET ?',
      params.concat([pageSize, offset])
    );

    const countRows = App.Database.query('SELECT count(*) AS total FROM profiles ' + whereClause, params);

    return {
      success: true,
      users: rows.map(function (r) {
        return {
          id: r.id,
          fullName: r.full_name,
          email: r.email,
          role: r.role,
          status: r.status,
          emailConfirmed: !!r.email_confirmed_at,
          createdAt: r.created_at,
        };
      }),
      page: page,
      pageSize: pageSize,
      total: Number(countRows[0].total),
    };
  }

  function translateLastAdminError(err) {
    const msg = String(err && err.message || '');
    if (msg.indexOf('último administrador') !== -1) {
      throw E.ConflictError('Esta é a última conta de administrador ativa: não é possível removê-la, rebaixá-la ou bani-la.');
    }
    throw err;
  }

  function changeUserRole(identity, targetProfileId, newRole, correlationId) {
    assertAdmin(identity);
    const id = S.normalizeText(targetProfileId);
    const role = S.normalizeText(newRole);

    if ([C.ROLES.VISITOR, C.ROLES.MEMBER, C.ROLES.ADMIN].indexOf(role) === -1) {
      throw E.ValidationError('Papel inválido.');
    }

    let affected;
    try {
      affected = App.Database.execute('UPDATE profiles SET role = ?::user_role WHERE id = ?::uuid', [role, id]);
    } catch (err) {
      translateLastAdminError(err);
    }
    if (!affected) throw E.NotFoundError('Usuário não encontrado.');

    App.Logging.logAudit(correlationId, identity.profileId, 'CHANGE_USER_ROLE', 'profile', id, 'success', { newRole: role });
    return { success: true, message: 'Papel atualizado com sucesso.' };
  }

  function banUser(identity, targetProfileId, correlationId) {
    assertAdmin(identity);
    const id = S.normalizeText(targetProfileId);

    let affected;
    try {
      affected = App.Database.execute("UPDATE profiles SET status = 'banned'::account_status WHERE id = ?::uuid", [id]);
    } catch (err) {
      translateLastAdminError(err);
    }
    if (!affected) throw E.NotFoundError('Usuário não encontrado.');

    S.revokeAllSessionsForProfile(id);
    App.Logging.logAudit(correlationId, identity.profileId, 'BAN_USER', 'profile', id, 'success', null);
    return { success: true, message: 'Conta banida. Todas as sessões ativas foram revogadas.' };
  }

  function unbanUser(identity, targetProfileId, correlationId) {
    assertAdmin(identity);
    const id = S.normalizeText(targetProfileId);

    const affected = App.Database.execute("UPDATE profiles SET status = 'active'::account_status WHERE id = ?::uuid", [id]);
    if (!affected) throw E.NotFoundError('Usuário não encontrado.');

    App.Logging.logAudit(correlationId, identity.profileId, 'UNBAN_USER', 'profile', id, 'success', null);
    return { success: true, message: 'Conta reativada.' };
  }

  function listFeedback(identity, input) {
    assertAdmin(identity);
    const page = Math.max(1, parseInt(input && input.page, 10) || 1);
    const pageSize = C.LIMITS.ADMIN_LIST_PAGE_SIZE;
    const offset = (page - 1) * pageSize;

    const rows = App.Database.query(
      'SELECT f.id AS id, f.message AS message, f.created_at AS created_at, p.full_name AS author_name ' +
        'FROM feedback f LEFT JOIN profiles p ON p.id = f.profile_id ' +
        'ORDER BY f.created_at DESC LIMIT ? OFFSET ?',
      [pageSize, offset]
    );
    const countRows = App.Database.query('SELECT count(*) AS total FROM feedback', []);

    return { success: true, feedback: rows, page: page, pageSize: pageSize, total: Number(countRows[0].total) };
  }

  return {
    dashboard: dashboard,
    listUsers: listUsers,
    changeUserRole: changeUserRole,
    banUser: banUser,
    unbanUser: unbanUser,
    listFeedback: listFeedback,
  };
})();
