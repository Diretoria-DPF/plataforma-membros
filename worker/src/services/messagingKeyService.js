/**
 * messagingKeyService.js
 * Publicação e leitura da CHAVE PÚBLICA de mensageria de cada conta (Fase
 * 3d de docs/PLANO_FASE3_MENSAGERIA.md). O servidor só guarda a pública, o
 * algoritmo, os parâmetros do KDF (para o dono re-derivar a mesma chave a
 * partir da própria frase-secreta) e o salt — nunca a privada, nunca a
 * semente, nunca a frase. Toda a criptografia roda no navegador
 * (frontend/msg-crypto.js, ainda não implementado nesta fatia — ver
 * relatório final).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { getRelationship } from './connectionService.js';

const ALGORITHMS = ['X25519', 'P-256'];
const KDF_ALGORITHMS = ['PBKDF2-SHA256'];

function assertMemberOrAdmin(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

/** Comprimento em bytes do valor decodificado de uma string base64url sem padding. */
function decodedByteLength(base64url) {
  const raw = S.normalizeText(base64url);
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return -1;
  const padLen = (4 - (raw.length % 4)) % 4;
  const padded = raw.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  try {
    return atob(padded).length;
  } catch (err) {
    return -1;
  }
}

function toResponse(row) {
  if (!row) return { success: true, hasKey: false };
  return {
    success: true,
    hasKey: true,
    keyVersion: row.key_version,
    algorithm: row.algorithm,
    publicKey: row.public_key,
    kdf: { algorithm: row.kdf_algorithm, iterations: row.kdf_iterations, salt: row.kdf_salt },
  };
}

/** Só o próprio dono, e só a versão ativa — inclui o salt. */
export async function getMyMessagingKey(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT key_version, algorithm, public_key, kdf_algorithm, kdf_iterations, kdf_salt
    FROM messaging_keys WHERE profile_id = ${identity.profileId}::uuid AND superseded_at IS NULL
    LIMIT 1
  `;
  return toResponse(rows[0]);
}

function validatePublishInput(input) {
  const algorithm = S.normalizeText(input && input.algorithm);
  const publicKey = S.normalizeText(input && input.publicKey);
  const kdfAlgorithm = S.normalizeText(input && input.kdfAlgorithm);
  const kdfIterations = Number(input && input.kdfIterations);
  const kdfSalt = S.normalizeText(input && input.kdfSalt);
  const expectedCurrentVersion = Number(input && input.expectedCurrentVersion);

  if (ALGORITHMS.indexOf(algorithm) === -1) throw E.ValidationError('Algoritmo de chave inválido.');
  if (KDF_ALGORITHMS.indexOf(kdfAlgorithm) === -1) throw E.ValidationError('Algoritmo de derivação de chave inválido.');
  if (!Number.isInteger(kdfIterations) || kdfIterations < C.LIMITS.KDF_MIN_ITERATIONS) {
    throw E.ValidationError('Número de iterações do KDF abaixo do mínimo permitido.');
  }
  if (!Number.isInteger(expectedCurrentVersion) || expectedCurrentVersion < 0) {
    throw E.ValidationError('Versão de chave esperada inválida.');
  }
  if (!S.isLengthValid(publicKey, C.LIMITS.MESSAGING_PUBLIC_KEY_MIN_LEN, C.LIMITS.MESSAGING_PUBLIC_KEY_MAX_LEN)) {
    throw E.ValidationError('Chave pública inválida.');
  }
  if (!S.isLengthValid(kdfSalt, C.LIMITS.MESSAGING_SALT_MIN_LEN, C.LIMITS.MESSAGING_SALT_MAX_LEN)) {
    throw E.ValidationError('Salt do KDF inválido.');
  }

  const publicKeyBytes = decodedByteLength(publicKey);
  if (publicKeyBytes === -1) throw E.ValidationError('Chave pública inválida (base64url malformado).');
  if (algorithm === 'X25519' && publicKeyBytes !== 32) {
    throw E.ValidationError('Chave pública X25519 deve ter 32 bytes.');
  }

  const saltBytes = decodedByteLength(kdfSalt);
  if (saltBytes === -1 || saltBytes < 16) throw E.ValidationError('Salt do KDF inválido (base64url malformado ou curto).');

  return { algorithm, publicKey, kdfAlgorithm, kdfIterations, kdfSalt, expectedCurrentVersion };
}

/**
 * Primeira publicação (expectedCurrentVersion = 0) ou rotação
 * (expectedCurrentVersion = N, versão ativa atual). Concorrência
 * otimista: o UPDATE de "supersede" só acontece se a versão ativa
 * encontrada bater com a esperada, e o INSERT da nova versão usa
 * exatamente N+1 — tudo num único statement com CTE, atômico no driver
 * HTTP do Neon.
 */
export async function publishMessagingKey(sql, identity, input, correlationId) {
  assertMemberOrAdmin(identity);
  await S.enforceRateLimit(sql, 'KEY_PUBLISH', identity.profileId, C.RATE_LIMITS.KEY_PUBLISH.MAX_ATTEMPTS, C.RATE_LIMITS.KEY_PUBLISH.WINDOW_SECONDS);

  const v = validatePublishInput(input);

  const rows = await sql`
    WITH current AS (
      SELECT key_version FROM messaging_keys
      WHERE profile_id = ${identity.profileId}::uuid AND superseded_at IS NULL
      FOR UPDATE
    ),
    checked AS (
      SELECT COALESCE((SELECT key_version FROM current), 0) AS current_version
    ),
    superseded AS (
      UPDATE messaging_keys SET superseded_at = now()
      WHERE profile_id = ${identity.profileId}::uuid AND superseded_at IS NULL
        AND (SELECT current_version FROM checked) = ${v.expectedCurrentVersion}
      RETURNING key_version
    )
    INSERT INTO messaging_keys (profile_id, key_version, algorithm, public_key, kdf_algorithm, kdf_iterations, kdf_salt)
    SELECT ${identity.profileId}::uuid, (SELECT current_version FROM checked) + 1, ${v.algorithm}, ${v.publicKey},
           ${v.kdfAlgorithm}, ${v.kdfIterations}, ${v.kdfSalt}
    WHERE (SELECT current_version FROM checked) = ${v.expectedCurrentVersion}
    RETURNING key_version
  `;

  if (!rows.length) {
    throw E.ConflictError('A chave de mensageria já foi alterada em outro lugar. Recarregue e tente novamente.');
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'PUBLISH_MESSAGING_KEY', 'profile', identity.profileId, 'success', { keyVersion: rows[0].key_version });
  return { success: true, message: 'Chave de mensageria publicada.', keyVersion: rows[0].key_version };
}

/**
 * Todas as versões (só pública + versão + algoritmo, nunca o salt) de um
 * contato autorizado. Exige conexão aceita E ausência de bloqueio —
 * achado MEDIUM #3 da revisão de segurança: sem essa checagem, uma conta
 * bloqueada continuaria conseguindo buscar chaves novas rotacionadas da
 * outra parte indefinidamente (o bloqueio só apaga a linha de
 * `connections`; a conversa e o histórico continuam existindo).
 */
export async function getPeerMessagingKeys(sql, identity, peerProfileId) {
  assertMemberOrAdmin(identity);
  const peerId = S.normalizeText(peerProfileId);
  if (!peerId) throw E.ValidationError('Contato inválido.');

  const relationship = await getRelationship(sql, identity.profileId, peerId);
  if (relationship.isBlockedEitherWay || (!relationship.isSelf && !relationship.isConnection)) {
    throw E.ForbiddenError('Só é possível ver chaves de mensageria de conexões aceitas.');
  }

  const rows = await sql`
    SELECT key_version, algorithm, public_key, superseded_at
    FROM messaging_keys WHERE profile_id = ${peerId}::uuid
    ORDER BY key_version DESC
  `;

  return {
    success: true,
    keys: rows.map((r) => ({ keyVersion: r.key_version, algorithm: r.algorithm, publicKey: r.public_key, active: r.superseded_at === null })),
  };
}
