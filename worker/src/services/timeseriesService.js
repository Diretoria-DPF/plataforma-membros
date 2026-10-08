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
 * (série sem buracos, pronta para o gráfico). Cada consulta lê só a janela pedida
 * (filtro de data). Resposta em cache privado de 300 s no KV, com profileId, range
 * e metric na chave (nunca compartilhada).
 * apiGetMyDashboardSeries: as 8 séries do Início em uma chamada (getMyDashboardSeries),
 * com um único pacote em cache por pessoa (chave com profileId).
 */
import * as C from '../constants.js';
import * as E from '../errors.js';
import { getCached, setCached } from '../cache.js';
import * as Logging from '../logging.js';

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

/**
 * Uma série, lendo só a janela pedida: de `starts_at` (00:00 de Brasília do primeiro
 * bucket) até `ends_at` (fim do bucket corrente). Linha fora dessa faixa nunca cai
 * num bucket da saída: o resultado é o mesmo de antes, sem varrer o histórico inteiro.
 */
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
    ), window_utc AS (
      SELECT first_bucket AT TIME ZONE ${TZ} AS starts_at,
             (current_bucket + ${bucket.step}::interval) AT TIME ZONE ${TZ} AS ends_at
      FROM span
    ), events_in AS (
      SELECT date_trunc(${bucket.trunc}::text, e.registered_at AT TIME ZONE ${TZ}) AS d, 1 AS amount
      FROM event_registrations e, window_utc w
      WHERE ${useEvents}::boolean AND e.profile_id = ${profileId}::uuid
        AND e.registered_at >= w.starts_at AND e.registered_at < w.ends_at
    ), learning_in AS (
      SELECT date_trunc(${bucket.trunc}::text, a.created_at AT TIME ZONE ${TZ}) AS d,
             CASE WHEN ${isHours}::boolean THEN COALESCE(a.duration_seconds, 0) ELSE 1 END AS amount
      FROM learning_attempts a, window_utc w
      WHERE ${useLearning}::boolean AND a.profile_id = ${profileId}::uuid
        AND a.created_at >= w.starts_at AND a.created_at < w.ends_at
    ), tasks_in AS (
      SELECT date_trunc(${bucket.trunc}::text, t.completed_at AT TIME ZONE ${TZ}) AS d, 1 AS amount
      FROM task_signups t, window_utc w
      WHERE ${useTasks}::boolean AND t.profile_id = ${profileId}::uuid AND t.completed_at IS NOT NULL
        AND t.completed_at >= w.starts_at AND t.completed_at < w.ends_at
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

/** Uma série sem cache: a mesma consulta para getMyTimeseries e para o pacote do Início. */
async function computeSeries(sql, identity, range, metric) {
  const spec = C.TIMESERIES.RANGES[range];
  const series = await query(sql, identity.profileId, spec, metric);
  return { range, granularity: spec.granularity, series };
}

/** apiGetMyTimeseries: `date` é o dia (day), a segunda-feira (week) ou o dia 1 do mês (month). */
export async function getMyTimeseries(sql, env, identity, input) {
  const { range, metric } = parseInput(input);
  const key = cacheKey(identity.profileId, range, metric);
  const cached = await getCached(env, key);
  if (cached) return cached;

  const result = { success: true, ...(await computeSeries(sql, identity, range, metric)) };
  await setCached(env, key, result, C.TIMESERIES.CACHE_TTL_SECONDS);
  return result;
}

// Séries do Início que apiGetMyDashboardSeries devolve juntas. `key` é o nome no
// objeto de resposta. Mesma consulta de getMyTimeseries, sem o cache por série:
// o pacote inteiro tem uma chave só (dashboardCacheKey).
export const DASHBOARD_SERIES = [
  { key: 'activity30d', metric: 'activity', range: '30d' },
  { key: 'events30d', metric: 'events', range: '30d' },
  { key: 'learning30d', metric: 'learning', range: '30d' },
  { key: 'tasks30d', metric: 'tasks', range: '30d' },
  { key: 'studyHours30d', metric: 'study_hours', range: '30d' },
  { key: 'events6m', metric: 'events', range: '6m' },
  { key: 'learning6m', metric: 'learning', range: '6m' },
  { key: 'tasks6m', metric: 'tasks', range: '6m' },
];

/** Entrada opcional e sem parâmetros: aceita ausência ou um objeto; o resto é recusado. */
function parseDashboardInput(input) {
  if (input === undefined || input === null) return;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw E.ValidationError('Entrada inválida para as séries do Início.');
  }
}

/** Chave privada do pacote do Início: uma por pessoa, com o mesmo TTL das séries. */
function dashboardCacheKey(profileId) {
  return 'cache:dashboard-series:v1:' + profileId;
}

/** Uma série isolada: falha vira null, é registrada e não derruba as outras. */
async function loadDashboardSeries(sql, identity, spec, cid) {
  try {
    const res = await computeSeries(sql, identity, spec.range, spec.metric);
    return res;
  } catch (err) {
    await Logging.logError(sql, cid, 'DASHBOARD_SERIES_FAILED', String((err && err.message) || err), { metric: spec.metric, range: spec.range });
    return null;
  }
}

/**
 * apiGetMyDashboardSeries: as 8 séries do Início em uma chamada.
 * Hit: devolve o pacote do KV sem consultar o banco. Miss: consulta em paralelo
 * (falha isolada vira null) e grava o pacote UMA vez, e só se nenhuma série falhou
 * (pacote incompleto não é cacheado: a próxima chamada tenta de novo).
 * series[key] tem o formato de getMyTimeseries (sem `success`), ou null se falhou.
 */
export async function getMyDashboardSeries(sql, env, identity, input, cid) {
  parseDashboardInput(input);
  const key = dashboardCacheKey(identity.profileId);
  const cached = await getCached(env, key);
  if (cached) return cached;

  const loaded = await Promise.all(DASHBOARD_SERIES.map((spec) => loadDashboardSeries(sql, identity, spec, cid)));
  const series = Object.fromEntries(DASHBOARD_SERIES.map((spec, i) => [spec.key, loaded[i]]));
  const result = { success: true, series };
  if (loaded.every((item) => item !== null)) await setCached(env, key, result, C.TIMESERIES.CACHE_TTL_SECONDS);
  return result;
}
