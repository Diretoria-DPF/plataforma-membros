/**
 * profileService.js — porta fiel de src/services/ProfileService.gs.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { getRelationship } from './connectionService.js';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/;
const INSTAGRAM_RE = /^@?[a-zA-Z0-9_.]{1,30}$/;

export async function getMyProfile(sql, identity) {
  const rows = await sql`
    SELECT p.full_name AS full_name, p.username AS username, p.email AS email, p.phone AS phone,
           p.education AS education, p.avatar_url AS avatar_url, p.linkedin_url AS linkedin_url,
           p.instagram_handle AS instagram_handle, p.interests AS interests,
           p.role AS role, p.created_at AS created_at,
           pr.theme AS theme, pr.email_notifications AS email_notifications
    FROM profiles p LEFT JOIN preferences pr ON pr.profile_id = p.id
    WHERE p.id = ${identity.profileId}::uuid LIMIT 1
  `;

  if (!rows.length) throw E.NotFoundError('Perfil não encontrado.');
  const row = rows[0];

  return {
    success: true,
    profile: {
      fullName: row.full_name,
      username: row.username,
      email: row.email,
      phone: row.phone,
      education: row.education,
      avatarUrl: row.avatar_url,
      linkedinUrl: row.linkedin_url,
      instagramHandle: row.instagram_handle,
      interests: row.interests,
      role: row.role,
      memberSince: row.created_at,
    },
    preferences: {
      theme: row.theme || C.THEME.SYSTEM,
      emailNotifications: row.email_notifications !== false,
    },
  };
}

/**
 * Visão de outro membro (fluxograma → clicar num cartão → perfil).
 * Sem visibilidade granular por campo ainda (isso é a Fase 3b do plano
 * de mensageria, deixada pra depois) — qualquer membro/admin vê o
 * perfil completo de outro membro/admin ativo, exceto contato direto
 * (e-mail/telefone), que nunca aparece aqui. Devolve a relação
 * (conexão/bloqueio) para a interface decidir que botão mostrar.
 */
export async function getMemberProfile(sql, identity, targetUsername) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
  const username = S.normalizeText(targetUsername).toLowerCase();
  if (!username) throw E.ValidationError('Usuário inválido.');

  const rows = await sql`
    SELECT id, full_name, username, avatar_url, education, linkedin_url, instagram_handle,
           interests, role, created_at, league_position, directorate
    FROM profiles
    WHERE username = ${username} AND status = 'active'::account_status
      AND role IN ('member'::user_role, 'admin'::user_role)
    LIMIT 1
  `;
  if (!rows.length) throw E.NotFoundError('Perfil não encontrado.');
  const row = rows[0];

  const relationship = await getRelationship(sql, identity.profileId, row.id);
  if (relationship.isBlockedEitherWay) throw E.NotFoundError('Perfil não encontrado.');

  return {
    success: true,
    profile: {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      avatarUrl: row.avatar_url,
      education: row.education,
      linkedinUrl: row.linkedin_url,
      instagramHandle: row.instagram_handle,
      interests: row.interests,
      role: row.role,
      memberSince: row.created_at,
      leaguePosition: row.league_position,
      directorate: row.directorate,
    },
    relationship,
  };
}

export async function updateMyProfile(sql, identity, input, correlationId) {
  // Nome completo é imutável após o cadastro por decisão de produto — nunca
  // é lido de `input` aqui, nem aceito de volta como parâmetro editável,
  // mesmo que o cliente envie um valor (defesa contra um front-end
  // adulterado tentando forçar a troca).
  const username = S.normalizeText(input.username).toLowerCase();
  const phone = S.normalizeText(input.phone);
  const education = S.normalizeText(input.education);
  const linkedinUrl = S.normalizeText(input.linkedinUrl);
  const instagramHandle = S.normalizeText(input.instagramHandle).replace(/^@/, '');
  const interests = S.normalizeText(input.interests);

  if (!USERNAME_RE.test(username)) {
    throw E.ValidationError('Nome de usuário deve ter de 3 a 30 caracteres (letras, números, "_" ou ".").');
  }
  if (!S.isLengthValid(phone, C.LIMITS.PHONE_MIN, C.LIMITS.PHONE_MAX)) {
    throw E.ValidationError('Informe um telefone válido.');
  }
  if (education && education.length > C.LIMITS.EDUCATION_MAX) throw E.ValidationError('Escolaridade inválida.');
  if (linkedinUrl && linkedinUrl.length > 255) throw E.ValidationError('Link do LinkedIn inválido.');
  if (instagramHandle && !INSTAGRAM_RE.test(instagramHandle)) throw E.ValidationError('Usuário do Instagram inválido.');
  if (interests && interests.length > 500) throw E.ValidationError('Interesses: máximo de 500 caracteres.');

  const usernameTaken = await sql`SELECT id FROM profiles WHERE username = ${username} AND id <> ${identity.profileId}::uuid LIMIT 1`;
  if (usernameTaken.length) throw E.ConflictError('Este nome de usuário já está em uso.');

  await sql`
    UPDATE profiles SET username = ${username}, phone = ${phone}, education = ${education || null},
           linkedin_url = ${linkedinUrl || null}, instagram_handle = ${instagramHandle || null}, interests = ${interests || null}
    WHERE id = ${identity.profileId}::uuid
  `;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_PROFILE', 'profile', identity.profileId, 'success', null);
  return { success: true, message: 'Perfil atualizado com sucesso.' };
}

export async function updateMyAvatarFromBase64(sql, env, identity, avatarBase64, avatarMimeType, correlationId) {
  const { updateMyAvatar } = await import('./mediaService.js');
  return updateMyAvatar(sql, env, identity, avatarBase64, avatarMimeType, correlationId);
}

/**
 * Métricas de uso pessoal: quantos eventos/tarefas/propostas/votos a conta
 * já participou, mais as listas recentes para exibir no perfil. Cada
 * consulta já filtra por profile_id da PRÓPRIA sessão — mesma garantia de
 * isolamento por usuário do resto do sistema, nunca aceita um id vindo do
 * cliente.
 */
export async function getMyMetrics(sql, identity) {
  const [eventsRows, tasksRows, proposalsRows, votesRows, feedbackRows] = await Promise.all([
    sql`
      SELECT e.id, e.title, e.event_date, e.status
      FROM event_registrations r JOIN events e ON e.id = r.event_id
      WHERE r.profile_id = ${identity.profileId}::uuid
      ORDER BY e.event_date DESC LIMIT 10
    `,
    sql`
      SELECT t.id, t.title, t.due_date, s.completed_at
      FROM task_signups s JOIN tasks t ON t.id = s.task_id
      WHERE s.profile_id = ${identity.profileId}::uuid
      ORDER BY t.due_date DESC NULLS LAST LIMIT 10
    `,
    sql`SELECT count(*) AS total FROM proposals WHERE author_id = ${identity.profileId}::uuid`,
    sql`SELECT count(*) AS total FROM votes WHERE profile_id = ${identity.profileId}::uuid`,
    sql`SELECT count(*) AS total FROM feedback WHERE profile_id = ${identity.profileId}::uuid`,
  ]);

  const tasksCompleted = tasksRows.filter((t) => !!t.completed_at).length;

  return {
    success: true,
    metrics: {
      eventsCount: eventsRows.length,
      tasksCount: tasksRows.length,
      tasksCompletedCount: tasksCompleted,
      proposalsCount: Number(proposalsRows[0].total),
      votesCount: Number(votesRows[0].total),
      feedbackCount: Number(feedbackRows[0].total),
    },
    recentEvents: eventsRows.map((r) => ({ id: r.id, title: r.title, eventDate: r.event_date, status: r.status })),
    recentTasks: tasksRows.map((r) => ({ id: r.id, title: r.title, dueDate: r.due_date, completed: !!r.completed_at })),
  };
}

export async function updateMyPreferences(sql, identity, input, correlationId) {
  const theme = S.normalizeText(input.theme);
  const emailNotifications = input.emailNotifications === true;

  if (Object.values(C.THEME).indexOf(theme) === -1) throw E.ValidationError('Tema inválido.');

  // "Densidade" foi removida da interface (não tinha efeito visual útil).
  // A coluna preferences.density continua existindo no banco (NOT NULL
  // DEFAULT 'standard') só para não exigir uma migração de schema — nunca
  // mais é lida nem exposta a partir daqui.
  await sql`
    UPDATE preferences SET theme = ${theme}::theme_preference, email_notifications = ${emailNotifications}
    WHERE profile_id = ${identity.profileId}::uuid
  `;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_PREFERENCES', 'profile', identity.profileId, 'success', null);
  return { success: true, message: 'Preferências atualizadas.' };
}

export async function submitFeedback(sql, identity, message, correlationId) {
  const text = S.normalizeText(message);
  if (!S.isLengthValid(text, C.LIMITS.FEEDBACK_MIN, C.LIMITS.FEEDBACK_MAX)) {
    throw E.ValidationError('A mensagem deve ter entre ' + C.LIMITS.FEEDBACK_MIN + ' e ' + C.LIMITS.FEEDBACK_MAX + ' caracteres.');
  }

  await sql`INSERT INTO feedback (profile_id, message) VALUES (${identity.profileId}::uuid, ${text})`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SUBMIT_FEEDBACK', 'feedback', null, 'success', null);
  return { success: true, message: 'Obrigado! Seu feedback foi enviado.' };
}
