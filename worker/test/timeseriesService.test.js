/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
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

  test('cache: a segunda chamada não consulta o banco e cada série tem chave privada própria', async () => {
    const kv = memoryKv();
    const env = makeEnv({ HOT_CACHE: kv });
    const spy = jest.fn(sql);
    const a = await getMyDashboardSeries(spy, env, identity(), {}, CID);
    const calls = spy.mock.calls.length;
    expect(calls).toBeGreaterThan(0);
    const b = await getMyDashboardSeries(spy, env, identity(), {}, CID);
    expect(b).toEqual(a);
    expect(spy.mock.calls.length).toBe(calls);
    const keys = [...kv.store.keys()];
    expect(keys).toHaveLength(KEYS.length);
    expect(keys.every((k) => k.includes(me))).toBe(true);
    expect(keys.some((k) => k.endsWith(':6m:events'))).toBe(true);
  });

  test.each([[[]], ['x'], [7]])('entrada inválida %p: erro de validação', async (input) => {
    await expect(getMyDashboardSeries(sql, makeEnv(), identity(), input, CID)).rejects.toMatchObject({ name: 'ValidationError', expected: true });
  });
});
