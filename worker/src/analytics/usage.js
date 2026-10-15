/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * analytics/usage.js — analytics de produto mínimo (DAT-01; docs/analytics-minimo.md; sql/040).
 *
 * Sem cookies, sem terceiros, sem texto de pessoa. Duas coisas e só:
 *  - recordActivity: "esta pessoa esteve ativa neste dia" (activity_days, no máximo 1 linha por pessoa/dia) e o
 *    contador `dau` (usage_daily) quando a linha é nova. Um cache em memória do isolate (pessoa + dia) faz com que a
 *    escrita aconteça, no máximo, uma vez por pessoa por dia por isolate: as demais requisições não tocam no banco.
 *  - bump: soma 1 num contador agregado (usage_daily) — signup, email_confirmed, quiz_completed, case_completed...
 *
 * Nada aqui pode derrubar ou atrasar a requisição: a escrita roda em segundo plano (env.waitUntil) e qualquer falha é
 * engolida, sem log (o erro do driver pode citar parâmetros). O "dia" é o dia civil de America/Sao_Paulo.
 */
import { runInBackground } from '../memory/background.js';

const TZ = 'America/Sao_Paulo';
/** Mesma regra do CHECK de usage_daily (sql/040). */
const METRIC_RE = /^[a-z0-9_.]{1,40}$/;
/** Teto de pessoas guardadas no cache do isolate (uma comunidade pequena nunca chega perto; evita crescer sem limite). */
const CACHE_MAX_ENTRIES = 5000;

export const METRICS = Object.freeze({
  SIGNUP: 'signup',
  EMAIL_CONFIRMED: 'email_confirmed',
  DAU: 'dau',
  QUIZ_COMPLETED: 'quiz_completed',
  CASE_COMPLETED: 'case_completed',
  LIA_MESSAGE: 'lia_message',
});

const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' do dia civil de São Paulo em que `now` cai. */
export function saoPauloDay(now) {
  return dayFormat.format(now instanceof Date ? now : new Date());
}

let cacheDay = '';
let cachedProfiles = new Set();

function cacheHas(day, profileId) {
  return cacheDay === day && cachedProfiles.has(profileId);
}

function cacheAdd(day, profileId) {
  // Virou o dia (ou encheu): recomeça. O cache vale até o fim do dia, que é quando a chave deixa de servir.
  if (cacheDay !== day) {
    cacheDay = day;
    cachedProfiles = new Set();
  }
  // Cheio: descarta só a entrada mais antiga (Set guarda a ordem de inserção), sem esvaziar o cache todo.
  if (cachedProfiles.size >= CACHE_MAX_ENTRIES) cachedProfiles.delete(cachedProfiles.values().next().value);
  cachedProfiles.add(profileId);
}

function cacheDrop(day, profileId) {
  if (cacheDay === day) cachedProfiles.delete(profileId);
}

/** Só para os testes: esvazia o cache do isolate. */
export function __resetUsageCacheForTests() {
  cacheDay = '';
  cachedProfiles = new Set();
}

/** Um único statement: grava o dia da pessoa e, se a linha é nova, soma 1 no `dau`. */
function writeActivity(sql, profileId, day) {
  return sql`
    WITH inserted AS (
      INSERT INTO activity_days (profile_id, day) VALUES (${profileId}::uuid, ${day}::date)
      ON CONFLICT DO NOTHING
      RETURNING 1
    )
    INSERT INTO usage_daily (day, metric, n)
    SELECT ${day}::date, ${METRICS.DAU}::text, 1 FROM inserted
    ON CONFLICT (day, metric) DO UPDATE SET n = usage_daily.n + 1`;
}

/**
 * Registra a atividade da pessoa no dia. Não bloqueia: com env.waitUntil a escrita continua depois da resposta; sem ele
 * (testes) devolve a promessa para o chamador aguardar. Nunca lança nem rejeita.
 * @returns {Promise<void>|undefined}
 */
export function recordActivity(sql, identity, now, env) {
  try {
    const profileId = identity && identity.profileId;
    if (!profileId || typeof sql !== 'function') return undefined;
    const day = saoPauloDay(now);
    if (cacheHas(day, profileId)) return undefined;
    cacheAdd(day, profileId);
    return runInBackground(env, async () => {
      try {
        await writeActivity(sql, profileId, day);
      } catch (err) {
        // Falhou: a próxima requisição tenta de novo. Sem log (nada de PII), a requisição já seguiu.
        cacheDrop(day, profileId);
      }
    });
  } catch (err) {
    return undefined;
  }
}

/**
 * Soma 1 no contador agregado `metric` do dia. Nome fora de [a-z0-9_.]{1,40} é recusado sem consultar o banco.
 * Nunca lança nem rejeita; devolve a promessa (ou undefined quando entregue ao waitUntil).
 * @returns {Promise<void>|undefined}
 */
export function bump(sql, metric, env, now) {
  try {
    if (typeof metric !== 'string' || !METRIC_RE.test(metric) || typeof sql !== 'function') return Promise.resolve();
    const day = saoPauloDay(now);
    return runInBackground(env, async () => {
      try {
        await sql`
          INSERT INTO usage_daily (day, metric, n) VALUES (${day}::date, ${metric}, 1)
          ON CONFLICT (day, metric) DO UPDATE SET n = usage_daily.n + 1`;
      } catch (err) {
        // Contador perdido é aceitável; derrubar a requisição, não.
      }
    });
  } catch (err) {
    return Promise.resolve();
  }
}
