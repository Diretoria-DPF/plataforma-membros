/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * turnstileService.test.js — verificação do desafio Turnstile da prévia de IA do visitante
 * (services/turnstileService.js). O segredo aqui é um VALOR DE TESTE fictício. O fetch é simulado.
 */
import { jest } from '@jest/globals';
import { verifyVisitorChallenge, challengeConfigured, allowedHostnames, SITEVERIFY_URL, CHALLENGE_ACTION } from '../src/services/turnstileService.js';

const ENV = { TURNSTILE_SECRET: 'segredo-de-teste-ficticio' };
const IP = '203.0.113.9';
const TOKEN = 'token-de-teste';

const siteverify = (body, init = {}) => ({ ok: init.ok !== false, status: init.status || 200, json: async () => body });
const good = (extra = {}) => siteverify({ success: true, action: CHALLENGE_ACTION, hostname: 'laift.com.br', ...extra });

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; globalThis.fetch = jest.fn(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe('verifyVisitorChallenge', () => {
  test('sucesso: POST form-urlencoded com secret, response e remoteip', async () => {
    globalThis.fetch.mockResolvedValueOnce(good());
    expect(await verifyVisitorChallenge(ENV, TOKEN, IP)).toBe(true);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    expect(url).toBe('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    const form = new URLSearchParams(String(init.body));
    expect(form.get('secret')).toBe(ENV.TURNSTILE_SECRET);
    expect(form.get('response')).toBe(TOKEN);
    expect(form.get('remoteip')).toBe(IP);
    expect(init.signal).toBeDefined();
  });

  test('sem IP, o campo remoteip não é enviado', async () => {
    globalThis.fetch.mockResolvedValueOnce(good());
    await verifyVisitorChallenge(ENV, TOKEN, '');
    expect(new URLSearchParams(String(globalThis.fetch.mock.calls[0][1].body)).has('remoteip')).toBe(false);
  });

  test.each([[undefined], [null], [''], ['   '], [42], [{}], ['x'.repeat(2049)]])('token inválido %p: false, sem chamar a Cloudflare', async (token) => {
    expect(await verifyVisitorChallenge(ENV, token, IP)).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('token com exatamente 2048 caracteres é aceito', async () => {
    globalThis.fetch.mockResolvedValueOnce(good());
    expect(await verifyVisitorChallenge(ENV, 'x'.repeat(2048), IP)).toBe(true);
  });

  test.each([[{}], [{ TURNSTILE_SECRET: '' }], [{ TURNSTILE_SECRET: '   ' }], [{ TURNSTILE_SECRET: 42 }], [null], [undefined]])('sem segredo (%p): false, sem chamar a Cloudflare', async (env) => {
    expect(await verifyVisitorChallenge(env, TOKEN, IP)).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each([
    ['success false', siteverify({ success: false, action: CHALLENGE_ACTION, hostname: 'laift.com.br' })],
    ['success não booleano', siteverify({ success: 'true', action: CHALLENGE_ACTION, hostname: 'laift.com.br' })],
    ['ação errada', good({ action: 'login' })],
    ['sem ação', good({ action: undefined })],
    ['hostname fora da lista', good({ hostname: 'evil.example' })],
    ['sem hostname', good({ hostname: undefined })],
    ['localhost em produção', good({ hostname: 'localhost' })],
    ['HTTP 500', siteverify({ success: true, action: CHALLENGE_ACTION, hostname: 'laift.com.br' }, { ok: false, status: 500 })],
    ['corpo não é objeto', siteverify(null)],
    ['corpo é lista', siteverify([])],
  ])('%s: false', async (_nome, response) => {
    globalThis.fetch.mockResolvedValueOnce(response);
    expect(await verifyVisitorChallenge(ENV, TOKEN, IP)).toBe(false);
  });

  test('JSON inválido: false, sem lançar', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } });
    expect(await verifyVisitorChallenge(ENV, TOKEN, IP)).toBe(false);
  });

  test('rede caindo: false, sem lançar', async () => {
    globalThis.fetch.mockRejectedValueOnce(new Error('rede'));
    expect(await verifyVisitorChallenge(ENV, TOKEN, IP)).toBe(false);
  });

  test('timeout: o AbortController aborta e o resultado é false', async () => {
    jest.useFakeTimers();
    try {
      globalThis.fetch.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })));
      }));
      const pending = verifyVisitorChallenge(ENV, TOKEN, IP);
      await jest.advanceTimersByTimeAsync(10001);
      expect(await pending).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('nunca registra token, segredo ou IP em console', async () => {
    const spies = ['log', 'error', 'warn', 'info'].map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    globalThis.fetch.mockRejectedValueOnce(new Error('rede'));
    await verifyVisitorChallenge(ENV, TOKEN, IP);
    globalThis.fetch.mockResolvedValueOnce(good({ success: false }));
    await verifyVisitorChallenge(ENV, TOKEN, IP);
    const printed = spies.flatMap((s) => s.mock.calls).join(' ');
    spies.forEach((s) => s.mockRestore());
    [TOKEN, ENV.TURNSTILE_SECRET, IP].forEach((secret) => expect(printed).not.toContain(secret));
  });
});

describe('TURNSTILE_HOSTNAMES', () => {
  test('padrão: laift.com.br e www.laift.com.br', () => {
    expect([...allowedHostnames({})].sort()).toEqual(['laift.com.br', 'www.laift.com.br']);
  });

  test('lista da variável: separada por vírgula, sem espaço nem caixa; staging aceito', async () => {
    const env = { ...ENV, TURNSTILE_HOSTNAMES: ' Staging.laift.com.br , laift.com.br ' };
    expect([...allowedHostnames(env)].sort()).toEqual(['laift.com.br', 'staging.laift.com.br']);
    globalThis.fetch.mockResolvedValueOnce(good({ hostname: 'staging.laift.com.br' }));
    expect(await verifyVisitorChallenge(env, TOKEN, IP)).toBe(true);
  });

  test('localhost e loopback são descartados da lista, mesmo se alguém os configurar', async () => {
    const env = { ...ENV, TURNSTILE_HOSTNAMES: 'localhost,127.0.0.1,[::1],localhost:4174,laift.com.br' };
    expect([...allowedHostnames(env)]).toEqual(['laift.com.br']);
    globalThis.fetch.mockResolvedValueOnce(good({ hostname: 'localhost' }));
    expect(await verifyVisitorChallenge(env, TOKEN, IP)).toBe(false);
  });

  test('variável vazia ou só com localhost volta ao padrão (nunca fica sem lista)', () => {
    expect(allowedHostnames({ TURNSTILE_HOSTNAMES: '' }).has('laift.com.br')).toBe(true);
    expect(allowedHostnames({ TURNSTILE_HOSTNAMES: 'localhost' }).has('laift.com.br')).toBe(true);
  });
});

describe('challengeConfigured', () => {
  test('só com segredo de texto não vazio', () => {
    expect(challengeConfigured(ENV)).toBe(true);
    [{}, { TURNSTILE_SECRET: '' }, { TURNSTILE_SECRET: ' ' }, null, undefined].forEach((e) => expect(challengeConfigured(e)).toBe(false));
  });
});
