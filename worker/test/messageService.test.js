import { jest } from '@jest/globals';
import * as MessageService from '../src/services/messageService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const env = makeEnv();
// env é compartilhado entre testes deste arquivo (evita recriar o mock em
// cada teste) — limpa o histórico de chamadas entre eles pra as asserções
// de invalidação de cache (toHaveBeenCalledWith/not.toHaveBeenCalledWith)
// não vazarem de um teste pro outro.
afterEach(() => { jest.clearAllMocks(); });
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
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([{ cleared_before_id: 0 }]) // getMyClearedBeforeId
      .mockResolvedValueOnce([
        { id: 5, sender_id: 'm1', client_message_id: VALID_UUID, crypto_version: 1, sender_key_version: 1, recipient_key_version: 1, iv: VALID_IV, ciphertext: VALID_CIPHERTEXT, deleted_at: null, created_at: '2026-01-01T00:00:00Z' },
      ]);
    const res = await MessageService.listMessages(sql, MEMBER, 'conv-1', {});
    expect(res.messages).toHaveLength(1);
    expect(res.messages[0].ciphertext).toBe(VALID_CIPHERTEXT);
  });

  test('mensagem apagada (deleted_at) vem como tombstone, sem ciphertext/iv', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }])
      .mockResolvedValueOnce([{ cleared_before_id: 0 }])
      .mockResolvedValueOnce([
        { id: 6, sender_id: 'peer-1', client_message_id: VALID_UUID, crypto_version: 1, sender_key_version: 1, recipient_key_version: 1, iv: null, ciphertext: null, deleted_at: '2026-01-02T00:00:00Z', created_at: '2026-01-01T00:00:00Z' },
      ]);
    const res = await MessageService.listMessages(sql, MEMBER, 'conv-1', {});
    expect(res.messages[0]).toEqual({ id: 6, senderId: 'peer-1', clientMessageId: VALID_UUID, deleted: true, createdAt: '2026-01-01T00:00:00Z' });
    expect(res.messages[0]).not.toHaveProperty('ciphertext');
  });
});

describe('MessageService.sendMessage — validação de forma (nunca toca o banco)', () => {
  test('clientMessageId que não é UUID', async () => {
    const sql = makeSql();
    await expect(MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload({ clientMessageId: 'nao-uuid' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('iv com tamanho errado', async () => {
    const sql = makeSql();
    await expect(MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload({ iv: 'curto' }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });

  test('ciphertext acima do limite máximo', async () => {
    const sql = makeSql();
    await expect(
      MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload({ ciphertext: 'D'.repeat(20000) }), 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('versão de chave inválida (não inteiro positivo)', async () => {
    const sql = makeSql();
    await expect(MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload({ senderKeyVersion: 0 }), 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
  });
});

describe('MessageService.sendMessage — idempotência e silenciamento progressivo', () => {
  test('reenvio com o mesmo clientMessageId devolve a mensagem já gravada (deduped), sem novo INSERT', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 42, created_at: '2026-01-01T00:00:00Z' }]);
    const res = await MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload(), 'cid');
    expect(res).toEqual({ success: true, messageId: 42, createdAt: '2026-01-01T00:00:00Z', deduped: true });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('silenciado (is_muted=true) lança RateLimitError e NÃO insere a mensagem', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([]) // sem duplicata
      .mockResolvedValueOnce([{ is_muted: true, muted_until: '2026-01-01T00:30:00Z', mute_strikes: 1, retry_after_seconds: 1800 }]);
    await expect(MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload(), 'cid')).rejects.toMatchObject({ name: 'RateLimitError' });
    expect(sql).toHaveBeenCalledTimes(2); // nunca chega no INSERT
  });

  test('mensagem em ordem envia e atualiza a conversa', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([]) // sem duplicata
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockResolvedValueOnce([{ message_id: 7, created_at: '2026-01-01T00:00:05Z', participant_low: 'm1', participant_high: 'peer-1' }]);
    const res = await MessageService.sendMessage(sql, env, MEMBER, 'conv-1', validPayload(), 'cid');
    expect(res).toEqual({ success: true, messageId: 7, createdAt: '2026-01-01T00:00:05Z' });
  });

  test('erro do gatilho guard_message_insert é traduzido para ForbiddenError, não logado como inesperado', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockRejectedValueOnce(new Error('É preciso ter uma conexão aceita para trocar mensagens.'));
    await expect(MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload(), 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('erro desconhecido do banco é relançado e logado (não vira ForbiddenError silenciosamente)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockRejectedValueOnce(new Error('conexão com o banco perdida'))
      .mockResolvedValueOnce(undefined); // logError
    await expect(MessageService.sendMessage(sql, env, MEMBER,'conv-1', validPayload(), 'cid')).rejects.toThrow('conexão com o banco perdida');
  });
});

describe('MessageService.markConversationRead', () => {
  test('marcador inválido (negativo) lança ValidationError', async () => {
    const sql = makeSql();
    await expect(MessageService.markConversationRead(sql, env, MEMBER,'conv-1', -1)).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('conversa que não pertence à pessoa lança NotFoundError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(MessageService.markConversationRead(sql, env, MEMBER,'conv-1', 10)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('atualiza o marcador do lado correto do par', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'conv-1' }]);
    const res = await MessageService.markConversationRead(sql, env, MEMBER,'conv-1', 10);
    expect(res).toEqual({ success: true });
  });
});

describe('MessageService.clearConversation', () => {
  test('conversa inválida lança ValidationError sem tocar o banco', async () => {
    const sql = makeSql();
    await expect(MessageService.clearConversation(sql, env, MEMBER,'', 'cid')).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('quem não participa da conversa lança ForbiddenError, sem apagar nada', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ participant_low: 'outro-1', participant_high: 'outro-2' }]);
    await expect(MessageService.clearConversation(sql, env, MEMBER,'conv-1', 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
    expect(sql).toHaveBeenCalledTimes(1);
  });

  test('participante avança o marcador cleared_before/last_read só do próprio lado, sem apagar nada do banco', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce(undefined) // UPDATE conversations (só marcador por participante)
      .mockResolvedValueOnce(undefined); // logAudit
    const res = await MessageService.clearConversation(sql, env, MEMBER,'conv-1', 'cid');
    expect(res).toEqual({ success: true, message: 'Conversa limpa.' });
    expect(sql).toHaveBeenCalledTimes(3);
    const updateCall = sql.mock.calls[1][0].join('');
    expect(updateCall).not.toMatch(/DELETE/i);
    expect(updateCall).toMatch(/cleared_before_id/);
  });
});

describe('MessageService.hideMessageForMe', () => {
  test('mensagem inválida (não numérica) lança ValidationError sem tocar o banco', async () => {
    const sql = makeSql();
    await expect(MessageService.hideMessageForMe(sql, MEMBER, 'conv-1', 'abc', 'cid')).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('quem não participa da conversa lança ForbiddenError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ participant_low: 'outro-1', participant_high: 'outro-2' }]);
    await expect(MessageService.hideMessageForMe(sql, MEMBER, 'conv-1', 5, 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('esconde a mensagem de qualquer remetente (não precisa ser a própria) e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([{ message_id: 5 }]) // INSERT message_hides
      .mockResolvedValueOnce(undefined); // logAudit
    const res = await MessageService.hideMessageForMe(sql, MEMBER, 'conv-1', 5, 'cid');
    expect(res).toEqual({ success: true });
  });

  test('mensagem inexistente na conversa lança NotFoundError', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([]) // INSERT não retornou linha (mensagem não existe nesta conversa)
      .mockResolvedValueOnce([]); // checagem de existência
    await expect(MessageService.hideMessageForMe(sql, MEMBER, 'conv-1', 999, 'cid')).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('já oculta antes (ON CONFLICT DO NOTHING) é idempotente, não é erro', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([]) // INSERT sem linha (conflito)
      .mockResolvedValueOnce([{ exists: 1 }]); // mensagem existe de fato
    const res = await MessageService.hideMessageForMe(sql, MEMBER, 'conv-1', 5, 'cid');
    expect(res).toEqual({ success: true });
  });
});

describe('MessageService.deleteMessage', () => {
  test('mensagem inválida lança ValidationError sem tocar o banco', async () => {
    const sql = makeSql();
    await expect(MessageService.deleteMessage(sql, MEMBER, 'conv-1', 0, 'cid')).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('quem não participa da conversa lança ForbiddenError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ participant_low: 'outro-1', participant_high: 'outro-2' }]);
    await expect(MessageService.deleteMessage(sql, MEMBER, 'conv-1', 5, 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('remetente apaga a própria mensagem (tombstone) e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([{ id: 5 }]) // UPDATE ... WHERE sender_id = eu
      .mockResolvedValueOnce(undefined); // logAudit
    const res = await MessageService.deleteMessage(sql, MEMBER, 'conv-1', 5, 'cid');
    expect(res).toEqual({ success: true });
  });

  test('tentar apagar mensagem do OUTRO participante lança ForbiddenError — nunca "para todos" de mensagem alheia', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([]) // UPDATE não afetou nada (sender_id != eu)
      .mockResolvedValueOnce([{ sender_id: 'peer-1', deleted_at: null }]); // é do outro, não apagada
    await expect(MessageService.deleteMessage(sql, MEMBER, 'conv-1', 5, 'cid')).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('mensagem já apagada antes é idempotente, não é erro', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([]) // UPDATE não afetou (deleted_at IS NULL já falso)
      .mockResolvedValueOnce([{ sender_id: 'm1', deleted_at: '2026-01-01T00:00:00Z' }]);
    const res = await MessageService.deleteMessage(sql, MEMBER, 'conv-1', 5, 'cid');
    expect(res).toEqual({ success: true });
  });

  test('mensagem inexistente na conversa lança NotFoundError', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }]) // assertParticipant
      .mockResolvedValueOnce([]) // UPDATE não afetou
      .mockResolvedValueOnce([]); // não existe
    await expect(MessageService.deleteMessage(sql, MEMBER, 'conv-1', 999, 'cid')).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('MessageService.syncMessaging', () => {
  test('devolve contadores de não lidas e pedidos pendentes', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ unread_messages: '3', pending_requests: '1' }]);
    const res = await MessageService.syncMessaging(sql, env, MEMBER);
    expect(res).toEqual({ success: true, unreadMessages: 3, pendingConnectionRequests: 1 });
  });

  test('cache hit (achado de escala de 2026-09-25): devolve do KV, nem consulta o banco', async () => {
    const sql = makeSql();
    const cachedEnv = makeEnv({ HOT_CACHE: { get: jest.fn().mockResolvedValue(JSON.stringify({ unreadMessages: 2, pendingConnectionRequests: 0 })), put: jest.fn(), delete: jest.fn() } });
    const res = await MessageService.syncMessaging(sql, cachedEnv, MEMBER);
    expect(res).toEqual({ success: true, unreadMessages: 2, pendingConnectionRequests: 0 });
    expect(sql).not.toHaveBeenCalled();
    expect(cachedEnv.HOT_CACHE.get).toHaveBeenCalledWith('cache:sync:m1');
  });
});

describe('MessageService — invalidação do cache de badge (achado de escala de 2026-09-25)', () => {
  test('sendMessage invalida o cache do DESTINATÁRIO (nunca o do próprio remetente)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([]) // sem duplicata
      .mockResolvedValueOnce([{ is_muted: false, muted_until: null, mute_strikes: 0, retry_after_seconds: 0 }])
      .mockResolvedValueOnce([{ message_id: 7, created_at: '2026-01-01T00:00:05Z', participant_low: 'm1', participant_high: 'peer-1' }]);
    await MessageService.sendMessage(sql, env, MEMBER, 'conv-1', validPayload(), 'cid');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:sync:peer-1');
    expect(env.HOT_CACHE.delete).not.toHaveBeenCalledWith('cache:sync:m1');
  });

  test('markConversationRead invalida o cache do PRÓPRIO usuário', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'conv-1' }]);
    await MessageService.markConversationRead(sql, env, MEMBER, 'conv-1', 10);
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:sync:m1');
  });

  test('clearConversation invalida o cache do PRÓPRIO usuário', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ participant_low: 'm1', participant_high: 'peer-1' }])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    await MessageService.clearConversation(sql, env, MEMBER, 'conv-1', 'cid');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:sync:m1');
  });
});
