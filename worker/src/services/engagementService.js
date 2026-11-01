/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * engagementService.js — retorno pessoal à plataforma (ENG-01, ENG-02, ENG-03).
 *
 * Tudo é PESSOAL e calculado aqui, a partir de learning_attempts da própria
 * sessão: sequência de dias (streak), meta diária de questões, se o quiz do
 * dia já foi feito e a última atividade (para "Continuar de onde parou").
 * Não existe ranking nem comparação entre pessoas. O "dia" é sempre o de
 * America/Sao_Paulo, para o membro não perder a sequência por causa do UTC.
 * Documentação: docs/engajamento.md.
 */
import * as C from '../constants.js';
import * as E from '../errors.js';

export const TIME_ZONE = 'America/Sao_Paulo';
export const GOAL_OPTIONS = [5, 10, 20];
export const DEFAULT_GOAL = 10;
/** Marca que o quiz diário grava em details.topics para ser reconhecido no mesmo dia. */
export const DAILY_QUIZ_TOPIC = 'Quiz diário';

const HISTORY_DAYS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;
const KNOWN_ACTIVITIES = ['quiz_estudo', 'quiz_prova', 'caso_clinico', 'formulacao', 'simulacao_pk'];
const MISSING_COLUMN = '42703';

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "AAAA-MM-DD" do instante, no fuso de São Paulo. */
export function saoPauloDateKey(date) {
  return dayFormat.format(date);
}

function dayNumber(key) {
  return Math.round(Date.parse(key + 'T00:00:00Z') / DAY_MS);
}

/**
 * Sequência de dias com ao menos uma atividade. `days` são chaves AAAA-MM-DD
 * (qualquer ordem). A sequência continua viva até o fim do dia seguinte ao
 * último: quem ainda não estudou hoje mantém a de ontem, sem cobrança.
 */
export function computeStreak(days, todayKey) {
  const numbers = Array.from(new Set(days.map(dayNumber))).sort((a, b) => b - a);
  const set = new Set(numbers);
  const today = dayNumber(todayKey);
  const activeToday = set.has(today);
  let cursor = activeToday ? today : today - 1;
  let current = 0;
  while (set.has(cursor)) { current += 1; cursor -= 1; }

  let best = 0;
  let run = 0;
  let previous = null;
  numbers.forEach((n) => {
    run = previous !== null && previous - n === 1 ? run + 1 : 1;
    previous = n;
    if (run > best) best = run;
  });
  return { current, best, activeToday };
}

function isMissingColumn(err) {
  return !!err && (err.code === MISSING_COLUMN || /daily_goal/.test(String(err.message || '')));
}

async function readGoal(sql, identity) {
  try {
    const rows = await sql`SELECT daily_goal FROM preferences WHERE profile_id = ${identity.profileId}::uuid`;
    const value = rows[0] ? Number(rows[0].daily_goal) : NaN;
    if (GOAL_OPTIONS.indexOf(value) !== -1) return { target: value, persisted: true };
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
  }
  return { target: DEFAULT_GOAL, persisted: false };
}

function lastActivity(rows) {
  const row = rows[0];
  if (!row || C.LEARNING_MODULES.indexOf(row.module) === -1 || KNOWN_ACTIVITIES.indexOf(row.activity) === -1) return null;
  const at = new Date(row.created_at);
  return { module: row.module, activity: row.activity, at: isNaN(at.getTime()) ? null : at.toISOString() };
}

/** apiLearnGetEngagement — sequência, meta do dia, quiz do dia e última atividade da PRÓPRIA sessão. */
export async function getEngagement(sql, identity, now = new Date()) {
  const profileId = identity.profileId;
  const [dayRows, todayRows, lastRows] = await Promise.all([
    sql`
      SELECT DISTINCT to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day
      FROM learning_attempts
      WHERE profile_id = ${profileId}::uuid AND created_at > now() - make_interval(days => ${HISTORY_DAYS})
      ORDER BY day DESC
    `,
    sql`
      SELECT COALESCE(sum(max_score) FILTER (WHERE activity IN ('quiz_estudo', 'quiz_prova')), 0)::int AS questions_today,
             COALESCE(bool_or(details @> ${JSON.stringify({ topics: [DAILY_QUIZ_TOPIC] })}::jsonb), false) AS daily_quiz_done
      FROM learning_attempts
      WHERE profile_id = ${profileId}::uuid
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
    `,
    sql`
      SELECT module, activity, created_at FROM learning_attempts
      WHERE profile_id = ${profileId}::uuid ORDER BY created_at DESC LIMIT 1
    `,
  ]);
  const goal = await readGoal(sql, identity);

  const today = saoPauloDateKey(now);
  const questionsToday = Number(todayRows[0] && todayRows[0].questions_today) || 0;
  return {
    success: true,
    engagement: {
      today,
      streak: computeStreak(dayRows.map((r) => r.day), today),
      goal: { target: goal.target, todayQuestions: questionsToday, reached: questionsToday >= goal.target, persisted: goal.persisted },
      dailyQuizDone: !!(todayRows[0] && todayRows[0].daily_quiz_done),
      last: lastActivity(lastRows),
    },
  };
}

/** apiLearnSetDailyGoal — 5, 10 ou 20 questões por dia. Sem a coluna (migração 047), avisa que fica só no aparelho. */
export async function setDailyGoal(sql, identity, input) {
  const goal = input && input.goal;
  if (GOAL_OPTIONS.indexOf(goal) === -1) throw E.ValidationError('Meta diária inválida.');
  try {
    await sql`
      INSERT INTO preferences (profile_id, daily_goal) VALUES (${identity.profileId}::uuid, ${goal})
      ON CONFLICT (profile_id) DO UPDATE SET daily_goal = EXCLUDED.daily_goal, updated_at = now()
      RETURNING daily_goal
    `;
  } catch (err) {
    if (!isMissingColumn(err)) throw err;
    return { success: false, localOnly: true, goal, message: 'A meta fica salva só neste aparelho por enquanto.' };
  }
  return { success: true, goal };
}
