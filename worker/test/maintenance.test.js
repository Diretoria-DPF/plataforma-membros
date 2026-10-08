/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { makeSql, makeEnv } from './helpers/mockEnv.js';
import { routedSql, callsMatching } from './helpers/aiTestUtils.js';
import { runMaintenance, RETENTION } from '../src/maintenance.js';
import { buildDocuments } from '../src/assistant/docs.js';
import { EMBEDDING_DIM } from '../src/constants.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';

jest.unstable_mockModule('../src/db.js', () => ({ createDb: jest.fn() }));
const { createDb } = await import('../src/db.js');
const { default: worker } = await import('../src/index.js');

function queryText(sql, callIndex) {
  const strings = sql.mock.calls[callIndex][0];
  return Array.isArray(strings) ? strings.join('?') : String(strings);
}

function allQueryTexts(sql) {
  return sql.mock.calls.map((call) => (Array.isArray(call[0]) ? call[0].join('?') : String(call[0])));
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
      .mockResolvedValueOnce([])         // assistant_moderation (decaimento)
      .mockResolvedValueOnce([1, 1])     // assistant_feedback (anonimização)
      .mockResolvedValueOnce([1])        // assistant_feedback (remoção aos 365 dias)
      .mockResolvedValueOnce([])         // assistant_messages (180 dias)
      .mockResolvedValueOnce([1, 1, 1]); // assistant_incidents (365 dias)
    const res = await runMaintenance(sql, 'cid');
    expect(res).toEqual({
      aiUsageLog: 3, atlasTelemetry: 2, sessions: 1, accountTokens: 0, rateLimitBuckets: 2, auditLogs: 1, errorLogs: 4, mfaChallenges: 0,
      semanticCache: 0, aiAlerts: 0, assistantModeration: 0,
      assistantFeedbackAnonymize: 2, assistantFeedbackPurge: 1, assistantMessagesPurge: 0, assistantIncidentsPurge: 3,
      ragReindex: 0,
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
    expect(queryText(sql, 10)).toMatch(/UPDATE assistant_feedback/);
    expect(queryText(sql, 11)).toMatch(/DELETE FROM assistant_feedback/);
    expect(queryText(sql, 12)).toMatch(/DELETE FROM assistant_messages/);
    expect(queryText(sql, 13)).toMatch(/DELETE FROM assistant_incidents/);
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
      .mockResolvedValueOnce([])         // assistant_moderation (decaimento)
      .mockResolvedValueOnce([])         // assistant_feedback (anonimização)
      .mockResolvedValueOnce([])         // assistant_feedback (365 dias)
      .mockResolvedValueOnce([])         // assistant_messages (180 dias)
      .mockResolvedValueOnce([]);        // assistant_incidents (365 dias)
    const res = await runMaintenance(sql, 'cid');
    expect(res).toEqual({
      aiUsageLog: null, atlasTelemetry: 0, sessions: 1, accountTokens: 1, rateLimitBuckets: 0, auditLogs: 0, errorLogs: 1, mfaChallenges: 0,
      semanticCache: 0, aiAlerts: 0, assistantModeration: 0,
      assistantFeedbackAnonymize: 0, assistantFeedbackPurge: 0, assistantMessagesPurge: 0, assistantIncidentsPurge: 0,
      ragReindex: 0,
    });
    expect(queryText(sql, 1)).toMatch(/error_logs/);
  });

  test('a tabela da Lia ausente (ex.: sql/021 não migrada) não derruba as outras limpezas', async () => {
    const sql = makeSql();
    sql.mockImplementation((strings) => {
      const text = strings.join('?');
      if (/UPDATE assistant_feedback/.test(text)) {
        return Promise.reject(new Error('relation "assistant_feedback" does not exist'));
      }
      // Limpezas devolvem uma linha; SELECTs e INSERTs (log de erro) devolvem vazio.
      return Promise.resolve(/^\s*DELETE\b/.test(text) ? [1] : []);
    });
    const res = await runMaintenance(sql, 'cid');
    expect(res.assistantFeedbackAnonymize).toBeNull();
    expect(res.assistantFeedbackPurge).toBe(1);
    expect(res.assistantMessagesPurge).toBe(1);
    expect(res.assistantIncidentsPurge).toBe(1);
    expect(res.sessions).toBe(1);
    const texts = allQueryTexts(sql);
    expect(texts.some((t) => /DELETE FROM assistant_incidents/.test(t))).toBe(true);
    expect(texts.some((t) => /INSERT INTO error_logs/.test(t))).toBe(true);
  });

  test('toda limpeza que apaga ou altera linhas tem corte por idade no WHERE (varredura do SQL)', async () => {
    const sql = makeSql();
    sql.mockResolvedValue([]);
    await runMaintenance(sql, 'cid');
    const modifying = allQueryTexts(sql).filter((t) => /^\s*(DELETE|UPDATE)\b/.test(t));
    // 9 limpezas do Worker + 4 da Lia (sem contar o decaimento, que é um SELECT + UPDATE só com linhas).
    expect(modifying).toHaveLength(13);
    modifying.forEach((text) => {
      expect(text).toMatch(/\bWHERE\b[\s\S]*<\s*now\(\)/);
    });
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
    // 9 limpezas + 2 consultas dos alertas da IA + 1 do decaimento da moderação da Lia + 4 da retenção da Lia
    // + 1 da flag rag_enabled (ragReindex, que só roda com env; aqui a flag está desligada).
    expect(sql).toHaveBeenCalledTimes(17);
  });
});

describe('ragReindex — reindexação diária da base da Lia (cron)', () => {
  const FLAG_ON = [{ key: 'rag_enabled', enabled: true, rollout_pct: 100, conditions: {} }];
  const aiOk = () => ({
    run: jest.fn(async (_model, { text }) => ({ data: text.map(() => Array.from({ length: EMBEDDING_DIM }, () => 0.01)) })),
  });

  beforeEach(() => { __resetFlagCacheForTests(); });

  test('flag desligada: não reindexa, não chama o modelo e não grava nada', async () => {
    const sql = routedSql([['feature_flags', []]]);
    const ai = aiOk();
    const res = await runMaintenance(sql, 'cid', makeEnv({ AI: ai }));
    expect(res.ragReindex).toBe(0);
    expect(ai.run).not.toHaveBeenCalled();
    expect(callsMatching(sql, 'INSERT INTO kb_chunks')).toHaveLength(0);
  });

  test('flag ligada e Workers AI: reindexa a base inteira e conta os gravados (upserted)', async () => {
    const total = buildDocuments().length;
    const sql = routedSql([['feature_flags', FLAG_ON], ['FROM kb_chunks', []]]);
    const ai = aiOk();
    const res = await runMaintenance(sql, 'cid', makeEnv({ AI: ai }));
    expect(res.ragReindex).toBe(total);
    expect(ai.run).toHaveBeenCalled();
    expect(callsMatching(sql, 'INSERT INTO kb_chunks')).toHaveLength(total);
  });

  test('sem Workers AI: não lança, grava os trechos sem embedding e conta (a busca segue por trigramas)', async () => {
    const total = buildDocuments().length;
    const sql = routedSql([['feature_flags', FLAG_ON], ['FROM kb_chunks', []]]);
    const res = await runMaintenance(sql, 'cid', makeEnv());
    expect(res.ragReindex).toBe(total);
  });

  test('falha do banco na reindexação: vira null, é registrada e não derruba as outras limpezas', async () => {
    const sql = routedSql([
      ['feature_flags', FLAG_ON],
      ['FROM kb_chunks', new Error('relation "kb_chunks" does not exist')],
    ]);
    const res = await runMaintenance(sql, 'cid', makeEnv({ AI: aiOk() }));
    expect(res.ragReindex).toBeNull();
    expect(res.aiUsageLog).toBe(0);
    expect(res.sessions).toBe(0);
    expect(callsMatching(sql, 'INSERT INTO error_logs')).toHaveLength(1);
  });
});
