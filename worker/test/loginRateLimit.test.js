/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * loginRateLimit.test.js — limites de tentativas do login contra um Postgres de verdade (PGlite com as
 * migrações): a ordem é por e-mail → por IP → global; o contador global só conta FALHAS de credencial e
 * nunca barra sozinho quem está dentro dos limites por e-mail e por IP — acima do limiar ele apenas
 * endurece esses limites (e audita uma vez por janela). Resposta de falha continua genérica e uniforme.
 */
import { jest } from '@jest/globals';
import * as AuthService from '../src/services/authService.js';
import { GENERIC_AUTH_FAILURE_MESSAGE, RATE_LIMITS } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const P_OK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const EMAIL_OK = 'membro@exemplo.com';
const PASS_OK = 'senha-correta-123';
const CID = '00000000-0000-4000-8000-0000000000a1';

const G = RATE_LIMITS.LOGIN_GLOBAL.MAX_ATTEMPTS;
const IP_MAX = RATE_LIMITS.LOGIN_IP.MAX_ATTEMPTS;
const EMAIL_MAX = RATE_LIMITS.LOGIN.MAX_ATTEMPTS;
const H_IP = RATE_LIMITS.LOGIN_HARDENED.IP_MAX_ATTEMPTS;
const H_EMAIL = RATE_LIMITS.LOGIN_HARDENED.EMAIL_MAX_ATTEMPTS;

let db;
let sql;

const envFor = (ip) => makeEnv({ clientIp: ip });
const login = (email, password, ip) => AuthService.login(sql, envFor(ip), email, password, 'UA', CID);
const outcome = (promise) => promise.then((r) => ({ ok: true, r }), (e) => ({ ok: false, name: e.name, message: e.message }));
const globalBucketRows = async () => (await db.query("SELECT attempts FROM rate_limit_buckets WHERE bucket = 'LOGIN_GLOBAL_FAILURES'")).rows;
const globalFailures = async () => (await globalBucketRows()).reduce((n, r) => n + r.attempts, 0);
const ipOf = (i) => '198.51.' + Math.floor(i / 250) + '.' + ((i % 250) + 1);

/** `n` falhas, cada uma de um IP e de um e-mail diferentes (nenhum limite individual é tocado). */
async function distributedFailures(n, offset = 0) {
  for (let i = offset; i < offset + n; i += 1) {
    await outcome(login('alvo' + i + '@exemplo.com', 'errada', ipOf(i)));
  }
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, email_confirmed_at)
     VALUES ($1, 'Membro OK', 'membro_ok', $2, crypt($3, gen_salt('bf', 4)), '11999990000', 'member', now())`,
    [P_OK, EMAIL_OK, PASS_OK],
  );
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
  await db.exec('DELETE FROM rate_limit_buckets; DELETE FROM sessions; DELETE FROM audit_logs;');
});

describe('login — o teto global não trava quem está dentro dos limites', () => {
  test('rajada de falhas distribuídas acima do limiar global NÃO impede login válido de IP limpo', async () => {
    await distributedFailures(G + 10);
    const res = await outcome(login(EMAIL_OK, PASS_OK, '203.0.113.77'));
    expect(res.ok).toBe(true);
    expect(res.r.sessionToken).toMatch(/^[0-9a-f]{64}$/);
  }, 60000);

  test('login bem-sucedido não incrementa o contador global', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await outcome(login(EMAIL_OK, PASS_OK, '203.0.113.' + (10 + i)))).ok).toBe(true);
    }
    expect(await globalFailures()).toBe(0);
  });

  test('cada falha de credencial incrementa o contador global uma vez', async () => {
    await outcome(login(EMAIL_OK, 'errada', '203.0.113.20'));
    await outcome(login('naoexiste@exemplo.com', 'errada', '203.0.113.21'));
    expect(await globalFailures()).toBe(2);
  });

  test('acima do limiar global, o limite por IP fica mais estrito (e o por e-mail também)', async () => {
    await distributedFailures(G + 1);
    const ip = '203.0.113.50';
    const results = [];
    for (let i = 0; i < H_IP + 1; i += 1) results.push(await outcome(login('outro' + i + '@exemplo.com', 'errada', ip)));
    expect(results.slice(0, H_IP).every((r) => r.name === 'AuthError')).toBe(true);
    expect(results[H_IP].name).toBe('RateLimitError');

    const email = 'vitima@exemplo.com';
    const byEmail = [];
    for (let i = 0; i < H_EMAIL + 1; i += 1) byEmail.push(await outcome(login(email, 'errada', '192.0.2.' + (i + 1))));
    expect(byEmail.slice(0, H_EMAIL).every((r) => r.name === 'AuthError')).toBe(true);
    expect(byEmail[H_EMAIL].name).toBe('RateLimitError');
  }, 60000);

  test('acima do limiar global, logins BEM-SUCEDIDOS de um IP compartilhado (NAT) não esgotam o limite endurecido', async () => {
    await distributedFailures(G + 1);
    for (let i = 0; i < H_IP + 3; i += 1) {
      expect((await outcome(login(EMAIL_OK, PASS_OK, '203.0.113.60'))).ok).toBe(true);
      await db.exec("DELETE FROM rate_limit_buckets WHERE bucket = 'LOGIN'"); // isola o teste do limite por e-mail
    }
  }, 60000);

  test('cruzar o limiar global gera UMA auditoria por janela, sem e-mail nem IP', async () => {
    await distributedFailures(G + 5);
    const rows = (await db.query("SELECT action, result, details FROM audit_logs WHERE action = 'LOGIN_THROTTLE'")).rows;
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toMatch(/@|198\.51/);
  }, 60000);
});

describe('login — limites individuais continuam valendo', () => {
  test('limite por e-mail bloqueia força bruta de IPs distintos', async () => {
    const results = [];
    for (let i = 0; i < EMAIL_MAX + 1; i += 1) results.push(await outcome(login(EMAIL_OK, 'errada' + i, '192.0.2.' + (i + 1))));
    expect(results[EMAIL_MAX].name).toBe('RateLimitError');
    // Nem a senha certa passa enquanto a janela do e-mail estiver estourada.
    expect((await outcome(login(EMAIL_OK, PASS_OK, '192.0.2.200'))).name).toBe('RateLimitError');
  });

  test('limite por IP bloqueia rotação de e-mails a partir de uma origem', async () => {
    const results = [];
    for (let i = 0; i < IP_MAX + 1; i += 1) results.push(await outcome(login('rot' + i + '@exemplo.com', 'errada', '203.0.113.99')));
    expect(results[IP_MAX].name).toBe('RateLimitError');
  });

  test('a ordem de verificação é e-mail antes de IP antes do global', async () => {
    const calls = [];
    const spy = async (strings, ...values) => {
      const text = strings.join('?');
      if (text.includes('rate_limit_buckets')) calls.push(values.find((v) => typeof v === 'string' && /^LOGIN/.test(v)));
      return sql(strings, ...values);
    };
    await outcome(AuthService.login(spy, envFor('203.0.113.5'), EMAIL_OK, 'errada', 'UA', CID));
    expect(calls.slice(0, 3)).toEqual(['LOGIN', 'LOGIN_IP', 'LOGIN_GLOBAL_FAILURES']);
  });
});

describe('login — resposta uniforme', () => {
  test('e-mail inexistente e senha errada devolvem o mesmo erro genérico, inclusive sob o limiar global', async () => {
    const before = [await outcome(login('naoexiste@exemplo.com', 'x', '192.0.2.1')), await outcome(login(EMAIL_OK, 'x', '192.0.2.2'))];
    await distributedFailures(G + 1, 1000);
    const after = [await outcome(login('naoexiste2@exemplo.com', 'x', '192.0.2.3')), await outcome(login(EMAIL_OK, 'x', '192.0.2.4'))];
    for (const r of [...before, ...after]) {
      expect(r).toEqual({ ok: false, name: 'AuthError', message: GENERIC_AUTH_FAILURE_MESSAGE });
    }
  }, 60000);
});
