/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import {
  budgetLimit, budgetStatus, noteTokens, recordCall, readDaily, totalsByDay, evaluateAlerts, __resetMetricsForTests,
} from '../src/ai/metrics.js';
import { AI_DAILY_TOKEN_BUDGET, AI_ALERTS } from '../src/constants.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

describe('budgetLimit', () => {
  test('usa a constante e aceita override pela variável de ambiente', () => {
    expect(budgetLimit({})).toBe(AI_DAILY_TOKEN_BUDGET);
    expect(budgetLimit({ AI_DAILY_TOKEN_BUDGET: '300000' })).toBe(300000);
    expect(budgetLimit({ AI_DAILY_TOKEN_BUDGET: 'abc' })).toBe(AI_DAILY_TOKEN_BUDGET);
    expect(budgetLimit({ AI_DAILY_TOKEN_BUDGET: '-5' })).toBe(AI_DAILY_TOKEN_BUDGET);
  });
});

describe('métricas e orçamento — SQL real', () => {
  let db;
  let sql;

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
  }, 60000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => {
    __resetMetricsForTests();
    await db.exec('DELETE FROM ai_metrics_daily; DELETE FROM ai_usage_log;');
  });

  async function usage(feature, tokensIn, tokensOut, extra) {
    const o = Object.assign({ provider: 'groq', ok: true, ageHours: 1 }, extra || {});
    await db.query(
      `INSERT INTO ai_usage_log (feature, model, prompt_tokens, completion_tokens, ok, provider, created_at)
       VALUES ($1, 'm', $2, $3, $4, $5, now() - make_interval(hours => $6))`,
      [feature, tokensIn, tokensOut, o.ok, o.provider, o.ageHours]
    );
  }

  test('o orçamento soma só o Groq das últimas 24 h', async () => {
    await usage('chat', 100, 50);
    await usage('evaluate', 200, 100);
    await usage('chat', 9999, 9999, { provider: 'nvidia' });   // outro provedor: fora
    await usage('chat', 9999, 9999, { ageHours: 30 });          // antigo: fora
    const status = await budgetStatus(sql, { AI_DAILY_TOKEN_BUDGET: '1000' });
    expect(status).toEqual({ used: 450, budget: 1000, pct: 45, exceeded: false });
  });

  test('passou do teto = exceeded', async () => {
    await usage('chat', 600, 500);
    expect(await budgetStatus(sql, { AI_DAILY_TOKEN_BUDGET: '1000' })).toMatchObject({ used: 1100, pct: 100, exceeded: true });
  });

  test('consulta o banco no máximo a cada 30 s e soma localmente entre as consultas', async () => {
    await usage('chat', 100, 0);
    const t0 = 1_000_000;
    expect((await budgetStatus(sql, {}, t0)).used).toBe(100);
    await usage('chat', 500, 0); // entra no banco, mas a consulta está em cache
    noteTokens(50);
    expect((await budgetStatus(sql, {}, t0 + 10_000)).used).toBe(150);
    expect((await budgetStatus(sql, {}, t0 + 31_000)).used).toBe(600); // reconsultou: o banco já tem tudo
  });

  test('se a consulta falhar, segue com o último valor conhecido (a IA não cai por causa do contador)', async () => {
    await usage('chat', 100, 0);
    await budgetStatus(sql, {}, 1_000_000);
    const broken = () => Promise.reject(new Error('banco fora'));
    expect((await budgetStatus(broken, {}, 2_000_000)).used).toBe(100);
  });

  test('recordCall acumula por (dia, recurso, modelo, provedor) com UPSERT', async () => {
    await recordCall(sql, { feature: 'chat', model: 'm1', provider: 'groq', ok: true, tokensIn: 100, tokensOut: 50, latencyMs: 200 });
    await recordCall(sql, { feature: 'chat', model: 'm1', provider: 'groq', ok: false, rateLimited: 2, latencyMs: 400 });
    await recordCall(sql, { feature: 'chat', model: 'm2', provider: 'nvidia', ok: true, tokensIn: 10, tokensOut: 5, latencyMs: 100 });
    const rows = await readDaily(sql, 7);
    const groq = rows.find((r) => r.provider === 'groq');
    expect(groq).toMatchObject({ calls: 2, okCalls: 1, rateLimited: 2, tokensIn: 100, tokensOut: 50, avgLatencyMs: 300 });
    expect(rows).toHaveLength(2);
  });

  test('acerto de cache conta cache_hits e NÃO conta como chamada ao provedor', async () => {
    await recordCall(sql, { feature: 'lab_preceptor', model: 'cache', provider: 'cache', ok: true, cacheHit: true });
    await recordCall(sql, { feature: 'lab_preceptor', model: 'm', provider: 'groq', ok: true, tokensIn: 5, tokensOut: 5, cacheMiss: true });
    const rows = await readDaily(sql, 7);
    expect(rows.find((r) => r.provider === 'cache')).toMatchObject({ calls: 0, cacheHits: 1 });
    expect(rows.find((r) => r.provider === 'groq')).toMatchObject({ calls: 1, cacheMisses: 1 });
  });

  test('readDaily respeita a janela e devolve o dia como texto YYYY-MM-DD', async () => {
    await recordCall(sql, { feature: 'chat', model: 'm', provider: 'groq', ok: true });
    await db.exec("INSERT INTO ai_metrics_daily (day, feature, model, provider, calls) VALUES (now()::date - 20, 'chat', 'old', 'groq', 9)");
    const week = await readDaily(sql, 7);
    expect(week).toHaveLength(1);
    expect(week[0].day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(await readDaily(sql, 30)).toHaveLength(2);
  });

  test('recordCall não derruba a chamada se o banco falhar', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(recordCall(() => Promise.reject(new Error('x')), { feature: 'chat', model: 'm', provider: 'groq', ok: true })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

describe('totalsByDay e evaluateAlerts', () => {
  const row = (day, over) => Object.assign({
    day, calls: 0, rateLimited: 0, tokensIn: 0, tokensOut: 0, cacheHits: 0, cacheMisses: 0,
  }, over || {});

  test('soma os recursos de cada dia, do mais recente ao mais antigo', () => {
    const totals = totalsByDay([
      row('2026-10-09', { calls: 5, tokensIn: 10, tokensOut: 5 }),
      row('2026-10-10', { calls: 3, tokensIn: 1, tokensOut: 1 }),
      row('2026-10-10', { calls: 4, tokensIn: 2, tokensOut: 2, cacheHits: 1 }),
    ]);
    expect(totals.map((t) => t.day)).toEqual(['2026-10-10', '2026-10-09']);
    expect(totals[0]).toMatchObject({ calls: 7, tokens: 6, cacheHits: 1 });
  });

  // O cron roda de madrugada: "hoje" (2026-10-11) está pela metade e NÃO conta para 429 nem cache.
  const today = '2026-10-11';

  test('sem motivo, sem alerta', () => {
    expect(evaluateAlerts({ daily: [], tokensUsed: 1000, budget: 450000, today })).toEqual([]);
  });

  test('orçamento: dispara a partir de 80%', () => {
    const at = (used) => evaluateAlerts({ daily: [], tokensUsed: used, budget: 1000, today }).map((a) => a.kind);
    expect(at(799)).toEqual([]);
    expect(at(800)).toEqual(['budget']);
    expect(at(1500)).toEqual(['budget']);
  });

  test('429: acima de 5% das chamadas do último dia completo e com amostra mínima', () => {
    const daily = (calls, limited) => [{ day: '2026-10-10', calls, rateLimited: limited, cacheHits: 0, cacheMisses: 0, tokens: 0 }];
    const kinds = (d) => evaluateAlerts({ daily: d, tokensUsed: 0, budget: 1000, today }).map((a) => a.kind);
    expect(kinds(daily(100, 5))).toEqual([]);          // exatamente 5% não passa
    expect(kinds(daily(100, 6))).toEqual(['rate_limited']);
    expect(kinds(daily(AI_ALERTS.MIN_CALLS - 1, AI_ALERTS.MIN_CALLS - 1))).toEqual([]); // amostra pequena
  });

  test('429 olha só o ÚLTIMO dia completo: o dia parcial de hoje e os mais antigos não contam', () => {
    const row = (day, limited) => ({ day, calls: 100, rateLimited: limited, cacheHits: 0, cacheMisses: 0, tokens: 0 });
    // Hoje (parcial) com 50% de 429 não dispara; ontem limpo.
    expect(evaluateAlerts({ daily: [row('2026-10-11', 50), row('2026-10-10', 1)], tokensUsed: 0, budget: 1000, today })).toEqual([]);
    // Anteontem ruim, ontem limpo: não dispara.
    expect(evaluateAlerts({ daily: [row('2026-10-10', 1), row('2026-10-09', 50)], tokensUsed: 0, budget: 1000, today })).toEqual([]);
    // Ontem ruim: dispara.
    expect(evaluateAlerts({ daily: [row('2026-10-10', 50)], tokensUsed: 0, budget: 1000, today }).map((a) => a.kind)).toEqual(['rate_limited']);
  });

  test('cache: taxa abaixo de 30% somando 3 dias gera alerta; com poucos dados ou 2 dias, não', () => {
    const day = (d, hits, misses) => ({ day: d, calls: 0, rateLimited: 0, cacheHits: hits, cacheMisses: misses, tokens: 0 });
    const three = [day('2026-10-10', 2, 18), day('2026-10-09', 3, 17), day('2026-10-08', 1, 19)];
    expect(evaluateAlerts({ daily: three, tokensUsed: 0, budget: 1000, today }).map((a) => a.kind)).toEqual(['cache_hit_rate']);
    const good = [day('2026-10-10', 10, 10), day('2026-10-09', 10, 10), day('2026-10-08', 10, 10)];
    expect(evaluateAlerts({ daily: good, tokensUsed: 0, budget: 1000, today })).toEqual([]);
    expect(evaluateAlerts({ daily: three.slice(0, 2), tokensUsed: 0, budget: 1000, today })).toEqual([]);
    const tiny = [day('2026-10-10', 0, 3), day('2026-10-09', 0, 3), day('2026-10-08', 0, 3)];
    expect(evaluateAlerts({ daily: tiny, tokensUsed: 0, budget: 1000, today })).toEqual([]);
    // O dia parcial de hoje não entra na janela de 3 dias.
    const withToday = [day('2026-10-11', 0, 40), ...good];
    expect(evaluateAlerts({ daily: withToday, tokensUsed: 0, budget: 1000, today })).toEqual([]);
  });

  test('vários alertas podem disparar juntos', () => {
    const daily = [
      { day: '2026-10-10', calls: 100, rateLimited: 20, cacheHits: 0, cacheMisses: 30, tokens: 0 },
      { day: '2026-10-09', calls: 0, rateLimited: 0, cacheHits: 0, cacheMisses: 30, tokens: 0 },
      { day: '2026-10-08', calls: 0, rateLimited: 0, cacheHits: 0, cacheMisses: 30, tokens: 0 },
    ];
    expect(evaluateAlerts({ daily, tokensUsed: 900, budget: 1000, today }).map((a) => a.kind).sort()).toEqual(['budget', 'cache_hit_rate', 'rate_limited']);
  });
});
