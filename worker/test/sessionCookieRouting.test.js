/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Roteador com o cookie de sessão (SEC-08, ADR 0011): login entrega o token só no cookie HttpOnly quando a flag
 * está ligada e a origem é do mesmo site; as chamadas seguintes trocam o marcador pelo cookie; logout apaga o cookie.
 * Quem usa: `npm test -- -i sessionCookieRouting`.
 */
import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';

const TOKEN = 'b'.repeat(64);
const seen = [];
// Banco simulado: a única consulta que o roteador faz aqui é a das flags (feature_flags).
let flagMode = 'on'; // 'on' | 'off' | 'error'
const flagRows = async () => {
  if (flagMode === 'error') throw new Error('banco fora');
  return [{ key: 'session_cookie_enabled', enabled: flagMode === 'on', rollout_pct: 100, conditions: null }];
};

jest.unstable_mockModule('../src/db.js', () => ({
  createDb: jest.fn(() => flagRows),
  createMemoryDb: jest.fn(() => null),
}));
jest.unstable_mockModule('../src/handlers.js', () => ({
  API_REGISTRY: {
    apiLogin: async () => ({ success: true, sessionToken: TOKEN, profile: { id: 'p1' } }),
    apiLoginMfa: async () => ({ success: true, sessionToken: TOKEN, profile: { id: 'p1' } }),
    apiLoginPendente: async () => ({ success: true, mfaRequired: true, mfaToken: 'abc' }),
    apiLogout: async (sql, env, args) => { seen.push(['apiLogout', args]); return { success: true }; },
    apiEcho: async (sql, env, args) => { seen.push(['apiEcho', args]); return { success: true, args }; },
  },
}));

const { default: worker } = await import('../src/index.js');
const { __resetFlagCacheForTests } = await import('../src/services/featureFlagService.js');

const SITE_ORIGIN = 'https://laift.com.br';
const PAGES_ORIGIN = 'https://diretoria-dpf.github.io';
const env = makeEnv({ ALLOWED_ORIGINS: `${SITE_ORIGIN},${PAGES_ORIGIN}`, SESSION_COOKIE_SITE: 'laift.com.br' });

function call(action, args, { origin = SITE_ORIGIN, cookie, e = env } = {}) {
  const headers = { 'Content-Type': 'text/plain;charset=utf-8' };
  if (origin) headers.Origin = origin;
  if (cookie) headers.Cookie = cookie;
  return worker.fetch(new Request('https://api.laift.com.br/', { method: 'POST', headers, body: JSON.stringify({ action, args }) }), e);
}

beforeEach(() => {
  seen.length = 0;
  flagMode = 'on';
  __resetFlagCacheForTests();
});

describe('login com a flag ligada', () => {
  test('o token vai só no cookie HttpOnly e o corpo leva o marcador', async () => {
    const res = await call('apiLogin', ['a@b.c', 'x']);
    const body = await res.json();
    expect(body).toMatchObject({ success: true, sessionToken: 'cookie', sessionCookie: true, profile: { id: 'p1' } });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    const cookie = res.headers.get('Set-Cookie');
    expect(cookie).toContain(`__Host-pm_session=${TOKEN}`);
    ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/'].forEach((part) => expect(cookie).toContain(part));
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(SITE_ORIGIN);
  });

  test('o login com segundo fator (apiLoginMfa) também usa o cookie', async () => {
    const res = await call('apiLoginMfa', ['mfa-token', '123456']);
    expect((await res.json()).sessionToken).toBe('cookie');
    expect(res.headers.get('Set-Cookie')).toContain(TOKEN);
  });

  test('resposta sem token (MFA pendente) segue igual, sem cookie', async () => {
    const res = await call('apiLoginPendente', []);
    expect(await res.json()).toEqual({ success: true, mfaRequired: true, mfaToken: 'abc' });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });
});

describe('quando o cookie NÃO é usado', () => {
  test('flag desligada: token no corpo, sem cookie', async () => {
    flagMode = 'off';
    const res = await call('apiLogin', ['a@b.c', 'x']);
    expect((await res.json()).sessionToken).toBe(TOKEN);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  test('erro ao ler a flag: o login funciona como antes (token no corpo)', async () => {
    flagMode = 'error';
    const res = await call('apiLogin', ['a@b.c', 'x']);
    expect((await res.json()).sessionToken).toBe(TOKEN);
  });

  test('cópia do GitHub Pages (outro site): token no corpo, sem cookie, mesmo com a flag ligada', async () => {
    const res = await call('apiLogin', ['a@b.c', 'x'], { origin: PAGES_ORIGIN });
    expect((await res.json()).sessionToken).toBe(TOKEN);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  test('sem SESSION_COOKIE_SITE configurado, nunca usa cookie', async () => {
    const res = await call('apiLogin', ['a@b.c', 'x'], { e: makeEnv({ ALLOWED_ORIGINS: SITE_ORIGIN }) });
    expect((await res.json()).sessionToken).toBe(TOKEN);
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  test('chamada sem Origin (curl, servidor): nunca usa cookie', async () => {
    const res = await call('apiLogin', ['a@b.c', 'x'], { origin: '' });
    expect((await res.json()).sessionToken).toBe(TOKEN);
  });
});

describe('chamadas com o marcador', () => {
  test('o Worker troca o marcador pelo token do cookie e o handler nunca vê "cookie"', async () => {
    const res = await call('apiEcho', ['cookie', { a: 1 }], { cookie: `x=1; __Host-pm_session=${TOKEN}` });
    expect((await res.json()).args).toEqual([TOKEN, { a: 1 }]);
    expect(seen[0][1][0]).toBe(TOKEN);
  });

  test('sem cookie, o marcador segue e o handler o recusa como sessão inválida', async () => {
    await call('apiEcho', ['cookie', {}]);
    expect(seen[0][1][0]).toBe('cookie');
  });

  test('CSRF: marcador vindo de origem de outro site ou sem Origin é recusado antes do handler', async () => {
    for (const origin of [PAGES_ORIGIN, 'https://evil.example', '']) {
      const res = await call('apiEcho', ['cookie', {}], { origin, cookie: `__Host-pm_session=${TOKEN}` });
      expect((await res.json()).success).toBe(false);
    }
    expect(seen).toHaveLength(0);
  });

  test('token explícito (cópia do Pages, clientes antigos) segue valendo como sempre', async () => {
    await call('apiEcho', [TOKEN, 1], { origin: PAGES_ORIGIN });
    expect(seen[0][1]).toEqual([TOKEN, 1]);
  });

  test('o marcador não é aplicado às ações de login (um e-mail "cookie" não vira sessão)', async () => {
    const res = await call('apiLogin', ['cookie', 'x'], { origin: PAGES_ORIGIN });
    expect((await res.json()).success).toBe(true);
  });
});

describe('logout', () => {
  test('com o marcador, o Worker apaga o cookie e o handler recebe o token certo', async () => {
    const res = await call('apiLogout', ['cookie'], { cookie: `__Host-pm_session=${TOKEN}` });
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(seen[0][1][0]).toBe(TOKEN);
  });

  test('logout com token explícito vindo de outro site (Pages) não mexe em cookie', async () => {
    const res = await call('apiLogout', [TOKEN], { origin: PAGES_ORIGIN });
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  test('logout de origem do site apaga o cookie mesmo com token explícito', async () => {
    const res = await call('apiLogout', [TOKEN]);
    expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});

describe('CORS', () => {
  test('preflight de origem permitida informa que aceita credenciais; origem desconhecida não recebe nada', async () => {
    const ok = await worker.fetch(new Request('https://api.laift.com.br/', { method: 'OPTIONS', headers: { Origin: SITE_ORIGIN } }), env);
    expect(ok.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    const no = await worker.fetch(new Request('https://api.laift.com.br/', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env);
    expect(no.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(no.headers.get('Access-Control-Allow-Credentials')).toBeNull();
  });
});
