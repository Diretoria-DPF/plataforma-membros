/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * timeseriesService.js
 * apiGetMyTimeseries: série temporal da PRÓPRIA atividade da pessoa para os
 * gráficos do Início. Só agrega tabelas existentes (sem migração):
 *   events    -> event_registrations.registered_at
 *   learning  -> learning_attempts.created_at
 *   tasks     -> task_signups.completed_at (tarefas concluídas)
 *   activity  -> soma das três
 * Dias e semanas no horário de Brasília; pontos sem atividade vêm com valor 0
 * (série sem buracos, pronta para o gráfico). Resposta em cache privado de
 * 300 s no KV, com o profileId na chave (nunca compartilhada entre pessoas).
 */
import * as C from '../constants.js';
import * as E from '../errors.js';
import { getCached, setCached } from '../cache.js';

const TZ = 'America/Sao_Paulo';

function cacheKey(profileId, range, metric) {
  return 'cache:timeseries:v1:' + profileId + ':' + range + ':' + metric;
}

function parseInput(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const range = raw.range === undefined || raw.range === null ? C.TIMESERIES.DEFAULT_RANGE : raw.range;
  if (typeof range !== 'string' || !Object.prototype.hasOwnProperty.call(C.TIMESERIES.RANGES, range)) {
    throw E.ValidationError('Período inválido. Use 30d, 90d ou 12m.');
  }
  const metric = raw.metric === undefined || raw.metric === null ? C.TIMESERIES.DEFAULT_METRIC : raw.metric;
  if (typeof metric !== 'string' || C.TIMESERIES.METRICS.indexOf(metric) === -1) {
    throw E.ValidationError('Métrica inválida. Use ' + C.TIMESERIES.METRICS.join(', ') + '.');
  }
  return { range, metric };
}

async function query(sql, profileId, spec, metric) {
  const granularity = spec.granularity;
  const useEvents = metric === 'activity' || metric === 'events';
  const useLearning = metric === 'activity' || metric === 'learning';
  const useTasks = metric === 'activity' || metric === 'tasks';
  const rows = granularity === 'day'
    ? await sql`
      WITH bounds AS (
        SELECT date_trunc('day', now() AT TIME ZONE ${TZ}) AS today
      ), span AS (
        SELECT today - make_interval(days => ${spec.days - 1}) AS first_day, today FROM bounds
      ), events_in AS (
        SELECT date_trunc('day', registered_at AT TIME ZONE ${TZ}) AS d FROM event_registrations
        WHERE ${useEvents}::boolean AND profile_id = ${profileId}::uuid
      ), learning_in AS (
        SELECT date_trunc('day', created_at AT TIME ZONE ${TZ}) AS d FROM learning_attempts
        WHERE ${useLearning}::boolean AND profile_id = ${profileId}::uuid
      ), tasks_in AS (
        SELECT date_trunc('day', completed_at AT TIME ZONE ${TZ}) AS d FROM task_signups
        WHERE ${useTasks}::boolean AND profile_id = ${profileId}::uuid AND completed_at IS NOT NULL
      ), hits AS (
        SELECT d, count(*) AS n FROM (
          SELECT d FROM events_in UNION ALL SELECT d FROM learning_in UNION ALL SELECT d FROM tasks_in
        ) all_hits GROUP BY d
      )
      SELECT to_char(g.d, 'YYYY-MM-DD') AS date, COALESCE(h.n, 0)::int AS value
      FROM span, generate_series(span.first_day, span.today, interval '1 day') AS g(d)
      LEFT JOIN hits h ON h.d = g.d
      ORDER BY g.d`
    : await sql`
      WITH bounds AS (
        SELECT date_trunc('week', now() AT TIME ZONE ${TZ}) AS this_week
      ), span AS (
        SELECT this_week - make_interval(weeks => ${spec.weeks - 1}) AS first_week, this_week FROM bounds
      ), events_in AS (
        SELECT date_trunc('week', registered_at AT TIME ZONE ${TZ}) AS d FROM event_registrations
        WHERE ${useEvents}::boolean AND profile_id = ${profileId}::uuid
      ), learning_in AS (
        SELECT date_trunc('week', created_at AT TIME ZONE ${TZ}) AS d FROM learning_attempts
        WHERE ${useLearning}::boolean AND profile_id = ${profileId}::uuid
      ), tasks_in AS (
        SELECT date_trunc('week', completed_at AT TIME ZONE ${TZ}) AS d FROM task_signups
        WHERE ${useTasks}::boolean AND profile_id = ${profileId}::uuid AND completed_at IS NOT NULL
      ), hits AS (
        SELECT d, count(*) AS n FROM (
          SELECT d FROM events_in UNION ALL SELECT d FROM learning_in UNION ALL SELECT d FROM tasks_in
        ) all_hits GROUP BY d
      )
      SELECT to_char(g.d, 'YYYY-MM-DD') AS date, COALESCE(h.n, 0)::int AS value
      FROM span, generate_series(span.first_week, span.this_week, interval '1 week') AS g(d)
      LEFT JOIN hits h ON h.d = g.d
      ORDER BY g.d`;
  return rows.map((r) => ({ date: r.date, value: Number(r.value) }));
}

/** apiGetMyTimeseries: `date` é o dia (granularity day) ou a segunda-feira da semana (week). */
export async function getMyTimeseries(sql, env, identity, input) {
  const { range, metric } = parseInput(input);
  const key = cacheKey(identity.profileId, range, metric);
  const cached = await getCached(env, key);
  if (cached) return cached;

  const spec = C.TIMESERIES.RANGES[range];
  const series = await query(sql, identity.profileId, spec, metric);
  const result = { success: true, range, granularity: spec.granularity, series };
  await setCached(env, key, result, C.TIMESERIES.CACHE_TTL_SECONDS);
  return result;
}
