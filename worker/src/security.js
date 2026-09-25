/**
 * security.js
 * Validação de entrada, tokens opacos (sessão/confirmação/redefinição),
 * limitação de tentativas e checagens de sessão/papel. Espelha
 * src/Security.gs (Apps Script) na lógica; a única mudança real é a
 * implementação de hashing (Web Crypto nativo do runtime do Worker, no
 * lugar de Utilities.computeDigest do Apps Script) e o armazenamento do
 * rate limit (tabela no Postgres, no lugar de CacheService — ver comentário
 * em enforceRateLimit).
 *
 * Sobre sessão no cliente: segue valendo a mesma regra de sempre — o token
 * de sessão só existe em memória JS no navegador (nunca localStorage/
 * cookie), independente de onde o backend está hospedado. Ver
 * frontend/app.js e docs/SECURITY.md.
 */
import { RateLimitError, AuthError, ForbiddenError } from './errors.js';
import { ACCOUNT_STATUS, LIMITS } from './constants.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeText(value) {
  return String(value === null || value === undefined ? '' : value).trim();
}

export function isValidEmail(email) {
  const v = normalizeText(email).toLowerCase();
  return EMAIL_RE.test(v) && v.length <= 255;
}

export function isLengthValid(value, min, max) {
  const len = normalizeText(value).length;
  return len >= min && len <= max;
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

/** Token opaco de alta entropia (duas UUIDv4 concatenadas, CSPRNG do runtime). */
export function generateRawToken() {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '');
}

/** SHA-256(pepper + ':' + token). Só o hash é persistido. */
export async function hashToken(rawToken, pepper) {
  return sha256Hex(pepper + ':' + rawToken);
}

export function newCorrelationId() {
  return crypto.randomUUID();
}

/**
 * Limitador de tentativas por (bucket, identificador), agora persistido
 * numa tabela Postgres (rate_limit_buckets — ver sql/003_rate_limits.sql)
 * em vez do CacheService do Apps Script. Um único UPSERT atômico faz
 * leitura+incremento (ou reinício de janela) em UMA operação — o
 * bloqueio de linha do Postgres durante o UPDATE serializa tentativas
 * concorrentes na mesma chave, o que é uma garantia MELHOR do que o
 * CacheService antigo (cuja janela de corrida entre leitura e escrita
 * estava documentada como risco residual conhecido).
 */
export async function enforceRateLimit(sql, bucket, identifier, maxAttempts, windowSeconds) {
  const idHash = await sha256Hex(normalizeText(identifier).toLowerCase());

  const rows = await sql`
    INSERT INTO rate_limit_buckets (bucket, identifier_hash, window_started_at, attempts)
    VALUES (${bucket}, ${idHash}, now(), 1)
    ON CONFLICT (bucket, identifier_hash) DO UPDATE SET
      attempts = CASE
        WHEN rate_limit_buckets.window_started_at < now() - (${windowSeconds} || ' seconds')::interval THEN 1
        ELSE rate_limit_buckets.attempts + 1
      END,
      window_started_at = CASE
        WHEN rate_limit_buckets.window_started_at < now() - (${windowSeconds} || ' seconds')::interval THEN now()
        ELSE rate_limit_buckets.window_started_at
      END
    RETURNING attempts
  `;

  const attempts = rows[0].attempts;
  if (attempts > maxAttempts) {
    throw RateLimitError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
  }
}

/** Cria uma sessão persistida e devolve o token BRUTO (só existe neste retorno). */
export async function createSession(sql, pepper, profileId, userAgent, ttlMinutes = LIMITS.SESSION_TTL_MINUTES) {
  const rawToken = generateRawToken();
  const tokenHash = await hashToken(rawToken, pepper);

  await sql`
    INSERT INTO sessions (profile_id, token_hash, expires_at, user_agent)
    VALUES (${profileId}::uuid, ${tokenHash}, now() + (${ttlMinutes} || ' minutes')::interval, ${userAgent || null})
  `;

  return rawToken;
}

/**
 * Resolve uma sessão a partir do token bruto recebido do cliente. SEMPRE
 * consulta o banco (join sessions+profiles) — nunca confia em papel/status
 * enviados pelo cliente. Retorna null se inválida/expirada/revogada, ou se
 * a conta está banida/sem e-mail confirmado.
 */
export async function resolveSession(sql, pepper, rawToken) {
  const token = normalizeText(rawToken);
  if (!token) return null;

  const tokenHash = await hashToken(token, pepper);
  const rows = await sql`
    SELECT s.profile_id AS profile_id, p.role AS role, p.status AS status,
           p.full_name AS full_name, p.email AS email, p.email_confirmed_at AS email_confirmed_at
    FROM sessions s
    JOIN profiles p ON p.id = s.profile_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
    LIMIT 1
  `;

  if (!rows.length) return null;

  const row = rows[0];
  if (row.status === ACCOUNT_STATUS.BANNED) return null;
  if (!row.email_confirmed_at) return null;

  return {
    profileId: row.profile_id,
    role: row.role,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    sessionToken: token,
  };
}

export async function requireSession(sql, pepper, rawToken) {
  const identity = await resolveSession(sql, pepper, rawToken);
  if (!identity) {
    throw AuthError('Sessão inválida ou expirada. Faça login novamente.');
  }
  return identity;
}

export function requireRole(identity, allowedRoles) {
  if (!identity || allowedRoles.indexOf(identity.role) === -1) {
    throw ForbiddenError('Acesso não autorizado para este recurso.');
  }
}

export async function revokeSession(sql, pepper, rawToken) {
  const tokenHash = await hashToken(normalizeText(rawToken), pepper);
  await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${tokenHash} AND revoked_at IS NULL`;
}

export async function revokeAllSessionsForProfile(sql, profileId) {
  await sql`UPDATE sessions SET revoked_at = now() WHERE profile_id = ${profileId}::uuid AND revoked_at IS NULL`;
}
