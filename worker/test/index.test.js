import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';

// index.js chama createDb(env.DATABASE_URL), que usa @neondatabase/serverless
// de verdade — mockamos o módulo inteiro para nunca tentar uma conexão real
// nestes testes de roteamento/CORS. Com ESM, o mock precisa ser registrado
// ANTES do import do módulo sob teste (por isso o import dinâmico abaixo,
// em vez de um import estático no topo do arquivo).
jest.unstable_mockModule('../src/db.js', () => ({
  createDb: jest.fn(() => jest.fn().mockResolvedValue([])),
}));

const { default: worker } = await import('../src/index.js');

function req(body, options) {
  const opts = options || {};
  return new Request('https://api.example.com/', {
    method: opts.method || 'POST',
    headers: Object.assign({ 'Content-Type': 'text/plain;charset=utf-8' }, opts.headers || {}),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('index.js — roteamento e CORS', () => {
  const env = makeEnv();

  test('OPTIONS (preflight) responde 204 com Access-Control-Allow-Origin quando a origem está na allowlist', async () => {
    const request = new Request('https://api.example.com/', {
      method: 'OPTIONS',
      headers: { Origin: 'https://diretoria-dpf.github.io' },
    });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://diretoria-dpf.github.io');
  });

  test('não devolve Access-Control-Allow-Origin para uma origem fora da allowlist', async () => {
    const request = req({ action: 'apiListEvents', args: [''] }, { headers: { Origin: 'https://site-malicioso.example' } });
    const res = await worker.fetch(request, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('GET é rejeitado com 405', async () => {
    const res = await worker.fetch(req(undefined, { method: 'GET' }), env);
    expect(res.status).toBe(405);
  });

  test('corpo que não é JSON válido devolve 400 genérico', async () => {
    const request = new Request('https://api.example.com/', { method: 'POST', body: '{{{não é json' });
    const res = await worker.fetch(request, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  test('action fora da allowlist devolve "Ação desconhecida." sem executar nada', async () => {
    const res = await worker.fetch(req({ action: 'apiApagarTudo', args: [] }), env);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Ação desconhecida.' });
  });

  test('action herdada de Object.prototype (constructor/toString) também é rejeitada', async () => {
    for (const action of ['constructor', 'toString', 'hasOwnProperty']) {
      const res = await worker.fetch(req({ action, args: [] }), env);
      const body = await res.json();
      expect(body.message).toBe('Ação desconhecida.');
    }
  });

  test('action válida executa e devolve JSON com Content-Type correto', async () => {
    const res = await worker.fetch(req({ action: 'apiListEvents', args: [''] }), env);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
