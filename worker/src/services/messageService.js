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
  if (r.deleted_at) {
    return {
      id: Number(r.id), senderId: r.sender_id, clientMessageId: r.client_message_id,
      deleted: true, createdAt: r.created_at,
    };
  }
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
  // last_message_at é uma coluna COMPARTILHADA (atualizada pro par inteiro
  // a cada envio) — depois de "limpar conversa" (sql/011, por participante),
  // o que eu devo ver como "última mensagem" é a última mensagem AINDA
  // VISÍVEL pra mim (acima do meu cleared_before_id, e não oculta
  // individualmente via message_hides), não o timestamp bruto da coluna.
  const rows = await sql`
    SELECT
      c.id AS conversation_id,
      CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.low_cleared_before_id ELSE c.high_cleared_before_id END AS my_cleared_before_id,
      CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.participant_high ELSE c.participant_low END AS peer_id,
      p.full_name, p.username, p.avatar_url, p.status,
      (
        SELECT max(m.created_at) FROM messages m
        WHERE m.conversation_id = c.id
          AND m.id > (CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.low_cleared_before_id ELSE c.high_cleared_before_id END)
          AND NOT EXISTS (SELECT 1 FROM message_hides mh WHERE mh.message_id = m.id AND mh.profile_id = ${identity.profileId}::uuid)
      ) AS last_message_at,
      (
        SELECT count(*) FROM messages m
        WHERE m.conversation_id = c.id
          AND m.sender_id <> ${identity.profileId}::uuid
          AND m.id > (CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.high_last_read_id ELSE c.low_last_read_id END)
      ) AS unread_count
    FROM conversations c
    JOIN profiles p ON p.id = (CASE WHEN c.participant_low = ${identity.profileId}::uuid THEN c.participant_high ELSE c.participant_low END)
    WHERE c.participant_low = ${identity.profileId}::uuid OR c.participant_high = ${identity.profileId}::uuid
    ORDER BY last_message_at DESC NULLS LAST
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

/** Coluna de "limpar conversa" (sql/011) do lado do chamador — participant_low usa low_cleared_before_id, participant_high usa o outro. */
async function getMyClearedBeforeId(sql, identity, convId) {
  const rows = await sql`
    SELECT CASE WHEN participant_low = ${identity.profileId}::uuid THEN low_cleared_before_id ELSE high_cleared_before_id END AS cleared_before_id
    FROM conversations WHERE id = ${convId}::uuid
  `;
  return rows.length ? Number(rows[0].cleared_before_id) : 0;
}

export async function listMessages(sql, identity, conversationId, input) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  await assertParticipant(sql, identity, convId);
  const clearedBeforeId = await getMyClearedBeforeId(sql, identity, convId);

  const beforeId = input && input.beforeId != null ? Number(input.beforeId) : null;
  const afterId = input && input.afterId != null ? Number(input.afterId) : null;

  // "Apagar somente para mim" (message_hides) e "Limpar conversa" (o piso
  // clearedBeforeId) só afetam a MINHA leitura — nunca tocam a linha em si,
  // por isso são aplicados aqui, na leitura, e não em nenhum DELETE.
  let rows;
  if (Number.isInteger(afterId)) {
    rows = await sql`
      SELECT m.id, m.sender_id, m.client_message_id, m.crypto_version, m.sender_key_version, m.recipient_key_version, m.iv, m.ciphertext, m.deleted_at, m.created_at
      FROM messages m
      WHERE m.conversation_id = ${convId}::uuid AND m.id > ${Math.max(afterId, clearedBeforeId)}
        AND NOT EXISTS (SELECT 1 FROM message_hides mh WHERE mh.message_id = m.id AND mh.profile_id = ${identity.profileId}::uuid)
      ORDER BY m.id ASC LIMIT ${C.LIMITS.MESSAGE_PAGE_SIZE}
    `;
  } else if (Number.isInteger(beforeId)) {
    rows = await sql`
      SELECT m.id, m.sender_id, m.client_message_id, m.crypto_version, m.sender_key_version, m.recipient_key_version, m.iv, m.ciphertext, m.deleted_at, m.created_at
      FROM messages m
      WHERE m.conversation_id = ${convId}::uuid AND m.id < ${beforeId} AND m.id > ${clearedBeforeId}
        AND NOT EXISTS (SELECT 1 FROM message_hides mh WHERE mh.message_id = m.id AND mh.profile_id = ${identity.profileId}::uuid)
      ORDER BY m.id DESC LIMIT ${C.LIMITS.MESSAGE_PAGE_SIZE}
    `;
  } else {
    rows = await sql`
      SELECT m.id, m.sender_id, m.client_message_id, m.crypto_version, m.sender_key_version, m.recipient_key_version, m.iv, m.ciphertext, m.deleted_at, m.created_at
      FROM messages m
      WHERE m.conversation_id = ${convId}::uuid AND m.id > ${clearedBeforeId}
        AND NOT EXISTS (SELECT 1 FROM message_hides mh WHERE mh.message_id = m.id AND mh.profile_id = ${identity.profileId}::uuid)
      ORDER BY m.id DESC LIMIT ${C.LIMITS.MESSAGE_PAGE_SIZE}
    `;
  }

  return { success: true, messages: rows.map(mapMessageRow) };
}

/**
 * "Apagar somente para mim" (message_hides, sql/011): esconde UMA mensagem
 * específica — minha ou do outro participante — só da MINHA visão. O outro
 * lado nunca sabe que eu ocultei nada (não há aviso, não há registro
 * visível pra ele). Não exige ser o remetente — é sobre a MINHA leitura,
 * não sobre o conteúdo em si.
 */
export async function hideMessageForMe(sql, identity, conversationId, messageId, correlationId) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  const msgId = Number(messageId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  if (!Number.isInteger(msgId) || msgId <= 0) throw E.ValidationError('Mensagem inválida.');
  await assertParticipant(sql, identity, convId);

  const rows = await sql`
    INSERT INTO message_hides (message_id, profile_id)
    SELECT m.id, ${identity.profileId}::uuid FROM messages m
    WHERE m.id = ${msgId} AND m.conversation_id = ${convId}::uuid
    ON CONFLICT (message_id, profile_id) DO NOTHING
    RETURNING message_id
  `;
  if (!rows.length) {
    // Ou a mensagem não existe/não é desta conversa, ou já estava oculta
    // pra mim (idempotente — nenhum dos dois é erro do ponto de vista do
    // usuário, que só queria "não ver mais essa mensagem").
    const exists = await sql`SELECT 1 FROM messages WHERE id = ${msgId} AND conversation_id = ${convId}::uuid`;
    if (!exists.length) throw E.NotFoundError('Mensagem não encontrada nesta conversa.');
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'HIDE_MESSAGE_FOR_ME', 'message', String(msgId), 'success', null);
  return { success: true };
}

/**
 * "Apagar para todos" — só o remetente pode apagar a PRÓPRIA mensagem;
 * remove o conteúdo (ciphertext/iv) para os DOIS lados, mantendo um
 * tombstone (deleted_at) no lugar. Nunca é possível apagar mensagem do
 * outro participante "para todos" — a cláusula `sender_id = identity`
 * abaixo é a autoridade real disso, não uma checagem só de UI.
 */
export async function deleteMessage(sql, identity, conversationId, messageId, correlationId) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  const msgId = Number(messageId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  if (!Number.isInteger(msgId) || msgId <= 0) throw E.ValidationError('Mensagem inválida.');
  await assertParticipant(sql, identity, convId);

  const rows = await sql`
    UPDATE messages SET ciphertext = NULL, iv = NULL, deleted_at = now()
    WHERE id = ${msgId} AND conversation_id = ${convId}::uuid AND sender_id = ${identity.profileId}::uuid AND deleted_at IS NULL
    RETURNING id
  `;
  if (!rows.length) {
    const exists = await sql`SELECT sender_id, deleted_at FROM messages WHERE id = ${msgId} AND conversation_id = ${convId}::uuid`;
    if (!exists.length) throw E.NotFoundError('Mensagem não encontrada nesta conversa.');
    if (exists[0].deleted_at) return { success: true }; // já apagada — idempotente
    throw E.ForbiddenError('Só é possível apagar para todos uma mensagem que você mesmo enviou.');
  }

  await Logging.logAudit(sql, correlationId, identity.profileId, 'DELETE_MESSAGE', 'message', String(msgId), 'success', null);
  return { success: true };
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

/**
 * "Limpar conversa" — corrigido em sql/011 depois de feedback direto do
 * dono da plataforma: a versão original apagava as mensagens de verdade
 * (afetando os dois lados). Agora é só um marcador POR PARTICIPANTE
 * (low/high_cleared_before_id, mesmo padrão de last_read_id) — esconde o
 * histórico anterior da MINHA visão; nada é apagado do banco, o outro
 * participante continua vendo tudo normalmente. Também adianta o meu
 * last_read_id até o mesmo ponto, pra não sobrar "não lida fantasma" de
 * mensagem que acabei de esconder da própria visão.
 */
export async function clearConversation(sql, identity, conversationId, correlationId) {
  assertMemberOrAdmin(identity);
  const convId = S.normalizeText(conversationId);
  if (!convId) throw E.ValidationError('Conversa inválida.');
  await assertParticipant(sql, identity, convId);

  await sql`
    UPDATE conversations SET
      low_cleared_before_id = CASE WHEN participant_low = ${identity.profileId}::uuid
        THEN GREATEST(low_cleared_before_id, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${convId}::uuid))
        ELSE low_cleared_before_id END,
      high_cleared_before_id = CASE WHEN participant_high = ${identity.profileId}::uuid
        THEN GREATEST(high_cleared_before_id, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${convId}::uuid))
        ELSE high_cleared_before_id END,
      low_last_read_id = CASE WHEN participant_low = ${identity.profileId}::uuid
        THEN GREATEST(low_last_read_id, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${convId}::uuid))
        ELSE low_last_read_id END,
      high_last_read_id = CASE WHEN participant_high = ${identity.profileId}::uuid
        THEN GREATEST(high_last_read_id, (SELECT COALESCE(max(id), 0) FROM messages WHERE conversation_id = ${convId}::uuid))
        ELSE high_last_read_id END
    WHERE id = ${convId}::uuid
  `;

  await Logging.logAudit(sql, correlationId, identity.profileId, 'CLEAR_CONVERSATION', 'conversation', convId, 'success', null);
  return { success: true, message: 'Conversa limpa.' };
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
