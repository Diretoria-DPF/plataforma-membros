/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * usageStatsService.js — painel de uso do admin (DAT-01; sql/040; docs/analytics-minimo.md).
 * Só leitura e só agregados: DAU/WAU/MAU (activity_days), retenção D1/D7/D30 por coorte semanal de cadastro, funil de
 * ativação e contadores por métrica (usage_daily). Tudo limitado por data (30 dias; coortes das últimas 8 semanas), então
 * nunca varre uma tabela inteira. Nada devolvido identifica uma pessoa.
 */
import * as S from '../security.js';
import { saoPauloDay } from '../analytics/usage.js';

const WINDOW_DAYS = 30;
const WAU_DAYS = 7;
const COHORT_WEEKS = 8;
/** Dias antes de hoje que a primeira coorte semanal pode começar (8 semanas, mais a folga até a segunda-feira). */
const COHORT_LOOKBACK_DAYS = COHORT_WEEKS * 7 - 1;
const RETENTION_OFFSETS = Object.freeze([1, 7, 30]);

const toInt = (value) => Number(value) || 0;

function dauSeries(sql, today) {
  return sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, count(*) AS n
    FROM activity_days
    WHERE day > ${today}::date - ${WINDOW_DAYS}::int AND day <= ${today}::date
    GROUP BY day ORDER BY day`;
}

function distinctActive(sql, today) {
  return sql`
    SELECT
      count(DISTINCT profile_id) FILTER (WHERE day > ${today}::date - ${WAU_DAYS}::int) AS wau,
      count(DISTINCT profile_id) AS mau
    FROM activity_days
    WHERE day > ${today}::date - ${WINDOW_DAYS}::int AND day <= ${today}::date`;
}

function counterTotals(sql, today) {
  return sql`
    SELECT metric, sum(n) AS n
    FROM usage_daily
    WHERE day > ${today}::date - ${WINDOW_DAYS}::int AND day <= ${today}::date
    GROUP BY metric ORDER BY metric`;
}

/** Por coorte semanal: tamanho e, para D1/D7/D30, quantas pessoas já podiam ser medidas e quantas voltaram NAQUELE dia. */
function weeklyRetention(sql, today) {
  return sql`
    WITH cohort AS (
      SELECT id, (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d0
      FROM profiles
      WHERE created_at >= (date_trunc('week', (${today}::date - ${COHORT_LOOKBACK_DAYS}::int)::timestamp) AT TIME ZONE 'America/Sao_Paulo')
    )
    SELECT to_char(date_trunc('week', c.d0::timestamp), 'YYYY-MM-DD') AS week, count(*) AS size,
      count(*) FILTER (WHERE c.d0 + 1 < ${today}::date) AS d1_eligible,
      count(*) FILTER (WHERE c.d0 + 1 < ${today}::date
        AND EXISTS (SELECT 1 FROM activity_days a WHERE a.profile_id = c.id AND a.day = c.d0 + 1)) AS d1_retained,
      count(*) FILTER (WHERE c.d0 + 7 < ${today}::date) AS d7_eligible,
      count(*) FILTER (WHERE c.d0 + 7 < ${today}::date
        AND EXISTS (SELECT 1 FROM activity_days a WHERE a.profile_id = c.id AND a.day = c.d0 + 7)) AS d7_retained,
      count(*) FILTER (WHERE c.d0 + 30 < ${today}::date) AS d30_eligible,
      count(*) FILTER (WHERE c.d0 + 30 < ${today}::date
        AND EXISTS (SELECT 1 FROM activity_days a WHERE a.profile_id = c.id AND a.day = c.d0 + 30)) AS d30_retained
    FROM cohort c
    GROUP BY 1 ORDER BY 1`;
}

/** Funil de quem se cadastrou nos últimos 30 dias: cadastro → e-mail confirmado → 1º simulado → voltou em D1/D7. */
function activationFunnel(sql, today) {
  return sql`
    WITH cohort AS (
      SELECT id, email_confirmed_at, (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d0
      FROM profiles
      WHERE created_at >= ((${today}::date - ${WINDOW_DAYS - 1}::int)::timestamp AT TIME ZONE 'America/Sao_Paulo')
    )
    SELECT count(*) AS signup,
      count(*) FILTER (WHERE email_confirmed_at IS NOT NULL) AS confirmed,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM learning_attempts l WHERE l.profile_id = c.id AND l.activity IN ('quiz_estudo', 'quiz_prova'))) AS first_quiz,
      count(*) FILTER (WHERE c.d0 + 1 < ${today}::date) AS d1_eligible,
      count(*) FILTER (WHERE c.d0 + 1 < ${today}::date
        AND EXISTS (SELECT 1 FROM activity_days a WHERE a.profile_id = c.id AND a.day = c.d0 + 1)) AS d1_retained,
      count(*) FILTER (WHERE c.d0 + 7 < ${today}::date) AS d7_eligible,
      count(*) FILTER (WHERE c.d0 + 7 < ${today}::date
        AND EXISTS (SELECT 1 FROM activity_days a WHERE a.profile_id = c.id AND a.day = c.d0 + 7)) AS d7_retained
    FROM cohort c`;
}

function shapeRetention(row) {
  const entry = { week: row.week, size: toInt(row.size) };
  for (const n of RETENTION_OFFSETS) {
    entry['d' + n] = { eligible: toInt(row['d' + n + '_eligible']), retained: toInt(row['d' + n + '_retained']) };
  }
  return entry;
}

function shapeFunnel(row) {
  const r = row || {};
  return {
    signup: toInt(r.signup),
    confirmed: toInt(r.confirmed),
    firstQuiz: toInt(r.first_quiz),
    returnedD1: { eligible: toInt(r.d1_eligible), retained: toInt(r.d1_retained) },
    returnedD7: { eligible: toInt(r.d7_eligible), retained: toInt(r.d7_retained) },
  };
}

/** apiAdminUsageStats — só admin (capacidade metrics.read). `now` é injetável para os testes. */
export async function usageStats(sql, identity, now) {
  S.requireCapability(identity, 'metrics.read');
  const today = saoPauloDay(now || new Date());

  const [dau, active, counters, retention, funnel] = await Promise.all([
    dauSeries(sql, today),
    distinctActive(sql, today),
    counterTotals(sql, today),
    weeklyRetention(sql, today),
    activationFunnel(sql, today),
  ]);

  const activeRow = (active && active[0]) || {};
  const counterMap = {};
  for (const row of counters || []) counterMap[row.metric] = toInt(row.n);

  return {
    success: true,
    today,
    windowDays: WINDOW_DAYS,
    dau: (dau || []).map((row) => ({ day: row.day, n: toInt(row.n) })),
    wau: toInt(activeRow.wau),
    mau: toInt(activeRow.mau),
    retention: (retention || []).map(shapeRetention),
    funnel: shapeFunnel(funnel && funnel[0]),
    counters: counterMap,
  };
}
