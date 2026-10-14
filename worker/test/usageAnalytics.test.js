/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * usageAnalytics.test.js — DAT-01 (sql/040 + analytics/usage.js + usageStatsService.js) contra Postgres de verdade
 * (PGlite, todas as migrações): UPSERT incremental, 1 linha por pessoa/dia, cache do isolate, falha do banco sem
 * derrubar nada, CASCADE, retenção, métrica inválida, DAU/WAU/MAU e retenção D1/D7/D30 em dados sintéticos.
 */
import { jest } from '@jest/globals';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { recordActivity, bump, saoPauloDay, METRICS, __resetUsageCacheForTests } from '../src/analytics/usage.js';
import { usageStats } from '../src/services/usageStatsService.js';
import { runMaintenance, RETENTION } from '../src/maintenance.js';

const ADMIN = { profileId: '11111111-1111-4111-8111-111111111111', role: 'admin', capabilities: ['metrics.read'] };
const MEMBER = { profileId: '22222222-2222-4222-8222-222222222222', role: 'member', capabilities: [] };
const NOW = new Date('2026-10-14T15:00:00Z'); // 12h em São Paulo

let db;
let sql;
const addProfile = (id, name, createdAt) => db.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username, created_at)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', 'member', 'active', now(), $4, $5)`,
  [id, 'Pessoa ' + name, name + '@example.com', name, createdAt]
);
const count = async (table, where = 'true') => Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n);
const dayOf = (offset) => saoPauloDay(new Date(NOW.getTime() - offset * 86400000));

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await addProfile(ADMIN.profileId, 'admin', '2026-01-01T12:00:00Z');
  await addProfile(MEMBER.profileId, 'membro', '2026-01-01T12:00:00Z');
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  __resetUsageCacheForTests();
  await db.exec('DELETE FROM activity_days; DELETE FROM usage_daily');
});

describe('saoPauloDay', () => {
  test('usa o dia civil de São Paulo, não o de UTC', () => {
    expect(saoPauloDay(new Date('2026-10-14T02:30:00Z'))).toBe('2026-10-13');
    expect(saoPauloDay(new Date('2026-10-14T15:00:00Z'))).toBe('2026-10-14');
  });
});

describe('bump (usage_daily)', () => {
  test('UPSERT incremental: cada chamada soma 1 na mesma linha (dia, métrica)', async () => {
    await bump(sql, METRICS.SIGNUP, {}, NOW);
    await bump(sql, METRICS.SIGNUP, {}, NOW);
    await bump(sql, METRICS.SIGNUP, {}, NOW);
    const { rows } = await db.query("SELECT n FROM usage_daily WHERE metric = 'signup'");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].n)).toBe(3);
  });

  test('métrica fora de [a-z0-9_.]{1,40} é recusada sem consultar o banco', async () => {
    const spy = jest.fn();
    for (const bad of ['Signup', 'a b', '', 'x'.repeat(41), "x'; DROP TABLE profiles;--", null, 42]) {
      await bump(spy, bad, {}, NOW);
    }
    expect(spy).not.toHaveBeenCalled();
    expect(await count('usage_daily')).toBe(0);
  });

  test('o CHECK do banco também recusa nome inválido', async () => {
    await expect(db.query("INSERT INTO usage_daily (day, metric, n) VALUES (current_date, 'Inválida', 1)")).rejects.toThrow(/usage_daily_metric_chk/);
  });

  test('falha do banco não lança nem rejeita', async () => {
    const broken = jest.fn().mockRejectedValue(new Error('banco fora do ar'));
    await expect(bump(broken, METRICS.SIGNUP, {}, NOW)).resolves.toBeUndefined();
    const throwsSync = () => { throw new Error('boom'); };
    await expect(bump(throwsSync, METRICS.SIGNUP, {}, NOW)).resolves.toBeUndefined();
  });

  test('com env.waitUntil a escrita vai para segundo plano', async () => {
    const pending = [];
    const env = { waitUntil: (p) => pending.push(p) };
    expect(bump(sql, METRICS.LIA_MESSAGE, env, NOW)).toBeUndefined();
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(await count('usage_daily', "metric = 'lia_message'")).toBe(1);
  });
});

describe('recordActivity (activity_days)', () => {
  test('grava 1 linha por pessoa por dia e soma 1 no dau só quando a linha é nova', async () => {
    await recordActivity(sql, MEMBER, NOW, {});
    __resetUsageCacheForTests(); // outro isolate: o ON CONFLICT DO NOTHING segura
    await recordActivity(sql, MEMBER, NOW, {});
    await recordActivity(sql, ADMIN, NOW, {});
    expect(await count('activity_days')).toBe(2);
    const { rows } = await db.query("SELECT n FROM usage_daily WHERE metric = 'dau'");
    expect(Number(rows[0].n)).toBe(2);
  });

  test('o cache do isolate evita a segunda escrita no mesmo dia', async () => {
    const spy = jest.fn(sql);
    await recordActivity(spy, MEMBER, NOW, {});
    await recordActivity(spy, MEMBER, NOW, {});
    await recordActivity(spy, MEMBER, new Date(NOW.getTime() + 3600000), {});
    expect(spy).toHaveBeenCalledTimes(1);
    // Outro dia: escreve de novo.
    await recordActivity(spy, MEMBER, new Date(NOW.getTime() + 86400000), {});
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test('sem identidade ou sem profileId não faz nada', async () => {
    const spy = jest.fn();
    await recordActivity(spy, null, NOW, {});
    await recordActivity(spy, {}, NOW, {});
    expect(spy).not.toHaveBeenCalled();
  });

  test('falha do banco não propaga e libera nova tentativa na próxima requisição', async () => {
    const broken = jest.fn().mockRejectedValue(new Error('banco fora do ar'));
    await expect(recordActivity(broken, MEMBER, NOW, {})).resolves.toBeUndefined();
    const ok = jest.fn(sql);
    await recordActivity(ok, MEMBER, NOW, {});
    expect(ok).toHaveBeenCalledTimes(1);
    expect(await count('activity_days')).toBe(1);
  });

  test('a falha não escreve nada no log (nem PII)', async () => {
    const spies = [jest.spyOn(console, 'error'), jest.spyOn(console, 'warn'), jest.spyOn(console, 'log')].map((s) => s.mockImplementation(() => {}));
    await recordActivity(jest.fn().mockRejectedValue(new Error(MEMBER.profileId)), MEMBER, NOW, {});
    spies.forEach((s) => { expect(s).not.toHaveBeenCalled(); s.mockRestore(); });
  });

  test('ON DELETE CASCADE: apagar a conta apaga os dias de atividade', async () => {
    const id = '99999999-9999-4999-8999-999999999999';
    await addProfile(id, 'efemero', '2026-01-01T12:00:00Z');
    await recordActivity(sql, { profileId: id }, NOW, {});
    expect(await count('activity_days', `profile_id = '${id}'`)).toBe(1);
    await db.query('DELETE FROM profiles WHERE id = $1', [id]);
    expect(await count('activity_days', `profile_id = '${id}'`)).toBe(0);
  });
});

describe('retenção (maintenance)', () => {
  test('apaga usage_daily e activity_days com mais de 400 dias e preserva o resto', async () => {
    expect(RETENTION.USAGE_ANALYTICS_DAYS).toBe(400);
    await db.query(`INSERT INTO usage_daily (day, metric, n) VALUES (current_date - 401, 'signup', 1), (current_date - 399, 'signup', 1)`);
    await db.query(`INSERT INTO activity_days (profile_id, day) VALUES ($1, current_date - 401), ($1, current_date - 399)`, [MEMBER.profileId]);
    const deleted = await runMaintenance(sql, 'cid');
    expect(deleted.usageDailyPurge).toBe(1);
    expect(deleted.activityDaysPurge).toBe(1);
    expect(await count('usage_daily')).toBe(1);
    expect(await count('activity_days')).toBe(1);
  });
});

describe('usageStats', () => {
  const people = [
    ['aaaaaaaa-0000-4000-8000-000000000001', 'pessoa1', 10], // cadastro há 10 dias (D1, D7 medidos)
    ['aaaaaaaa-0000-4000-8000-000000000002', 'pessoa2', 10],
    ['aaaaaaaa-0000-4000-8000-000000000003', 'pessoa3', 0], // cadastro hoje: nada medido ainda
  ];
  const activity = (id, offsets) => Promise.all(offsets.map((o) => db.query('INSERT INTO activity_days (profile_id, day) VALUES ($1, $2::date)', [id, dayOf(o)])));

  beforeAll(async () => {
    for (const [id, name, ago] of people) await addProfile(id, name, new Date(NOW.getTime() - ago * 86400000).toISOString());
  });
  beforeEach(async () => {
    // p1 volta no D1 (offset 9) e D7 (offset 3); p2 só no D1; p3 hoje.
    await activity(people[0][0], [10, 9, 3, 0]);
    await activity(people[1][0], [10, 9]);
    await activity(people[2][0], [0]);
    await db.query("INSERT INTO learning_attempts (profile_id, module, activity, score, max_score) VALUES ($1, 'farmacologia', 'quiz_estudo', 3, 5)", [people[0][0]]);
    await bump(sql, METRICS.SIGNUP, {}, NOW);
    await bump(sql, METRICS.SIGNUP, {}, NOW);
  });
  afterEach(async () => { await db.exec('DELETE FROM learning_attempts'); });

  test('só admin (capacidade metrics.read) lê', async () => {
    await expect(usageStats(sql, MEMBER, NOW)).rejects.toMatchObject({ expected: true });
    await expect(usageStats(sql, null, NOW)).rejects.toMatchObject({ expected: true });
  });

  test('DAU, WAU, MAU e contadores em dados sintéticos', async () => {
    const res = await usageStats(sql, ADMIN, NOW);
    expect(res.success).toBe(true);
    expect(res.today).toBe(dayOf(0));
    const byDay = Object.fromEntries(res.dau.map((d) => [d.day, d.n]));
    expect(byDay[dayOf(0)]).toBe(2); // p1 e p3
    expect(byDay[dayOf(9)]).toBe(2);
    expect(byDay[dayOf(10)]).toBe(2);
    expect(res.wau).toBe(2); // p1 (hoje, -3) e p3 (hoje); p2 só até -9
    expect(res.mau).toBe(3);
    expect(res.counters.signup).toBe(2);
  });

  test('retenção D1/D7 por coorte e funil', async () => {
    const res = await usageStats(sql, ADMIN, NOW);
    const totals = res.retention.reduce((acc, w) => ({
      size: acc.size + w.size,
      d1e: acc.d1e + w.d1.eligible, d1r: acc.d1r + w.d1.retained,
      d7e: acc.d7e + w.d7.eligible, d7r: acc.d7r + w.d7.retained,
      d30e: acc.d30e + w.d30.eligible,
    }), { size: 0, d1e: 0, d1r: 0, d7e: 0, d7r: 0, d30e: 0 });
    // Coortes: além de p1..p3 existem admin e membro (cadastro em janeiro, fora das 8 semanas).
    expect(totals).toEqual({ size: 3, d1e: 2, d1r: 2, d7e: 2, d7r: 1, d30e: 0 });
    expect(res.funnel).toEqual({
      signup: 3, confirmed: 3, firstQuiz: 1,
      returnedD1: { eligible: 2, retained: 2 }, returnedD7: { eligible: 2, retained: 1 },
    });
  });
});
