/**
 * authService.js
 * Cadastro, confirmação de e-mail, login, logout e recuperação de senha.
 * Porta fiel de src/services/AuthService.gs — mesma lógica de negócio e
 * mesmas garantias de segurança (hash sempre em Postgres via pgcrypto,
 * mitigação de timing attack na enumeração de e-mail, revogação de sessões
 * no reset de senha). A diferença real é de infraestrutura: operações que
 * eram uma transação multi-instrução (App.Database.withTransaction) agora
 * são um único statement SQL com CTEs encadeadas — ver comentário em db.js.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { sendEmail } from '../mailer.js';

const BCRYPT_COST = 10;
// Hash bcrypt fixo (não corresponde a nenhuma senha real) usado só para
// igualar o tempo de resposta quando o e-mail informado não existe.
const DUMMY_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8vC0Ldx7Fn6TZ2yq6q9Q2q9Q2q9Q2q';

function assertValidRegistration(input) {
  const fullName = S.normalizeText(input.fullName);
  const email = S.normalizeText(input.email).toLowerCase();
  const phone = S.normalizeText(input.phone);
  const city = S.normalizeText(input.city);
  const education = S.normalizeText(input.education);
  const password = S.normalizeText(input.password);
  const validationPreference = S.normalizeText(input.validationPreference || 'email');

  if (!S.isLengthValid(fullName, C.LIMITS.NAME_MIN, C.LIMITS.NAME_MAX)) {
    throw E.ValidationError('Informe um nome completo válido.');
  }
  if (!S.isValidEmail(email)) {
    throw E.ValidationError('Informe um e-mail válido.');
  }
  if (!S.isLengthValid(phone, C.LIMITS.PHONE_MIN, C.LIMITS.PHONE_MAX)) {
    throw E.ValidationError('Informe um telefone válido.');
  }
  if (city && city.length > C.LIMITS.CITY_MAX) {
    throw E.ValidationError('Cidade inválida.');
  }
  if (education && education.length > C.LIMITS.EDUCATION_MAX) {
    throw E.ValidationError('Escolaridade inválida.');
  }
  if (password.length < C.LIMITS.PASSWORD_MIN_LENGTH) {
    throw E.ValidationError('A senha deve ter pelo menos ' + C.LIMITS.PASSWORD_MIN_LENGTH + ' caracteres.');
  }
  if (validationPreference !== 'email') {
    throw E.ValidationError('No momento, apenas a confirmação por e-mail está disponível.');
  }
  if (input.termsAccepted !== true) {
    throw E.ValidationError('É necessário aceitar os Termos de Uso.');
  }
  if (input.privacyAccepted !== true) {
    throw E.ValidationError('É necessário aceitar a Política de Privacidade.');
  }

  return { fullName, email, phone, city: city || null, education: education || null, password };
}

function escapeHtmlForEmail(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendConfirmationEmail(env, email, fullName, rawToken, correlationId, profileId, sql) {
  const link = env.APP_BASE_URL + '?mode=confirm&token=' + encodeURIComponent(rawToken);
  try {
    await sendEmail(env, {
      to: email,
      subject: 'Confirme sua conta — ' + env.MAIL_FROM_NAME,
      text: 'Olá, ' + fullName + '. Confirme sua conta acessando: ' + link + ' (o link expira em ' + C.LIMITS.EMAIL_TOKEN_TTL_HOURS + ' horas).',
      html:
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">' +
        '<h2>Confirme sua conta</h2>' +
        '<p>Olá, ' + escapeHtmlForEmail(fullName) + '.</p>' +
        '<p><a href="' + link + '" target="_blank">Clique aqui para confirmar seu e-mail</a></p>' +
        '<p>Este link expira em ' + C.LIMITS.EMAIL_TOKEN_TTL_HOURS + ' horas.</p>' +
        '</div>',
    });
  } catch (mailErr) {
    await Logging.logError(sql, correlationId, 'MAIL_CONFIRMATION_FAILED', 'Falha ao enviar e-mail de confirmação.', {
      profileId,
      detail: String((mailErr && mailErr.message) || mailErr),
    });
  }
}

export async function register(sql, env, input, correlationId) {
  const data = assertValidRegistration(input);
  await S.enforceRateLimit(sql, 'REGISTER_GLOBAL', 'global', C.RATE_LIMITS.REGISTER_GLOBAL.MAX_ATTEMPTS, C.RATE_LIMITS.REGISTER_GLOBAL.WINDOW_SECONDS);
  await S.enforceRateLimit(sql, 'REGISTER', data.email, C.RATE_LIMITS.REGISTER.MAX_ATTEMPTS, C.RATE_LIMITS.REGISTER.WINDOW_SECONDS);

  const existing = await sql`SELECT id FROM profiles WHERE email = ${data.email} LIMIT 1`;
  if (existing.length) {
    throw E.ConflictError('Já existe uma conta cadastrada com este e-mail.');
  }

  const rawToken = S.generateRawToken();
  const tokenHash = await S.hashToken(rawToken, env.SESSION_TOKEN_PEPPER);

  const rows = await sql`
    WITH new_profile AS (
      INSERT INTO profiles (full_name, email, password_hash, phone, city, education, role, status)
      VALUES (${data.fullName}, ${data.email}, crypt(${data.password}, gen_salt('bf', ${BCRYPT_COST})), ${data.phone}, ${data.city}, ${data.education}, ${C.ROLES.VISITOR}::user_role, ${C.ACCOUNT_STATUS.ACTIVE}::account_status)
      RETURNING id
    ),
    consent_terms AS (
      INSERT INTO consents (profile_id, document_type, document_version)
      SELECT id, 'terms'::consent_document_type, ${C.LEGAL_VERSIONS.TERMS} FROM new_profile
    ),
    consent_privacy AS (
      INSERT INTO consents (profile_id, document_type, document_version)
      SELECT id, 'privacy'::consent_document_type, ${C.LEGAL_VERSIONS.PRIVACY} FROM new_profile
    ),
    prefs AS (
      INSERT INTO preferences (profile_id) SELECT id FROM new_profile
    )
    INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at)
    SELECT id, ${C.TOKEN_TYPE.EMAIL_CONFIRMATION}::account_token_type, ${tokenHash}, now() + (${C.LIMITS.EMAIL_TOKEN_TTL_HOURS} || ' hours')::interval
    FROM new_profile
    RETURNING profile_id
  `;

  const profileId = rows[0].profile_id;

  await sendConfirmationEmail(env, data.email, data.fullName, rawToken, correlationId, profileId, sql);
  await Logging.logAudit(sql, correlationId, profileId, 'REGISTER', 'profile', profileId, 'success', null);

  return { success: true, message: 'Cadastro realizado. Verifique seu e-mail para confirmar a conta.' };
}

export async function confirmEmail(sql, env, rawToken, correlationId) {
  const token = S.normalizeText(rawToken);
  if (!token) throw E.ValidationError('Link de confirmação inválido.');
  await S.enforceRateLimit(sql, 'CONFIRM_EMAIL', token, C.RATE_LIMITS.CONFIRM_EMAIL.MAX_ATTEMPTS, C.RATE_LIMITS.CONFIRM_EMAIL.WINDOW_SECONDS);

  const tokenHash = await S.hashToken(token, env.SESSION_TOKEN_PEPPER);

  const rows = await sql`
    WITH consumed AS (
      UPDATE account_tokens SET used_at = now()
      WHERE token_hash = ${tokenHash} AND token_type = 'email_confirmation'::account_token_type
        AND used_at IS NULL AND expires_at > now()
      RETURNING profile_id
    )
    UPDATE profiles SET email_confirmed_at = now()
    WHERE id = (SELECT profile_id FROM consumed) AND email_confirmed_at IS NULL
    RETURNING id
  `;

  const profileId = rows.length ? rows[0].id : null;

  if (!profileId) {
    await Logging.logAudit(sql, correlationId, null, 'CONFIRM_EMAIL', 'account_token', null, 'failure', null);
    throw E.ConflictError('Link de confirmação inválido, já utilizado ou expirado.');
  }

  await Logging.logAudit(sql, correlationId, profileId, 'CONFIRM_EMAIL', 'profile', profileId, 'success', null);
  return { success: true, message: 'E-mail confirmado com sucesso. Você já pode entrar.' };
}

export async function login(sql, env, email, password, userAgent, correlationId) {
  const normalizedEmail = S.normalizeText(email).toLowerCase();
  const pwd = S.normalizeText(password);

  if (!S.isValidEmail(normalizedEmail) || !pwd) {
    throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);
  }

  await S.enforceRateLimit(sql, 'LOGIN', normalizedEmail, C.RATE_LIMITS.LOGIN.MAX_ATTEMPTS, C.RATE_LIMITS.LOGIN.WINDOW_SECONDS);

  const rows = await sql`
    SELECT id, role, status, full_name, email_confirmed_at, (password_hash = crypt(${pwd}, password_hash)) AS password_ok
    FROM profiles WHERE email = ${normalizedEmail} LIMIT 1
  `;

  if (!rows.length) {
    // Mitiga enumeração por tempo de resposta: computa um crypt() equivalente
    // mesmo quando não há conta com esse e-mail.
    await sql`SELECT crypt(${pwd}, ${DUMMY_BCRYPT_HASH}) AS ignored`;
    await Logging.logAudit(sql, correlationId, null, 'LOGIN', 'profile', null, 'failure', null);
    throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);
  }

  const row = rows[0];
  const authorized = row.password_ok === true && row.status === C.ACCOUNT_STATUS.ACTIVE && !!row.email_confirmed_at;

  if (!authorized) {
    await Logging.logAudit(sql, correlationId, row.id, 'LOGIN', 'profile', row.id, 'failure', null);
    throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);
  }

  const sessionToken = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, row.id, userAgent || '');
  await Logging.logAudit(sql, correlationId, row.id, 'LOGIN', 'profile', row.id, 'success', null);

  return {
    success: true,
    message: 'Login realizado com sucesso.',
    sessionToken,
    profile: { fullName: row.full_name, role: row.role },
  };
}

export async function logout(sql, env, rawSessionToken, correlationId) {
  const identity = await S.resolveSession(sql, env.SESSION_TOKEN_PEPPER, rawSessionToken);
  await S.revokeSession(sql, env.SESSION_TOKEN_PEPPER, rawSessionToken);
  await Logging.logAudit(sql, correlationId, identity ? identity.profileId : null, 'LOGOUT', 'session', null, 'success', null);
  return { success: true, message: 'Sessão encerrada.' };
}

export async function requestPasswordReset(sql, env, email, correlationId) {
  const normalizedEmail = S.normalizeText(email).toLowerCase();
  const generic = { success: true, message: 'Se o e-mail existir em nossa base, um link de redefinição será enviado.' };

  if (!S.isValidEmail(normalizedEmail)) {
    throw E.ValidationError('Informe um e-mail válido.');
  }

  await S.enforceRateLimit(sql, 'RESET_REQUEST_GLOBAL', 'global', C.RATE_LIMITS.RESET_REQUEST_GLOBAL.MAX_ATTEMPTS, C.RATE_LIMITS.RESET_REQUEST_GLOBAL.WINDOW_SECONDS);
  await S.enforceRateLimit(sql, 'RESET_REQUEST', normalizedEmail, C.RATE_LIMITS.RESET_REQUEST.MAX_ATTEMPTS, C.RATE_LIMITS.RESET_REQUEST.WINDOW_SECONDS);

  const rows = await sql`SELECT id, full_name FROM profiles WHERE email = ${normalizedEmail} AND status = 'active'::account_status LIMIT 1`;

  if (!rows.length) {
    await Logging.logAudit(sql, correlationId, null, 'REQUEST_PASSWORD_RESET', 'profile', null, 'success', null);
    return generic;
  }

  const profile = rows[0];
  const rawToken = S.generateRawToken();
  const tokenHash = await S.hashToken(rawToken, env.SESSION_TOKEN_PEPPER);

  await sql`
    INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at)
    VALUES (${profile.id}::uuid, ${C.TOKEN_TYPE.PASSWORD_RESET}::account_token_type, ${tokenHash}, now() + (${C.LIMITS.RESET_TOKEN_TTL_MINUTES} || ' minutes')::interval)
  `;

  const link = env.APP_BASE_URL + '?mode=reset&token=' + encodeURIComponent(rawToken);

  try {
    await sendEmail(env, {
      to: normalizedEmail,
      subject: 'Redefinição de senha — ' + env.MAIL_FROM_NAME,
      text: 'Acesse o link para redefinir sua senha: ' + link + ' (expira em ' + C.LIMITS.RESET_TOKEN_TTL_MINUTES + ' minutos).',
      html:
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#222">' +
        '<h2>Redefinição de senha</h2>' +
        '<p><a href="' + link + '" target="_blank">Clique aqui para criar uma nova senha</a></p>' +
        '<p>Este link expira em ' + C.LIMITS.RESET_TOKEN_TTL_MINUTES + ' minutos.</p>' +
        '</div>',
    });
  } catch (mailErr) {
    await Logging.logError(sql, correlationId, 'MAIL_RESET_FAILED', 'Falha ao enviar e-mail de redefinição.', {
      profileId: profile.id,
      detail: String((mailErr && mailErr.message) || mailErr),
    });
  }

  await Logging.logAudit(sql, correlationId, profile.id, 'REQUEST_PASSWORD_RESET', 'profile', profile.id, 'success', null);
  return generic;
}

export async function validateResetToken(sql, env, rawToken) {
  const token = S.normalizeText(rawToken);
  if (!token) return { success: false, message: 'Link inválido.' };

  const tokenHash = await S.hashToken(token, env.SESSION_TOKEN_PEPPER);
  const rows = await sql`
    SELECT id FROM account_tokens WHERE token_hash = ${tokenHash} AND token_type = 'password_reset'::account_token_type
      AND used_at IS NULL AND expires_at > now() LIMIT 1
  `;

  if (!rows.length) return { success: false, message: 'Este link é inválido, já foi usado ou expirou.' };
  return { success: true, message: 'Link válido.' };
}

export async function confirmPasswordReset(sql, env, rawToken, newPassword, correlationId) {
  const token = S.normalizeText(rawToken);
  const pwd = S.normalizeText(newPassword);

  if (!token) throw E.ValidationError('Link de redefinição inválido.');
  await S.enforceRateLimit(sql, 'RESET_CONFIRM', token, C.RATE_LIMITS.RESET_CONFIRM.MAX_ATTEMPTS, C.RATE_LIMITS.RESET_CONFIRM.WINDOW_SECONDS);
  if (pwd.length < C.LIMITS.PASSWORD_MIN_LENGTH) {
    throw E.ValidationError('A nova senha deve ter pelo menos ' + C.LIMITS.PASSWORD_MIN_LENGTH + ' caracteres.');
  }

  const tokenHash = await S.hashToken(token, env.SESSION_TOKEN_PEPPER);

  const rows = await sql`
    WITH consumed AS (
      UPDATE account_tokens SET used_at = now()
      WHERE token_hash = ${tokenHash} AND token_type = 'password_reset'::account_token_type
        AND used_at IS NULL AND expires_at > now()
      RETURNING profile_id
    )
    UPDATE profiles SET password_hash = crypt(${pwd}, gen_salt('bf', ${BCRYPT_COST}))
    WHERE id = (SELECT profile_id FROM consumed)
    RETURNING id
  `;

  const profileId = rows.length ? rows[0].id : null;

  if (!profileId) {
    await Logging.logAudit(sql, correlationId, null, 'CONFIRM_PASSWORD_RESET', 'account_token', null, 'failure', null);
    throw E.ConflictError('Link inválido, já utilizado ou expirado.');
  }

  await S.revokeAllSessionsForProfile(sql, profileId);
  await Logging.logAudit(sql, correlationId, profileId, 'CONFIRM_PASSWORD_RESET', 'profile', profileId, 'success', null);
  return { success: true, message: 'Senha redefinida com sucesso. Faça login novamente.' };
}
