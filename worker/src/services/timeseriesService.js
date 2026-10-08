/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * timeseriesService.js
 * apiGetMyTimeseries: série temporal da PRÓPRIA atividade da pessoa para os
 * gráficos do Início. Só agrega tabelas existentes (sem migração):
 *   events      -> event_registrations.registered_at (contagem)
 *   learning    -> learning_attempts.created_at (contagem)
 *   tasks       -> task_signups.completed_at (tarefas concluídas, contagem)
 *   activity    -> soma das três contagens
 *   study_hours -> soma de learning_attempts.duration_seconds, em horas (2 casas)
 * Ranges: 30d/90d (diário), 12m (semanal), 6m (mensal, 6 meses incluindo o corrente).
 * Dias, semanas e meses no horário de Brasília; buckets sem atividade vêm com 0
 * (série sem buracos, pronta para o gráfico). Resposta em cache privado de
 * 300 s no KV, com profileId, range e metric na chave (nunca compartilhada).
 */
import * as C from '../constants.js';
import * as E from '../errors.js';
import { getCached, setCached } from '../cache.js';

const TZ = 'America/Sao_Paulo';
const HOUR_SECONDS = 3600;
const HOURS_DECIMALS = 100;

// Truncamento e passo de cada granularidade. Literais fixos: nunca vêm do cliente.
const BUCKETS = {
  day: { trunc: 'day', step: '1 day' },
  week: { trunc: 'week', step: '1 week' },
  month: { trunc: 'month', step: '1 month' },
};

function cacheKey(profileId, range, metric) {
  return 'cache:timeseries:v1:' + profileId + ':' + range + ':' + metric;
}

function parseInput(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const range = raw.range === undefined || raw.range === null ? C.TIMESERIES.DEFAULT_RANGE : raw.range;
  if (typeof range !== 'string' || !Object.prototype.hasOwnProperty.call(C.TIMESERIES.RANGES, range)) {
    throw E.ValidationError('Período inválido. Use 30d, 90d, 6m ou 12m.');
  }
  const metric = raw.metric === undefined || raw.metric === null ? C.TIMESERIES.DEFAULT_METRIC : raw.metric;
  if (typeof metric !== 'string' || C.TIMESERIES.METRICS.indexOf(metric) === -1) {
    throw E.ValidationError('Métrica inválida. Use ' + C.TIMESERIES.METRICS.join(', ') + '.');
  }
  return { range, metric };
}

/** Segundos -> horas com 2 casas; contagens seguem inteiras. */
function toValue(raw, metric) {
  const n = Number(raw);
  if (metric !== 'study_hours') return n;
  return Math.round((n / HOUR_SECONDS) * HOURS_DECIMALS) / HOURS_DECIMALS;
}

async function query(sql, profileId, spec, metric) {
  const bucket = BUCKETS[spec.granularity];
  const useEvents = metric === 'activity' || metric === 'events';
  const useLearning = metric === 'activity' || metric === 'learning' || metric === 'study_hours';
  const useTasks = metric === 'activity' || metric === 'tasks';
  const isHours = metric === 'study_hours';
  const rows = await sql`
    WITH bounds AS (
      SELECT date_trunc(${bucket.trunc}::text, now() AT TIME ZONE ${TZ}) AS current_bucket
    ), span AS (
      SELECT current_bucket - (${bucket.step}::interval * ${spec.count - 1}) AS first_bucket, current_bucket FROM bounds
    ), events_in AS (
      SELECT date_trunc(${bucket.trunc}::text, registered_at AT TIME ZONE ${TZ}) AS d, 1 AS amount
      FROM event_registrations
      WHERE ${useEvents}::boolean AND profile_id = ${profileId}::uuid
    ), learning_in AS (
      SELECT date_trunc(${bucket.trunc}::text, created_at AT TIME ZONE ${TZ}) AS d,
             CASE WHEN ${isHours}::boolean THEN COALESCE(duration_seconds, 0) ELSE 1 END AS amount
      FROM learning_attempts
      WHERE ${useLearning}::boolean AND profile_id = ${profileId}::uuid
    ), tasks_in AS (
      SELECT date_trunc(${bucket.trunc}::text, completed_at AT TIME ZONE ${TZ}) AS d, 1 AS amount
      FROM task_signups
      WHERE ${useTasks}::boolean AND profile_id = ${profileId}::uuid AND completed_at IS NOT NULL
    ), hits AS (
      SELECT d, SUM(amount) AS total FROM (
        SELECT d, amount FROM events_in
        UNION ALL SELECT d, amount FROM learning_in
        UNION ALL SELECT d, amount FROM tasks_in
      ) all_hits GROUP BY d
    )
    SELECT to_char(g.d, 'YYYY-MM-DD') AS date, COALESCE(h.total, 0) AS value
    FROM span, generate_series(span.first_bucket, span.current_bucket, ${bucket.step}::interval) AS g(d)
    LEFT JOIN hits h ON h.d = g.d
    ORDER BY g.d`;
  return rows.map((r) => ({ date: r.date, value: toValue(r.value, metric) }));
}

/** apiGetMyTimeseries: `date` é o dia (day), a segunda-feira (week) ou o dia 1 do mês (month). */
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
