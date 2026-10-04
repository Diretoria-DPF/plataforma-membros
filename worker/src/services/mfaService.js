/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * mfaService.js
 * Verificação em duas etapas (TOTP, RFC 6238) — Fase 2.
 *
 * Fluxo de login: senha correta + MFA ativa → NÃO cria sessão; devolve um
 * desafio de 5 minutos (mfaToken). apiLoginMfa troca desafio + código (ou
 * código de recuperação) pela sessão. Cada desafio aceita no máximo 5
 * tentativas, e há limite por pessoa e por IP.
 *
 * Obrigatoriedade para administradores: flag `mfa_required`. Com ela ligada,
 * um admin sem MFA continua conseguindo entrar, mas toda ação de admin é
 * recusada com `mfaSetupRequired` até ele cadastrar o autenticador
 * (assertAdminMfaSatisfied, chamada por runWithSession). Quem perde o
 * aparelho e os códigos é resetado por OUTRO admin (adminResetUserMfa) —
 * o procedimento de dois administradores de docs/DEPLOYMENT.md.
 *
 * Segurança: segredo cifrado em repouso (mfa/secretBox.js); passo TOTP já
 * usado nunca vale de novo (last_used_step, atualizado de forma atômica);
 * códigos de recuperação guardam só o hash e valem uma vez.
 *
 * Compatibilidade de implantação: se a migração 017 ainda não foi aplicada,
 * o login segue como antes (tabela ausente = sem MFA) em vez de falhar.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import * as Totp from '../mfa/totp.js';
import { encryptSecret, decryptSecret } from '../mfa/secretBox.js';
import { isEnabled, isMissingTable } from './featureFlagService.js';

export const MFA_CHALLENGE_TTL_SECONDS = 300;
export const MFA_CHALLENGE_MAX_ATTEMPTS = 5;
export const RECOVERY_CODE_COUNT = 10;
export const MFA_ISSUER = 'LAIFT';
export const MFA_REQUIRED_FLAG = 'mfa_required';

// Sem I, O, 0 e 1 (confundem-se ao ditar/ler). 32 símbolos dividem 256 por
// igual, então sortear por byte não introduz viés.
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT) {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_LENGTH));
    const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
    codes.push(chars.slice(0, 5) + '-' + chars.slice(5));
  }
  return codes;
}

function normalizeRecoveryCode(code) {
  return String(code || '').toUpperCase().replace(/[\s-]/g, '');
}

function isRecoveryShape(code) {
  return /^[A-Z2-9]{10}$/.test(normalizeRecoveryCode(code));
}

function hashRecoveryCode(env, code) {
  return S.hashToken('mfa-recovery:' + normalizeRecoveryCode(code), env.SESSION_TOKEN_PEPPER);
}

async function getCredential(sql, profileId) {
  const rows = await sql`
    SELECT profile_id, secret_enc, confirmed_at, last_used_step
    FROM mfa_credentials WHERE profile_id = ${profileId}::uuid
  `;
  return rows.length ? rows[0] : null;
}

async function getConfirmed(sql, profileId) {
  const cred = await getCredential(sql, profileId);
  return cred && cred.confirmed_at ? cred : null;
}

async function replaceRecoveryCodes(sql, env, profileId, codes) {
  const hashes = [];
  for (const code of codes) hashes.push(await hashRecoveryCode(env, code));
  await sql`
    WITH removed AS (DELETE FROM mfa_recovery_codes WHERE profile_id = ${profileId}::uuid)
    INSERT INTO mfa_recovery_codes (profile_id, code_hash)
    SELECT ${profileId}::uuid, unnest(${hashes}::text[])
  `;
}

/**
 * Confere um TOTP (6 dígitos) ou um código de recuperação. Devolve
 * 'totp' | 'recovery' | null. Os dois caminhos consomem o fator de forma
 * atômica, então duas requisições simultâneas com o mesmo código não passam.
 */
export async function checkSecondFactor(sql, env, profileId, code, now = Date.now()) {
  const cred = await getConfirmed(sql, profileId);
  if (!cred) return null;

  if (isRecoveryShape(code)) {
    const hash = await hashRecoveryCode(env, code);
    const used = await sql`
      UPDATE mfa_recovery_codes SET used_at = now()
      WHERE profile_id = ${profileId}::uuid AND code_hash = ${hash} AND used_at IS NULL
      RETURNING id
    `;
    return used.length ? 'recovery' : null;
  }

  let secret;
  try {
    secret = await decryptSecret(env, cred.secret_enc, profileId);
  } catch (err) {
    throw new Error('Não foi possível ler o segredo de MFA (chave de cifragem alterada?).');
  }
  const step = await Totp.verifyTotp(secret, code, now, Number(cred.last_used_step) || 0);
  if (step === null) return null;
  const claimed = await sql`
    UPDATE mfa_credentials SET last_used_step = ${step}
    WHERE profile_id = ${profileId}::uuid AND last_used_step < ${step}
    RETURNING profile_id
  `;
  return claimed.length ? 'totp' : null;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
/** Chamado pelo login depois da senha certa: devolve o desafio, ou null se a pessoa não usa MFA. */
export async function startLoginChallenge(sql, env, profileId) {
  let cred;
  try {
    cred = await getConfirmed(sql, profileId);
  } catch (err) {
    if (isMissingTable(err)) return null;
    throw err;
  }
  if (!cred) return null;

  const rawToken = S.generateRawToken();
  const tokenHash = await S.hashToken(rawToken, env.SESSION_TOKEN_PEPPER);
  await sql`
    INSERT INTO mfa_challenges (token_hash, profile_id, expires_at)
    VALUES (${tokenHash}, ${profileId}::uuid, now() + (${MFA_CHALLENGE_TTL_SECONDS} || ' seconds')::interval)
  `;
  return rawToken;
}

export async function completeLogin(sql, env, rawToken, code, userAgent, correlationId) {
  const token = S.normalizeText(rawToken);
  if (!token || !S.normalizeText(code)) throw E.AuthError('Informe o código de verificação.');
  await S.enforceRateLimit(sql, 'MFA_VERIFY_IP', env.clientIp || 'unknown', C.RATE_LIMITS.MFA_VERIFY_IP.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_VERIFY_IP.WINDOW_SECONDS);

  const tokenHash = await S.hashToken(token, env.SESSION_TOKEN_PEPPER);
  const claimed = await sql`
    UPDATE mfa_challenges SET attempts = attempts + 1
    WHERE token_hash = ${tokenHash} AND expires_at > now() AND attempts < ${MFA_CHALLENGE_MAX_ATTEMPTS}
    RETURNING profile_id
  `;
  if (!claimed.length) throw E.AuthError('A verificação expirou ou excedeu as tentativas. Entre novamente.');
  const profileId = claimed[0].profile_id;

  await S.enforceRateLimit(sql, 'MFA_VERIFY', profileId, C.RATE_LIMITS.MFA_VERIFY.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_VERIFY.WINDOW_SECONDS);
  const method = await checkSecondFactor(sql, env, profileId, code);
  if (!method) {
    await Logging.logAudit(sql, correlationId, profileId, 'LOGIN_MFA', 'profile', profileId, 'failure', null);
    throw E.AuthError('Código inválido ou já utilizado.');
  }

  const rows = await sql`
    SELECT role, status, full_name, email_confirmed_at FROM profiles WHERE id = ${profileId}::uuid LIMIT 1
  `;
  const p = rows[0];
  if (!p || p.status !== C.ACCOUNT_STATUS.ACTIVE || !p.email_confirmed_at) throw E.AuthError(C.GENERIC_AUTH_FAILURE_MESSAGE);

  await sql`DELETE FROM mfa_challenges WHERE token_hash = ${tokenHash}`;
  const sessionToken = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, profileId, userAgent || '');
  await Logging.logAudit(sql, correlationId, profileId, 'LOGIN_MFA', 'profile', profileId, 'success', { method });
  return {
    success: true,
    message: 'Login realizado com sucesso.',
    sessionToken,
    profile: { fullName: p.full_name, role: p.role },
    usedRecoveryCode: method === 'recovery',
  };
}

// ---------------------------------------------------------------------------
// Obrigatoriedade para administradores
// ---------------------------------------------------------------------------
export async function adminNeedsSetup(sql, identity) {
  if (!identity || identity.role !== C.ROLES.ADMIN) return false;
  if (!(await isEnabled(sql, MFA_REQUIRED_FLAG, identity))) return false;
  try {
    return !(await getConfirmed(sql, identity.profileId));
  } catch (err) {
    if (isMissingTable(err)) return false;
    throw err;
  }
}

export async function assertAdminMfaSatisfied(sql, identity) {
  if (!(await adminNeedsSetup(sql, identity))) return;
  const err = E.AuthError('Configure a verificação em duas etapas para continuar usando a área de administração.');
  err.payload = { mfaSetupRequired: true };
  throw err;
}

// ---------------------------------------------------------------------------
// Cadastro e manutenção (sessão obrigatória)
// ---------------------------------------------------------------------------
export async function status(sql, identity) {
  let cred;
  try {
    cred = await getCredential(sql, identity.profileId);
  } catch (err) {
    // Migração 017 ainda não aplicada: o recurso simplesmente não existe ainda.
    if (isMissingTable(err)) return { success: true, enabled: false, pendingEnrollment: false, recoveryCodesLeft: 0, required: false, available: false };
    throw err;
  }
  const enabled = !!(cred && cred.confirmed_at);
  let recoveryCodesLeft = 0;
  if (enabled) {
    const rows = await sql`SELECT count(*)::int AS n FROM mfa_recovery_codes WHERE profile_id = ${identity.profileId}::uuid AND used_at IS NULL`;
    recoveryCodesLeft = Number(rows[0].n) || 0;
  }
  const adminRequired = identity.role === C.ROLES.ADMIN && await isEnabled(sql, MFA_REQUIRED_FLAG, identity);
  return { success: true, enabled, pendingEnrollment: !!cred && !enabled, recoveryCodesLeft, required: adminRequired, available: true };
}

/** Senha (e, se houver MFA, o segundo fator) de quem executa uma ação sensível. */
export async function requireStepUp(sql, env, identity, rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  await S.enforceRateLimit(sql, 'MFA_MANAGE', identity.profileId, C.RATE_LIMITS.MFA_MANAGE.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_MANAGE.WINDOW_SECONDS);
  await assertPassword(sql, identity.profileId, input.password);
  let enrolled = null;
  try {
    enrolled = await getConfirmed(sql, identity.profileId);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
  }
  if (enrolled && !(await checkSecondFactor(sql, env, identity.profileId, input.code))) {
    throw E.AuthError('Código inválido ou já utilizado.');
  }
}

// Cadastrar um autenticador troca a defesa da conta: exige a SENHA (uma sessão
// roubada sozinha não basta para trancar o dono do lado de fora).
export async function beginEnrollment(sql, env, identity, rawInput) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  await S.enforceRateLimit(sql, 'MFA_ENROLL', identity.profileId, C.RATE_LIMITS.MFA_ENROLL.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_ENROLL.WINDOW_SECONDS);
  await assertPassword(sql, identity.profileId, input.password);
  const existing = await getCredential(sql, identity.profileId);
  if (existing && existing.confirmed_at) throw E.ConflictError('A verificação em duas etapas já está ativa.');

  const secret = Totp.generateSecret();
  const secretEnc = await encryptSecret(env, secret, identity.profileId);
  const saved = await sql`
    INSERT INTO mfa_credentials (profile_id, secret_enc)
    VALUES (${identity.profileId}::uuid, ${secretEnc})
    ON CONFLICT (profile_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, created_at = now()
    WHERE mfa_credentials.confirmed_at IS NULL
    RETURNING profile_id
  `;
  if (!saved.length) throw E.ConflictError('A verificação em duas etapas já está ativa.');
  return {
    success: true,
    secret,
    issuer: MFA_ISSUER,
    otpauthUri: Totp.buildOtpAuthUri({ issuer: MFA_ISSUER, account: identity.email, secret }),
  };
}

export async function confirmEnrollment(sql, env, identity, code, correlationId, now = Date.now()) {
  await S.enforceRateLimit(sql, 'MFA_MANAGE', identity.profileId, C.RATE_LIMITS.MFA_MANAGE.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_MANAGE.WINDOW_SECONDS);
  const cred = await getCredential(sql, identity.profileId);
  if (!cred) throw E.ValidationError('Inicie o cadastro do autenticador primeiro.');
  if (cred.confirmed_at) throw E.ConflictError('A verificação em duas etapas já está ativa.');

  const secret = await decryptSecret(env, cred.secret_enc, identity.profileId);
  const step = await Totp.verifyTotp(secret, code, now, 0);
  if (step === null) throw E.ValidationError('Código inválido. Confira o horário do celular e tente de novo.');

  // Ativação + códigos de recuperação num ÚNICO comando: se falhar, nada fica
  // pela metade (MFA ativa sem nenhum código que a pessoa tenha visto).
  const recoveryCodes = generateRecoveryCodes();
  const hashes = [];
  for (const recovery of recoveryCodes) hashes.push(await hashRecoveryCode(env, recovery));
  const confirmed = await sql`
    WITH activated AS (
      UPDATE mfa_credentials SET confirmed_at = now(), last_used_step = ${step}
      WHERE profile_id = ${identity.profileId}::uuid AND confirmed_at IS NULL
      RETURNING profile_id
    ), cleared AS (
      DELETE FROM mfa_recovery_codes WHERE profile_id IN (SELECT profile_id FROM activated)
    )
    INSERT INTO mfa_recovery_codes (profile_id, code_hash)
    SELECT profile_id, unnest(${hashes}::text[]) FROM activated
    RETURNING id
  `;
  if (!confirmed.length) throw E.ConflictError('A verificação em duas etapas já está ativa.');

  // Quem estava logado com a senha antes (talvez um intruso) é desconectado; a sessão atual fica.
  const keep = identity.sessionToken ? await S.hashToken(identity.sessionToken, env.SESSION_TOKEN_PEPPER) : '';
  await sql`
    UPDATE sessions SET revoked_at = now()
    WHERE profile_id = ${identity.profileId}::uuid AND revoked_at IS NULL AND token_hash <> ${keep}
  `;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MFA_ENABLE', 'profile', identity.profileId, 'success', null);
  return {
    success: true,
    message: 'Verificação em duas etapas ativada. Guarde os códigos de recuperação: eles só aparecem agora.',
    recoveryCodes,
  };
}

async function assertPassword(sql, profileId, password) {
  const pwd = S.normalizeText(password);
  if (!pwd) throw E.ValidationError('Informe sua senha.');
  const rows = await sql`SELECT (password_hash = crypt(${pwd}, password_hash)) AS ok FROM profiles WHERE id = ${profileId}::uuid`;
  if (!rows.length || rows[0].ok !== true) throw E.AuthError('Senha incorreta.');
}

export async function regenerateRecoveryCodes(sql, env, identity, rawInput, correlationId) {
  await S.enforceRateLimit(sql, 'MFA_MANAGE', identity.profileId, C.RATE_LIMITS.MFA_MANAGE.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_MANAGE.WINDOW_SECONDS);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  if (!(await getConfirmed(sql, identity.profileId))) throw E.ValidationError('A verificação em duas etapas não está ativa.');
  const method = await checkSecondFactor(sql, env, identity.profileId, input.code);
  if (!method) throw E.AuthError('Código inválido ou já utilizado.');

  const recoveryCodes = generateRecoveryCodes();
  await replaceRecoveryCodes(sql, env, identity.profileId, recoveryCodes);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MFA_RECOVERY_REGENERATE', 'profile', identity.profileId, 'success', null);
  return { success: true, message: 'Novos códigos gerados. Os anteriores deixaram de valer.', recoveryCodes };
}

// Um único comando: nunca sobra credencial sem códigos (ou o inverso).
async function wipe(sql, profileId) {
  await sql`
    WITH challenges AS (DELETE FROM mfa_challenges WHERE profile_id = ${profileId}::uuid),
         recovery AS (DELETE FROM mfa_recovery_codes WHERE profile_id = ${profileId}::uuid)
    DELETE FROM mfa_credentials WHERE profile_id = ${profileId}::uuid
  `;
}

export async function disable(sql, env, identity, rawInput, correlationId) {
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  await S.enforceRateLimit(sql, 'MFA_DISABLE', identity.profileId, C.RATE_LIMITS.MFA_DISABLE.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_DISABLE.WINDOW_SECONDS);
  if (!(await getConfirmed(sql, identity.profileId))) throw E.ValidationError('A verificação em duas etapas não está ativa.');
  if (identity.role === C.ROLES.ADMIN && await isEnabled(sql, MFA_REQUIRED_FLAG, identity)) {
    throw E.ForbiddenError('A verificação em duas etapas é obrigatória para administradores.');
  }
  await assertPassword(sql, identity.profileId, input.password);
  const method = await checkSecondFactor(sql, env, identity.profileId, input.code);
  if (!method) throw E.AuthError('Código inválido ou já utilizado.');

  await wipe(sql, identity.profileId);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MFA_DISABLE', 'profile', identity.profileId, 'success', null);
  return { success: true, message: 'Verificação em duas etapas desativada.' };
}

async function sendResetLink(env, email, correlationId, sql) {
  // Import tardio: authService importa este arquivo (evita dependência circular).
  const AuthService = await import('./authService.js');
  return AuthService.requestPasswordReset(sql, env, email, correlationId);
}

/**
 * Recuperação de conta: OUTRO administrador apaga o MFA da pessoa. Como isto
 * enfraquece a conta (e seria o atalho de um admin comprometido), exige a
 * senha e o segundo fator de quem executa e deixa a conta do alvo SEM senha
 * válida: ele precisa criar uma nova pelo link enviado ao e-mail dele. Assim
 * quem apenas sabe a senha antiga não consegue entrar e cadastrar o PRÓPRIO
 * autenticador na janela entre o reset e o recadastro.
 */
export async function adminResetUserMfa(sql, env, identity, targetProfileId, rawInput, correlationId, deps) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  const target = S.normalizeText(targetProfileId);
  if (!UUID_RE.test(target)) throw E.ValidationError('Pessoa inválida.');
  if (target === identity.profileId) {
    throw E.ForbiddenError('Peça a outro administrador para redefinir a sua verificação em duas etapas.');
  }
  await S.enforceRateLimit(sql, 'MFA_ADMIN_RESET', identity.profileId, C.RATE_LIMITS.MFA_ADMIN_RESET.MAX_ATTEMPTS, C.RATE_LIMITS.MFA_ADMIN_RESET.WINDOW_SECONDS);
  await requireStepUp(sql, env, identity, rawInput);

  const found = await sql`SELECT id, email FROM profiles WHERE id = ${target}::uuid`;
  if (!found.length) throw E.NotFoundError('Pessoa não encontrada.');

  // Sessões primeiro: mesmo que algo falhe depois, o alvo já não tem acesso aberto.
  await S.revokeAllSessionsForProfile(sql, target);
  await wipe(sql, target);
  await sql`UPDATE profiles SET password_hash = crypt(${S.generateRawToken()}, gen_salt('bf', 10)) WHERE id = ${target}::uuid`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MFA_ADMIN_RESET', 'profile', target, 'success', null);

  let linkSent = true;
  try {
    const send = (deps && deps.sendResetLink) || sendResetLink;
    await send(env, found[0].email, correlationId, sql);
  } catch (err) {
    linkSent = false;
  }
  return {
    success: true,
    linkSent,
    message: linkSent
      ? 'Verificação em duas etapas redefinida. A senha da pessoa foi invalidada e um link para criar uma nova foi enviado ao e-mail dela.'
      : 'Verificação em duas etapas redefinida e senha invalidada, mas o e-mail não saiu. A pessoa deve usar "Esqueci minha senha".',
  };
}
