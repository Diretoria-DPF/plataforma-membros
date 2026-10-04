/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { runAiAlerts } from '../src/ai/alerts.js';
import { __resetMetricsForTests } from '../src/ai/metrics.js';
import { routedSql, callsMatching } from './helpers/aiTestUtils.js';
import { makeEnv } from './helpers/mockEnv.js';

const NOW = new Date('2026-10-10T12:00:00Z');
const CID = '33333333-3333-4333-8333-333333333333';

function metricRow(over) {
  return Object.assign({
    day: '2026-10-10', feature: 'chat', model: 'm', provider: 'groq', calls: 100, ok_calls: 100, rate_limited: 0,
    tokens_in: 1000, tokens_out: 1000, cache_hits: 0, cache_misses: 0, latency_ms_total: 100000,
  }, over || {});
}

function world({ rows, tokens = 1000, recentAlert = false, admins = [{ email: 'adm@exemplo.com', full_name: 'Adm' }] }) {
  return routedSql([
    ['FROM ai_metrics_daily', rows],
    ['FROM ai_usage_log', [{ tokens }]],
    ["action = 'AI_ALERT'", recentAlert ? [{ '?column?': 1 }] : []],
    ['FROM profiles', admins],
  ]);
}

beforeEach(() => {
  __resetMetricsForTests();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}), text: async () => '' });
});

describe('runAiAlerts', () => {
  test('sem nada a avisar não envia e-mail nem consulta administradores', async () => {
    const sql = world({ rows: [metricRow()] });
    expect(await runAiAlerts(sql, makeEnv(), CID, NOW)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(callsMatching(sql, 'FROM profiles')).toHaveLength(0);
  });

  test('orçamento acima de 80% avisa todos os administradores e audita o tipo do alerta', async () => {
    const sql = world({ rows: [metricRow()], tokens: 400000, admins: [{ email: 'a@x.com', full_name: 'A' }, { email: 'b@x.com', full_name: 'B' }] });
    const sent = await runAiAlerts(sql, makeEnv({ AI_DAILY_TOKEN_BUDGET: '450000' }), CID, NOW);
    expect(sent.map((a) => a.kind)).toEqual(['budget']);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(callsMatching(sql, 'INSERT INTO audit_logs')[0]).toContain('AI_ALERT');
    expect(JSON.stringify(callsMatching(sql, 'INSERT INTO audit_logs')[0])).toContain('budget');
  });

  test('não repete o mesmo alerta dentro de 20 h', async () => {
    const sql = world({ rows: [metricRow()], tokens: 440000, recentAlert: true });
    expect(await runAiAlerts(sql, makeEnv(), CID, NOW)).toEqual([]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('429 em mais de 5% das chamadas de hoje gera alerta', async () => {
    const sql = world({ rows: [metricRow({ calls: 100, rate_limited: 9 })] });
    const sent = await runAiAlerts(sql, makeEnv(), CID, NOW);
    expect(sent.map((a) => a.kind)).toContain('rate_limited');
  });

  test('uma falha do Brevo não impede o registro nem derruba o cron', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('brevo fora'));
    const sql = world({ rows: [metricRow()], tokens: 440000 });
    const sent = await runAiAlerts(sql, makeEnv(), CID, NOW);
    expect(sent).toHaveLength(1);
    expect(callsMatching(sql, 'INSERT INTO error_logs')).toHaveLength(1);
    expect(callsMatching(sql, 'INSERT INTO audit_logs')).toHaveLength(1);
  });

  test('antes da migração 018 não faz nada', async () => {
    const sql = routedSql([['FROM ai_metrics_daily', Object.assign(new Error('relation "ai_metrics_daily" does not exist'), { code: '42P01' })]]);
    expect(await runAiAlerts(sql, makeEnv(), CID, NOW)).toEqual([]);
  });

  test('erro de banco que não é tabela ausente sobe (o cron isola e registra)', async () => {
    const sql = routedSql([['FROM ai_metrics_daily', new Error('connection reset')]]);
    await expect(runAiAlerts(sql, makeEnv(), CID, NOW)).rejects.toThrow('connection reset');
  });
});
