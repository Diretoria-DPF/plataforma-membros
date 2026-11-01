/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';
import {
  ValidationError, AuthError, ForbiddenError, RateLimitError, NotFoundError, ConflictError, AgentError,
} from '../src/errors.js';
import { AiUnavailableError, AiInvalidOutputError, QuotaExceededError } from '../src/ai/errors.js';
import { statusForError, tagStatus, statusOf, wantsRealStatus, STATUS_REQUEST_HEADER } from '../src/httpStatus.js';

jest.unstable_mockModule('../src/db.js', () => ({
  createDb: jest.fn(() => jest.fn().mockResolvedValue([])),
  createMemoryDb: jest.fn(() => null),
}));
const { default: worker } = await import('../src/index.js');
const { API_REGISTRY } = await import('../src/handlers.js');

describe('httpStatus — mapa de erro para status', () => {
  test.each([
    [ValidationError('x'), 400],
    [AuthError('x'), 401],
    [ForbiddenError('x'), 403],
    [NotFoundError('x'), 404],
    [ConflictError('x'), 409],
    [RateLimitError('x'), 429],
    [AiUnavailableError('x'), 503],
    [AiInvalidOutputError('x'), 502],
    [QuotaExceededError('x'), 429],
    [AgentError('RATE_LIMIT', 'x'), 429],
    [AgentError('QUOTA', 'x'), 429],
    [AgentError('AI_UNAVAILABLE', 'x'), 503],
    [AgentError('INVALID_OUTPUT', 'x'), 502],
    [AgentError('AGENT_DISABLED', 'x'), 403],
    [AgentError('VALIDATION', 'x'), 400],
  ])('%p -> %i', (err, status) => {
    expect(statusForError(err)).toBe(status);
  });

  test('erro esperado sem tipo conhecido vira 400; inesperado e nulo viram 500', () => {
    const custom = new Error('x'); custom.expected = true;
    expect(statusForError(custom)).toBe(400);
    expect(statusForError(new Error('boom'))).toBe(500);
    expect(statusForError(null)).toBe(500);
  });

  test('tagStatus não altera o corpo serializado', () => {
    const body = tagStatus({ success: false, message: 'm' }, 404);
    expect(JSON.stringify(body)).toBe('{"success":false,"message":"m"}');
    expect(statusOf(body)).toBe(404);
    expect(statusOf({ success: false })).toBeNull();
    expect(statusOf(null)).toBeNull();
    expect(statusOf('texto')).toBeNull();
  });

  test('wantsRealStatus só com o cabeçalho opt-in igual a 1', () => {
    const mk = (v) => new Request('https://a.example/', { headers: v === undefined ? {} : { [STATUS_REQUEST_HEADER]: v } });
    expect(wantsRealStatus(mk('1'))).toBe(true);
    expect(wantsRealStatus(mk('0'))).toBe(false);
    expect(wantsRealStatus(mk(undefined))).toBe(false);
  });
});

describe('index.js — status HTTP real (opt-in X-Laift-Status)', () => {
  const env = makeEnv();
  function post(body, headers) {
    return new Request('https://api.example.com/', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
      body: JSON.stringify(body),
    });
  }
  function withHandler(impl, fn) {
    const spy = jest.spyOn(API_REGISTRY, 'apiListEvents').mockImplementation(impl);
    return fn().finally(() => spy.mockRestore());
  }
  const failing = (err) => async () => { const { run } = await import('../src/handlers.js'); return run(null, async () => { throw err; }); };

  test('sem o cabeçalho: erro esperado continua HTTP 200 com o mesmo corpo', async () => {
    await withHandler(failing(NotFoundError('Evento não encontrado.')), async () => {
      const res = await worker.fetch(post({ action: 'apiListEvents', args: [''] }), env);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: false, message: 'Evento não encontrado.' });
    });
  });

  test('com o cabeçalho: erro esperado vira o status do tipo, corpo idêntico', async () => {
    await withHandler(failing(NotFoundError('Evento não encontrado.')), async () => {
      const res = await worker.fetch(post({ action: 'apiListEvents', args: [''] }, { [STATUS_REQUEST_HEADER]: '1' }), env);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ success: false, message: 'Evento não encontrado.' });
    });
  });

  test('com o cabeçalho: payload do erro (ex.: mfaSetupRequired) segue no corpo', async () => {
    const err = ForbiddenError('Cadastre o MFA.'); err.payload = { mfaSetupRequired: true };
    await withHandler(failing(err), async () => {
      const res = await worker.fetch(post({ action: 'apiListEvents', args: [''] }, { [STATUS_REQUEST_HEADER]: '1' }), env);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ success: false, message: 'Cadastre o MFA.', mfaSetupRequired: true });
    });
  });

  test('com o cabeçalho: erro inesperado vira 500 com a mensagem genérica; sucesso continua 200', async () => {
    const silence = jest.spyOn(console, 'error').mockImplementation(() => {});
    await withHandler(async () => { throw new Error('segredo interno'); }, async () => {
      const res = await worker.fetch(post({ action: 'apiListEvents', args: [''] }, { [STATUS_REQUEST_HEADER]: '1' }), env);
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toMatch(/segredo interno/);
    });
    silence.mockRestore();
    await withHandler(async () => ({ success: true, events: [] }), async () => {
      const res = await worker.fetch(post({ action: 'apiListEvents', args: [''] }, { [STATUS_REQUEST_HEADER]: '1' }), env);
      expect(res.status).toBe(200);
    });
  });

  test('com o cabeçalho: ação desconhecida vira 404; sem o cabeçalho segue 200', async () => {
    const com = await worker.fetch(post({ action: 'naoExiste', args: [] }, { [STATUS_REQUEST_HEADER]: '1' }), env);
    expect(com.status).toBe(404);
    const sem = await worker.fetch(post({ action: 'naoExiste', args: [] }), env);
    expect(sem.status).toBe(200);
  });

  test('preflight libera o cabeçalho X-Laift-Status', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/', { method: 'OPTIONS', headers: { Origin: 'https://diretoria-dpf.github.io' } }), env);
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/X-Laift-Status/i);
    expect(res.headers.get('Access-Control-Allow-Headers')).toMatch(/Content-Type/i);
  });
});
