/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';

// Mesmo padrão do index.test.js: o módulo de banco é mockado ANTES do import
// dinâmico, e o spy de createDb prova que /health nunca abre conexão.
const createDb = jest.fn(() => jest.fn().mockResolvedValue([]));
const createMemoryDb = jest.fn(() => null);
jest.unstable_mockModule('../src/db.js', () => ({ createDb, createMemoryDb }));

const { default: worker } = await import('../src/index.js');

describe('GET/HEAD /health — sonda rasa de disponibilidade', () => {
  const env = makeEnv();

  beforeEach(() => {
    createDb.mockClear();
    createMemoryDb.mockClear();
  });

  test('GET responde 200 com corpo exato, JSON e no-store', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/health'), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"ok":true}');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
  });

  test('HEAD responde 200 sem corpo, com os mesmos cabeçalhos', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/health', { method: 'HEAD' }), env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Content-Type')).toMatch(/^application\/json/);
  });

  test('não toca banco (nem sql nem memória), mesmo com DATABASE_URL presente', async () => {
    const withDb = makeEnv({ DATABASE_URL: 'postgres://x' });
    await worker.fetch(new Request('https://api.example.com/health'), withDb);
    await worker.fetch(new Request('https://api.example.com/health', { method: 'HEAD' }), withDb);
    expect(createDb).not.toHaveBeenCalled();
    expect(createMemoryDb).not.toHaveBeenCalled();
  });

  test('POST em /health não é a sonda: segue como caminho inexistente (404)', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/health', { method: 'POST', body: '{}' }), env);
    expect(res.status).toBe(404);
  });

  test('GET em outro caminho continua 405', async () => {
    for (const p of ['/', '/v1/', '/healthz', '/health/x']) {
      const res = await worker.fetch(new Request('https://api.example.com' + p), env);
      expect(res.status).toBe(405);
    }
  });

  test('POST RPC continua funcionando', async () => {
    const res = await worker.fetch(
      new Request('https://api.example.com/', { method: 'POST', body: JSON.stringify({ action: 'naoExiste', args: [] }) }),
      env
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: false, message: 'Ação desconhecida.' });
  });

  test('OPTIONS em /health segue o preflight existente (204)', async () => {
    const res = await worker.fetch(new Request('https://api.example.com/health', { method: 'OPTIONS' }), env);
    expect(res.status).toBe(204);
  });
});
