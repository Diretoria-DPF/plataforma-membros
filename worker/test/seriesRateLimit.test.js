/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Rate limit por perfil nas séries do Início (apiGetMyTimeseries e
// apiGetMyDashboardSeries). O limite conta a sessão (profileId), nunca o IP
// nem a entrada do cliente, e conta toda chamada, inclusive cache hit.
import { jest } from '@jest/globals';
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { RATE_LIMITS } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';

const PROFILE_A = '11111111-1111-4111-8111-111111111111';
const PROFILE_B = '22222222-2222-4222-8222-222222222222';
const TOKEN_A = 'token-de-sessao-perfil-a';
const TOKEN_B = 'token-de-sessao-perfil-b';
const RATE_LIMIT_MESSAGE = 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.';
const TIMESERIES = RATE_LIMITS.TIMESERIES;
const DASHBOARD = RATE_LIMITS.DASHBOARD_SERIES;

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

  test('cache hit também conta: toda chamada gasta o limite', async () => {
    const { env, sql } = await setup();
    env.HOT_CACHE.get.mockResolvedValue(JSON.stringify({ success: true, range: '30d', granularity: 'day', series: [] }));
    await repeat(TIMESERIES.MAX_ATTEMPTS, () => callTimeseries(sql, env));
    const res = await callTimeseries(sql, env);
    expect(res).toMatchObject({ success: false, message: RATE_LIMIT_MESSAGE });
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
