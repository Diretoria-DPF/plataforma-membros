import * as MessageService from '../src/services/messageService.js';
import { makeSql } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const VALID_UUID = '11111111-1111-4111-8111-111111111111';
const VALID_IV = 'C'.repeat(16); // 12 bytes em base64url
const VALID_CIPHERTEXT = 'D'.repeat(32);

function validPayload(overrides) {
  return Object.assign(
    { clientMessageId: VALID_UUID, senderKeyVersion: 1, recipientKeyVersion: 1, iv: VALID_IV, ciphertext: VALID_CIPHERTEXT },
    overrides || {}
  );
}

describe('MessageService.openConversation', () => {
  test('sem conexão aceita lança ForbiddenError, sem gravar nada', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ is_connection: false, is_blocked: false }]);
    await expect(MessageService.openConversation(sql, MEMBER, 'peer-1', 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('bloqueado lança ForbiddenError mesmo com conexão aceita', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ is_connection: true, is_blocked: true }]);
    await expect(MessageService.openConversation(sql, MEMBER, 'peer-1', 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('consigo mesmo lança ValidationError antes de consultar relacionamento', async () => {
    const sql = makeSql();
    await expect(MessageService.openConversation(sql, MEMBER, MEMBER.profileId, 'cid')).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('abre (ou reabre, idempotente) a conversa e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ is_connection: true, is_blocked: false }])
      .mockResolvedValueOnce([{ id: 'conv-1' }])
      .mockResolvedValueOnce(undefined);
    const res = await MessageService.openConversation(sql, MEMBER, 'peer-1', 'cid');
    expect(res).toEqual({ success: true, conversationId: 'conv-1' });
  });
});

describe('MessageService.listMessages', () => {
  test('conversa inexistente lança NotFoundError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(MessageService.listMessages(sql, MEMBER, 'conv-1', {})).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('quem não participa da conversa lança ForbiddenError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ participant_low: 'outro-1', participant_high: 'outro-2' }]);
    await expect(MessageService.listMessages(sql, MEMBER, 'conv-1', {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('participante recebe a lista de mensagens (sem texto claro, só ciphertext opaco)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }])
      .mockResolvedValueOnce([
        { id: 5, sender_id: 'm1', client_message_id: VALID_UUID, crypto_version: 1, sender_key_version: 1, recipient_key_version: 1, iv: VALID_IV, ciphertext: VALID_CIPHERTEXT, created_at: '2026-01-01T00:00:00Z' },
      ]);
    const res = await MessageService.listMessages(sql, MEMBER, 'conv-1', {});
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].ciphertext).toBe(VALID_CIPHERTEXT);
  });
});

describe('MessageService.sendMessage — validação de forma (nunca toca o banco)', () => {
  test('clientMessageId que não é UUID', async () => {
    const sql = makeSql();
    await expect(MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload({ clientMessageId: 'nao-uuid' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('iv com tamanho errado', async () => {
    const sql = makeSql();
    await expect(MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload({ iv: 'curto' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('ciphertext acima do limite máximo', async () => {
    const sql = makeSql();
    await expect(
      MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload({ ciphertext: 'D'.repeat(20000) }), 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('versão de chave inválida (não inteiro positivo)', async () => {
    const sql = makeSql();
    await expect(MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload({ senderKeyVersion: 0 }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });
});

describe('MessageService.sendMessage — idempotência e silenciamento progressivo', () => {
  test('reenvio com o mesmo clientMessageId devolve a mensagem já gravada (deduped), sem novo INSERT', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 42, created_at: '2026-01-01T00:00:00Z' }]);
    const res = await MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload(), 'cid');
    expect(res).toEqual({ success: true, messageId: 42, createdAt: '2026-01-01T00:00:00Z', deduped: true });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('silenciado (is_muted=true) lança RateLimitError e NÃO insere a mensagem', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([]) // sem duplicata
      .mockResolvedValueOnce([{ is_muted: true, muted_until: '2026-01-01T00:30:00Z', mute_strikes: 1, retry_after_seconds: 1800 }]);
    await expect(MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload(), 'cid')).rejects.toMatchObject({ name: 'RateLimitError' });
    expect(sql).toHaveBeenCalledTimes(2); // nunca chega no INSERT
  });

  test('mensagem em ordem envia e atualiza a conversa', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([]) // sem duplicata
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockResolvedValueOnce([{ message_id: 7, created_at: '2026-01-01T00:00:05Z' }]);
    const res = await MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload(), 'cid');
    expect(res).toEqual({ success: true, messageId: 7, createdAt: '2026-01-01T00:00:05Z' });
  });

  test('erro do gatilho guard_message_insert é traduzido para ForbiddenError, não logado como inesperado', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockRejectedValueOnce(new Error('É preciso ter uma conexão aceita para trocar mensagens.'));
    await expect(MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload(), 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('erro desconhecido do banco é relançado e logado (não vira ForbiddenError silenciosamente)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockRejectedValueOnce(new Error('conexão com o banco perdida'))
      .mockResolvedValueOnce(undefined); // logError
    await expect(MessageService.sendMessage(sql, MEMBER, 'conv-1', validPayload(), 'cid')).rejects.toThrow('conexão com o banco perdida');
  });
});

describe('MessageService.markConversationRead', () => {
  test('marcador inválido (negativo) lança ValidationError', async () => {
    const sql = makeSql();
    await expect(MessageService.markConversationRead(sql, MEMBER, 'conv-1', -1)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('conversa que não pertence à pessoa lança NotFoundError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(MessageService.markConversationRead(sql, MEMBER, 'conv-1', 10)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('atualiza o marcador do lado correto do par', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'conv-1' }]);
    const res = await MessageService.markConversationRead(sql, MEMBER, 'conv-1', 10);
    expect(res).toEqual({ success: true });
  });
});

describe('MessageService.syncMessaging', () => {
  test('devolve contadores de não lidas e pedidos pendentes', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ unread_messages: '3', pending_requests: '1' }]);
    const res = await MessageService.syncMessaging(sql, MEMBER);
    expect(res).toEqual({ success: true, unreadMessages: 3, pendingConnectionRequests: 1 });
  });
});
