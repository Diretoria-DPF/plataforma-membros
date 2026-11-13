/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { makeEnv } from './helpers/mockEnv.js';

// F-029: pela rota real (index.js), a telemetria do Atlas não chega ao banco.
// O mock de db.js devolve um "sql" espião; nenhuma consulta pode acontecer.
const sqlSpy = jest.fn().mockResolvedValue([]);
jest.unstable_mockModule('../src/db.js', () => ({
  createDb: jest.fn(() => sqlSpy),
  createMemoryDb: jest.fn(() => null),
}));

const { default: worker } = await import('../src/index.js');

function post(body) {
  return new Request('https://api.example.com/v1', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', Origin: 'https://laift.com.br' },
    body: JSON.stringify(body),
  });
}

describe('rota apiLearnAtlasTelemetry (F-029)', () => {
  beforeEach(() => sqlSpy.mockClear());

  test('POST com eventos devolve resposta fixa e não faz nenhuma consulta', async () => {
    const res = await worker.fetch(post({
      action: 'apiLearnAtlasTelemetry',
      args: ['token-qualquer', { sessionId: 'abcd1234efgh', events: [{ event: 'app_open', props: { mode: 'explore' } }] }],
    }), makeEnv({ ALLOWED_ORIGINS: 'https://laift.com.br' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, stored: 0, disabled: true });
    expect(sqlSpy).not.toHaveBeenCalled();
  });

  test('marcador de cookie também não abre sessão nem grava', async () => {
    const res = await worker.fetch(post({ action: 'apiLearnAtlasTelemetry', args: ['cookie', { sessionId: 'abcd1234efgh', events: [] }] }),
      makeEnv({ ALLOWED_ORIGINS: 'https://laift.com.br', SESSION_COOKIE_SITE: 'laift.com.br' }));
    const body = await res.json();
    expect(body.stored).toBe(0);
    expect(sqlSpy).not.toHaveBeenCalled();
  });
});
