import { jest } from '@jest/globals';
import * as ConnectionService from '../src/services/connectionService.js';
import { makeSql, makeEnv } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const VISITOR = { profileId: 'v1', role: 'visitor' };
const env = makeEnv();
// idem messageService.test.js: env é compartilhado entre testes, limpa o
// histórico de chamadas entre eles pras asserções de invalidação de cache
// não vazarem de um teste pro outro.
afterEach(() => { jest.clearAllMocks(); });

describe('ConnectionService.sendConnectionRequest', () => {
  test('visitor não pode enviar pedido de conexão', async () => {
    const sql = makeSql();
    await expect(ConnectionService.sendConnectionRequest(sql, env, VISITOR,{ username: 'fulano' }, 'cid')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });

  test('rejeita quando nem username nem telefone são informados', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]); // rate limit
    await expect(ConnectionService.sendConnectionRequest(sql, env, MEMBER,{}, 'cid')).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('rejeita quando username E telefone são informados juntos', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(
      ConnectionService.sendConnectionRequest(sql, env, MEMBER,{ username: 'fulano', phone: '11999999999' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('alvo inexistente devolve a mesma mensagem genérica de sucesso (não revela nada)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit
      .mockResolvedValueOnce([]); // SELECT profiles — não encontrado

    const res = await ConnectionService.sendConnectionRequest(sql, env, MEMBER,{ username: 'ninguem' }, 'cid');
    expect(res.success).toBe(true);
    expect(res.message).toMatch(/Se existir uma conta/);
  });

  test('pedir conexão consigo mesmo devolve a mesma mensagem genérica, sem inserir nada', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'm1' }]); // o próprio profileId do MEMBER

    const res = await ConnectionService.sendConnectionRequest(sql, env, MEMBER,{ username: 'eu_mesmo' }, 'cid');
    expect(res.success).toBe(true);
    expect(sql).toHaveBeenCalledTimes(2); // rate limit + SELECT, nunca chega no INSERT
  });

  test('cria pedido novo quando não existe vínculo anterior', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'target-1' }]) // SELECT profiles
      .mockResolvedValueOnce([]) // SELECT connections existente — nenhuma
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await ConnectionService.sendConnectionRequest(sql, env, MEMBER,{ username: 'fulano' }, 'cid');
    expect(res.success).toBe(true);
  });

  test('reabre pedido declinado como UPDATE (não INSERT) quando o cooldown já venceu', async () => {
    const sql = makeSql();
    const past = new Date(Date.now() - 1000).toISOString();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'target-1' }])
      .mockResolvedValueOnce([{ id: 'conn-1', status: 'declined', declined_until: past }])
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await ConnectionService.sendConnectionRequest(sql, env, MEMBER,{ username: 'fulano' }, 'cid');
    expect(res.success).toBe(true);
    const updateCall = sql.mock.calls.find((call) => String(call[0]).includes('UPDATE connections'));
    expect(updateCall).toBeTruthy();
  });

  test('recusa ainda em cooldown é um no-op silencioso (mesma mensagem, sem UPDATE)', async () => {
    const sql = makeSql();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'target-1' }])
      .mockResolvedValueOnce([{ id: 'conn-1', status: 'declined', declined_until: future }])
      .mockResolvedValueOnce(undefined); // logAudit (nenhum INSERT/UPDATE de connections acontece)

    const res = await ConnectionService.sendConnectionRequest(sql, env, MEMBER,{ username: 'fulano' }, 'cid');
    expect(res.success).toBe(true);
    expect(sql).toHaveBeenCalledTimes(4); // rate limit + SELECT profile + SELECT existing + logAudit
  });
});

describe('ConnectionService.respondToRequest', () => {
  test('decisão inválida lança ValidationError antes de tocar o banco', async () => {
    const sql = makeSql();
    await expect(ConnectionService.respondToRequest(sql, env, MEMBER,'conn-1', 'talvez', 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('aceitar um pedido que não existe/não pertence à pessoa lança ConflictError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // UPDATE não afetou nenhuma linha
    await expect(ConnectionService.respondToRequest(sql, env, MEMBER,'conn-1', 'accept', 'cid')).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });

  test('recusar grava declined_until e responde com sucesso', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'conn-1' }]).mockResolvedValueOnce(undefined);
    const res = await ConnectionService.respondToRequest(sql, env, MEMBER, 'conn-1', 'decline', 'cid');
    expect(res.success).toBe(true);
  });

  test('resposta bem-sucedida invalida o cache de badge do PRÓPRIO usuário (achado de escala de 2026-09-25)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ id: 'conn-1' }]).mockResolvedValueOnce(undefined);
    await ConnectionService.respondToRequest(sql, env, MEMBER, 'conn-1', 'accept', 'cid');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:sync:m1');
  });
});

describe('ConnectionService — invalidação do cache de badge ao criar pedido (achado de escala de 2026-09-25)', () => {
  test('pedido novo invalida o cache do ALVO', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'target-1' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);
    await ConnectionService.sendConnectionRequest(sql, env, MEMBER, { username: 'fulano' }, 'cid');
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('cache:sync:target-1');
  });

  test('no-op (já pendente/aceita/cooldown) NÃO invalida nada — nada mudou de verdade', async () => {
    const sql = makeSql();
    const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'target-1' }])
      .mockResolvedValueOnce([{ id: 'conn-1', status: 'declined', declined_until: future }])
      .mockResolvedValueOnce(undefined);
    await ConnectionService.sendConnectionRequest(sql, env, MEMBER, { username: 'fulano' }, 'cid');
    expect(env.HOT_CACHE.delete).not.toHaveBeenCalled();
  });
});

describe('ConnectionService.removeConnection', () => {
  test('só remove conexões com status accepted (não pending/declined)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]); // DELETE não encontrou linha accepted
    await expect(ConnectionService.removeConnection(sql, MEMBER, 'conn-1', 'cid')).rejects.toMatchObject({
      name: 'NotFoundError',
    });
  });
});

describe('ConnectionService.blockProfile', () => {
  test('não é possível bloquear a própria conta', async () => {
    const sql = makeSql();
    await expect(ConnectionService.blockProfile(sql, MEMBER, MEMBER.profileId, 'cid')).rejects.toMatchObject({
      name: 'ValidationError',
    });
    expect(sql).not.toHaveBeenCalled();
  });

  test('bloqueia com um único statement (CTE) e audita', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
    const res = await ConnectionService.blockProfile(sql, MEMBER, 'target-1', 'cid');
    expect(res.success).toBe(true);
    expect(sql).toHaveBeenCalledTimes(2); // o statement combinado + logAudit
  });
});

describe('ConnectionService.getRelationship', () => {
  test('perfil próprio devolve isSelf sem consultar o banco', async () => {
    const sql = makeSql();
    const rel = await ConnectionService.getRelationship(sql, 'm1', 'm1');
    expect(rel).toEqual({ isSelf: true, isConnection: false, isBlockedEitherWay: false });
    expect(sql).not.toHaveBeenCalled();
  });

  test('devolve isConnection/isBlockedEitherWay a partir da consulta', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ is_connection: true, is_blocked: false }]);
    const rel = await ConnectionService.getRelationship(sql, 'm1', 'm2');
    expect(rel).toEqual({ isSelf: false, isConnection: true, isBlockedEitherWay: false });
  });
});
