/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/metrics.js
 * Orçamento de tokens, métricas diárias e alertas da IA.
 *
 *  - budgetStatus: tokens gastos nas últimas 24 h (ai_usage_log, só Groq)
 *    contra AI_DAILY_TOKEN_BUDGET. A soma é reconsultada a cada 30 s por
 *    instância e cada chamada bem-sucedida soma localmente (noteTokens), para
 *    o contador não ficar defasado entre as consultas. Se a consulta falhar,
 *    vale o último valor conhecido (a IA não cai por causa do contador).
 *  - recordCall: uma linha por (dia, recurso, modelo, provedor) em
 *    ai_metrics_daily (sql/018), com UPSERT. Acerto de cache é registrado aqui
 *    porque não gera linha em ai_usage_log.
 *  - evaluateAlerts: função pura usada pelo cron (maintenance.js).
 * Nada aqui guarda conteúdo de conversa.
 */
import * as C from '../constants.js';

let budgetCache = { at: 0, used: 0 };

export function __resetMetricsForTests() {
  budgetCache = { at: 0, used: 0 };
}

export function budgetLimit(env) {
  const n = Number(env && env.AI_DAILY_TOKEN_BUDGET);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : C.AI_DAILY_TOKEN_BUDGET;
}

async function tokensUsed24h(sql, now) {
  if (budgetCache.at && now - budgetCache.at < C.AI_BUDGET_REFRESH_MS) return budgetCache.used;
  try {
    const rows = await sql`
      SELECT coalesce(sum(coalesce(prompt_tokens, 0) + coalesce(completion_tokens, 0)), 0)::bigint AS tokens
      FROM ai_usage_log
      WHERE created_at > now() - interval '24 hours' AND provider = 'groq'
    `;
    budgetCache = { at: now, used: Number(rows[0].tokens) || 0 };
  } catch (err) {
    // Sem consulta (ex.: coluna provider ainda não migrada): segue com o último valor.
    budgetCache = { at: now, used: budgetCache.used };
  }
  return budgetCache.used;
}

/** Soma tokens de uma chamada recém-feita ao contador local. */
export function noteTokens(count) {
  const n = Number(count);
  if (Number.isFinite(n) && n > 0) budgetCache.used += Math.round(n);
}

export async function budgetStatus(sql, env, now = Date.now()) {
  const used = await tokensUsed24h(sql, now);
  const budget = budgetLimit(env);
  return { used, budget, pct: Math.min(100, Math.round((used / budget) * 100)), exceeded: used >= budget };
}

const toCount = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : 0);

/**
 * entry: { feature, model, provider, ok, rateLimited, tokensIn, tokensOut,
 *          latencyMs, cacheHit, cacheMiss }. Falhar aqui nunca afeta a resposta.
 */
export async function recordCall(sql, entry) {
  if (!sql) return;
  const hit = !!entry.cacheHit;
  const calls = hit ? 0 : 1;
  try {
    await sql`
      INSERT INTO ai_metrics_daily
        (day, feature, model, provider, calls, ok_calls, rate_limited, tokens_in, tokens_out, cache_hits, cache_misses, latency_ms_total)
      VALUES
        ((now() AT TIME ZONE 'UTC')::date, ${entry.feature}, ${String(entry.model || 'desconhecido').slice(0, 100)}, ${entry.provider || 'groq'},
         ${calls}, ${calls && entry.ok ? 1 : 0}, ${toCount(entry.rateLimited)}, ${toCount(entry.tokensIn)}, ${toCount(entry.tokensOut)},
         ${hit ? 1 : 0}, ${entry.cacheMiss ? 1 : 0}, ${toCount(entry.latencyMs)})
      ON CONFLICT (day, feature, model, provider) DO UPDATE SET
        calls = ai_metrics_daily.calls + EXCLUDED.calls,
        ok_calls = ai_metrics_daily.ok_calls + EXCLUDED.ok_calls,
        rate_limited = ai_metrics_daily.rate_limited + EXCLUDED.rate_limited,
        tokens_in = ai_metrics_daily.tokens_in + EXCLUDED.tokens_in,
        tokens_out = ai_metrics_daily.tokens_out + EXCLUDED.tokens_out,
        cache_hits = ai_metrics_daily.cache_hits + EXCLUDED.cache_hits,
        cache_misses = ai_metrics_daily.cache_misses + EXCLUDED.cache_misses,
        latency_ms_total = ai_metrics_daily.latency_ms_total + EXCLUDED.latency_ms_total
    `;
  } catch (err) {
    console.error('Falha ao gravar ai_metrics_daily (feature=' + entry.feature + ').');
  }
}

function rowToDto(r) {
  const calls = Number(r.calls) || 0;
  return {
    day: String(r.day),
    feature: r.feature,
    model: r.model,
    provider: r.provider,
    calls,
    okCalls: Number(r.ok_calls) || 0,
    rateLimited: Number(r.rate_limited) || 0,
    tokensIn: Number(r.tokens_in) || 0,
    tokensOut: Number(r.tokens_out) || 0,
    cacheHits: Number(r.cache_hits) || 0,
    cacheMisses: Number(r.cache_misses) || 0,
    avgLatencyMs: calls ? Math.round((Number(r.latency_ms_total) || 0) / calls) : 0,
  };
}

/** Linhas dos últimos `days` dias (inclui hoje), mais recentes primeiro. */
export async function readDaily(sql, days) {
  const span = Math.min(90, Math.max(1, Math.round(Number(days) || 7)));
  const rows = await sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, feature, model, provider, calls, ok_calls, rate_limited,
           tokens_in, tokens_out, cache_hits, cache_misses, latency_ms_total
    FROM ai_metrics_daily
    WHERE day > (now() AT TIME ZONE 'UTC')::date - ${span}::int
    ORDER BY day DESC, feature, model
  `;
  return (rows || []).map(rowToDto);
}

/** Soma as linhas por dia (para os alertas e o gráfico). */
export function totalsByDay(rows) {
  const byDay = new Map();
  rows.forEach((r) => {
    const t = byDay.get(r.day) || { day: r.day, calls: 0, rateLimited: 0, cacheHits: 0, cacheMisses: 0, tokens: 0 };
    t.calls += r.calls;
    t.rateLimited += r.rateLimited;
    t.cacheHits += r.cacheHits;
    t.cacheMisses += r.cacheMisses;
    t.tokens += r.tokensIn + r.tokensOut;
    byDay.set(r.day, t);
  });
  return Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1));
}

/**
 * Regras dos alertas (cron diário):
 *  - orçamento: tokens das últimas 24 h acima de AI_ALERTS.BUDGET_PCT do teto;
 *  - 429: mais de AI_ALERTS.RATE_LIMITED_MAX_PCT das chamadas de HOJE;
 *  - cache: taxa de acerto abaixo de AI_ALERTS.HIT_RATE_MIN_PCT somando os
 *    últimos AI_ALERTS.HIT_RATE_DAYS dias.
 * Todas exigem amostra mínima (AI_ALERTS.MIN_CALLS) para evitar alarme falso.
 */
export function evaluateAlerts({ daily, tokensUsed, budget, today }) {
  const A = C.AI_ALERTS;
  const alerts = [];

  const pct = budget > 0 ? (tokensUsed / budget) * 100 : 0;
  if (pct >= A.BUDGET_PCT) {
    alerts.push({ kind: 'budget', message: 'Consumo de tokens em ' + Math.round(pct) + '% do orçamento diário (' + tokensUsed + ' de ' + budget + ').' });
  }

  const todayRow = daily.find((d) => d.day === today);
  if (todayRow && todayRow.calls >= A.MIN_CALLS) {
    const rate = (todayRow.rateLimited / todayRow.calls) * 100;
    if (rate > A.RATE_LIMITED_MAX_PCT) {
      alerts.push({ kind: 'rate_limited', message: 'O provedor devolveu limite de requisições (429) em ' + rate.toFixed(1) + '% das chamadas de hoje.' });
    }
  }

  const recent = daily.slice(0, A.HIT_RATE_DAYS);
  const hits = recent.reduce((s, d) => s + d.cacheHits, 0);
  const lookups = hits + recent.reduce((s, d) => s + d.cacheMisses, 0);
  if (recent.length >= A.HIT_RATE_DAYS && lookups >= A.MIN_CALLS) {
    const hitRate = (hits / lookups) * 100;
    if (hitRate < A.HIT_RATE_MIN_PCT) {
      alerts.push({ kind: 'cache_hit_rate', message: 'Taxa de acerto do cache em ' + hitRate.toFixed(0) + '% nos últimos ' + A.HIT_RATE_DAYS + ' dias (meta: ' + A.HIT_RATE_MIN_PCT + '%).' });
    }
  }
  return alerts;
}
