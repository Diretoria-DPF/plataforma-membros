/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
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
      .mockResolvedValueOnce([1, 1])     // atlas_telemetry
      .mockResolvedValueOnce([1])        // sessions
      .mockResolvedValueOnce([])         // account_tokens
      .mockResolvedValueOnce([1, 1])     // rate_limit_buckets
      .mockResolvedValueOnce([1])        // audit_logs
      .mockResolvedValueOnce([1, 1, 1, 1]) // error_logs
      .mockResolvedValueOnce([])         // mfa_challenges
      .mockResolvedValueOnce([])         // semantic_cache
      .mockResolvedValueOnce([]);        // assistant_moderation (decaimento)
    const res = await runMaintenance(sql, 'cid');
    expect(res).toEqual({
      aiUsageLog: 3, atlasTelemetry: 2, sessions: 1, accountTokens: 0, rateLimitBuckets: 2, auditLogs: 1, errorLogs: 4, mfaChallenges: 0,
      semanticCache: 0, aiAlerts: 0, assistantModeration: 0,
    });
    expect(queryText(sql, 7)).toMatch(/DELETE FROM mfa_challenges/);
    expect(queryText(sql, 8)).toMatch(/DELETE FROM ai_semantic_cache/);
    expect(queryText(sql, 0)).toMatch(/DELETE FROM ai_usage_log/);
    expect(sql.mock.calls[0]).toContain(RETENTION.AI_USAGE_LOG_DAYS);
    expect(RETENTION.AI_USAGE_LOG_DAYS).toBe(180);
    expect(queryText(sql, 1)).toMatch(/DELETE FROM atlas_telemetry/);
    expect(sql.mock.calls[1]).toContain(RETENTION.ATLAS_TELEMETRY_DAYS);
    expect(RETENTION.ATLAS_TELEMETRY_DAYS).toBe(90);
    expect(queryText(sql, 2)).toMatch(/DELETE FROM sessions/);
    expect(sql.mock.calls[2]).toContain(RETENTION.EXPIRED_SESSION_GRACE_DAYS);
    expect(queryText(sql, 3)).toMatch(/DELETE FROM account_tokens/);
    expect(sql.mock.calls[3]).toContain(RETENTION.EXPIRED_TOKEN_GRACE_DAYS);
    expect(queryText(sql, 4)).toMatch(/DELETE FROM rate_limit_buckets/);
    expect(sql.mock.calls[4]).toContain(RETENTION.RATE_LIMIT_BUCKET_MAX_AGE_DAYS);
    // A folga dos baldes precisa ser maior que a maior janela de rate limit (7 dias).
    expect(RETENTION.RATE_LIMIT_BUCKET_MAX_AGE_DAYS).toBeGreaterThan(7);
  });

  test('audit_logs guarda 2 anos e error_logs 30 dias; o corte é sempre por created_at', async () => {
    const sql = makeSql();
    sql.mockResolvedValue([]);
    await runMaintenance(sql, 'cid');
    expect(RETENTION.AUDIT_LOGS_DAYS).toBe(730);
    expect(RETENTION.ERROR_LOGS_DAYS).toBe(30);
    const byTable = {};
    sql.mock.calls.forEach((call, i) => {
      const text = queryText(sql, i);
      const m = text.match(/DELETE FROM (audit_logs|error_logs)/);
      if (m) byTable[m[1]] = { text, values: call.slice(1) };
    });
    expect(byTable.audit_logs.values).toEqual([RETENTION.AUDIT_LOGS_DAYS]);
    expect(byTable.error_logs.values).toEqual([RETENTION.ERROR_LOGS_DAYS]);
    // Nenhuma das duas pode virar um DELETE sem filtro de idade.
    Object.values(byTable).forEach(({ text }) => expect(text).toMatch(/WHERE\s+created_at\s*<\s*now\(\)/));
  });

  test('uma limpeza que falha é registrada e não impede as outras', async () => {
    const sql = makeSql();
    sql
      .mockRejectedValueOnce(new Error('relation "ai_usage_log" does not exist'))
      .mockResolvedValueOnce(undefined)  // logError do ai_usage_log
      .mockResolvedValueOnce([])         // atlas_telemetry
      .mockResolvedValueOnce([1])        // sessions
      .mockResolvedValueOnce([1])        // account_tokens
      .mockResolvedValueOnce([])         // rate_limit_buckets
      .mockResolvedValueOnce([])         // audit_logs
      .mockResolvedValueOnce([1])        // error_logs
      .mockResolvedValueOnce([])         // mfa_challenges
      .mockResolvedValueOnce([])         // semantic_cache
      .mockResolvedValueOnce([]);        // assistant_moderation (decaimento)
    const res = await runMaintenance(sql, 'cid');
    expect(res).toEqual({
      aiUsageLog: null, atlasTelemetry: 0, sessions: 1, accountTokens: 1, rateLimitBuckets: 0, auditLogs: 0, errorLogs: 1, mfaChallenges: 0,
      semanticCache: 0, aiAlerts: 0, assistantModeration: 0,
    });
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
    // 9 limpezas + 2 consultas dos alertas da IA + 1 do decaimento da moderação da Lia.
    expect(sql).toHaveBeenCalledTimes(12);
  });
});
