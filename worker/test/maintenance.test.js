import { jest } from '@jest/globals';
import { makeSql, makeEnv } from './helpers/mockEnv.js';
import { runMaintenance, RETENTION } from '../src/maintenance.js';

jest.unstable_mockModule('../src/db.js', () => ({ createDb: jest.fn() }));
const { createDb } = await import('../src/db.js');
const { default: worker } = await import('../src/index.js');

function queryText(sql, callIndex) {
  const strings = sql.mock.calls[callIndex][0];
  return Array.isArray(strings) ? strings.join('?') : String(strings);
}

describe('maintenance.runMaintenance', () => {
  test('apaga log da IA > 180 dias e registros expirados, devolvendo as contagens', async () => {
    const sql = makeSql();
    sql
      .mockResolvedValueOnce([1, 1, 1])  // ai_usage_log
      .mockResolvedValueOnce([1])        // sessions
      .mockResolvedValueOnce([])         // account_tokens
      .mockResolvedValueOnce([1, 1]);    // rate_limit_buckets
    const res = await runMaintenance(sql, 'cid');
    expect(res).toEqual({ aiUsageLog: 3, sessions: 1, accountTokens: 0, rateLimitBuckets: 2 });
    expect(queryText(sql, 0)).toMatch(/DELETE FROM ai_usage_log/);
    expect(sql.mock.calls[0]).toContain(RETENTION.AI_USAGE_LOG_DAYS);
    expect(RETENTION.AI_USAGE_LOG_DAYS).toBe(180);
    expect(queryText(sql, 1)).toMatch(/DELETE FROM sessions/);
    expect(sql.mock.calls[1]).toContain(RETENTION.EXPIRED_SESSION_GRACE_DAYS);
    expect(queryText(sql, 2)).toMatch(/DELETE FROM account_tokens/);
    expect(sql.mock.calls[2]).toContain(RETENTION.EXPIRED_TOKEN_GRACE_DAYS);
    expect(queryText(sql, 3)).toMatch(/DELETE FROM rate_limit_buckets/);
    expect(sql.mock.calls[3]).toContain(RETENTION.RATE_LIMIT_BUCKET_MAX_AGE_DAYS);
    // A folga dos baldes precisa ser maior que a maior janela de rate limit (7 dias).
    expect(RETENTION.RATE_LIMIT_BUCKET_MAX_AGE_DAYS).toBeGreaterThan(7);
  });

  test('nunca toca audit_logs nem error_logs (só registra erro)', async () => {
    const sql = makeSql();
    sql.mockResolvedValue([]);
    await runMaintenance(sql, 'cid');
    sql.mock.calls.forEach((_, i) => expect(queryText(sql, i)).not.toMatch(/DELETE FROM (audit_logs|error_logs)/));
  });

  test('uma limpeza que falha é registrada e não impede as outras', async () => {
    const sql = makeSql();
    sql
      .mockRejectedValueOnce(new Error('relation "ai_usage_log" does not exist'))
      .mockResolvedValueOnce(undefined)  // logError do ai_usage_log
      .mockResolvedValueOnce([1])        // sessions
      .mockResolvedValueOnce([1])        // account_tokens
      .mockResolvedValueOnce([]);        // rate_limit_buckets
    const res = await runMaintenance(sql, 'cid');
    expect(res).toEqual({ aiUsageLog: null, sessions: 1, accountTokens: 1, rateLimitBuckets: 0 });
    expect(queryText(sql, 1)).toMatch(/error_logs/);
  });
});

describe('index.js — handler scheduled (Cron Trigger)', () => {
  test('roda a manutenção via ctx.waitUntil', async () => {
    const sql = makeSql();
    sql.mockResolvedValue([]);
    createDb.mockReturnValue(sql);
    const pending = [];
    await worker.scheduled({ cron: '17 6 * * *' }, makeEnv(), { waitUntil: (p) => pending.push(p) });
    expect(pending).toHaveLength(1);
    await pending[0];
    expect(sql).toHaveBeenCalledTimes(4);
  });
});
