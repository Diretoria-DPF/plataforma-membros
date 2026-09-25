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

/**
 * Defesa em profundidade (achado M3 da auditoria de 2026-09-25): o campo
 * hoje só é renderizado como texto (nunca como href clicável), então não é
 * explorável agora — mas exigir esquema https:// evita que o campo vire um
 * vetor de link malicioso/javascript: se algum dia passar a ser clicável.
 */
export function isValidLinkedinUrl(value) {
  const v = normalizeText(value);
  if (!v) return true;
  if (v.length > 255) return false;
  if (!/^https:\/\//i.test(v)) return false;
  try {
    // eslint-disable-next-line no-new
    new URL(v);
    return true;
  } catch (err) {
    return false;
  }
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

async function findSessionRow(sql, pepper, rawToken) {
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

  return rows.length ? rows[0] : null;
}

/**
 * Resolve uma sessão a partir do token bruto recebido do cliente. SEMPRE
 * consulta o banco (join sessions+profiles) — nunca confia em papel/status
 * enviados pelo cliente. Retorna null se inválida/expirada/revogada, ou se
 * a conta está banida/sem e-mail confirmado — usado pelos endpoints onde
 * identidade é OPCIONAL (ex.: listar eventos públicos): uma conta banida
 * simplesmente cai para o mesmo tratamento de "anônimo", sem mensagem
 * especial, porque esses endpoints não exigem sessão válida de qualquer forma.
 */
export async function resolveSession(sql, pepper, rawToken) {
  const row = await findSessionRow(sql, pepper, rawToken);
  if (!row) return null;
  if (row.status === ACCOUNT_STATUS.BANNED) return null;
  if (!row.email_confirmed_at) return null;

  return {
    profileId: row.profile_id,
    role: row.role,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    sessionToken: normalizeText(rawToken),
  };
}

/**
 * Usado pelos endpoints que EXIGEM sessão válida. Diferente de
 * resolveSession, aqui uma conta banida gera uma mensagem específica (em
 * vez de cair no "sessão inválida" genérico) — quem já teria acesso ao
 * token de sessão (a própria pessoa logada) merece saber que foi banida,
 * não ficar achando que é só uma sessão expirada. Isso não abre uma nova
 * forma de enumeração: só quem já possui o token de sessão da conta (ou
 * seja, já estava logado nela) recebe essa informação.
 */
export async function requireSession(sql, pepper, rawToken) {
  const row = await findSessionRow(sql, pepper, rawToken);
  if (!row) {
    throw AuthError('Sessão inválida ou expirada. Faça login novamente.');
  }
  if (row.status === ACCOUNT_STATUS.BANNED) {
    throw AuthError('Sua conta foi banida. Se você acredita que isso é um engano, entre em contato com a administração.');
  }
  if (!row.email_confirmed_at) {
    throw AuthError('Sessão inválida ou expirada. Faça login novamente.');
  }

  return {
    profileId: row.profile_id,
    role: row.role,
    status: row.status,
    fullName: row.full_name,
    email: row.email,
    sessionToken: normalizeText(rawToken),
  };
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

/**
 * Estende a sessão em atividade real (chamado pelo cliente via
 * apiTouchSession, no máximo 1x/30s — ver resetSessionExpiryOnActivity em
 * app.js). Desliza expires_at para +SESSION_TTL_MINUTES a partir de agora,
 * mas nunca além de SESSION_ABSOLUTE_MAX_HOURS a partir da criação da
 * sessão — sem o teto absoluto, uma sessão nunca expiraria enquanto a
 * pessoa continuasse ativa.
 */
export async function touchSession(sql, pepper, rawToken) {
  const token = normalizeText(rawToken);
  if (!token) return;
  const tokenHash = await hashToken(token, pepper);
  await sql`
    UPDATE sessions
    SET expires_at = LEAST(
      now() + (${LIMITS.SESSION_TTL_MINUTES} || ' minutes')::interval,
      created_at + (${LIMITS.SESSION_ABSOLUTE_MAX_HOURS} || ' hours')::interval
    )
    WHERE token_hash = ${tokenHash} AND revoked_at IS NULL AND expires_at > now()
  `;
}
