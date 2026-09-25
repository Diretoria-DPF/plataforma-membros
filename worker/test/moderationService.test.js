import * as ModerationService from '../src/services/moderationService.js';
import { makeSql } from './helpers/mockEnv.js';

const MEMBER = { profileId: 'm1', role: 'member' };
const ADMIN = { profileId: 'a1', role: 'admin' };

describe('ModerationService.submitReport', () => {
  test('não é possível denunciar a própria conta', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]); // rate limit
    await expect(
      ModerationService.submitReport(sql, MEMBER, { targetProfileId: 'm1', category: 'spam' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('categoria fora da lista fechada lança ValidationError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 1 }]);
    await expect(
      ModerationService.submitReport(sql, MEMBER, { targetProfileId: 't1', category: 'inventada' }, 'cid')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('sem vínculo prévio (nunca interagiu) lança ForbiddenError', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit
      .mockResolvedValueOnce([]); // SELECT vínculo — nenhum

    await expect(
      ModerationService.submitReport(sql, MEMBER, { targetProfileId: 't1', category: 'spam' }, 'cid')
    ).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('com vínculo prévio, registra a denúncia e audita', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ 1: 1 }]) // vínculo existe
      .mockResolvedValueOnce(undefined) // INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await ModerationService.submitReport(sql, MEMBER, { targetProfileId: 't1', category: 'harassment' }, 'cid');
    expect(res.success).toBe(true);
  });
});

describe('ModerationService.listReports / resolveReport — só admin', () => {
  test('member não pode listar denúncias', async () => {
    const sql = makeSql();
    await expect(ModerationService.listReports(sql, MEMBER, {})).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('member não pode resolver denúncias', async () => {
    const sql = makeSql();
    await expect(ModerationService.resolveReport(sql, MEMBER, 'r1', { status: 'dismissed' }, 'cid')).rejects.toMatchObject({
      name: 'ForbiddenError',
    });
  });

  test('admin resolve uma denúncia aberta como "resolved" (grava resolved_by/resolved_at)', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([{ status: 'open' }]) // SELECT status atual
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await ModerationService.resolveReport(sql, ADMIN, 'r1', { status: 'resolved', resolutionNote: 'ok' }, 'cid');
    expect(res.success).toBe(true);
  });

  test('transição inválida (de resolved para open) lança ConflictError', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ status: 'resolved' }]);
    await expect(ModerationService.resolveReport(sql, ADMIN, 'r1', { status: 'open' }, 'cid')).rejects.toMatchObject({
      name: 'ConflictError',
    });
  });
});
