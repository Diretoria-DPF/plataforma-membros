/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * confirmationService.test.js — SEC-02 (cadastro sem saída) contra um Postgres de verdade (PGlite com as migrações):
 * reenvio uniforme, intervalo mínimo e limites, token antigo invalidado, recadastro sem "já existe", redefinição de
 * senha que confirma o e-mail, faxina dos cadastros nunca confirmados e teto diário de e-mails.
 */
import { jest } from '@jest/globals';
import * as AuthService from '../src/services/authService.js';
import * as ConfirmationService from '../src/services/confirmationService.js';
import { RESEND_RATE_LIMITS, EMAIL_DAILY_MAX } from '../src/constants.js';
import { runMaintenance, RETENTION } from '../src/maintenance.js';
import { API_REGISTRY } from '../src/handlers.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000c2';
const {
  REGISTER_SUCCESS_MESSAGE, RESEND_GENERIC_MESSAGE, RESEND_COOLDOWN_MESSAGE, EMAIL_QUOTA_MESSAGE,
} = ConfirmationService;

let db;
let sql;
let env;
let seq = 0;

const nextEmail = (tag) => { seq += 1; return `${tag}${seq}@exemplo.com`; };
const registration = (email, over = {}) => ({
  fullName: 'Pessoa de Teste', username: 'user_' + email.split('@')[0], email, phone: '11999990000',
  password: 'senha-forte-123', termsAccepted: true, privacyAccepted: true, ...over,
});
const register = (input) => AuthService.register(sql, env, input, CID);
const resend = (email) => ConfirmationService.resendConfirmation(sql, env, email, CID);
const sentBodies = () => global.fetch.mock.calls.map((c) => JSON.parse(c[1].body));
const lastToken = (mode = 'confirm') => {
  const bodies = sentBodies();
  const match = bodies[bodies.length - 1].textContent.match(new RegExp('mode=' + mode + '&token=([0-9a-zA-Z%_-]+)'));
  return decodeURIComponent(match[1]);
};
const profileOf = async (email) => (await db.query('SELECT * FROM profiles WHERE email = $1', [email])).rows[0];
const pendingTokens = async (profileId) => (await db.query(
  "SELECT id FROM account_tokens WHERE profile_id = $1 AND token_type = 'email_confirmation' AND used_at IS NULL", [profileId])).rows;
const clearCooldown = () => db.query("DELETE FROM rate_limit_buckets WHERE bucket = 'RESEND_COOLDOWN'");

async function errorOf(promise) {
  return promise.then(() => null, (e) => e);
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  env = makeEnv();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
  await db.exec('DELETE FROM rate_limit_buckets; DELETE FROM audit_logs; DELETE FROM error_logs;');
});

describe('apiResendConfirmation — resposta uniforme', () => {
  test('está no registro público de ações e devolve a mesma resposta pelo handler', async () => {
    const res = await API_REGISTRY.apiResendConfirmation(sql, env, [{ email: nextEmail('ninguem') }]);
    expect(res).toEqual({ success: true, message: RESEND_GENERIC_MESSAGE, cooldownSeconds: 120 });
  });

  test('não confirmada, inexistente e confirmada: a MESMA resposta; só a não confirmada recebe e-mail', async () => {
    const pending = nextEmail('pendente');
    const confirmed = nextEmail('confirmada');
    await register(registration(pending));
    await register(registration(confirmed));
    await db.query('UPDATE profiles SET email_confirmed_at = now() WHERE email = $1', [confirmed]);
    global.fetch.mockClear();

    const answers = [await resend(pending), await resend(nextEmail('inexistente')), await resend(confirmed)];
    answers.forEach((a) => expect(a).toEqual(answers[0]));
    expect(answers[0]).toEqual({ success: true, message: RESEND_GENERIC_MESSAGE, cooldownSeconds: RESEND_RATE_LIMITS.RESEND_COOLDOWN.WINDOW_SECONDS });
    expect(sentBodies().map((b) => b.to[0].email)).toEqual([pending]);
  });

  test('e-mail mal formado é erro de formato (antes de qualquer consulta por conta)', async () => {
    const err = await errorOf(resend('nao-e-email'));
    expect(err).toMatchObject({ name: 'ValidationError' });
  });

  test('conta banida não confirmada não recebe reenvio', async () => {
    const email = nextEmail('banida');
    await register(registration(email));
    await db.query("UPDATE profiles SET status = 'banned' WHERE email = $1", [email]);
    global.fetch.mockClear();
    expect(await resend(email)).toMatchObject({ success: true, message: RESEND_GENERIC_MESSAGE });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('apiResendConfirmation — token, intervalo e limites', () => {
  test('o token anterior é invalidado e o novo confirma a conta (guardado só como hash)', async () => {
    const email = nextEmail('token');
    await register(registration(email));
    const first = lastToken();
    await resend(email);
    const second = lastToken();
    expect(second).not.toBe(first);

    const profile = await profileOf(email);
    expect(await pendingTokens(profile.id)).toHaveLength(1);
    const stored = (await db.query('SELECT token_hash FROM account_tokens WHERE profile_id = $1', [profile.id])).rows;
    stored.forEach((r) => expect(r.token_hash).not.toBe(second));

    await expect(AuthService.confirmEmail(sql, env, first, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    await expect(AuthService.confirmEmail(sql, env, second, CID)).resolves.toMatchObject({ success: true });
  });

  test('intervalo mínimo: o 2º pedido em menos de 2 minutos é recusado, igual para qualquer e-mail', async () => {
    const email = nextEmail('cooldown');
    await register(registration(email));
    await resend(email);
    const err = await errorOf(resend(email));
    expect(err).toMatchObject({ name: 'RateLimitError', message: RESEND_COOLDOWN_MESSAGE });

    const ghost = nextEmail('fantasma');
    await resend(ghost);
    expect(await errorOf(resend(ghost))).toMatchObject({ name: 'RateLimitError', message: RESEND_COOLDOWN_MESSAGE });
  });

  test('limite por e-mail na hora (além do intervalo mínimo)', async () => {
    const email = nextEmail('porhora');
    for (let i = 0; i < RESEND_RATE_LIMITS.RESEND_EMAIL.MAX_ATTEMPTS; i += 1) {
      await clearCooldown();
      await resend(email);
    }
    await clearCooldown();
    expect(await errorOf(resend(email))).toMatchObject({ name: 'RateLimitError' });
  });

  test('limite por IP, com e-mails diferentes', async () => {
    for (let i = 0; i < RESEND_RATE_LIMITS.RESEND_IP.MAX_ATTEMPTS; i += 1) await resend(nextEmail('ip'));
    expect(await errorOf(resend(nextEmail('ip')))).toMatchObject({ name: 'RateLimitError' });
    env = makeEnv({ clientIp: '198.51.100.7' });
    await expect(resend(nextEmail('ip'))).resolves.toMatchObject({ success: true });
  });

  test('com env.waitUntil, o e-mail sai depois da resposta (o tempo não revela se houve envio)', async () => {
    const email = nextEmail('adiado');
    await register(registration(email));
    global.fetch.mockClear();
    const pending = [];
    env = makeEnv({ waitUntil: (p) => pending.push(p) });
    await resend(email);
    await resend(nextEmail('adiado-inexistente'));
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(sentBodies().map((b) => b.to[0].email)).toEqual([email]);
  });
});

describe('cadastro com e-mail já existente (sem enumeração)', () => {
  test('não confirmada: mesma resposta de um cadastro novo, vira reenvio e NÃO altera a conta', async () => {
    const email = nextEmail('recadastro');
    const fresh = await register(registration(email));
    expect(fresh).toEqual({ success: true, message: REGISTER_SUCCESS_MESSAGE });
    const before = await profileOf(email);
    const firstToken = lastToken();

    const again = await register(registration(email, { fullName: 'Outro Nome', password: 'outra-senha-456', username: 'outro_' + seq }));
    expect(again).toEqual(fresh);
    const after = await profileOf(email);
    expect(after.full_name).toBe(before.full_name);
    expect(after.username).toBe(before.username);
    expect(after.password_hash).toBe(before.password_hash);
    expect(lastToken()).not.toBe(firstToken);
    expect(await pendingTokens(before.id)).toHaveLength(1);
    expect((await db.query('SELECT count(*)::int AS n FROM profiles WHERE email = $1', [email])).rows[0].n).toBe(1);
  });

  test('não confirmada com o MESMO nome de usuário: segue como recadastro (não acusa nome em uso)', async () => {
    const email = nextEmail('mesmonome');
    await register(registration(email));
    await expect(register(registration(email))).resolves.toEqual({ success: true, message: REGISTER_SUCCESS_MESSAGE });
  });

  test('confirmada: resposta idêntica e aviso ao dono, no máximo 1 por dia', async () => {
    const email = nextEmail('dona');
    await register(registration(email));
    await db.query('UPDATE profiles SET email_confirmed_at = now() WHERE email = $1', [email]);
    global.fetch.mockClear();

    const first = await register(registration(email));
    const second = await register(registration(email));
    expect(first).toEqual({ success: true, message: REGISTER_SUCCESS_MESSAGE });
    expect(second).toEqual(first);
    const bodies = sentBodies();
    expect(bodies).toHaveLength(1);
    expect(bodies[0].subject).toMatch(/Tentativa de cadastro/);
    expect(bodies[0].textContent).not.toMatch(/token=/);
  });

  test('nome de usuário de outra pessoa: erro de campo, igual exista ou não o e-mail', async () => {
    const owner = nextEmail('dono');
    await register(registration(owner, { username: 'nome_disputado' }));
    const msgs = [];
    for (const email of [owner + '.br', nextEmail('qualquer')]) {
      const err = await errorOf(register(registration(email, { username: 'nome_disputado' })));
      msgs.push(err && err.message);
    }
    expect(msgs).toEqual(['Este nome de usuário já está em uso.', 'Este nome de usuário já está em uso.']);
  });
});

describe('redefinição de senha confirma o e-mail', () => {
  test('conta não confirmada: o reset confirma, apaga os links de confirmação pendentes e o login passa', async () => {
    const email = nextEmail('reset');
    await register(registration(email));
    const confirmToken = lastToken();
    await AuthService.requestPasswordReset(sql, env, email, CID);
    const resetToken = lastToken('reset');

    await expect(AuthService.confirmPasswordReset(sql, env, resetToken, 'nova-senha-789', CID)).resolves.toMatchObject({ success: true });
    const profile = await profileOf(email);
    expect(profile.email_confirmed_at).not.toBeNull();
    expect(await pendingTokens(profile.id)).toHaveLength(0);
    await expect(AuthService.confirmEmail(sql, env, confirmToken, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    await expect(AuthService.login(sql, env, email, 'nova-senha-789', 'UA', CID)).resolves.toMatchObject({ success: true });
  });

  test('conta já confirmada mantém a data original de confirmação', async () => {
    const email = nextEmail('jaconfirmada');
    await register(registration(email));
    await db.query("UPDATE profiles SET email_confirmed_at = '2026-01-02T00:00:00Z' WHERE email = $1", [email]);
    await AuthService.requestPasswordReset(sql, env, email, CID);
    await AuthService.confirmPasswordReset(sql, env, lastToken('reset'), 'nova-senha-789', CID);
    expect((await profileOf(email)).email_confirmed_at.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});

describe('faxina dos cadastros nunca confirmados', () => {
  async function addProfile(tag, over = {}) {
    const email = nextEmail(tag);
    const row = { role: 'visitor', status: 'active', email_confirmed_at: null, age_days: 8, ...over };
    const res = await db.query(
      `INSERT INTO profiles (full_name, username, email, password_hash, phone, role, status, email_confirmed_at, created_at)
       VALUES ('Pessoa Teste', $1, $2, 'x', '11999990000', $3, $4, $5, now() - make_interval(days => $6)) RETURNING id`,
      ['u_' + seq, email, row.role, row.status, row.email_confirmed_at, row.age_days],
    );
    return res.rows[0].id;
  }
  const exists = async (id) => (await db.query('SELECT 1 FROM profiles WHERE id = $1', [id])).rows.length === 1;

  test('apaga só visitante ativo, não confirmado, com mais de 7 dias, sem sessão; tokens vão junto', async () => {
    const stale = await addProfile('velho');
    await db.query("INSERT INTO account_tokens (profile_id, token_type, token_hash, expires_at) VALUES ($1, 'email_confirmation', 'h-velho', now())", [stale]);
    const kept = {
      confirmed: await addProfile('conf', { email_confirmed_at: new Date().toISOString() }),
      admin: await addProfile('adm', { role: 'admin' }),
      member: await addProfile('mem', { role: 'member' }),
      banned: await addProfile('ban', { status: 'banned' }),
      recent: await addProfile('novo', { age_days: 6 }),
      withSession: await addProfile('sess'),
    };
    await db.query("INSERT INTO sessions (profile_id, token_hash, expires_at) VALUES ($1, 'h-sessao', now() + interval '1 day')", [kept.withSession]);

    const res = await runMaintenance(sql, CID);
    expect(res.unconfirmedProfilesPurge).toBeGreaterThanOrEqual(1);
    expect(await exists(stale)).toBe(false);
    expect((await db.query('SELECT 1 FROM account_tokens WHERE profile_id = $1', [stale])).rows).toHaveLength(0);
    for (const id of Object.values(kept)) expect(await exists(id)).toBe(true);
  });

  test('respeita o LIMIT do lote', async () => {
    await runMaintenance(sql, CID); // zera o que sobrou de outros testes
    const total = RETENTION.UNCONFIRMED_PROFILE_BATCH + 3;
    for (let i = 0; i < total; i += 1) await addProfile('lote');
    const first = await runMaintenance(sql, CID);
    expect(first.unconfirmedProfilesPurge).toBe(RETENTION.UNCONFIRMED_PROFILE_BATCH);
    const second = await runMaintenance(sql, CID);
    expect(second.unconfirmedProfilesPurge).toBe(3);
    expect(RETENTION.UNCONFIRMED_PROFILE_DAYS).toBe(7);
  });
});

describe('teto diário de e-mails', () => {
  test('padrão ~80% do plano de 300/dia e configurável pela variável do Worker', () => {
    expect(EMAIL_DAILY_MAX).toBe(240);
    expect(ConfirmationService.emailDailyMax({})).toBe(240);
    expect(ConfirmationService.emailDailyMax({ EMAIL_DAILY_MAX: '50' })).toBe(50);
    expect(ConfirmationService.emailDailyMax({ EMAIL_DAILY_MAX: 'abc' })).toBe(240);
    expect(ConfirmationService.emailDailyMax({ EMAIL_DAILY_MAX: '-1' })).toBe(240);
  });

  test('acima do teto: "tente mais tarde" para qualquer e-mail (cadastro, reenvio e reset) e uma auditoria', async () => {
    env = makeEnv({ EMAIL_DAILY_MAX: '2' });
    await register(registration(nextEmail('cota')));
    await register(registration(nextEmail('cota')));
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const blocked = [
      await errorOf(register(registration(nextEmail('cota')))),
      await errorOf(resend(nextEmail('cota'))),
      await errorOf(AuthService.requestPasswordReset(sql, env, nextEmail('cota'), CID)),
    ];
    blocked.forEach((err) => expect(err).toMatchObject({ name: 'RateLimitError', message: EMAIL_QUOTA_MESSAGE }));
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const alerts = (await db.query("SELECT details FROM audit_logs WHERE action = 'EMAIL_QUOTA_REACHED'")).rows;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].details).toEqual({ max: 2, windowSeconds: 86400 });
  });

  test('falha da Brevo vai a error_logs só com o status, sem o endereço nem o corpo da resposta', async () => {
    const email = nextEmail('falha');
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => `{"message":"invalid ${email}"}` });
    await expect(register(registration(email))).resolves.toEqual({ success: true, message: REGISTER_SUCCESS_MESSAGE });
    const rows = (await db.query("SELECT code, message, context FROM error_logs WHERE code = 'MAIL_CONFIRMATION_FAILED'")).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].context.status).toBe(400);
    expect(JSON.stringify(rows[0])).not.toMatch(/@/);
  });
});
