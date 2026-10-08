/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as C from '../src/constants.js';
import { getMyTimeseries, getMyDashboardSeries, DASHBOARD_SERIES } from '../src/services/timeseriesService.js';
import { makeEnv } from './helpers/mockEnv.js';
import { memoryKv } from './helpers/aiTestUtils.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const TZ = 'America/Sao_Paulo';
let db;
let sql;
let me;
let other;
let estudo;
let vazio;
const ids = {};

async function profile(email) {
  const res = await db.query(
    "INSERT INTO profiles (full_name, email, password_hash, phone, role, username, email_confirmed_at) VALUES ('Pessoa Teste', $1, 'x', '11999999999', 'member', $2, now()) RETURNING id", [email, 'user_' + email.split('@')[0]]);
  return res.rows[0].id;
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  me = await profile('eu@exemplo.com');
  other = await profile('outra@exemplo.com');
  estudo = await profile('estudo@exemplo.com');
  vazio = await profile('vazio@exemplo.com');
  ids.event = (await db.query("INSERT INTO events (title, description, event_date, status) VALUES ('Evento teste', 'descricao', now(), 'published') RETURNING id")).rows[0].id;
  ids.task = (await db.query("INSERT INTO tasks (title, description, status) VALUES ('Tarefa teste', 'descricao', 'published') RETURNING id").catch(async () => ({ rows: [{ id: null }] }))).rows[0].id;
  // Eu: 2 inscrições em evento há 2 dias, 1 tentativa de quiz há 1 dia, 1 tarefa concluída há 3 dias.
  await db.query("INSERT INTO event_registrations (event_id, profile_id, registered_at) VALUES ($1, $2, now() - interval '2 days')", [ids.event, me]);
  await db.query("INSERT INTO event_registrations (event_id, profile_id, registered_at) VALUES ($1, $2, now() - interval '200 days')", [ids.event, other]);
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity, score, max_score) VALUES ($1, 'farmacologia', 'quiz_estudo', 5, 10)", [me]);
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity, created_at) VALUES ($1, 'toxicologia', 'quiz_estudo', now() - interval '60 days')", [me]);
  if (ids.task) {
    await db.query("INSERT INTO task_signups (task_id, profile_id, completed_at) VALUES ($1, $2, now() - interval '3 days')", [ids.task, me]);
  }
  // Estudo: 5400 s + 1800 s + 1000 s agora (= 2,2777 h -> 2,28) e uma tentativa sem duração (0 h).
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity, duration_seconds) VALUES ($1, 'farmacologia', 'quiz_estudo', 5400)", [estudo]);
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity, duration_seconds) VALUES ($1, 'farmacologia', 'quiz_estudo', 1800)", [estudo]);
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity, duration_seconds) VALUES ($1, 'farmacologia', 'quiz_estudo', 1000)", [estudo]);
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity) VALUES ($1, 'farmacologia', 'quiz_estudo')", [estudo]);
  // Atividade de outra pessoa nunca entra na minha série (inclusive as horas de estudo: 10 h agora).
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity, duration_seconds) VALUES ($1, 'farmacologia', 'quiz_estudo', 36000)", [other]);
}, 120000);
afterAll(async () => { if (db) await db.close(); });

const identity = (profileId = me) => ({ profileId, role: 'member' });
const total = (res) => res.series.reduce((acc, p) => acc + p.value, 0);

describe('apiGetMyTimeseries — contrato por range', () => {
  test('30d (padrão): 30 pontos diários, ascendentes, sem buracos', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(), {});
    expect(res).toMatchObject({ success: true, range: '30d', granularity: 'day' });
    expect(res.series).toHaveLength(30);
    expect(res.series[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const dates = res.series.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(30);
    expect(res.series.every((p) => Number.isInteger(p.value) && p.value >= 0)).toBe(true);
    expect(total(res)).toBeGreaterThanOrEqual(2); // evento + quiz (+ tarefa quando existe)
  });

  test('90d: 90 pontos diários e inclui a atividade de 60 dias atrás', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(), { range: '90d' });
    expect(res).toMatchObject({ range: '90d', granularity: 'day' });
    expect(res.series).toHaveLength(90);
    const r30 = await getMyTimeseries(sql, makeEnv(), identity(), { range: '30d' });
    expect(total(res)).toBe(total(r30) + 1);
  });

  test('12m: pontos semanais (52)', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(), { range: '12m' });
    expect(res).toMatchObject({ range: '12m', granularity: 'week' });
    expect(res.series).toHaveLength(52);
  });

  test('metric filtra a fonte; atividade de outra pessoa não conta', async () => {
    const events = await getMyTimeseries(sql, makeEnv(), identity(), { range: '12m', metric: 'events' });
    expect(total(events)).toBe(1); // a inscrição de 200 dias é da outra pessoa
    const learning = await getMyTimeseries(sql, makeEnv(), identity(), { range: '90d', metric: 'learning' });
    expect(total(learning)).toBe(2);
  });

  test.each([['7d'], ['1y'], [''], [30], [{}], ['30D'], ['6M']])('range inválido %p: erro de validação (400)', async (range) => {
    await expect(getMyTimeseries(sql, makeEnv(), identity(), { range })).rejects.toMatchObject({ name: 'ValidationError', expected: true });
  });

  test.each([['senhas'], ['Study_hours'], ['duration_seconds'], [''], [7]])('metric inválida %p: erro de validação', async (metric) => {
    await expect(getMyTimeseries(sql, makeEnv(), identity(), { metric })).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('apiGetMyTimeseries — range 6m (mensal)', () => {
  test('6 pontos mensais, ascendentes, com o mês corrente (Brasília) por último', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(), { range: '6m' });
    expect(res).toMatchObject({ success: true, range: '6m', granularity: 'month' });
    expect(res.series).toHaveLength(6);
    expect(res.series.every((p) => /^\d{4}-\d{2}-01$/.test(p.date))).toBe(true);
    const dates = res.series.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
    expect(new Set(dates).size).toBe(6);
    const { rows } = await db.query("SELECT to_char(date_trunc('month', now() AT TIME ZONE $1), 'YYYY-MM-DD') AS d", [TZ]);
    expect(dates[5]).toBe(rows[0].d);
  });

  test('meses sem atividade vêm com 0 (pessoa sem nenhum registro)', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(vazio), { range: '6m', metric: 'activity' });
    expect(res.series).toHaveLength(6);
    expect(res.series.every((p) => p.value === 0)).toBe(true);
  });

  test('inscrição própria entra na série mensal; a de outra pessoa (200 dias) não', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(), { range: '6m', metric: 'events' });
    expect(total(res)).toBe(1);
  });
});

describe('apiGetMyTimeseries — métrica study_hours', () => {
  test('soma duration_seconds por bucket e converte em horas com 2 casas (8200 s -> 2,28 h)', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(estudo), { range: '6m', metric: 'study_hours' });
    expect(res.series).toHaveLength(6);
    expect(res.series[5].value).toBe(2.28);
    expect(res.series.slice(0, 5).every((p) => p.value === 0)).toBe(true);
    expect(typeof res.series[5].value).toBe('number');
  });

  test('a mesma soma aparece na série de 12m (semanal)', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(estudo), { range: '12m', metric: 'study_hours' });
    expect(total(res)).toBeCloseTo(2.28, 2);
  });

  test('tentativa sem duração conta 0 h; pessoa sem duração registrada vê 0', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(me), { range: '6m', metric: 'study_hours' });
    expect(total(res)).toBe(0);
  });

  test('horas de outra pessoa (10 h) nunca aparecem para mim nem para estudo', async () => {
    const mine = await getMyTimeseries(sql, makeEnv(), identity(me), { range: '6m', metric: 'study_hours' });
    const theirs = await getMyTimeseries(sql, makeEnv(), identity(estudo), { range: '6m', metric: 'study_hours' });
    expect(total(mine)).toBe(0);
    expect(total(theirs)).toBeCloseTo(2.28, 2);
  });
});

describe('apiGetMyTimeseries — cache privado', () => {
  test('a segunda chamada não consulta o banco', async () => {
    const kv = memoryKv();
    const env = makeEnv({ HOT_CACHE: kv });
    const spy = jest.fn(sql);
    const a = await getMyTimeseries(spy, env, identity(), { range: '30d' });
    const calls = spy.mock.calls.length;
    const b = await getMyTimeseries(spy, env, identity(), { range: '30d' });
    expect(b).toEqual(a);
    expect(spy.mock.calls.length).toBe(calls);
    const keys = [...kv.store.keys()];
    expect(keys.every((k) => k.includes(me))).toBe(true);
  });

  test('a chave inclui range e metric: combinações não se misturam', async () => {
    const kv = memoryKv();
    const env = makeEnv({ HOT_CACHE: kv });
    const hours = await getMyTimeseries(sql, env, identity(estudo), { range: '6m', metric: 'study_hours' });
    const days = await getMyTimeseries(sql, env, identity(estudo), { range: '30d', metric: 'activity' });
    expect(hours.granularity).toBe('month');
    expect(days.granularity).toBe('day');
    const keys = [...kv.store.keys()];
    expect(keys).toHaveLength(2);
    expect(keys.some((k) => k.endsWith(':6m:study_hours'))).toBe(true);
    expect(keys.some((k) => k.endsWith(':30d:activity'))).toBe(true);
    expect(keys.every((k) => k.includes(estudo))).toBe(true);
  });
});

// Falha simulada numa só série: a consulta de eventos dos últimos 6 meses (só events e passo mensal).
function failingSql(target) {
  return (strings, ...values) => {
    const flags = values.filter((v) => typeof v === 'boolean').join(',');
    if (flags === 'true,false,false,false' && values.includes('1 month')) return Promise.reject(new Error('falha simulada'));
    return target(strings, ...values);
  };
}

const CID = '00000000-0000-4000-8000-0000000000aa';
const KEYS = DASHBOARD_SERIES.map((spec) => spec.key);

describe('apiGetMyDashboardSeries — as 8 séries do Início', () => {
  test('devolve as 8 séries no formato de getMyTimeseries (success só no envelope)', async () => {
    const res = await getMyDashboardSeries(sql, makeEnv(), identity(), {}, CID);
    expect(res.success).toBe(true);
    expect(Object.keys(res.series).sort()).toEqual([...KEYS].sort());
    KEYS.forEach((key) => expect(Object.keys(res.series[key]).sort()).toEqual(['granularity', 'range', 'series']));
    expect(res.series.activity30d).toMatchObject({ range: '30d', granularity: 'day' });
    expect(res.series.activity30d.series).toHaveLength(30);
    expect(res.series.events6m).toMatchObject({ range: '6m', granularity: 'month' });
    expect(res.series.events6m.series).toHaveLength(6);
    expect(res.series.studyHours30d.series.every((p) => typeof p.value === 'number')).toBe(true);
  });

  test('cada série é igual à resposta de apiGetMyTimeseries para o mesmo período e métrica', async () => {
    const res = await getMyDashboardSeries(sql, makeEnv(), identity(estudo), {}, CID);
    for (const spec of DASHBOARD_SERIES) {
      const single = await getMyTimeseries(sql, makeEnv(), identity(estudo), { range: spec.range, metric: spec.metric });
      expect(res.series[spec.key]).toEqual({ range: single.range, granularity: single.granularity, series: single.series });
    }
  });

  test('isolamento de perfil: só a atividade da própria pessoa entra em cada série', async () => {
    const mine = await getMyDashboardSeries(sql, makeEnv(), identity(me), {}, CID);
    expect(total(mine.series.events30d)).toBe(1);
    expect(total(mine.series.events6m)).toBe(1);
    expect(total(mine.series.studyHours30d)).toBe(0);
    const theirs = await getMyDashboardSeries(sql, makeEnv(), identity(estudo), {}, CID);
    expect(total(theirs.series.studyHours30d)).toBeCloseTo(2.28, 2);
    expect(total(theirs.series.events30d)).toBe(0);
    const empty = await getMyDashboardSeries(sql, makeEnv(), identity(vazio), {}, CID);
    expect(KEYS.every((key) => total(empty.series[key]) === 0)).toBe(true);
  });

  test('falha isolada: a série que falha vira null, as outras seguem intactas e a falha é registrada', async () => {
    const env = makeEnv();
    const ok = await getMyDashboardSeries(sql, env, identity(), {}, CID);
    const res = await getMyDashboardSeries(failingSql(sql), env, identity(), {}, CID);
    expect(res.success).toBe(true);
    expect(res.series.events6m).toBeNull();
    KEYS.filter((key) => key !== 'events6m').forEach((key) => expect(res.series[key]).toEqual(ok.series[key]));
    const logged = await db.query("SELECT code, context FROM error_logs WHERE code = 'DASHBOARD_SERIES_FAILED'");
    expect(logged.rows.length).toBeGreaterThanOrEqual(1);
    expect(logged.rows[0].context).toEqual({ metric: 'events', range: '6m' });
  });

  test('cache do pacote: miss consulta as 8 séries e grava UMA chave privada; hit não consulta o banco', async () => {
    const kv = memoryKv();
    const env = makeEnv({ HOT_CACHE: kv });
    const spy = jest.fn(sql);
    const a = await getMyDashboardSeries(spy, env, identity(), {}, CID);
    expect(spy.mock.calls.length).toBe(KEYS.length);
    expect(kv.put).toHaveBeenCalledTimes(1);
    const keys = [...kv.store.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toContain(me);
    const b = await getMyDashboardSeries(spy, env, identity(), {}, CID);
    expect(b).toEqual(a);
    expect(spy.mock.calls.length).toBe(KEYS.length);
    expect(kv.put).toHaveBeenCalledTimes(1);
  });

  test('cache do pacote: com uma série falha nada é gravado; a chamada seguinte consulta de novo e então grava', async () => {
    const kv = memoryKv();
    const env = makeEnv({ HOT_CACHE: kv });
    const partial = await getMyDashboardSeries(failingSql(sql), env, identity(), {}, CID);
    expect(partial.series.events6m).toBeNull();
    expect(kv.put).not.toHaveBeenCalled();
    expect(kv.store.size).toBe(0);
    const spy = jest.fn(sql);
    const full = await getMyDashboardSeries(spy, env, identity(), {}, CID);
    expect(full.series.events6m).not.toBeNull();
    expect(spy.mock.calls.length).toBe(KEYS.length);
    expect(kv.put).toHaveBeenCalledTimes(1);
    const again = jest.fn(sql);
    expect(await getMyDashboardSeries(again, env, identity(), {}, CID)).toEqual(full);
    expect(again).not.toHaveBeenCalled();
  });

  test.each([[[]], ['x'], [7]])('entrada inválida %p: erro de validação', async (input) => {
    await expect(getMyDashboardSeries(sql, makeEnv(), identity(), input, CID)).rejects.toMatchObject({ name: 'ValidationError', expected: true });
  });
});

// Instantes de fronteira em SQL (timestamptz). "Início" = 00:00 de Brasília do 1º bucket da janela.
const LOCAL = `'${TZ}'`;
const START_30D = `((date_trunc('day', now() AT TIME ZONE ${LOCAL}) - interval '29 days') AT TIME ZONE ${LOCAL})`;
const START_6M = `((date_trunc('month', now() AT TIME ZONE ${LOCAL}) - interval '5 months') AT TIME ZONE ${LOCAL})`;
const START_12M = `((date_trunc('week', now() AT TIME ZONE ${LOCAL}) - interval '51 weeks') AT TIME ZONE ${LOCAL})`;
const CURRENT_MONTH = `(date_trunc('month', now() AT TIME ZONE ${LOCAL}) AT TIME ZONE ${LOCAL})`;
const NEXT_MONTH = `((date_trunc('month', now() AT TIME ZONE ${LOCAL}) + interval '1 month') AT TIME ZONE ${LOCAL})`;
const ONE_SECOND_BEFORE = (start) => `(${start} - interval '1 second')`;

/** Tentativa de estudo com created_at = instante SQL e duração em segundos. */
async function attemptAt(profileId, instant, seconds) {
  await db.query(`INSERT INTO learning_attempts (profile_id, module, activity, duration_seconds, created_at) VALUES ($1, 'farmacologia', 'quiz_estudo', $2, ${instant})`, [profileId, seconds]);
}

/** Inscrição com registered_at = instante SQL (um evento novo por inscrição: UNIQUE(event_id, profile_id)). */
async function registrationAt(profileId, instant) {
  const ev = await db.query("INSERT INTO events (title, description, event_date, status) VALUES ('Evento de borda', 'descricao', now(), 'published') RETURNING id");
  await db.query(`INSERT INTO event_registrations (event_id, profile_id, registered_at) VALUES ($1, $2, ${instant})`, [ev.rows[0].id, profileId]);
}

// Oráculo: a consulta anterior ao filtro de data (lê o histórico inteiro e só depois
// recorta os buckets). O resultado atual tem que ser igual a ela em todo range e métrica.
const LEGACY_SOURCES = {
  events: 'SELECT registered_at AS t, 1 AS amount FROM event_registrations WHERE profile_id = $1',
  learning: 'SELECT created_at AS t, 1 AS amount FROM learning_attempts WHERE profile_id = $1',
  hours: 'SELECT created_at AS t, COALESCE(duration_seconds, 0) AS amount FROM learning_attempts WHERE profile_id = $1',
  tasks: 'SELECT completed_at AS t, 1 AS amount FROM task_signups WHERE profile_id = $1 AND completed_at IS NOT NULL',
};
const LEGACY_PARTS = {
  activity: ['events', 'learning', 'tasks'],
  events: ['events'],
  learning: ['learning'],
  tasks: ['tasks'],
  study_hours: ['hours'],
};

async function legacySeries(profileId, range, metric) {
  const spec = C.TIMESERIES.RANGES[range];
  const trunc = { day: 'day', week: 'week', month: 'month' }[spec.granularity];
  const union = LEGACY_PARTS[metric].map((part) => LEGACY_SOURCES[part]).join(' UNION ALL ');
  const { rows } = await db.query(
    `WITH cur AS (SELECT date_trunc('${trunc}', now() AT TIME ZONE $2) AS c),
          hits AS (SELECT date_trunc('${trunc}', u.t AT TIME ZONE $2) AS d, SUM(u.amount) AS total
                   FROM (${union}) u GROUP BY 1)
     SELECT to_char(g.d, 'YYYY-MM-DD') AS date, COALESCE(h.total, 0) AS value
     FROM cur, generate_series(cur.c - ($3::interval * $4), cur.c, $3::interval) AS g(d)
     LEFT JOIN hits h ON h.d = g.d
     ORDER BY g.d`,
    [profileId, TZ, `1 ${trunc}`, spec.count - 1]);
  const isHours = metric === 'study_hours';
  return rows.map((r) => ({ date: r.date, value: isHours ? Math.round((Number(r.value) / 3600) * 100) / 100 : Number(r.value) }));
}

describe('apiGetMyTimeseries — fronteiras da janela (filtro de data)', () => {
  let j30;
  let j6m;
  let j12m;
  beforeAll(async () => {
    j30 = await profile('janela30@exemplo.com');
    j6m = await profile('janela6m@exemplo.com');
    j12m = await profile('janela12m@exemplo.com');
    // 30d: 1º dia às 00:00 (entra), 1 s antes dele (fica fora), agora (entra), daqui a 2 dias (fora).
    await registrationAt(j30, START_30D);
    await registrationAt(j30, ONE_SECOND_BEFORE(START_30D));
    await registrationAt(j30, 'now()');
    await registrationAt(j30, "now() + interval '2 days'");
    // 6m: 1º mês às 00:00 (entra), último segundo do mês anterior (fora), 1º dia do mês corrente (entra), agora (entra), 1º dia do mês seguinte (fora).
    await attemptAt(j6m, START_6M, 3600);
    await attemptAt(j6m, ONE_SECOND_BEFORE(START_6M), 3600);
    await attemptAt(j6m, CURRENT_MONTH, 3600);
    await attemptAt(j6m, 'now()', 3600);
    await attemptAt(j6m, NEXT_MONTH, 3600);
    // 12m: segunda da 1ª semana às 00:00 (entra, 3600 s), 1 s antes (fora, 7200 s), agora (entra, 1800 s).
    await attemptAt(j12m, START_12M, 3600);
    await attemptAt(j12m, ONE_SECOND_BEFORE(START_12M), 7200);
    await attemptAt(j12m, 'now()', 1800);
  }, 60000);

  test('30d: registro no 1º dia às 00:00 entra; 1 s antes da janela fica fora; futuro fica fora', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(j30), { range: '30d', metric: 'events' });
    expect(res.series[0].value).toBe(1);
    expect(res.series[29].value).toBe(1);
    expect(total(res)).toBe(2);
    const wider = await getMyTimeseries(sql, makeEnv(), identity(j30), { range: '90d', metric: 'events' });
    expect(total(wider)).toBe(3); // o registro de 1 s antes da janela de 30 dias cai dentro da de 90
  });

  test('6m: 1º mês às 00:00 entra; último segundo do mês anterior e o mês seguinte ficam fora', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(j6m), { range: '6m', metric: 'learning' });
    expect(res.series[0].value).toBe(1);
    expect(res.series[5].value).toBe(2);
    expect(total(res)).toBe(3);
  });

  test('12m: 1ª semana às 00:00 entra; 1 s antes fica fora; horas somam só a janela', async () => {
    const res = await getMyTimeseries(sql, makeEnv(), identity(j12m), { range: '12m', metric: 'study_hours' });
    expect(res.series).toHaveLength(52);
    expect(res.series[0].value).toBe(1); // 3600 s
    expect(res.series[51].value).toBe(0.5); // 1800 s, semana corrente
    expect(total(res)).toBe(1.5); // os 7200 s de antes da janela ficaram de fora
  });

  test('resultado idêntico ao da consulta anterior (sem filtro de data) em todo range e métrica', async () => {
    for (const pid of [j30, j6m, j12m, me, estudo]) {
      for (const range of Object.keys(C.TIMESERIES.RANGES)) {
        for (const metric of C.TIMESERIES.METRICS) {
          const got = await getMyTimeseries(sql, makeEnv(), identity(pid), { range, metric });
          const legacy = await legacySeries(pid, range, metric);
          expect({ combo: range + '/' + metric, series: got.series }).toEqual({ combo: range + '/' + metric, series: legacy });
        }
      }
    }
  }, 120000);
});
