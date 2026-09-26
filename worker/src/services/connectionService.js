/**
 * connectionService.js
 * Sistema de conexões entre membros ("ligar-se" a outro membro): pedido
 * por username ou telefone exatos, aceitar/recusar/bloquear. Fase 3a de
 * docs/PLANO_FASE3_MENSAGERIA.md, já com o achado HIGH da revisão de
 * segurança incorporado (cooldown de recusa via connections.declined_until
 * — ver seção 2.1/10 do plano e o gatilho guard_connection_write em
 * sql/007_connections_moderation.sql, que é a autoridade real; as
 * checagens aqui só adiantam mensagens amigáveis).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { invalidateCached, messageSyncCacheKey } from '../cache.js';

function assertMemberOrAdmin(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

const GENERIC_REQUEST_RESULT = { success: true, message: 'Se existir uma conta com esses dados, o pedido foi enviado.' };

export async function sendConnectionRequest(sql, env, identity, input, correlationId) {
  assertMemberOrAdmin(identity);
  await S.enforceRateLimit(sql, 'CONNECTION_REQUEST', identity.profileId, C.RATE_LIMITS.CONNECTION_REQUEST.MAX_ATTEMPTS, C.RATE_LIMITS.CONNECTION_REQUEST.WINDOW_SECONDS);

  const username = S.normalizeText(input && input.username).toLowerCase();
  const phoneRaw = S.normalizeText(input && input.phone);

  if (!username && !phoneRaw) throw E.ValidationError('Informe um nome de usuário ou telefone.');
  if (username && phoneRaw) throw E.ValidationError('Informe apenas nome de usuário ou telefone, não os dois.');

  let targetRows;
  let requestedVia;
  if (username) {
    requestedVia = 'username';
    targetRows = await sql`
      SELECT id FROM profiles
      WHERE username = ${username} AND status = 'active'::account_status
        AND email_confirmed_at IS NOT NULL AND role IN ('member'::user_role, 'admin'::user_role)
    `;
  } else {
    requestedVia = 'phone';
    targetRows = await sql`
      SELECT id FROM profiles
      WHERE phone_normalized = normalize_phone_br(${phoneRaw}) AND phone_discoverable = true
        AND status = 'active'::account_status AND email_confirmed_at IS NOT NULL
        AND role IN ('member'::user_role, 'admin'::user_role)
    `;
  }

  // Exatamente 1 resultado — 0 ou mais de 1 (telefone duplicado, achado
  // #7 da revisão) é tratado como "não encontrado", nunca um erro
  // distinto, pra não revelar nada sobre quantas contas casaram.
  if (targetRows.length !== 1) return GENERIC_REQUEST_RESULT;
  const targetId = targetRows[0].id;
  if (targetId === identity.profileId) return GENERIC_REQUEST_RESULT;

  const existing = await sql`
    SELECT id, status, declined_until FROM connections
    WHERE LEAST(requester_id, addressee_id) = LEAST(${identity.profileId}::uuid, ${targetId}::uuid)
      AND GREATEST(requester_id, addressee_id) = GREATEST(${identity.profileId}::uuid, ${targetId}::uuid)
  `;

  let requestCreatedOrReopened = false;
  try {
    if (!existing.length) {
      await sql`
        INSERT INTO connections (requester_id, addressee_id, status, requested_via)
        VALUES (${identity.profileId}::uuid, ${targetId}::uuid, 'pending'::connection_status, ${requestedVia})
      `;
      requestCreatedOrReopened = true;
    } else if (
      existing[0].status === 'declined' &&
      (!existing[0].declined_until || new Date(existing[0].declined_until).getTime() <= Date.now())
    ) {
      // Cooldown já venceu — reabre o MESMO vínculo como um novo pedido,
      // na direção de quem está pedindo agora (nunca um INSERT novo, que
      // colidiria com o índice único do par).
      await sql`
        UPDATE connections SET requester_id = ${identity.profileId}::uuid, addressee_id = ${targetId}::uuid,
          status = 'pending'::connection_status, requested_via = ${requestedVia},
          declined_until = NULL, responded_at = NULL
        WHERE id = ${existing[0].id}::uuid
      `;
      requestCreatedOrReopened = true;
    }
    // Qualquer outro caso (já aceita, já pendente, recusa ainda em
    // cooldown, ou bloqueio) é um no-op silencioso — mesma resposta.
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (
      msg.indexOf('exclusivas para membros') !== -1 ||
      msg.indexOf('não está apta') !== -1 ||
      msg.indexOf('interagir com esta conta') !== -1 ||
      msg.indexOf('reenvio') !== -1
    ) {
      return GENERIC_REQUEST_RESULT;
    }
    await Logging.logError(sql, correlationId, 'CONNECTION_REQUEST_FAILED', 'Falha ao registrar pedido de conexão.', { requesterId: identity.profileId });
    throw err;
  }

  if (requestCreatedOrReopened) await invalidateCached(env, messageSyncCacheKey(targetId));
  await Logging.logAudit(sql, correlationId, identity.profileId, 'SEND_CONNECTION_REQUEST', 'profile', targetId, 'success', null);
  return GENERIC_REQUEST_RESULT;
}

export async function listIncomingRequests(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT c.id AS id, c.created_at AS created_at, p.id AS requester_id, p.full_name AS full_name,
           p.username AS username, p.avatar_url AS avatar_url
    FROM connections c JOIN profiles p ON p.id = c.requester_id
    WHERE c.addressee_id = ${identity.profileId}::uuid AND c.status = 'pending'::connection_status
      AND p.status = 'active'::account_status
    ORDER BY c.created_at DESC
  `;
  return {
    success: true,
    requests: rows.map((r) => ({
      connectionId: r.id, createdAt: r.created_at, requesterId: r.requester_id,
      fullName: r.full_name, username: r.username, avatarUrl: r.avatar_url,
    })),
  };
}

export async function respondToRequest(sql, env, identity, connectionId, decision, correlationId) {
  assertMemberOrAdmin(identity);
  const id = S.normalizeText(connectionId);
  const action = S.normalizeText(decision);
  if (['accept', 'decline'].indexOf(action) === -1) throw E.ValidationError('Decisão inválida.');

  const rows = action === 'accept'
    ? await sql`
        UPDATE connections SET status = 'accepted'::connection_status, responded_at = now()
        WHERE id = ${id}::uuid AND addressee_id = ${identity.profileId}::uuid AND status = 'pending'::connection_status
        RETURNING id
      `
    : await sql`
        UPDATE connections SET status = 'declined'::connection_status, responded_at = now(),
          declined_until = now() + (${C.LIMITS.DECLINE_COOLDOWN_DAYS} || ' days')::interval
        WHERE id = ${id}::uuid AND addressee_id = ${identity.profileId}::uuid AND status = 'pending'::connection_status
        RETURNING id
      `;

  if (!rows.length) throw E.ConflictError('Não foi possível processar este pedido de conexão.');

  await invalidateCached(env, messageSyncCacheKey(identity.profileId));
  await Logging.logAudit(sql, correlationId, identity.profileId, action === 'accept' ? 'ACCEPT_CONNECTION' : 'DECLINE_CONNECTION', 'connection', id, 'success', null);
  return { success: true, message: action === 'accept' ? 'Conexão aceita.' : 'Pedido de conexão recusado.' };
}

export async function listMyConnections(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT c.id AS connection_id,
           CASE WHEN c.requester_id = ${identity.profileId}::uuid THEN p2.id ELSE p1.id END AS peer_id,
           CASE WHEN c.requester_id = ${identity.profileId}::uuid THEN p2.full_name ELSE p1.full_name END AS full_name,
           CASE WHEN c.requester_id = ${identity.profileId}::uuid THEN p2.username ELSE p1.username END AS username,
           CASE WHEN c.requester_id = ${identity.profileId}::uuid THEN p2.avatar_url ELSE p1.avatar_url END AS avatar_url
    FROM connections c
    JOIN profiles p1 ON p1.id = c.requester_id
    JOIN profiles p2 ON p2.id = c.addressee_id
    WHERE (c.requester_id = ${identity.profileId}::uuid OR c.addressee_id = ${identity.profileId}::uuid)
      AND c.status = 'accepted'::connection_status
    ORDER BY c.responded_at DESC
  `;
  return {
    success: true,
    connections: rows.map((r) => ({ connectionId: r.connection_id, peerId: r.peer_id, fullName: r.full_name, username: r.username, avatarUrl: r.avatar_url })),
  };
}

export async function removeConnection(sql, identity, connectionId, correlationId) {
  assertMemberOrAdmin(identity);
  const id = S.normalizeText(connectionId);
  // Restrito a conexões ACEITAS (achado HIGH da revisão de segurança) —
  // pedidos pending/declined não são removíveis, exatamente para o
  // cooldown de recusa não virar contornável via apagar-e-reenviar.
  const rows = await sql`
    DELETE FROM connections
    WHERE id = ${id}::uuid AND status = 'accepted'::connection_status
      AND (requester_id = ${identity.profileId}::uuid OR addressee_id = ${identity.profileId}::uuid)
    RETURNING id
  `;
  if (!rows.length) throw E.NotFoundError('Conexão não encontrada.');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'REMOVE_CONNECTION', 'connection', id, 'success', null);
  return { success: true, message: 'Conexão removida.' };
}

export async function blockProfile(sql, identity, targetProfileId, correlationId) {
  assertMemberOrAdmin(identity);
  const targetId = S.normalizeText(targetProfileId);
  if (targetId === identity.profileId) throw E.ValidationError('Não é possível bloquear a própria conta.');

  await sql`
    WITH ins AS (
      INSERT INTO profile_blocks (blocker_id, blocked_id) VALUES (${identity.profileId}::uuid, ${targetId}::uuid)
      ON CONFLICT DO NOTHING RETURNING blocker_id
    )
    DELETE FROM connections
    WHERE LEAST(requester_id, addressee_id) = LEAST(${identity.profileId}::uuid, ${targetId}::uuid)
      AND GREATEST(requester_id, addressee_id) = GREATEST(${identity.profileId}::uuid, ${targetId}::uuid)
  `;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'BLOCK_PROFILE', 'profile', targetId, 'success', null);
  return { success: true, message: 'Conta bloqueada.' };
}

export async function unblockProfile(sql, identity, targetProfileId, correlationId) {
  assertMemberOrAdmin(identity);
  const targetId = S.normalizeText(targetProfileId);
  const rows = await sql`
    DELETE FROM profile_blocks WHERE blocker_id = ${identity.profileId}::uuid AND blocked_id = ${targetId}::uuid RETURNING blocker_id
  `;
  if (!rows.length) throw E.NotFoundError('Bloqueio não encontrado.');
  await Logging.logAudit(sql, correlationId, identity.profileId, 'UNBLOCK_PROFILE', 'profile', targetId, 'success', null);
  return { success: true, message: 'Bloqueio removido.' };
}

export async function listMyBlocks(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT p.id AS id, p.full_name AS full_name, p.username AS username
    FROM profile_blocks b JOIN profiles p ON p.id = b.blocked_id
    WHERE b.blocker_id = ${identity.profileId}::uuid
    ORDER BY b.created_at DESC
  `;
  return { success: true, blocks: rows.map((r) => ({ id: r.id, fullName: r.full_name, username: r.username })) };
}

/**
 * Helper reutilizado por profileService (e futuramente messageService)
 * pra saber a relação entre quem está vendo e o perfil visto, sem
 * duplicar a lógica de bloqueio/conexão em cada service.
 */
export async function getRelationship(sql, viewerProfileId, targetProfileId) {
  if (viewerProfileId === targetProfileId) return { isSelf: true, isConnection: false, isBlockedEitherWay: false };

  const rows = await sql`
    SELECT
      EXISTS(
        SELECT 1 FROM connections
        WHERE status = 'accepted'::connection_status
          AND LEAST(requester_id, addressee_id) = LEAST(${viewerProfileId}::uuid, ${targetProfileId}::uuid)
          AND GREATEST(requester_id, addressee_id) = GREATEST(${viewerProfileId}::uuid, ${targetProfileId}::uuid)
      ) AS is_connection,
      EXISTS(
        SELECT 1 FROM profile_blocks
        WHERE (blocker_id = ${viewerProfileId}::uuid AND blocked_id = ${targetProfileId}::uuid)
           OR (blocker_id = ${targetProfileId}::uuid AND blocked_id = ${viewerProfileId}::uuid)
      ) AS is_blocked
  `;
  return { isSelf: false, isConnection: rows[0].is_connection === true, isBlockedEitherWay: rows[0].is_blocked === true };
}
