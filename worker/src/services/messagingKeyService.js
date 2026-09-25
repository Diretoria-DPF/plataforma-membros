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
// 'NONE' (sql/010_messaging_simplify.sql): chave gerada aleatoriamente no
// navegador e guardada em IndexedDB, sem frase-secreta/PBKDF2 — feedback
// do dono da plataforma de que a frase-secreta tornou a mensageria
// complicada demais para o uso real entre os membros. 'PBKDF2-SHA256'
// continua aceito só para não quebrar as contas que já publicaram uma
// chave sob o fluxo antigo antes desta mudança.
const KDF_ALGORITHMS = ['PBKDF2-SHA256', 'NONE'];

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

function toResponse(row, profileId) {
  if (!row) return { success: true, hasKey: false, profileId };
  return {
    success: true,
    hasKey: true,
    profileId,
    keyVersion: row.key_version,
    algorithm: row.algorithm,
    publicKey: row.public_key,
    kdf: { algorithm: row.kdf_algorithm, iterations: row.kdf_iterations, salt: row.kdf_salt },
  };
}

/**
 * Só o próprio dono, e só a versão ativa — inclui o salt.
 *
 * `profileId` (adicionado na Fase 3f, frontend/msg-crypto.js): o front-end
 * não tem, hoje, NENHUMA outra forma de aprender o próprio UUID de perfil
 * (login e getMyProfile nunca o devolvem — só getMemberProfile devolve,
 * mas só o de OUTRA conta). O AAD do AES-GCM (seção 3.6 do plano) precisa
 * embutir o `senderId` exatamente como o servidor vai gravar em
 * `messages.sender_id`, então o cliente precisa conhecer esse valor ANTES
 * de cifrar a primeira mensagem — não dá para descobrir depois, por
 * indução, sem circularidade. Como esta é literalmente a primeira chamada
 * que o fluxo de desbloqueio/configuração de mensageria já faz (para ler
 * salt/iterações e a chave pública ativa), é o lugar natural para
 * devolver também o próprio id, sem endpoint novo.
 */
export async function getMyMessagingKey(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT key_version, algorithm, public_key, kdf_algorithm, kdf_iterations, kdf_salt
    FROM messaging_keys WHERE profile_id = ${identity.profileId}::uuid AND superseded_at IS NULL
    LIMIT 1
  `;
  return toResponse(rows[0], identity.profileId);
}

function validatePublishInput(input) {
  const algorithm = S.normalizeText(input && input.algorithm);
  const publicKey = S.normalizeText(input && input.publicKey);
  const kdfAlgorithm = S.normalizeText(input && input.kdfAlgorithm);
  const expectedCurrentVersion = Number(input && input.expectedCurrentVersion);

  if (ALGORITHMS.indexOf(algorithm) === -1) throw E.ValidationError('Algoritmo de chave inválido.');
  if (KDF_ALGORITHMS.indexOf(kdfAlgorithm) === -1) throw E.ValidationError('Algoritmo de derivação de chave inválido.');
  if (!Number.isInteger(expectedCurrentVersion) || expectedCurrentVersion < 0) {
    throw E.ValidationError('Versão de chave esperada inválida.');
  }
  if (!S.isLengthValid(publicKey, C.LIMITS.MESSAGING_PUBLIC_KEY_MIN_LEN, C.LIMITS.MESSAGING_PUBLIC_KEY_MAX_LEN)) {
    throw E.ValidationError('Chave pública inválida.');
  }

  const publicKeyBytes = decodedByteLength(publicKey);
  if (publicKeyBytes === -1) throw E.ValidationError('Chave pública inválida (base64url malformado).');
  if (algorithm === 'X25519' && publicKeyBytes !== 32) {
    throw E.ValidationError('Chave pública X25519 deve ter 32 bytes.');
  }

  // 'NONE' (chave sem frase-secreta, ver sql/010_messaging_simplify.sql):
  // kdfIterations/kdfSalt não existem — devolvidos como null, exatamente o
  // formato que a CHECK messaging_keys_kdf_consistency exige no banco.
  if (kdfAlgorithm === 'NONE') {
    return { algorithm, publicKey, kdfAlgorithm, kdfIterations: null, kdfSalt: null, expectedCurrentVersion };
  }

  const kdfIterations = Number(input && input.kdfIterations);
  const kdfSalt = S.normalizeText(input && input.kdfSalt);
  if (!Number.isInteger(kdfIterations) || kdfIterations < C.LIMITS.KDF_MIN_ITERATIONS) {
    throw E.ValidationError('Número de iterações do KDF abaixo do mínimo permitido.');
  }
  if (!S.isLengthValid(kdfSalt, C.LIMITS.MESSAGING_SALT_MIN_LEN, C.LIMITS.MESSAGING_SALT_MAX_LEN)) {
    throw E.ValidationError('Salt do KDF inválido.');
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
