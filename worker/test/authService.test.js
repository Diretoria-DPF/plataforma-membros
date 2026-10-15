/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as AuthService from '../src/services/authService.js';
import { GENERIC_AUTH_FAILURE_MESSAGE } from '../src/constants.js';
import { makeEnv, makeSql } from './helpers/mockEnv.js';

const SENHA_TESTE = ['senha', 'grande', '12345'].join('');

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
      .mockResolvedValueOnce([{ attempts: 1 }]) // limite LOGIN (por e-mail)
      .mockResolvedValueOnce([{ attempts: 1 }]) // limite LOGIN_IP
      .mockResolvedValueOnce([]) // leitura do contador global de falhas (sem escrita)
      .mockResolvedValueOnce([]) // SELECT profiles — não encontrado
      .mockResolvedValueOnce([{ ignored: 'x' }]) // SELECT crypt(dummy)
      .mockResolvedValueOnce(undefined) // logAudit
      .mockResolvedValueOnce([{ attempts: 1 }]) // falha soma no contador do IP
      .mockResolvedValueOnce([{ attempts: 1 }]); // falha soma no contador global

    await expect(AuthService.login(sql, env, 'naoexiste@x.com', 'qualquercoisa', '', 'cid-1')).rejects.toMatchObject({
      name: 'AuthError',
      message: expect.stringContaining('inválidos'),
    });
    expect(sql).toHaveBeenCalledTimes(8);
  });

  test('login bem-sucedido cria sessão e devolve profile', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // limite LOGIN (por e-mail)
      .mockResolvedValueOnce([{ attempts: 1 }]) // limite LOGIN_IP
      .mockResolvedValueOnce([]) // leitura do contador global de falhas (sem escrita)
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'active', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: true }])
      .mockResolvedValueOnce([]) // mfa_credentials: sem MFA
      .mockResolvedValueOnce(undefined) // INSERT sessions (createSession)
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AuthService.login(sql, env, 'fulano@x.com', 'senha-correta', 'UA', 'cid-1');
    expect(res.success).toBe(true);
    expect(res.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    // O front precisa do id do PRÓPRIO perfil (onboarding por conta). Chave exata: nada de e-mail nem telefone.
    expect(res.profile).toEqual({ id: 'p1', fullName: 'Fulano', role: 'member' });
    expect(Object.keys(res.profile).sort()).toEqual(['fullName', 'id', 'role']);
    expect(Object.keys(res).sort()).toEqual(['message', 'profile', 'sessionToken', 'success']);
    expect(JSON.stringify(res)).not.toMatch(/@|phone|telefone|password|senha-correta/i);
    expect(res.mfaRequired).toBeUndefined();
  });

  test('com MFA ativa a senha certa NÃO cria sessão: devolve o desafio', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN (por e-mail)
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN_IP
      .mockResolvedValueOnce([]) // leitura do contador global de falhas
      .mockResolvedValueOnce([{ id: 'p1', role: 'admin', status: 'active', full_name: 'Ana', email_confirmed_at: '2024-01-01', password_ok: true }])
      .mockResolvedValueOnce([{ profile_id: 'p1', secret_enc: 'v1.a.b', confirmed_at: '2026-10-01', last_used_step: 0 }]) // mfa_credentials
      .mockResolvedValueOnce(undefined) // INSERT mfa_challenges
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AuthService.login(sql, env, 'ana@x.com', 'senha-correta', 'UA', 'cid-1');
    expect(res).toMatchObject({ success: true, mfaRequired: true });
    expect(res.mfaToken).toMatch(/^[0-9a-f]{64}$/);
    expect(res.sessionToken).toBeUndefined();
    const sqlTexts = sql.mock.calls.map((c) => (Array.isArray(c[0]) ? c[0].join('?') : String(c[0])));
    expect(sqlTexts.some((t) => t.includes('INSERT INTO sessions'))).toBe(false);
  });

  test('senha errada (password_ok false) falha mesmo com conta ativa/confirmada', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN (por e-mail)
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN_IP
      .mockResolvedValueOnce([]) // leitura do contador global de falhas
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'active', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: false }])
      .mockResolvedValueOnce(undefined) // logAudit
      .mockResolvedValueOnce([{ attempts: 1 }]) // falha soma no contador do IP
      .mockResolvedValueOnce([{ attempts: 1 }]); // falha soma no contador global

    await expect(AuthService.login(sql, env, 'fulano@x.com', 'senha-errada', '', 'cid-1')).rejects.toMatchObject({ name: 'AuthError' });
  });

  test('conta banida com senha CORRETA recebe mensagem especifica de banimento', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN (por e-mail)
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN_IP
      .mockResolvedValueOnce([]) // leitura do contador global de falhas
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'banned', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: true }])
      .mockResolvedValueOnce(undefined);

    await expect(AuthService.login(sql, env, 'fulano@x.com', 'senha-correta', '', 'cid-1')).rejects.toMatchObject({
      name: 'AuthError',
      message: expect.stringContaining('banida'),
    });
  });

  test('conta banida com senha ERRADA continua recebendo a mensagem generica (nao revela banimento sem saber a senha)', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN (por e-mail)
      .mockResolvedValueOnce([{ attempts: 1 }]) // LOGIN_IP
      .mockResolvedValueOnce([]) // leitura do contador global de falhas
      .mockResolvedValueOnce([{ id: 'p1', role: 'member', status: 'banned', full_name: 'Fulano', email_confirmed_at: '2024-01-01', password_ok: false }])
      .mockResolvedValueOnce(undefined) // logAudit
      .mockResolvedValueOnce([{ attempts: 1 }]) // falha soma no contador do IP
      .mockResolvedValueOnce([{ attempts: 1 }]); // falha soma no contador global

    await expect(AuthService.login(sql, env, 'fulano@x.com', 'senha-errada', '', 'cid-1')).rejects.toMatchObject({
      name: 'AuthError',
      message: GENERIC_AUTH_FAILURE_MESSAGE,
    });
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
        password: SENHA_TESTE,
        termsAccepted: false,
        privacyAccepted: true,
      }, 'cid-1')
    ).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('cadastro com e-mail já existente: mesma resposta de sucesso, sem "já existe" e sem inserir (SEC-02)', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit global
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit por IP
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit por e-mail
      .mockResolvedValueOnce([]) // teto diário de e-mails (só leitura)
      .mockResolvedValueOnce([]) // nome de usuário livre
      .mockResolvedValueOnce([{ id: 'existing', email_confirmed_at: '2026-01-01' }]) // e-mail já confirmado
      .mockResolvedValueOnce([{ ignored: 'x' }]) // crypt() que iguala o custo do bcrypt
      .mockResolvedValueOnce([{ attempts: 2 }]) // aviso ao dono já enviado hoje: não reenvia
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AuthService.register(sql, env, {
      fullName: 'Fulano de Tal',
      username: 'fulano123',
      email: 'fulano@x.com',
      phone: '11999999999',
      password: SENHA_TESTE,
      termsAccepted: true,
      privacyAccepted: true,
    }, 'cid-1');
    expect(res).toEqual({ success: true, message: expect.stringContaining('Enviamos um e-mail de confirmação se o endereço puder ser cadastrado') });
    const texts = sql.mock.calls.map((c) => (Array.isArray(c[0]) ? c[0].join('?') : String(c[0])));
    expect(texts.some((t) => /INSERT INTO profiles/.test(t))).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('nome de usuário de OUTRA conta: erro de campo, sem consultar o e-mail', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([{ attempts: 1 }])
      .mockResolvedValueOnce([]) // teto diário
      .mockResolvedValueOnce([{ email: 'outra@x.com' }]); // nome de usuário de outra pessoa
    await expect(AuthService.register(sql, env, {
      fullName: 'Fulano de Tal', username: 'fulano123', email: 'fulano@x.com', phone: '11999999999',
      password: SENHA_TESTE, termsAccepted: true, privacyAccepted: true,
    }, 'cid-1')).rejects.toMatchObject({ name: 'ConflictError', message: 'Este nome de usuário já está em uso.' });
    expect(sql).toHaveBeenCalledTimes(5);
  });

  test('cadastro válido: cria perfil, envia e-mail e audita sucesso', async () => {
    const sql = makeSql();
    const env = makeEnv();
    sql
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit global
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit por IP
      .mockResolvedValueOnce([{ attempts: 1 }]) // rate limit por e-mail
      .mockResolvedValueOnce([]) // teto diário de e-mails (só leitura)
      .mockResolvedValueOnce([]) // username não existe ainda
      .mockResolvedValueOnce([]) // e-mail não existe ainda
      .mockResolvedValueOnce([{ profile_id: 'novo-id' }]) // CTE de INSERT
      .mockResolvedValueOnce([{ attempts: 1 }]) // conta 1 no teto diário de e-mails
      .mockResolvedValueOnce(undefined); // logAudit

    const res = await AuthService.register(sql, env, {
      fullName: 'Fulano de Tal',
      username: 'fulano123',
      email: 'fulano@x.com',
      phone: '11999999999',
      password: SENHA_TESTE,
      termsAccepted: true,
      privacyAccepted: true,
    }, 'cid-1');

    expect(res.success).toBe(true);
    expect(res.message).toMatch(/^Enviamos um e-mail de confirmação se o endereço puder ser cadastrado/);
    expect(global.fetch).toHaveBeenCalledWith('https://api.brevo.com/v3/smtp/email', expect.any(Object));
  });
});
