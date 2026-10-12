/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// touchSession ignora no SERVIDOR o toque se a sessão foi estendida há menos de
// 5 min. Não há coluna de "último acesso": o último deslize é inferido de
// expires_at (= toque + 30 min, limitado a created_at + 12 h). SQL real (PGlite).
import { jest } from '@jest/globals';
import * as S from '../src/security.js';
import { LIMITS } from '../src/constants.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const PEPPER = 'test-pepper-value-not-for-production';
const PROFILE = '33333333-3333-4333-8333-333333333333';
const TTL = LIMITS.SESSION_TTL_MINUTES; // 30
const MIN_INTERVAL = LIMITS.SESSION_TOUCH_MIN_INTERVAL_MINUTES; // 5
const ABS_HOURS = LIMITS.SESSION_ABSOLUTE_MAX_HOURS; // 12

let db;
let sql;
let counter = 0;

beforeAll(async () => {
  jest.setTimeout(120000);
  db = await createMigratedDb();
  sql = toSql(db);
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, status, email_confirmed_at)
     VALUES ($1, 'Membro Sessao', 'membro_sessao', 'sessao@exemplo.com', 'x', '11999990000', 'member', 'active', now())`,
    [PROFILE]
  );
}, 120000);

afterAll(async () => { if (db) await db.close(); });

/**
 * Cria uma sessão cuja idade e cujo último deslize são dados em minutos:
 * createdAgoMin = há quanto tempo foi criada; expiresInMin = quanto falta p/ expirar.
 */
async function makeSession({ createdAgoMin, expiresInMin, revoked = false }) {
  counter += 1;
  const token = 'token-sessao-' + counter;
  const hash = await S.hashToken(token, PEPPER);
  await db.query(
    `INSERT INTO sessions (profile_id, token_hash, created_at, expires_at, revoked_at)
     VALUES ($1, $2, now() - ($3 || ' minutes')::interval, now() + ($4 || ' minutes')::interval,
             CASE WHEN $5::boolean THEN now() ELSE NULL END)`,
    [PROFILE, hash, String(createdAgoMin), String(expiresInMin), revoked]
  );
  return { token, hash };
}

/** Minutos entre agora e o expires_at da sessão (negativo = já expirou). */
async function minutesLeft(hash) {
  const res = await db.query(`SELECT extract(epoch FROM (expires_at - now())) / 60 AS m FROM sessions WHERE token_hash = $1`, [hash]);
  return Number(res.rows[0].m);
}

describe('touchSession — limite de 5 min no servidor', () => {
  test('constantes: toque mínimo de 5 min, bem abaixo do TTL de 30 min da sessão', () => {
    expect(MIN_INTERVAL).toBe(5);
    expect(MIN_INTERVAL).toBeLessThan(TTL);
  });

  test('toque logo após o login (sessão nova, sem deslize anterior) é ignorado', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 1, expiresInMin: TTL - 1 });
    const before = await minutesLeft(hash);
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(before, 1);
  });

  test('último deslize há 1 min (restam 29): ignorado, expires_at não muda', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 40, expiresInMin: TTL - 1 });
    const before = await minutesLeft(hash);
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(before, 1);
  });

  test('último deslize há 4 min (restam 26): ainda ignorado', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 60, expiresInMin: TTL - 4 });
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(26, 1);
  });

  test('último deslize há 4,9 min (restam 25,1): logo antes do limite, ignorado', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 60, expiresInMin: TTL - (MIN_INTERVAL - 0.1) });
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(TTL - (MIN_INTERVAL - 0.1), 1);
  });

  test('último deslize há 5,1 min (restam 24,9): logo depois do limite, estende para ~30 min', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 60, expiresInMin: TTL - (MIN_INTERVAL + 0.1) });
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(TTL, 1);
  });

  test('último deslize há 6 min (restam 24): estende para ~30 min', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 60, expiresInMin: TTL - 6 });
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(TTL, 1);
  });

  test('último deslize há 29 min (resta 1): estende para ~30 min — a sessão não cai por causa do limite', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 120, expiresInMin: 1 });
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(TTL, 1);
  });

  test('nunca encurta: a sessão ignorada mantém exatamente o expires_at que tinha', async () => {
    const { token, hash } = await makeSession({ createdAgoMin: 10, expiresInMin: 28 });
    const stored = await db.query(`SELECT expires_at FROM sessions WHERE token_hash = $1`, [hash]);
    await S.touchSession(sql, PEPPER, token);
    const after = await db.query(`SELECT expires_at FROM sessions WHERE token_hash = $1`, [hash]);
    expect(after.rows[0].expires_at.getTime()).toBe(stored.rows[0].expires_at.getTime());
  });

  test('teto absoluto de 12 h continua valendo: perto do teto estende só até created_at + 12 h', async () => {
    const createdAgoMin = ABS_HOURS * 60 - 10; // faltam 10 min para o teto
    const { token, hash } = await makeSession({ createdAgoMin, expiresInMin: 2 });
    await S.touchSession(sql, PEPPER, token);
    expect(await minutesLeft(hash)).toBeCloseTo(10, 1);
  });

  test('sessão já no teto absoluto não é reescrita (nada a estender)', async () => {
    const createdAgoMin = ABS_HOURS * 60 - 10;
    const { token, hash } = await makeSession({ createdAgoMin, expiresInMin: 10 });
    const stored = await db.query(`SELECT expires_at FROM sessions WHERE token_hash = $1`, [hash]);
    await S.touchSession(sql, PEPPER, token);
    const after = await db.query(`SELECT expires_at FROM sessions WHERE token_hash = $1`, [hash]);
    expect(after.rows[0].expires_at.getTime()).toBe(stored.rows[0].expires_at.getTime());
  });

  test('sessão expirada ou revogada nunca é ressuscitada', async () => {
    const expired = await makeSession({ createdAgoMin: 120, expiresInMin: -5 });
    await S.touchSession(sql, PEPPER, expired.token);
    expect(await minutesLeft(expired.hash)).toBeLessThan(0);

    const revoked = await makeSession({ createdAgoMin: 120, expiresInMin: 1, revoked: true });
    await S.touchSession(sql, PEPPER, revoked.token);
    expect(await minutesLeft(revoked.hash)).toBeLessThan(1.01);
  });
});
