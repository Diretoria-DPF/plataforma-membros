/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/admin.js
 * Administração da memória e dos agentes (ADR 0007). REGRA: o admin NÃO lê a memória de ninguém. Só enxerga agregados
 * (contagens) e pode APAGAR a memória de uma pessoa (com reautenticação). Os agregados dos agentes vêm de agent_traces,
 * que não guarda texto do usuário.
 *
 *   apiAdminMemoryStats        consentimentos por situação, fila de exclusão e totais da memória (só números)
 *   apiAdminPurgeMemberMemory  apaga a memória de uma pessoa; exige senha (e 2º fator) como outras ações sensíveis
 *   apiAdminAgentsStats        chamadas, tokens, latência e desfechos dos agentes (agregados de agent_traces)
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import { isMissingTable } from '../services/featureFlagService.js';
import { createMemoryDb } from '../db.js';
import * as Store from './store.js';
import { memoryKeyConfigured } from './subject.js';
import { eraseSubject } from './cleanup.js';
import { cacheInvalidate } from './tutorCache.js';

const { AgentError } = E;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATS_DAYS = Object.freeze({ DEFAULT: 30, MAX: 90 });

function assertAdmin(identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
}

const number = (v) => (v === null || v === undefined ? 0 : Number(v));

async function coreStats(sql) {
  const [consent, queue] = await Promise.all([
    sql`SELECT status, (purpose_version = ${C.MEMORY.PURPOSE_VERSION}) AS is_current, count(*)::int AS people
        FROM member_memory_consent GROUP BY 1, 2`,
    sql`SELECT count(*)::int AS pending, coalesce(max(attempts), 0)::int AS max_attempts,
               floor(extract(epoch FROM (now() - min(enqueued_at))) / 3600)::int AS oldest_hours
        FROM memory_purge_queue`,
  ]);
  const grantedCurrent = consent.filter((r) => r.status === 'granted' && r.is_current === true).reduce((n, r) => n + number(r.people), 0);
  const grantedOld = consent.filter((r) => r.status === 'granted' && r.is_current !== true).reduce((n, r) => n + number(r.people), 0);
  const revoked = consent.filter((r) => r.status === 'revoked').reduce((n, r) => n + number(r.people), 0);
  return {
    consent: { grantedCurrent, grantedOldVersion: grantedOld, revoked },
    purgeQueue: { pending: number(queue[0].pending), maxAttempts: number(queue[0].max_attempts), oldestHours: queue[0].pending ? number(queue[0].oldest_hours) : null },
  };
}

async function memoryTotals(env) {
  const msql = createMemoryDb(env);
  if (!msql) return { available: false };
  try {
    return { available: true, ...(await Store.aggregateStats(msql)) };
  } catch (err) {
    return { available: false };
  }
}

/** Painel da memória: SÓ agregados. Nunca devolve item, pessoa ou pseudônimo. */
export async function memoryStats(sql, env, identity) {
  assertAdmin(identity);
  let core;
  try {
    core = await coreStats(sql);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    core = { consent: { grantedCurrent: 0, grantedOldVersion: 0, revoked: 0 }, purgeQueue: { pending: 0, maxAttempts: 0, oldestHours: null }, migrationPending: true };
  }
  return {
    success: true, alpha: true, apiVersion: C.AGENTS.API_VERSION, purposeVersion: C.MEMORY.PURPOSE_VERSION,
    configured: !!createMemoryDb(env) && memoryKeyConfigured(env), ...core, memory: await memoryTotals(env),
  };
}

/**
 * Apaga a memória de UMA pessoa (não mexe no consentimento dela). Input: { profileId, password, code? }. A reautenticação
 * vem de `hooks.stepUp` (MfaService.requireStepUp). Falhou o apagamento: entra na fila e o cron conclui.
 */
export async function purgeMemberMemory(sql, env, identity, rawInput, correlationId, hooks = {}) {
  assertAdmin(identity);
  const input = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const target = typeof input.profileId === 'string' ? input.profileId.trim().toLowerCase() : '';
  if (!UUID_RE.test(target)) throw AgentError('VALIDATION', 'Pessoa inválida.');
  if (hooks.stepUp) await hooks.stepUp();
  const outcome = await eraseSubject(sql, env, target, 'admin');
  cacheInvalidate(target);
  await Logging.logAudit(sql, correlationId, identity.profileId, 'MEMORY_ADMIN_PURGE', 'profile', target, 'success', { erased: outcome.erased, queued: outcome.queued });
  return {
    success: true, alpha: true, apiVersion: C.AGENTS.API_VERSION, erased: outcome.erased, queued: outcome.queued,
    message: outcome.erased ? 'Memória apagada.' : 'Apagamento enfileirado; o cron conclui em até 24 horas.',
  };
}

// ---------------------------------------------------------------------------
// apiAdminAgentsStats
// ---------------------------------------------------------------------------
function clampDays(raw) {
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, STATS_DAYS.MAX) : STATS_DAYS.DEFAULT;
}

async function traceAggregates(sql, days) {
  const [totals, byPersona, byOutcome, byDay] = await Promise.all([
    sql`SELECT count(*)::int AS calls, coalesce(sum(tokens_in), 0)::bigint AS tokens_in, coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
               count(*) FILTER (WHERE estimated)::int AS estimated_calls, count(*) FILTER (WHERE memory_used)::int AS memory_used_calls,
               coalesce(round(avg(latency_ms)), 0)::int AS avg_latency_ms,
               coalesce(round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)), 0)::int AS p95_latency_ms
        FROM agent_traces WHERE created_at >= now() - make_interval(days => ${days}::int)`,
    sql`SELECT persona, persona_version, count(*)::int AS calls, coalesce(sum(tokens_in), 0)::bigint AS tokens_in, coalesce(sum(tokens_out), 0)::bigint AS tokens_out
        FROM agent_traces WHERE created_at >= now() - make_interval(days => ${days}::int) GROUP BY persona, persona_version ORDER BY persona, persona_version`,
    sql`SELECT outcome, count(*)::int AS calls FROM agent_traces WHERE created_at >= now() - make_interval(days => ${days}::int) GROUP BY outcome ORDER BY outcome`,
    sql`SELECT (created_at AT TIME ZONE 'UTC')::date::text AS day, count(*)::int AS calls
        FROM agent_traces WHERE created_at >= now() - make_interval(days => ${days}::int) GROUP BY 1 ORDER BY 1`,
  ]);
  return { totals: totals[0], byPersona, byOutcome, byDay };
}

const EMPTY_TRACES = { totals: { calls: 0, tokens_in: 0, tokens_out: 0, estimated_calls: 0, memory_used_calls: 0, avg_latency_ms: 0, p95_latency_ms: 0 }, byPersona: [], byOutcome: [], byDay: [] };

/** Agregados dos agentes nos últimos N dias (padrão 30, teto 90). Sem texto do usuário, sem pessoa. */
export async function agentsStats(sql, identity, rawInput) {
  assertAdmin(identity);
  const days = clampDays(rawInput && rawInput.days);
  let agg;
  try {
    agg = await traceAggregates(sql, days);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    agg = EMPTY_TRACES;
  }
  const t = agg.totals;
  return {
    success: true, alpha: true, apiVersion: C.AGENTS.API_VERSION, days,
    totals: {
      calls: number(t.calls), tokensIn: number(t.tokens_in), tokensOut: number(t.tokens_out), estimatedCalls: number(t.estimated_calls),
      memoryUsedCalls: number(t.memory_used_calls), avgLatencyMs: number(t.avg_latency_ms), p95LatencyMs: number(t.p95_latency_ms),
    },
    byPersona: agg.byPersona.map((r) => ({ persona: r.persona, version: r.persona_version, calls: number(r.calls), tokensIn: number(r.tokens_in), tokensOut: number(r.tokens_out) })),
    byOutcome: agg.byOutcome.map((r) => ({ outcome: r.outcome, calls: number(r.calls) })),
    byDay: agg.byDay.map((r) => ({ day: r.day, calls: number(r.calls) })),
  };
}
