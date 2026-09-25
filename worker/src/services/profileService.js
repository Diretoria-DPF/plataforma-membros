/**
 * profileService.js — porta fiel de src/services/ProfileService.gs.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';

export async function getMyProfile(sql, identity) {
  const rows = await sql`
    SELECT p.full_name AS full_name, p.email AS email, p.phone AS phone, p.city AS city,
           p.education AS education, p.role AS role, p.created_at AS created_at,
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
      email: row.email,
      phone: row.phone,
      city: row.city,
      education: row.education,
      role: row.role,
      memberSince: row.created_at,
    },
    preferences: {
      theme: row.theme || C.THEME.SYSTEM,
      emailNotifications: row.email_notifications !== false,
    },
  };
}

export async function updateMyProfile(sql, identity, input, correlationId) {
  // Nome completo é imutável após o cadastro por decisão de produto — nunca
  // é lido de `input` aqui, nem aceito de volta como parâmetro editável,
  // mesmo que o cliente envie um valor (defesa contra um front-end
  // adulterado tentando forçar a troca).
  const phone = S.normalizeText(input.phone);
  const city = S.normalizeText(input.city);
  const education = S.normalizeText(input.education);

  if (!S.isLengthValid(phone, C.LIMITS.PHONE_MIN, C.LIMITS.PHONE_MAX)) {
    throw E.ValidationError('Informe um telefone válido.');
  }
  if (city && city.length > C.LIMITS.CITY_MAX) throw E.ValidationError('Cidade inválida.');
  if (education && education.length > C.LIMITS.EDUCATION_MAX) throw E.ValidationError('Escolaridade inválida.');

  await sql`
    UPDATE profiles SET phone = ${phone}, city = ${city || null}, education = ${education || null}
    WHERE id = ${identity.profileId}::uuid
  `;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'UPDATE_PROFILE', 'profile', identity.profileId, 'success', null);
  return { success: true, message: 'Perfil atualizado com sucesso.' };
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
