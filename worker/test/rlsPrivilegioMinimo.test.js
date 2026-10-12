/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Migração 031 (RLS e papel de menor privilégio laift_worker) contra um Postgres real (PGlite com todas
 * as migrações). Este teste é a trava de toda migração futura: criou tabela sem chamar
 * laift_enable_rls('tabela'::regclass), ele falha.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const UP = fs.readFileSync(path.join(SQL_ROOT, '032_rls_runtime_role.sql'), 'utf8');
const DOWN = fs.readFileSync(path.join(SQL_ROOT, 'down', '032_rls_runtime_role.sql'), 'utf8');
const PROFILE = '11111111-1111-4111-8111-111111111111';
const PUBLIC_TABLES = "SELECT c.oid, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')";

/** Executa `fn` com o papel trocado e sempre volta ao papel original. */
async function asRole(db, role, fn) {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
  }
}

describe('031 — RLS negando por padrão e privilégio mínimo', () => {
  let db;
  beforeAll(async () => {
    db = await createMigratedDb();
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role)
       VALUES ($1, 'Maria Teste', 'maria', 'maria@exemplo.com', 'x', '11999990000', 'member')`,
      [PROFILE]
    );
  }, 60000);
  afterAll(async () => { await db.close(); });

  test('toda tabela do esquema public tem RLS ligado e forçado', async () => {
    const { rows } = await db.query(`${PUBLIC_TABLES} AND NOT (c.relrowsecurity AND c.relforcerowsecurity) ORDER BY 2`);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  test('toda tabela (menos o ledger) tem a política laift_worker_all, e não existe outra política', async () => {
    const missing = await db.query(
      `${PUBLIC_TABLES} AND c.relname <> 'schema_migrations'
       AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'laift_worker_all') ORDER BY 2`
    );
    expect(missing.rows.map((r) => r.relname)).toEqual([]);
    const others = await db.query("SELECT polname FROM pg_policy WHERE polname <> 'laift_worker_all'");
    expect(others.rows).toEqual([]);
  });

  test('o laift_worker não é superusuário, não ignora RLS e não cria papéis nem bancos', async () => {
    const { rows } = await db.query(
      "SELECT rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolcanlogin FROM pg_roles WHERE rolname = 'laift_worker'"
    );
    expect(rows).toEqual([{ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: true }]);
  });

  test('o laift_worker lê, atualiza, insere e apaga (o que o Worker faz)', async () => {
    await asRole(db, 'laift_worker', async () => {
      expect((await db.query('SELECT id FROM profiles')).rows).toHaveLength(1);
      const upd = await db.query("UPDATE profiles SET full_name = 'Maria Souza' WHERE id = $1", [PROFILE]);
      expect(upd.affectedRows).toBe(1);
      await db.query('INSERT INTO preferences (profile_id) VALUES ($1) ON CONFLICT DO NOTHING', [PROFILE]);
      const del = await db.query('DELETE FROM preferences WHERE profile_id = $1', [PROFILE]);
      expect(del.affectedRows).toBe(1);
    });
  });

  test('o laift_worker não faz DDL nem TRUNCATE', async () => {
    await asRole(db, 'laift_worker', async () => {
      await expect(db.exec('CREATE TABLE zz_intruso (id int)')).rejects.toThrow(/permission denied/);
      await expect(db.exec('DROP TABLE profiles')).rejects.toThrow(/must be owner/);
      await expect(db.exec('ALTER TABLE profiles ADD COLUMN zz int')).rejects.toThrow(/must be owner/);
      await expect(db.exec('TRUNCATE profiles')).rejects.toThrow(/permission denied/);
      await expect(db.exec('CREATE ROLE zz_outro')).rejects.toThrow(/permission denied/);
    });
  });

  test('outro papel, mesmo com GRANT de leitura, não enxerga linha nenhuma (negar por padrão)', async () => {
    await db.exec('CREATE ROLE zz_sonda NOLOGIN');
    await db.exec('GRANT SELECT ON profiles TO zz_sonda');
    const { rows } = await asRole(db, 'zz_sonda', () => db.query('SELECT count(*)::int AS n FROM profiles'));
    expect(rows[0].n).toBe(0);
  });

  test('laift_enable_rls cobre uma tabela nova (como toda migração futura deve fazer)', async () => {
    await db.exec('CREATE TABLE zz_nova (id int PRIMARY KEY)');
    await db.exec("SELECT laift_enable_rls('zz_nova'::regclass)");
    const { rows } = await db.query(
      "SELECT relrowsecurity AS rls, relforcerowsecurity AS forcado, (SELECT count(*)::int FROM pg_policy WHERE polrelid = c.oid) AS politicas FROM pg_class c WHERE relname = 'zz_nova'"
    );
    expect(rows).toEqual([{ rls: true, forcado: true, politicas: 1 }]);
    await db.exec('INSERT INTO zz_nova VALUES (1)');
    await asRole(db, 'laift_worker', async () => {
      expect((await db.query('SELECT id FROM zz_nova')).rows).toHaveLength(1);
    });
    await db.exec('DROP TABLE zz_nova');
  });

  test('o papel legado laift_app (031) não tem mais política: nega por padrão', async () => {
    const { rows } = await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polname = 'laift_app_all'");
    expect(rows[0].n).toBe(0);
    const visivel = await asRole(db, 'laift_app', () => db.query('SELECT count(*)::int AS n FROM profiles'));
    expect(visivel.rows[0].n).toBe(0);
  });

  test('a 032 é idempotente (reaplicar não duplica política nem falha)', async () => {
    await db.exec(UP);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polname = 'laift_worker_all'");
    const tabelas = await db.query(`${PUBLIC_TABLES} AND c.relname <> 'schema_migrations'`);
    expect(rows[0].n).toBe(tabelas.rows.length);
  });

  test('a volta (down) restaura as políticas da 031 e tira as permissões do laift_worker', async () => {
    await db.exec(DOWN);
    const rls = await db.query(`${PUBLIC_TABLES} AND c.relname <> 'schema_migrations' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)`);
    expect(rls.rows).toEqual([]);
    const antigas = await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polname = 'laift_app_all'");
    const novas = await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polname = 'laift_worker_all'");
    expect(antigas.rows[0].n).toBeGreaterThan(0);
    expect(novas.rows[0].n).toBe(0);
    await asRole(db, 'laift_worker', async () => {
      await expect(db.query('SELECT id FROM profiles')).rejects.toThrow(/permission denied/);
    });
  });
});
