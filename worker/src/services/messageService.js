/**
 * messageService.js
 * Mensagens diretas 1:1 cifradas ponta a ponta (Fase 3e de
 * docs/PLANO_FASE3_MENSAGERIA.md). O servidor NUNCA vê texto claro — só
 * manipula `iv`/`ciphertext` opacos e valida a FORMA (base64url, tamanhos,
 * versões de chave, participação). A autoridade real das regras de
 * negócio é o gatilho `guard_message_insert` (sql/009_messaging.sql); as
 * checagens em `openConversation` só adiantam uma mensagem amigável antes
 * de bater no banco.
 *
 * DP-7 do plano: envio de mensagem NÃO chama Logging.logAudit (volume +
 * metadado social duplicado numa tabela cujo actor_id sobrevive à
 * exclusão). Continuam auditados: publicação/rotação de chave (ver
 * messagingKeyService.js) e a abertura de conversa.
 *
 * "Requisito novo 2" (silenciamento progressivo): antes de cada INSERT,
 * `sendMessage` chama a função de banco `apply_message_penalty`, que é a
 * autoridade real do estado de silenciamento — persistido no servidor
 * (tabela message_penalties), nunca no cliente, e sem nenhum caminho de
 * API que permita ao próprio penalizado zerar o próprio estado.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { getRelationship } from './connectionService.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IV_RE = /^[A-Za-z0-9_-]{16}$/; // 12 bytes -> 16 chars base64url sem padding
const CIPHERTEXT_RE = /^[A-Za-z0-9_-]+$/;

function assertMemberOrAdmin(identity) {
  S.requireRole(identity, [C.ROLES.MEMBER, C.ROLES.ADMIN]);
}

function formatRetryAfter(seconds) {
  const s = Math.max(1, Number(seconds) || 0);
  if (s < 60) return s + (s === 1 ? ' segundo' : ' segundos');
  const minutes = Math.ceil(s / 60);
  return minutes + (minutes === 1 ? ' minuto' : ' minutos');
}

function mapMessageRow(r) {
  return {
    id: Number(r.id),
    senderId: r.sender_id,
    clientMessageId: r.client_message_id,
    cryptoVersion: r.crypto_version,
    senderKeyVersion: r.sender_key_version,
    recipientKeyVersion: r.recipient_key_version,
    iv: r.iv,
    ciphertext: r.ciphertext,
    createdAt: r.created_at,
  };
}

/** Traduz as mensagens conhecidas do guard_message_insert; qualquer outra é um erro inesperado. */
function isGuardMessageError(msg) {
  return (
    msg.indexOf('não participa') !== -1 ||
    msg.indexOf('não está apta') !== -1 ||
    msg.indexOf('não está disponível') !== -1 ||
    msg.indexOf('conexão aceita') !== -1 ||
    msg.indexOf('Não é possível enviar') !== -1 ||
    msg.indexOf('desatualizada') !== -1 ||
    msg.indexOf('mudou') !== -1 ||
    msg.indexOf('Conversa não encontrada') !== -1
  );
}

export async function openConversation(sql, identity, peerProfileId, correlationId) {
  assertMemberOrAdmin(identity);
  const peerId = S.normalizeText(peerProfileId);
  if (!peerId || peerId === identity.profileId) throw E.ValidationError('Contato inválido.');

  const relationship = await getRelationship(sql, identity.profileId, peerId);
  if (!relationship.isConnection || relationship.isBlockedEitherWay) {
    throw E.ForbiddenError('É preciso ter uma conexão aceita para iniciar uma conversa.');
  }

  const rows = await sql`
    INSERT INTO conversations (participant_low, participant_high)
    VALUES (LEAST(${identity.profileId}::uuid, ${peerId}::uuid), GREATEST(${identity.profileId}::uuid, ${peerId}::uuid))
    ON CONFLICT (participant_low, participant_high) DO UPDATE SET participant_low = conversations.participant_low
    RETURNING id
  `;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'OPEN_CONVERSATION', 'conversation', rows[0].id, 'success', null);
  return { success: true, conversationId: rows[0].id };
}

export async function listConversations(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT
      c.id AS conversation_id, c.last_message_at,
      CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.participant_high ELSE c.participant_low END AS peer_id,
      p.full_name, p.username, p.avatar_url, p.status,
      (
        SELECT count(*) FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id <> ${identity.profileId}::uuid
          AND m.id > (CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.high_last_read_id ELSE c.low_last_read_id END)
      ) AS unread_count
    FROM conversations c
    JOIN profiles p ON p.id = (CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.participant_high ELSE c.participant_low END)
    WHERE c.participant_low = ${identity.profileId}::uuid OR c.participant_high = ${identity.profileId}::uuid
    ORDER BY c.last_message_at DESC NULLS LAST
  `;

  return {
    success: true,
    conversations: rows.map((r) => ({
      conversationId: r.conversation_id,
      lastMessageAt: r.last_message_at,
      peer: { id: r.peer_id, fullName: r.full_name, username: r.username, avatarUrl: r.avatar_url, status: r.status },
      unreadCount: Number(r.unread_count),
    })),
  };
}

async function assertParticipant(sql, identity, conversationId) {
  const rows = await sql`SELECT participant_low, participant_high FROM conversations WHERE id = ${conversationId}::uuid`;
  if (!rows.length) throw E.NotFoundError('Conversa não encontrada.');
  const conv = rows[0];
  if (conv.participant_low !== identity.profileId && conv.participant_high !== identity.profileId) {
    throw E.ForbiddenError('Você não participa desta conversa.');
  }
  return conv;
}

export async function listMessages(sql, identity, conversationId, input) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  await assertParticipant(sql, identity, convId);

  const beforeId = input && input.beforeId != null ? Number(input.beforeId) : null;
  const afterId = input && input.afterId != null ? Number(input.afterId) : null;

  let rows;
  if (Number.isInteger(afterId)) {
    rows = await sql`
      SELECT id, sender_id, client_message_id, crypto_version, sender_key_version, recipient_key_version, iv, ciphertext, created_at
      FROM messages WHERE conversation_id = ${convId}::uuid AND id > ${afterId}
      ORDER BY id ASC LIMIT ${C.LIMITS.MESSAGE_PAGE_SIZE}
    `;
  } else if (Number.isInteger(beforeId)) {
    rows = await sql`
      SELECT id, sender_id, client_message_id, crypto_version, sender_key_version, recipient_key_version, iv, ciphertext, created_at
      FROM messages WHERE conversation_id = ${convId}::uuid AND id < ${beforeId}
      ORDER BY id DESC LIMIT ${C.LIMITS.MESSAGE_PAGE_SIZE}
    `;
  } else {
    rows = await sql`
      SELECT id, sender_id, client_message_id, crypto_version, sender_key_version, recipient_key_version, iv, ciphertext, created_at
      FROM messages WHERE conversation_id = ${convId}::uuid
      ORDER BY id DESC LIMIT ${C.LIMITS.MESSAGE_PAGE_SIZE}
    `;
  }

  return { success: true, messages: rows.map(mapMessageRow) };
}

function validateSendPayload(payload) {
  const clientMessageId = S.normalizeText(payload && payload.clientMessageId);
  const senderKeyVersion = Number(payload && payload.senderKeyVersion);
  const recipientKeyVersion = Number(payload && payload.recipientKeyVersion);
  const iv = S.normalizeText(payload && payload.iv);
  const ciphertext = S.normalizeText(payload && payload.ciphertext);

  if (!UUID_RE.test(clientMessageId)) throw E.ValidationError('Identificador de mensagem inválido.');
  if (!Number.isInteger(senderKeyVersion) || senderKeyVersion < 1) throw E.ValidationError('Versão de chave do remetente inválida.');
  if (!Number.isInteger(recipientKeyVersion) || recipientKeyVersion < 1) throw E.ValidationError('Versão de chave do destinatário inválida.');
  if (!IV_RE.test(iv)) throw E.ValidationError('IV da mensagem inválido.');
  if (!CIPHERTEXT_RE.test(ciphertext) || !S.isLengthValid(ciphertext, 24, C.LIMITS.MESSAGE_CIPHERTEXT_MAX)) {
    throw E.ValidationError('Conteúdo da mensagem inválido.');
  }

  return { clientMessageId, senderKeyVersion, recipientKeyVersion, iv, ciphertext };
}

export async function sendMessage(sql, identity, conversationId, payload, correlationId) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  const v = validateSendPayload(payload);

  // Reenvio idempotente (falha de rede no cliente): mesmo clientMessageId
  // já gravado devolve a linha existente em vez de erro.
  const existing = await sql`
    SELECT id, created_at FROM messages WHERE sender_id = ${identity.profileId}::uuid AND client_message_id = ${v.clientMessageId}::uuid
  `;
  if (existing.length) {
    return { success: true, messageId: Number(existing[0].id), createdAt: existing[0].created_at, deduped: true };
  }

  const [penalty] = await sql`
    SELECT * FROM apply_message_penalty(
      ${identity.profileId}::uuid, ${C.LIMITS.MESSAGE_BURST_MAX}, ${C.LIMITS.MESSAGE_BURST_WINDOW_SECONDS},
      ${C.LIMITS.MESSAGE_MUTE_BASE_MINUTES}, ${C.LIMITS.MESSAGE_MUTE_MULTIPLIER}
    )
  `;
  if (penalty.is_muted) {
    throw E.RateLimitError('Você enviou mensagens rápido demais e está temporariamente silenciado. Tente novamente em ' + formatRetryAfter(penalty.retry_after_seconds) + '.');
  }

  let rows;
  try {
    rows = await sql`
      WITH ins AS (
        INSERT INTO messages (conversation_id, sender_id, client_message_id, sender_key_version, recipient_key_version, iv, ciphertext)
        VALUES (${convId}::uuid, ${identity.profileId}::uuid, ${v.clientMessageId}::uuid, ${v.senderKeyVersion}, ${v.recipientKeyVersion}, ${v.iv}, ${v.ciphertext})
        RETURNING id, conversation_id, created_at
      )
      UPDATE conversations SET
        last_message_at = (SELECT created_at FROM ins),
        low_last_read_id = CASE WHEN participant_low = ${identity.profileId}::uuid THEN (SELECT id FROM ins) ELSE low_last_read_id END,
        high_last_read_id = CASE WHEN participant_high = ${identity.profileId}::uuid THEN (SELECT id FROM ins) ELSE high_last_read_id END
      WHERE id = (SELECT conversation_id FROM ins)
      RETURNING (SELECT id FROM ins) AS message_id, (SELECT created_at FROM ins) AS created_at
    `;
  } catch (err) {
    const msg = String((err && err.message) || '');
    if (isGuardMessageError(msg)) throw E.ForbiddenError(msg);
    await Logging.logError(sql, correlationId, 'MESSAGE_SEND_FAILED', 'Falha ao enviar mensagem.', { senderId: identity.profileId });
    throw err;
  }

  return { success: true, messageId: Number(rows[0].message_id), createdAt: rows[0].created_at };
}

export async function markConversationRead(sql, identity, conversationId, lastReadMessageId) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  const lastReadId = Number(lastReadMessageId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  if (!Number.isInteger(lastReadId) || lastReadId < 0) throw E.ValidationError('Marcador de leitura inválido.');

  const rows = await sql`
    UPDATE conversations SET
      low_last_read_id = CASE WHEN participant_low = ${identity.profileId}::uuid THEN GREATEST(low_last_read_id, ${lastReadId}) ELSE low_last_read_id END,
      high_last_read_id = CASE WHEN participant_high = ${identity.profileId}::uuid THEN GREATEST(high_last_read_id, ${lastReadId}) ELSE high_last_read_id END
    WHERE id = ${convId}::uuid AND (participant_low = ${identity.profileId}::uuid OR participant_high = ${identity.profileId}::uuid)
    RETURNING id
  `;
  if (!rows.length) throw E.NotFoundError('Conversa não encontrada.');
  return { success: true };
}

export async function syncMessaging(sql, identity) {
  assertMemberOrAdmin(identity);
  const rows = await sql`
    SELECT
      COALESCE((
        SELECT count(*) FROM messages m
        JOIN conversations c ON c.id = m.conversation_id
        WHERE (c.participant_low = ${identity.profileId}::uuid OR c.participant_high = ${identity.profileId}::uuid)
          AND m.sender_id <> ${identity.profileId}::uuid
          AND m.id > (CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.high_last_read_id ELSE c.low_last_read_id END)
      ), 0) AS unread_messages,
      COALESCE((SELECT count(*) FROM connections WHERE addressee_id = ${identity.profileId}::uuid AND status = 'pending'::connection_status), 0) AS pending_requests
  `;
  return {
    success: true,
    unreadMessages: Number(rows[0].unread_messages),
    pendingConnectionRequests: Number(rows[0].pending_requests),
  };
}
