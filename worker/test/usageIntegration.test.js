/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * usageIntegration.test.js — DAT-01 ligado ao Worker de ponta a ponta (PGlite, todas as migrações): a requisição com
 * sessão registra a atividade em segundo plano, a falha do analytics não derruba a requisição, o simulado concluído soma
 * no contador e apiAdminUsageStats só atende o admin.
 */
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';
import { API_REGISTRY } from '../src/handlers.js';
import { hashToken } from '../src/security.js';
import { __resetUsageCacheForTests } from '../src/analytics/usage.js';

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const env = makeEnv();

let db;
let sql;
const pending = [];
const bgEnv = () => Object.assign({}, env, { waitUntil: (p) => pending.push(p) });
const drain = async () => { await Promise.all(pending.splice(0)); };

async function addProfile(id, name, role, token) {
  await db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', $4, 'active', now(), $5)`,
    [id, 'Pessoa ' + name, name + '@example.com', role, name]
  );
  await db.query(
    "INSERT INTO sessions (profile_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '1 hour')",
    [id, await hashToken(token, env.SESSION_TOKEN_PEPPER)]
  );
}
const count = async (table, where = 'true') => Number((await db.query(`SELECT count(*) AS n FROM ${table} WHERE ${where}`)).rows[0].n);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await addProfile(ADMIN_ID, 'admin', 'admin', 'tok-admin');
  await addProfile(MEMBER_ID, 'membro', 'member', 'tok-membro');
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  __resetUsageCacheForTests();
  await db.exec('DELETE FROM activity_days; DELETE FROM usage_daily');
});

describe('runWithSession registra a atividade', () => {
  test('uma requisição com sessão grava o dia da pessoa em segundo plano, uma vez só', async () => {
    const first = await API_REGISTRY.apiGetMyMetrics(sql, bgEnv(), ['tok-membro']);
    expect(first.success).not.toBe(false);
    await drain();
    expect(await count('activity_days', `profile_id = '${MEMBER_ID}'`)).toBe(1);
    pending.length = 0;
    await API_REGISTRY.apiGetMyMetrics(sql, bgEnv(), ['tok-membro']);
    expect(pending).toHaveLength(0); // cache do isolate: nem chegou ao banco
    expect(await count('activity_days')).toBe(1);
    expect(await count('usage_daily', "metric = 'dau'")).toBe(1);
  });

  test('falha do banco no registro não derruba a requisição', async () => {
    const flaky = (strings, ...values) => {
      const text = Array.isArray(strings) ? strings.join('?') : String(strings);
      if (/activity_days|usage_daily/.test(text)) return Promise.reject(new Error('banco do analytics fora do ar'));
      return sql(strings, ...values);
    };
    const res = await API_REGISTRY.apiGetMyMetrics(flaky, bgEnv(), ['tok-membro']);
    await drain();
    expect(res.success).not.toBe(false);
    expect(await count('activity_days')).toBe(0);
  });

  test('requisição recusada (sessão inválida) não registra nada', async () => {
    const res = await API_REGISTRY.apiGetMyMetrics(sql, bgEnv(), ['token-que-nao-existe']);
    await drain();
    expect(res.success).toBe(false);
    expect(await count('activity_days')).toBe(0);
  });
});

describe('contadores nos pontos do funil', () => {
  test('simulado concluído soma quiz_completed', async () => {
    const res = await API_REGISTRY.apiLearnSubmitQuizAttempt(sql, bgEnv(), ['tok-membro', {
      module: 'farmacologia', mode: 'estudo', correct: 3, total: 5, durationSeconds: 60, topics: [],
    }]);
    await drain();
    expect(res.success).toBe(true);
    const { rows } = await db.query("SELECT n FROM usage_daily WHERE metric = 'quiz_completed'");
    expect(Number(rows[0].n)).toBe(1);
  });
});

describe('apiAdminUsageStats', () => {
  test('membro é recusado', async () => {
    const res = await API_REGISTRY.apiAdminUsageStats(sql, env, ['tok-membro']);
    expect(res).toEqual({ success: false, message: 'Acesso não autorizado para este recurso.' });
  });

  test('admin recebe o resumo agregado, sem identificar ninguém', async () => {
    await API_REGISTRY.apiGetMyMetrics(sql, bgEnv(), ['tok-membro']);
    await drain();
    const res = await API_REGISTRY.apiAdminUsageStats(sql, env, ['tok-admin']);
    expect(res.success).toBe(true);
    expect(res.mau).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(res)).not.toMatch(new RegExp(MEMBER_ID + '|' + ADMIN_ID));
  });
});
