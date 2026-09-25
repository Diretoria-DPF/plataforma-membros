import { jest } from '@jest/globals';
import * as S from '../src/security.js';
import { makeSql } from './helpers/mockEnv.js';

const PEPPER = 'test-pepper-value-not-for-production';

describe('security.js — tokens e hashing', () => {
  test('generateRawToken produz um token de alta entropia (duas UUIDs sem hífen)', () => {
    const a = S.generateRawToken();
    const b = S.generateRawToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/i);
  });

  test('hashToken é determinístico para o mesmo token/pepper e muda se qualquer um mudar', async () => {
    const h1 = await S.hashToken('abc', PEPPER);
    const h2 = await S.hashToken('abc', PEPPER);
    const h3 = await S.hashToken('abc', 'outro-pepper');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  test('newCorrelationId gera um UUID diferente a cada chamada', () => {
    expect(S.newCorrelationId()).not.toBe(S.newCorrelationId());
  });
});

describe('security.js — validação', () => {
  test('isValidEmail aceita formatos razoáveis e rejeita o resto', () => {
    expect(S.isValidEmail('a@b.com')).toBe(true);
    expect(S.isValidEmail('sem-arroba')).toBe(false);
    expect(S.isValidEmail('')).toBe(false);
  });

  test('isLengthValid respeita min/max após normalizar (trim)', () => {
    expect(S.isLengthValid('  abc  ', 3, 5)).toBe(true);
    expect(S.isLengthValid('ab', 3, 5)).toBe(false);
  });
});

describe('security.js — enforceRateLimit', () => {
  test('permite quando o UPSERT retorna attempts <= max', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 3 }]);
    await expect(S.enforceRateLimit(sql, 'LOGIN', 'a@b.com', 8, 900)).resolves.toBeUndefined();
  });

  test('lança RateLimitError quando attempts excede max', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ attempts: 9 }]);
    await expect(S.enforceRateLimit(sql, 'LOGIN', 'a@b.com', 8, 900)).rejects.toMatchObject({
      name: 'RateLimitError',
      expected: true,
    });
  });
});

describe('security.js — sessão', () => {
  test('resolveSession retorna null se não houver linha', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    const identity = await S.resolveSession(sql, PEPPER, 'algum-token');
    expect(identity).toBeNull();
  });

  test('resolveSession retorna null para conta banida mesmo com sessão válida no banco', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ profile_id: '1', role: 'member', status: 'banned', full_name: 'X', email: 'x@y.com', email_confirmed_at: '2024-01-01' }]);
    const identity = await S.resolveSession(sql, PEPPER, 'algum-token');
    expect(identity).toBeNull();
  });

  test('resolveSession retorna null se e-mail nunca foi confirmado', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ profile_id: '1', role: 'visitor', status: 'active', full_name: 'X', email: 'x@y.com', email_confirmed_at: null }]);
    const identity = await S.resolveSession(sql, PEPPER, 'algum-token');
    expect(identity).toBeNull();
  });

  test('resolveSession devolve identidade para sessão válida/ativa/confirmada', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ profile_id: '1', role: 'admin', status: 'active', full_name: 'X', email: 'x@y.com', email_confirmed_at: '2024-01-01' }]);
    const identity = await S.resolveSession(sql, PEPPER, 'algum-token');
    expect(identity).toMatchObject({ profileId: '1', role: 'admin' });
  });

  test('requireSession lança AuthError quando não há linha (sessão inexistente)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([]);
    await expect(S.requireSession(sql, PEPPER, 'token-invalido')).rejects.toMatchObject({ name: 'AuthError', expected: true });
  });

  test('requireSession lança mensagem ESPECÍFICA de banimento quando a sessão é válida mas a conta está banida (diferente de resolveSession, que trata como anônimo)', async () => {
    const sql = makeSql();
    sql.mockResolvedValueOnce([{ profile_id: '1', role: 'member', status: 'banned', full_name: 'X', email: 'x@y.com', email_confirmed_at: '2024-01-01' }]);
    await expect(S.requireSession(sql, PEPPER, 'token-valido-de-conta-banida')).rejects.toMatchObject({
      name: 'AuthError',
      message: expect.stringContaining('banida'),
    });
  });
});

describe('security.js — requireRole', () => {
  test('lança ForbiddenError se o papel não estiver na lista permitida', () => {
    expect(() => S.requireRole({ role: 'member' }, ['admin'])).toThrow(expect.objectContaining({ name: 'ForbiddenError' }));
  });

  test('não lança quando o papel está na lista', () => {
    expect(() => S.requireRole({ role: 'admin' }, ['admin'])).not.toThrow();
  });

  test('lança ForbiddenError quando identity é null (sessão anônima tentando ação restrita)', () => {
    expect(() => S.requireRole(null, ['admin'])).toThrow(expect.objectContaining({ name: 'ForbiddenError' }));
  });
});
