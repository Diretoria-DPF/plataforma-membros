import { jest } from '@jest/globals';
import * as AuthService from '../src/services/authService.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

// mailer.js chama fetch() de verdade (API da Resend) — mockamos fetch
// global para nenhum teste bater na rede.
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
});

describe('AuthService.login', () => {
  test('lança AuthError genérico para e-mail/senha inválidos, sem consultar o banco', async () => {
    const sql = makeSql();
    const env = makeEnv();
    await expect(AuthService.login(sql, env, '', '', '', 'cid-1')).rejects.toMatchObject({ name: 'AuthError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('e-mail inexistente: computa crypt() dummy (mitigação de timing) e devolve mensagem genérica', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // enforceRateLimit
      .mockResolvedValueOnce([]) // SELECT profiles — não encontrado
      .mockResolvedValueOnce([{ ignored: 'x' }]) // SELECT crypt(dummy)
      .mockResolvedValueOnce(undefined); // logAudit

    await expect(AuthService.login(sql, env, 'naoexiste@x.com', 'qualquercoisa', '', 'cid-1')).rejects.toMatchObject({
      name: 'AuthError',
      message: expect.stringContaining('inválidos'),
    });
    expect(sql).toHaveBeenCalledTimes(4);
  });

  test('login bem-sucedido cria sessão e devolve profile', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // enforceRateLimit
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'active', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: true }])
      .mockResolvedValueOnce(undefined) // INSERT sessions (createSession)
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AuthService.login(sql, env, 'fulano@x.com', 'senha-correta', 'UA', 'cid-1');
    expect(res.success).toBe(true);
    expect(res.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.profile).toEqual({ fullName: 'Fulano', role: 'member' });
  });

  test('senha errada (password_ok false) falha mesmo com conta ativa/confirmada', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'active', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: false }])
      .mockResolvedValueOnce(undefined);

    await expect(AuthService.login(sql, env, 'fulano@x.com', 'senha-errada', '', 'cid-1')).rejects.toMatchObject({ name: 'AuthError' });
  });

  test('conta banida falha mesmo com senha correta', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'banned', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: true }])
      .mockResolvedValueOnce(undefined);

    await expect(AuthService.login(sql, env, 'fulano@x.com', 'senha-correta', '', 'cid-1')).rejects.toMatchObject({ name: 'AuthError' });
  });

  test('excesso de tentativas propaga RateLimitError antes de qualquer SELECT em profiles', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql.mockResolvedValueOnce([{ attempts: 99 }]); // enforceRateLimit estoura
    await expect(AuthService.login(sql, env, 'fulano@x.com', 'senha', '', 'cid-1')).rejects.toMatchObject({ name: 'RateLimitError' });
    expect(sql).toHaveBeenCalledTimes(1);
  });
});

describe('AuthService.register', () => {
  test('rejeita senha curta antes de qualquer chamada ao banco', async () => {
    const sql = makeSql();
    const env = makeEnv();
    await expect(
      AuthService.register(sql, env, {
        fullName: 'Fulano de Tal',
        email: 'fulano@x.com',
        phone: '11999999999',
        password: 'curta',
        termsAccepted: true,
        privacyAccepted: true,
      }, 'cid-1')
    ).rejects.toMatchObject({ name: 'ValidationError' });
    expect(sql).not.toHaveBeenCalled();
  });

  test('rejeita quando termos/privacidade não foram aceitos', async () => {
    const sql = makeSql();
    const env = makeEnv();
    await expect(
      AuthService.register(sql, env, {
        fullName: 'Fulano de Tal',
        email: 'fulano@x.com',
        phone: '11999999999',
        password: 'senhagrande12345',
        termsAccepted: false,
        privacyAccepted: true,
      }, 'cid-1')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('cadastro válido: bloqueia e-mail duplicado antes de inserir', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit global
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit por e-mail
      .mockResolvedValueOnce([{ id: 'existing' }]); // SELECT id FROM profiles — já existe

    await expect(
      AuthService.register(sql, env, {
        fullName: 'Fulano de Tal',
        email: 'fulano@x.com',
        phone: '11999999999',
        password: 'senhagrande12345',
        termsAccepted: true,
        privacyAccepted: true,
      }, 'cid-1')
    ).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('cadastro válido: cria perfil, envia e-mail e audita sucesso', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit global
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit por e-mail
      .mockResolvedValueOnce([]) // e-mail não existe ainda
      .mockResolvedValueOnce([{ profile_id: 'novo-id' }]) // CTE de INSERT
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AuthService.register(sql, env, {
      fullName: 'Fulano de Tal',
      email: 'fulano@x.com',
      phone: '11999999999',
      password: 'senhagrande12345',
      termsAccepted: true,
      privacyAccepted: true,
    }, 'cid-1');

    expect(res.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('https://api.resend.com/emails', expect.any(Object));
  });
});
