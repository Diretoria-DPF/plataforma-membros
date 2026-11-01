/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { RateLimitError } from '../src/errors.js';

const realSecurity = await import('../src/security.js');
const enforceRateLimit = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../src/security.js', () => ({ ...realSecurity, enforceRateLimit }));
const Svc = await import('../src/services/clientErrorService.js');
const { API_REGISTRY } = await import('../src/handlers.js');

const env = { clientIp: '203.0.113.7' };
const good = { kind: 'error', message: 'Cannot read properties of undefined', route: '/index.html', browser: 'chrome', appVersion: 'v19' };

beforeEach(() => { enforceRateLimit.mockClear(); enforceRateLimit.mockResolvedValue(undefined); });

describe('sanitizeMessage — sem PII', () => {
  test('tira e-mail, token, query string, URL com parâmetros, UUID e números longos', () => {
    const out = Svc.sanitizeMessage('Falha para ana@example.com em https://x.example/p?token=abc123 Bearer segredoSECRETO id 123e4567-e89b-12d3-a456-426614174000 cpf 12345678901');
    expect(out).not.toMatch(/ana@|token=|abc123|segredoSECRETO|123e4567|12345678901/);
    expect(out).toContain('[email]');
    expect(out).toContain('https://x.example/p');
  });
  test('trunca em 200 e ignora não-texto', () => {
    expect(Svc.sanitizeMessage('a '.repeat(500)).length).toBeLessThanOrEqual(200);
    expect(Svc.sanitizeMessage(42)).toBe('');
  });
});

describe('sanitizeRoute / normalizeReport', () => {
  test('rota só com o caminho; query e fragmento saem; formato estranho vira vazio', () => {
    expect(Svc.sanitizeRoute('/App/index.html?email=a@b.c#x')).toBe('/app/index.html');
    expect(Svc.sanitizeRoute('javascript:alert(1)')).toBe('');
  });
  test('classe de navegador e versão só aceitam valores conhecidos', () => {
    const r = Svc.normalizeReport({ ...good, browser: 'Mozilla/5.0 (X11)', appVersion: 'a b c', extra: 'x', userEmail: 'a@b.c' });
    expect(r).toEqual({ kind: 'error', message: good.message, route: '/index.html', browser: 'other', appVersion: '' });
  });
  test('sem mensagem ou entrada inválida: null', () => {
    expect(Svc.normalizeReport({ kind: 'error' })).toBeNull();
    expect(Svc.normalizeReport([])).toBeNull();
    expect(Svc.normalizeReport(null)).toBeNull();
  });
});

describe('logClientError', () => {
  test('grava com impressão digital estável e só os campos limpos', async () => {
    const sql = jest.fn().mockResolvedValue([{}]);
    const a = await Svc.logClientError(sql, env, good);
    await Svc.logClientError(sql, env, { ...good });
    expect(a).toEqual({ success: true, stored: true });
    const [, ...v1] = sql.mock.calls[0];
    const [, ...v2] = sql.mock.calls[1];
    expect(v1[0]).toMatch(/^[0-9a-f]{32}$/);
    expect(v1).toEqual(v2);
    expect(JSON.stringify(v1)).not.toMatch(/203\.0\.113/);
    expect(enforceRateLimit).toHaveBeenCalledWith(sql, 'CLIENT_ERROR_IP', '203.0.113.7', expect.any(Number), expect.any(Number));
  });
  test('limite por IP estourado: responde sucesso sem gravar', async () => {
    enforceRateLimit.mockRejectedValue(RateLimitError('x'));
    const sql = jest.fn();
    expect(await Svc.logClientError(sql, env, good)).toEqual({ success: true, stored: false });
    expect(sql).not.toHaveBeenCalled();
  });
  test('tabela inexistente (045 não aplicada): degrada sem erro; outro erro propaga', async () => {
    const missing = Object.assign(new Error('relation "client_errors" does not exist'), { code: '42P01' });
    expect(await Svc.logClientError(jest.fn().mockRejectedValue(missing), env, good)).toEqual({ success: true, stored: false });
    await expect(Svc.logClientError(jest.fn().mockRejectedValue(new Error('boom')), env, good)).rejects.toThrow('boom');
  });
  test('entrada inválida não toca no banco', async () => {
    const sql = jest.fn();
    expect(await Svc.logClientError(sql, env, { nada: 1 })).toEqual({ success: true, stored: false });
    expect(sql).not.toHaveBeenCalled();
  });
});

describe('adminList', () => {
  const admin = { role: 'admin', capabilities: ['metrics.read'] };
  test('exige metrics.read', async () => {
    await expect(Svc.adminList(jest.fn(), { role: 'member', capabilities: [] }, {})).rejects.toThrow();
  });
  test('devolve o ranking mapeado e aceita só janelas conhecidas', async () => {
    const sql = jest.fn().mockResolvedValue([{ kind: 'error', message: 'm', route: '/', browser: 'chrome', app_version: 'v1', count: '3', first_seen: 'a', last_seen: 'b' }]);
    const res = await Svc.adminList(sql, admin, { days: 999 });
    expect(res.days).toBe(7);
    expect(res.errors[0]).toMatchObject({ message: 'm', count: 3, appVersion: 'v1' });
  });
  test('sem a tabela: lista vazia', async () => {
    const missing = Object.assign(new Error('x'), { code: '42P01' });
    expect(await Svc.adminList(jest.fn().mockRejectedValue(missing), admin, {})).toMatchObject({ success: true, errors: [], tableMissing: true });
  });
});

test('as duas ações estão no API_REGISTRY', () => {
  expect(typeof API_REGISTRY.apiLogClientError).toBe('function');
  expect(typeof API_REGISTRY.apiAdminClientErrors).toBe('function');
});
