/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';
import { securityHeaders, SECURITY_HEADERS } from '../src/securityHeaders.js';

const createDb = jest.fn(() => jest.fn().mockResolvedValue([]));
const createMemoryDb = jest.fn(() => null);
jest.unstable_mockModule('../src/db.js', () => ({ createDb, createMemoryDb }));
const { default: worker } = await import('../src/index.js');

const EXPECTED = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=604800',
};

function expectSecure(res) {
  for (const [k, v] of Object.entries(EXPECTED)) expect(res.headers.get(k)).toBe(v);
  expect(res.headers.get('Cross-Origin-Resource-Policy')).toBeNull();
}

describe('securityHeaders (helper puro)', () => {
  test('devolve os três cabeçalhos fixos, sem CORP', () => {
    expect(securityHeaders()).toEqual(EXPECTED);
    expect(SECURITY_HEADERS).toEqual(EXPECTED);
  });

  test('noStore acrescenta Cache-Control: no-store', () => {
    expect(securityHeaders({ noStore: true })).toEqual({ ...EXPECTED, 'Cache-Control': 'no-store' });
  });

  test('não compartilha estado entre chamadas', () => {
    const a = securityHeaders();
    a['X-Teste'] = '1';
    expect(securityHeaders()['X-Teste']).toBeUndefined();
  });
});

describe('Worker: cabeçalhos de segurança em toda resposta', () => {
  const env = makeEnv({ ALLOWED_ORIGINS: 'https://laift.com.br' });
  const origin = { Origin: 'https://laift.com.br' };

  test('OPTIONS 204 mantém CORS e leva os cabeçalhos', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/', { method: 'OPTIONS', headers: origin }), env);
    expect(res.status).toBe(204);
    expectSecure(res);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://laift.com.br');
  });

  test('/health leva os cabeçalhos e mantém no-store', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/health'), env);
    expectSecure(res);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  test('erro 405 e 404 levam os cabeçalhos e no-store', async () => {
    const r405 = await worker.fetch(new Request('https://api.example.com/', { method: 'PUT' }), env);
    expect(r405.status).toBe(405);
    expectSecure(r405);
    const r404 = await worker.fetch(new Request('https://api.example.com/x', { method: 'POST', body: '{}' }), env);
    expect(r404.status).toBe(404);
    expectSecure(r404);
    expect(r404.headers.get('Cache-Control')).toBe('no-store');
  });

  test('POST de ação (JSON) leva os cabeçalhos, no-store e CORS', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/', {
      method: 'POST', headers: origin, body: JSON.stringify({ action: 'nao_existe', args: [] }),
    }), env);
    expect(res.status).toBe(200);
    expectSecure(res);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://laift.com.br');
    expect(res.headers.get('Vary')).toBe('Origin');
  });
});
