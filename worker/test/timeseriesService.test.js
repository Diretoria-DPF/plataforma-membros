/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { getMyTimeseries } from '../src/services/timeseriesService.js';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv } from './helpers/mockEnv.js';
import { memoryKv } from './helpers/aiTestUtils.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

let db;
let sql;
let me;
let other;
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
  // Atividade de outra pessoa nunca entra na minha série.
  await db.query("INSERT INTO learning_attempts (profile_id, module, activity) VALUES ($1, 'farmacologia', 'quiz_estudo')", [other]);
}, 120000);
afterAll(async () => { if (db) await db.close(); });

const identity = () => ({ profileId: me, role: 'member' });
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

  test.each([['7d'], ['1y'], [''], [30], [{}], ['30D']])('range inválido %p: erro de validação (400)', async (range) => {
    await expect(getMyTimeseries(sql, makeEnv(), identity(), { range })).rejects.toMatchObject({ name: 'ValidationError', expected: true });
  });

  test('metric inválida: erro de validação', async () => {
    await expect(getMyTimeseries(sql, makeEnv(), identity(), { metric: 'senhas' })).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('cache privado por pessoa: a segunda chamada não consulta o banco', async () => {
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

  test('está registrada no API_REGISTRY', () => {
    expect(typeof API_REGISTRY.apiGetMyTimeseries).toBe('function');
  });
});
