/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Rate limit por perfil nas séries do Início (apiGetMyTimeseries e
// apiGetMyDashboardSeries). O limite conta a sessão (profileId), nunca o IP
// nem a entrada do cliente. Cache hit no KV NÃO conta (devolve sem tocar o banco
// além da sessão); só o cache miss, que de fato consulta o Neon, gasta o limite.
import { jest } from '@jest/globals';
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { RATE_LIMITS, TIMESERIES as TIMESERIES_CONFIG } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';

const PROFILE_A = '11111111-1111-4111-8111-111111111111';
const PROFILE_B = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'token-de-sessao-perfil-a';
const TOKEN_B = 'token-de-sessao-perfil-b';
const RATE_LIMIT_MESSAGE = 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
const TIMESERIES = RATE_LIMITS.TIMESERIES;
const DASHBOARD = RATE_LIMITS.DASHBOARD_SERIES;
const CACHE_TTL = TIMESERIES_CONFIG.CACHE_TTL_SECONDS;

function memberRow(profileId) {
  return {
    profile_id: profileId,
    role: 'member',
    status: 'active',
    full_name: 'Membro Teste',
    email: 'membro@exemplo.com',
    email_confirmed_at: '2026-01-01',
  };
}

/**
 * sql falso com o mínimo que o caminho real usa: a leitura da sessão (pelo
 * hash do token) e o UPSERT de rate_limit_buckets, contado por
 * (bucket, identifier_hash). A janela de tempo é lógica do SQL e fica fora
 * daqui; o teste cobre o contador. Qualquer outra consulta devolve [].
 */
function makeFakeSql(sessionsByHash) {
  const counters = new Map();
  const sql = jest.fn(async (strings, ...values) => {
    const text = strings.join('?');
    if (text.includes('INSERT INTO rate_limit_buckets')) {
      const key = values[0] + '|' + values[1];
      const attempts = (counters.get(key) || 0) + 1;
      counters.set(key, attempts);
      return [{ attempts }];
    }
    if (text.includes('FROM sessions s')) {
      const row = sessionsByHash.get(values[0]);
      return row ? [row] : [];
    }
    return [];
  });
  sql.counters = counters;
  return sql;
}

async function setup() {
  const env = makeEnv();
  const pepper = env.SESSION_TOKEN_PEPPER;
  const sessions = new Map([
    [await S.hashToken(TOKEN_A, pepper), memberRow(PROFILE_A)],
    [await S.hashToken(TOKEN_B, pepper), memberRow(PROFILE_B)],
  ]);
  return { env, sql: makeFakeSql(sessions) };
}

const callTimeseries = (sql, env, token = TOKEN_A) => API_REGISTRY.apiGetMyTimeseries(sql, env, [token, {}]);
const callDashboard = (sql, env, token = TOKEN_A) => API_REGISTRY.apiGetMyDashboardSeries(sql, env, [token, {}]);

async function repeat(times, call) {
  const results = [];
  for (let i = 0; i < times; i += 1) results.push(await call());
  return results;
}

const textOf = (call) => call[0].join('?');

describe('limites acordados para as séries do Início', () => {
  test('apiGetMyTimeseries: 60 chamadas por hora; apiGetMyDashboardSeries: 30 por hora', () => {
    expect(TIMESERIES).toEqual({ MAX_ATTEMPTS: 60, WINDOW_SECONDS: 3600 });
    expect(DASHBOARD).toEqual({ MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 });
  });
});

describe('rate limit por perfil — apiGetMyTimeseries', () => {
  test('dentro do limite, todas as chamadas passam', async () => {
    const { env, sql } = await setup();
    const results = await repeat(TIMESERIES.MAX_ATTEMPTS, () => callTimeseries(sql, env));
    results.forEach((res) => expect(res).toMatchObject({ success: true }));
  });

  test('a chamada N+1 falha com o erro padrão de rate limit e não chega à série', async () => {
    const { env, sql } = await setup();
    await repeat(TIMESERIES.MAX_ATTEMPTS, () => callTimeseries(sql, env));
    const before = sql.mock.calls.length;
    const res = await callTimeseries(sql, env);
    expect(res).toMatchObject({ success: false, message: RATE_LIMIT_MESSAGE });
    const blocked = sql.mock.calls.slice(before).map(textOf);
    expect(blocked[blocked.length - 1]).toContain('INSERT INTO rate_limit_buckets');
    expect(blocked.some((text) => text.includes('WITH bounds'))).toBe(false);
  });

  test('cache hit não gasta o limite nem toca rate_limit_buckets: só a leitura da sessão vai ao banco', async () => {
    const { env, sql } = await setup();
    const payload = { success: true, range: '30d', granularity: 'day', series: [] };
    env.HOT_CACHE.get.mockResolvedValue(JSON.stringify(payload));
    const results = await repeat(TIMESERIES.MAX_ATTEMPTS + 5, () => callTimeseries(sql, env));
    results.forEach((res) => expect(res).toEqual(payload));
    expect(sql.counters.size).toBe(0);
    const texts = sql.mock.calls.map(textOf);
    expect(texts.some((text) => text.includes('INSERT INTO rate_limit_buckets'))).toBe(false);
    expect(texts.some((text) => text.includes('WITH bounds'))).toBe(false);
  });

  test('cache miss ainda gasta o limite antes de consultar a série, e grava no KV com a mesma chave e TTL', async () => {
    const { env, sql } = await setup();
    const res = await callTimeseries(sql, env);
    expect(res).toMatchObject({ success: true, range: '30d' });
    expect(sql.counters.size).toBe(1);
    const texts = sql.mock.calls.map(textOf);
    expect(texts.findIndex((t) => t.includes('INSERT INTO rate_limit_buckets'))).toBeLessThan(texts.findIndex((t) => t.includes('WITH bounds')));
    expect(env.HOT_CACHE.get).toHaveBeenCalledWith('cache:timeseries:v1:' + PROFILE_A + ':30d:activity');
    expect(env.HOT_CACHE.put).toHaveBeenCalledWith('cache:timeseries:v1:' + PROFILE_A + ':30d:activity', expect.any(String), { expirationTtl: CACHE_TTL });
  });

  test('entrada inválida continua recusada (sem consultar série); sem KV (staging) o limite vale em toda chamada', async () => {
    const { env, sql } = await setup();
    const bad = await API_REGISTRY.apiGetMyTimeseries(sql, env, [TOKEN_A, { range: '1d' }]);
    expect(bad).toMatchObject({ success: false });
    expect(sql.mock.calls.map(textOf).some((t) => t.includes('WITH bounds'))).toBe(false);

    const { sql: sql2 } = await setup();
    const envNoKv = makeEnv();
    delete envNoKv.HOT_CACHE;
    await repeat(TIMESERIES.MAX_ATTEMPTS, () => callTimeseries(sql2, envNoKv));
    expect(await callTimeseries(sql2, envNoKv)).toMatchObject({ success: false, message: RATE_LIMIT_MESSAGE });
  });

  test('limites são por perfil: esgotar o perfil A não afeta o perfil B', async () => {
    const { env, sql } = await setup();
    await repeat(TIMESERIES.MAX_ATTEMPTS, () => callTimeseries(sql, env, TOKEN_A));
    expect(await callTimeseries(sql, env, TOKEN_A)).toMatchObject({ success: false, message: RATE_LIMIT_MESSAGE });
    expect(await callTimeseries(sql, env, TOKEN_B)).toMatchObject({ success: true });
  });
});

describe('rate limit por perfil — apiGetMyDashboardSeries', () => {
  test('dentro do limite passa; a chamada N+1 falha com o erro padrão', async () => {
    const { env, sql } = await setup();
    const results = await repeat(DASHBOARD.MAX_ATTEMPTS, () => callDashboard(sql, env));
    results.forEach((res) => expect(res).toMatchObject({ success: true }));
    expect(await callDashboard(sql, env)).toMatchObject({ success: false, message: RATE_LIMIT_MESSAGE });
  });

  test('o teto do dashboard tem contador próprio: esgotá-lo não bloqueia apiGetMyTimeseries', async () => {
    const { env, sql } = await setup();
    await repeat(DASHBOARD.MAX_ATTEMPTS, () => callDashboard(sql, env));
    expect(await callDashboard(sql, env)).toMatchObject({ success: false, message: RATE_LIMIT_MESSAGE });
    expect(await callTimeseries(sql, env)).toMatchObject({ success: true });
  });

  test('cache hit do pacote não gasta o limite nem consulta o banco; miss grava com a chave por perfil', async () => {
    const { env, sql } = await setup();
    const miss = await callDashboard(sql, env);
    expect(miss).toMatchObject({ success: true });
    expect(env.HOT_CACHE.put).toHaveBeenCalledWith('cache:dashboard-series:v1:' + PROFILE_A, expect.any(String), { expirationTtl: CACHE_TTL });
    expect(sql.counters.size).toBe(1);

    const payload = { success: true, series: { activity30d: null } };
    env.HOT_CACHE.get.mockResolvedValue(JSON.stringify(payload));
    const before = sql.mock.calls.length;
    const results = await repeat(DASHBOARD.MAX_ATTEMPTS + 5, () => callDashboard(sql, env));
    results.forEach((res) => expect(res).toEqual(payload));
    const texts = sql.mock.calls.slice(before).map(textOf);
    expect(texts.some((t) => t.includes('INSERT INTO rate_limit_buckets') || t.includes('WITH bounds'))).toBe(false);
    expect(env.HOT_CACHE.get).toHaveBeenLastCalledWith('cache:dashboard-series:v1:' + PROFILE_A);
  });

  test('limite do dashboard também é por perfil', async () => {
    const { env, sql } = await setup();
    await repeat(DASHBOARD.MAX_ATTEMPTS, () => callDashboard(sql, env, TOKEN_A));
    expect(await callDashboard(sql, env, TOKEN_B)).toMatchObject({ success: true });
  });
});

describe('as duas actions continuam exigindo sessão', () => {
  test.each(['apiGetMyTimeseries', 'apiGetMyDashboardSeries'])('%s: token inválido recusa e não grava contagem', async (action) => {
    const { env, sql } = await setup();
    const res = await API_REGISTRY[action](sql, env, ['token-invalido', {}]);
    expect(res).toMatchObject({ success: false, message: expect.stringContaining('Sessão') });
    expect(sql.counters.size).toBe(0);
  });
});
