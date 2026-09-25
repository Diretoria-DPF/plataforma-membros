/**
 * adminService.js — porta fiel de src/services/AdminService.gs, incluindo a
 * checagem de existência do alvo em changeUserRole/banUser/unbanUser
 * (achado da auditoria de segurança, corrigido também na versão Apps
 * Script antes desta migração — ver histórico de commits).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

export async function dashboard(sql, identity) {
  assertAdmin(identity);

  const rows = await sql`
    SELECT
      (SELECT count(*) FROM profiles WHERE role = 'member'::user_role AND status = 'active'::account_status) AS active_members,
      (SELECT count(*) FROM profiles WHERE role = 'admin'::user_role AND status = 'active'::account_status) AS active_admins,
      (SELECT count(*) FROM profiles WHERE status = 'banned'::account_status) AS banned_accounts,
      (SELECT count(*) FROM events WHERE status = 'published'::event_status) AS published_events,
      (SELECT count(*) FROM proposals WHERE status = 'submitted'::proposal_status) AS proposals_pending,
      (SELECT count(*) FROM proposals WHERE status = 'voting_open'::proposal_status) AS proposals_voting,
      (SELECT count(*) FROM tasks WHERE status = 'published'::task_status) AS tasks_open
  `;

  return { success: true, indicators: rows[0] };
}

const USER_SORT_COLUMNS = { created_at: 'created_at', full_name: 'full_name', email: 'email' };
const USER_SORT_DIRECTIONS = { ASC: 'ASC', DESC: 'DESC' };

export async function listUsers(sql, identity, input) {
  assertAdmin(identity);

  const search = S.normalizeText(input && input.search);
  const page = Math.max(1, parseInt((input && input.page) || 1, 10) || 1);
  const pageSize = C.LIMITS.ADMIN_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const sortColumn = USER_SORT_COLUMNS[(input && input.sortBy) || ''] || USER_SORT_COLUMNS.created_at;
  const sortDirection = USER_SORT_DIRECTIONS[(input && input.sortDir) || ''] || USER_SORT_DIRECTIONS.DESC;

  // sortColumn/sortDirection vêm SEMPRE de uma lista fechada acima (nunca
  // interpolação direta do valor do cliente) — por isso é seguro colocar no
  // texto da query via sql(texto, params) em vez do template tag.
  const whereClause = search ? 'WHERE full_name ILIKE $1 OR email ILIKE $1' : '';
  const params = search ? ['%' + search + '%'] : [];
  const limitParamIndex = params.length + 1;
  const offsetParamIndex = params.length + 2;

  const rows = await sql(
    `SELECT id, full_name, email, role, status, email_confirmed_at, created_at, league_position, directorate
     FROM profiles ${whereClause}
     ORDER BY ${sortColumn} ${sortDirection}
     LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`,
    params.concat([pageSize, offset])
  );

  const countRows = await sql(`SELECT count(*) AS total FROM profiles ${whereClause}`, params);

  return {
    success: true,
    users: rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      email: r.email,
      role: r.role,
      status: r.status,
      emailConfirmed: !!r.email_confirmed_at,
      createdAt: r.created_at,
      leaguePosition: r.league_position,
      directorate: r.directorate,
    })),
    page,
    pageSize,
    total: Number(countRows[0].total),
  };
}

async function translateLastAdminError(err) {
  const msg = String((err && err.message) || '');
  if (msg.indexOf('último administrador') !== -1) {
    throw E.ConflictError('Esta é a última conta de administrador ativa: não é possível removê-la, rebaixá-la ou bani-la.');
  }
  throw err;
}

export async function changeUserRole(sql, identity, targetProfileId, newRole, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(targetProfileId);
  const role = S.normalizeText(newRole);

  if ([C.ROLES.VISITOR, C.ROLES.MEMBER, C.ROLES.ADMIN].indexOf(role) === -1) {
    throw E.ValidationError('Papel inválido.');
  }

  let rows;
  try {
    rows = await sql`UPDATE profiles SET role = ${role}::user_role WHERE id = ${id}::uuid RETURNING id`;
  } catch (err) {
    await translateLastAdminError(err);
  }
  if (!rows || !rows.length) throw E.NotFoundError('Usuário não encontrado.');

  await Logging.logAudit(sql, correlationId, identity.profileId, 'CHANGE_USER_ROLE', 'profile', id, 'success', { newRole: role });
  return { success: true, message: 'Papel atualizado com sucesso.' };
}

export async function banUser(sql, identity, targetProfileId, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(targetProfileId);

  let rows;
  try {
    rows = await sql`UPDATE profiles SET status = 'banned'::account_status WHERE id = ${id}::uuid RETURNING id`;
  } catch (err) {
    await translateLastAdminError(err);
  }
  if (!rows || !rows.length) throw E.NotFoundError('Usuário não encontrado.');

  await S.revokeAllSessionsForProfile(sql, id);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'BAN_USER', 'profile', id, 'success', null);
  return { success: true, message: 'Conta banida. Todas as sessões ativas foram revogadas.' };
}

export async function unbanUser(sql, identity, targetProfileId, correlationId) {
  assertAdmin(identity);
  const id = S.normalizeText(targetProfileId);

  const rows = await sql`UPDATE profiles SET status = 'active'::account_status WHERE id = ${id}::uuid RETURNING id`;
  if (!rows.length) throw E.NotFoundError('Usuário não encontrado.');

  await Logging.logAudit(sql, correlationId, identity.profileId, 'UNBAN_USER', 'profile', id, 'success', null);
  return { success: true, message: 'Conta reativada.' };
}

export async function listFeedback(sql, identity, input) {
  assertAdmin(identity);
  const page = Math.max(1, parseInt((input && input.page) || 1, 10) || 1);
  const pageSize = C.LIMITS.ADMIN_LIST_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const rows = await sql`
    SELECT f.id AS id, f.message AS message, f.created_at AS created_at, p.full_name AS author_name
    FROM feedback f LEFT JOIN profiles p ON p.id = f.profile_id
    ORDER BY f.created_at DESC LIMIT ${pageSize} OFFSET ${offset}
  `;
  const countRows = await sql`SELECT count(*) AS total FROM feedback`;

  return { success: true, feedback: rows, page, pageSize, total: Number(countRows[0].total) };
}
