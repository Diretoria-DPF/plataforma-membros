/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryConsentMigration.test.js — sql/036_memory_consent.sql no NÚCLEO (PGlite, todas as migrações): consentimento por
 * pessoa (CASCADE, restrições), fila de exclusão (sem FK, gatilho AFTER DELETE ON profiles), RLS forçada + laift_worker,
 * descrição da flag, reaplicação e o down (apaga a própria linha do ledger).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const FILE = '036_memory_consent.sql';
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const TABLES = ['member_memory_consent', 'memory_purge_queue'];

let db;

const addProfile = (id, name) => db.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', 'member', 'active', now(), $4)`,
  [id, 'Membro ' + name, name + '@example.com', name]
);
const consent = (id, status = 'granted', version = 'memoria-2026-10-v1') => db.query(
  status === 'granted'
    ? 'INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at) VALUES ($1, $2, $3, now())'
    : 'INSERT INTO member_memory_consent (profile_id, status, purpose_version, revoked_at) VALUES ($1, $2, $3, now())',
  [id, status, version]
);
const queue = async () => (await db.query('SELECT profile_ref, reason, attempts FROM memory_purge_queue ORDER BY profile_ref')).rows;

beforeAll(async () => {
  db = await createMigratedDb();
  await addProfile(P1, 'alfa');
  await addProfile(P2, 'beta');
}, 120000);
afterAll(async () => { await db.close(); });

describe('036 — member_memory_consent', () => {
  test('aceita o consentimento válido (granted e revoked)', async () => {
    await consent(P1, 'granted');
    expect((await db.query('SELECT status, purpose_version FROM member_memory_consent')).rows).toEqual([{ status: 'granted', purpose_version: 'memoria-2026-10-v1' }]);
    await db.query('DELETE FROM member_memory_consent');
    await consent(P1, 'revoked');
    await db.query('DELETE FROM member_memory_consent');
  });

  test.each([
    ['status desconhecido', "INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at) VALUES ('" + P1 + "', 'talvez', 'memoria-v1', now())"],
    ['versão fora do formato', "INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at) VALUES ('" + P1 + "', 'granted', 'Versão 1', now())"],
    ['granted sem data do aceite', "INSERT INTO member_memory_consent (profile_id, status, purpose_version) VALUES ('" + P1 + "', 'granted', 'memoria-v1')"],
    ['granted com data de revogação', "INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at, revoked_at) VALUES ('" + P1 + "', 'granted', 'memoria-v1', now(), now())"],
    ['revoked sem data da revogação', "INSERT INTO member_memory_consent (profile_id, status, purpose_version) VALUES ('" + P1 + "', 'revoked', 'memoria-v1')"],
  ])('recusa: %s', async (_n, text) => {
    await expect(db.exec(text)).rejects.toThrow(/violates check constraint/);
  });

  test('um consentimento por pessoa e só de perfil existente', async () => {
    await consent(P1);
    await expect(consent(P1)).rejects.toThrow(/duplicate key/);
    await expect(consent('99999999-9999-4999-8999-999999999999')).rejects.toThrow(/foreign key/);
    await db.query('DELETE FROM member_memory_consent');
  });

  test('não há coluna para o conteúdo da memória', async () => {
    const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'member_memory_consent' ORDER BY ordinal_position");
    expect(rows.map((r) => r.column_name)).toEqual(['profile_id', 'status', 'purpose_version', 'granted_at', 'revoked_at', 'updated_at']);
  });
});

describe('036 — memory_purge_queue e o gatilho de exclusão de conta', () => {
  test('apagar o perfil enfileira a limpeza da memória (sem FK) e leva o consentimento junto (CASCADE)', async () => {
    await db.exec('DELETE FROM memory_purge_queue');
    await consent(P2);
    await db.query('DELETE FROM profiles WHERE id = $1', [P2]);
    expect(await queue()).toEqual([{ profile_ref: P2, reason: 'account_deleted', attempts: 0 }]);
    expect((await db.query('SELECT 1 FROM member_memory_consent WHERE profile_id = $1', [P2])).rows).toHaveLength(0);
  });

  test('apagar o perfil sem consentimento também enfileira (não há como saber se tinha memória)', async () => {
    await db.exec('DELETE FROM memory_purge_queue');
    const P3 = '33333333-3333-4333-8333-333333333333';
    await addProfile(P3, 'gama');
    await db.query('DELETE FROM profiles WHERE id = $1', [P3]);
    expect((await queue()).map((r) => r.profile_ref)).toEqual([P3]);
  });

  test('a fila não tem FK: a linha sobrevive ao perfil, e reapagar só reafirma o motivo', async () => {
    await db.exec('DELETE FROM memory_purge_queue');
    await db.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'revoked')", [P1]);
    await db.query('DELETE FROM profiles WHERE id = $1', [P1]);
    expect(await queue()).toEqual([{ profile_ref: P1, reason: 'account_deleted', attempts: 0 }]);
  });

  test.each([
    ['motivo desconhecido', "INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ('44444444-4444-4444-8444-444444444444', 'porque sim')"],
    ['tentativas negativas', "INSERT INTO memory_purge_queue (profile_ref, reason, attempts) VALUES ('44444444-4444-4444-8444-444444444444', 'admin', -1)"],
    ['código de erro com texto livre', "INSERT INTO memory_purge_queue (profile_ref, reason, last_error_code) VALUES ('44444444-4444-4444-8444-444444444444', 'admin', 'falha na conexão com o banco da Maria')"],
  ])('recusa: %s', async (_n, text) => {
    await expect(db.exec(text)).rejects.toThrow(/violates check constraint/);
  });

  test('a fila não guarda conteúdo: só referência, motivo, tentativas, datas e um código curto', async () => {
    const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'memory_purge_queue' ORDER BY ordinal_position");
    expect(rows.map((r) => r.column_name)).toEqual(['profile_ref', 'reason', 'attempts', 'last_error_code', 'enqueued_at', 'last_attempt_at']);
  });
});

describe('036 — RLS forçada e privilégio mínimo', () => {
  test.each(TABLES)('%s: RLS ligada e forçada, com a política única laift_worker_all', async (table) => {
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
              (SELECT array_agg(polname) FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas
       FROM pg_class c WHERE c.relname = $1`, [table]
    );
    expect(rows).toEqual([{ rls: true, forcado: true, politicas: ['laift_worker_all'] }]);
  });

  test('o laift_worker lê, grava e apaga; outro papel não enxerga nada; sem DDL', async () => {
    await db.exec('DELETE FROM memory_purge_queue');
    await db.exec('SET ROLE laift_worker');
    try {
      await db.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'admin')", [P1]);
      expect((await db.query('SELECT profile_ref FROM memory_purge_queue')).rows).toHaveLength(1);
      expect((await db.query('DELETE FROM memory_purge_queue')).affectedRows).toBe(1);
      await expect(db.exec('TRUNCATE memory_purge_queue')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('RESET ROLE');
    }
    await db.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'admin')", [P1]);
    await db.exec('CREATE ROLE zz_sonda_memoria NOLOGIN');
    await db.exec('GRANT SELECT ON memory_purge_queue, member_memory_consent TO zz_sonda_memoria');
    await db.exec('SET ROLE zz_sonda_memoria');
    try {
      expect((await db.query('SELECT count(*)::int AS n FROM memory_purge_queue')).rows[0].n).toBe(0);
    } finally {
      await db.exec('RESET ROLE');
    }
    await db.exec('DELETE FROM memory_purge_queue');
  });
});

describe('036 — flag, reaplicação e down', () => {
  test('a flag memory_enabled segue DESLIGADA, agora com descrição do que faz', async () => {
    const { rows } = await db.query("SELECT enabled, description FROM feature_flags WHERE key = 'memory_enabled'");
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].description).toMatch(/consentimento/);
  });

  test('reaplicar é idempotente, não religa a flag e não desfaz descrição escrita pelo admin', async () => {
    await db.exec("UPDATE feature_flags SET enabled = TRUE, description = 'nota do admin' WHERE key = 'memory_enabled'");
    await db.exec(readSql(FILE));
    await db.exec(readSql(FILE));
    expect((await db.query("SELECT enabled, description FROM feature_flags WHERE key = 'memory_enabled'")).rows[0]).toEqual({ enabled: true, description: 'nota do admin' });
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'memory_enabled'");
    const trg = await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = 'profiles'::regclass AND tgname = 'trg_profiles_memory_purge'");
    expect(trg.rows[0].n).toBe(1);
  });

  test('down: tira gatilho, função e tabelas e só a própria linha do ledger; a exclusão de perfil segue funcionando', async () => {
    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('036_memory_consent.sql', 'h'), ('035_agents_core.sql', 'h')");
    await db.exec(readSql('down/' + FILE));
    for (const t of TABLES) expect((await db.query('SELECT to_regclass($1) AS t', ['public.' + t])).rows[0].t).toBeNull();
    expect((await db.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'memory_enqueue_purge'")).rows[0].n).toBe(0);
    expect((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)).toEqual(['035_agents_core.sql']);
    await addProfile('55555555-5555-4555-8555-555555555555', 'delta');
    await expect(db.query("DELETE FROM profiles WHERE id = '55555555-5555-4555-8555-555555555555'")).resolves.toBeDefined();
    await db.exec('DROP TABLE schema_migrations');
  });

  test('reaplicar depois do down recria tudo e o gatilho volta a enfileirar', async () => {
    await db.exec(readSql(FILE));
    const P4 = '66666666-6666-4666-8666-666666666666';
    await addProfile(P4, 'epsilon');
    await db.query('DELETE FROM profiles WHERE id = $1', [P4]);
    expect((await queue()).map((r) => r.profile_ref)).toContain(P4);
  });
});
