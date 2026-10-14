/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memberRolesMigration.test.js — sql/038_member_roles.sql (PGlite, todas as migrações): tabela de cargos, lista fechada,
 * visitante sem cargo, ON DELETE CASCADE/SET NULL, cópia dos curadores da Biblioteca, RLS, reaplicação e o down.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';
import { FUNCTIONAL_ROLES } from '../src/roles/capabilities.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const FILE = '038_member_roles.sql';
const ADMIN = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const VISITOR = '33333333-3333-4333-8333-333333333333';
const CURATOR_MFA = '44444444-4444-4444-8444-444444444444';
const CURATOR_NO_MFA = '55555555-5555-4555-8555-555555555555';
const CURATOR_PENDING = '88888888-8888-4888-8888-888888888888';

let db;
const addProfile = (id, name, role) => db.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', $4, 'active', now(), $5)`,
  [id, 'Pessoa ' + name, name + '@example.com', role, name]
);
const grant = (profileId, role, by = ADMIN) => db.query(
  'INSERT INTO member_roles (profile_id, role, granted_by) VALUES ($1, $2, $3)', [profileId, role, by]
);
const rolesOf = async (profileId) => (await db.query(
  'SELECT role FROM member_roles WHERE profile_id = $1 ORDER BY role', [profileId]
)).rows.map((r) => r.role);

beforeAll(async () => {
  db = await createMigratedDb();
  await addProfile(ADMIN, 'admin', 'admin');
  await addProfile(MEMBER, 'membro', 'member');
  await addProfile(VISITOR, 'visitante', 'visitor');
}, 60000);
afterAll(async () => { await db.close(); });

describe('038 — member_roles', () => {
  test('a lista de cargos do banco é a mesma de capabilities.js', async () => {
    for (const role of FUNCTIONAL_ROLES) await grant(MEMBER, role);
    expect(await rolesOf(MEMBER)).toEqual([...FUNCTIONAL_ROLES].sort());
    await db.query('DELETE FROM member_roles WHERE profile_id = $1', [MEMBER]);
  });

  test('cargo fora da lista é recusado (inclusive "admin" e o revisor clínico da Biblioteca)', async () => {
    await expect(grant(MEMBER, 'admin')).rejects.toThrow(/member_roles_role_chk/);
    await expect(grant(MEMBER, 'revisor_clinico')).rejects.toThrow(/member_roles_role_chk/);
  });

  test('o mesmo cargo duas vezes viola a chave primária (o serviço usa ON CONFLICT)', async () => {
    await grant(MEMBER, 'mentor');
    await expect(grant(MEMBER, 'mentor')).rejects.toThrow(/duplicate key|member_roles_pk/);
    const res = await db.query("INSERT INTO member_roles (profile_id, role) VALUES ($1, 'mentor') ON CONFLICT DO NOTHING", [MEMBER]);
    expect(res.affectedRows).toBe(0);
  });

  test('visitante não recebe cargo (nem por UPDATE)', async () => {
    await expect(grant(VISITOR, 'gestor')).rejects.toThrow(/member_roles:/);
    await expect(db.query('UPDATE member_roles SET profile_id = $1 WHERE profile_id = $2', [VISITOR, MEMBER])).rejects.toThrow(/member_roles:/);
  });

  test('admin pode ter cargo', async () => {
    await grant(ADMIN, 'curador');
    expect(await rolesOf(ADMIN)).toContain('curador');
  });

  test('apagar quem concedeu mantém o cargo (granted_by vira NULL); apagar a pessoa apaga os cargos', async () => {
    const other = '66666666-6666-4666-8666-666666666666';
    const holder = '77777777-7777-4777-8777-777777777777';
    await addProfile(other, 'outroadmin', 'admin');
    await addProfile(holder, 'titular', 'member');
    await grant(holder, 'gestor', other);
    await db.query('DELETE FROM profiles WHERE id = $1', [other]);
    const kept = await db.query('SELECT granted_by FROM member_roles WHERE profile_id = $1', [holder]);
    expect(kept.rows).toEqual([{ granted_by: null }]);
    await db.query('DELETE FROM profiles WHERE id = $1', [holder]);
    expect(await rolesOf(holder)).toEqual([]);
  });

  test('índices: por cargo e por quem concedeu', async () => {
    const { rows } = await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'member_roles' ORDER BY 1");
    expect(rows.map((r) => r.indexname)).toEqual(expect.arrayContaining(['idx_member_roles_granted_by', 'idx_member_roles_role', 'member_roles_pk']));
  });

  test('RLS forçado com a política única laift_worker_all, e o laift_worker lê e grava', async () => {
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
              array(SELECT polname FROM pg_policy WHERE polrelid = c.oid ORDER BY 1) AS policies
       FROM pg_class c WHERE c.relname = 'member_roles'`
    );
    expect(rows).toEqual([{ rls: true, forced: true, policies: ['laift_worker_all'] }]);
    await db.exec('SET ROLE laift_worker');
    try {
      await db.query("INSERT INTO member_roles (profile_id, role) VALUES ($1, 'moderador')", [MEMBER]);
      expect(await rolesOf(MEMBER)).toContain('moderador');
      await db.query("DELETE FROM member_roles WHERE profile_id = $1 AND role = 'moderador'", [MEMBER]);
    } finally {
      await db.exec('RESET ROLE');
    }
  });
});

describe('038 — cópia dos curadores da Biblioteca', () => {
  beforeAll(async () => {
    await addProfile(CURATOR_MFA, 'curadormfa', 'member');
    await addProfile(CURATOR_NO_MFA, 'curadorsemmfa', 'member');
    await addProfile(CURATOR_PENDING, 'curadorpendente', 'member');
    await db.query("INSERT INTO library_staff (profile_id, role) VALUES ($1, 'curador')", [CURATOR_PENDING]);
    await db.query("INSERT INTO mfa_credentials (profile_id, secret_enc, confirmed_at) VALUES ($1, 'v1.a.b', NULL)", [CURATOR_PENDING]);
    await db.query(
      `INSERT INTO library_staff (profile_id, role, granted_by) VALUES
         ($1, 'curador', $3), ($2, 'curador', $3), ($1, 'mentor', $3), ($1, 'revisor_clinico', $3), ($4, 'curador', $3)`,
      [CURATOR_MFA, CURATOR_NO_MFA, ADMIN, VISITOR]
    );
    await db.query("INSERT INTO mfa_credentials (profile_id, secret_enc, confirmed_at) VALUES ($1, 'v1.a.b', now())", [CURATOR_MFA]);
    await db.exec(readSql(FILE));
  });

  test('curador com MFA ativo vira cargo curador; mentor e revisor clínico da Biblioteca ficam só na Biblioteca', async () => {
    expect(await rolesOf(CURATOR_MFA)).toEqual(['curador']);
    const staff = await db.query('SELECT role FROM library_staff WHERE profile_id = $1 ORDER BY role', [CURATOR_MFA]);
    expect(staff.rows.map((r) => r.role)).toEqual(['curador', 'mentor', 'revisor_clinico']);
  });

  test('curador sem MFA, com cadastro de MFA não confirmado e visitante não são copiados (continuam na library_staff)', async () => {
    expect(await rolesOf(CURATOR_NO_MFA)).toEqual([]);
    expect(await rolesOf(CURATOR_PENDING)).toEqual([]);
    expect(await rolesOf(VISITOR)).toEqual([]);
  });

  test('reaplicar é idempotente (não duplica, não falha)', async () => {
    await db.exec(readSql(FILE));
    expect(await rolesOf(CURATOR_MFA)).toEqual(['curador']);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM pg_policy WHERE polrelid = 'member_roles'::regclass");
    expect(rows[0].n).toBe(1);
  });
});

describe('038 — down', () => {
  test('o down remove a tabela, o gatilho e a linha do ledger, e a migração reaplica depois', async () => {
    await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [FILE]);
    await db.exec(readSql('down/' + FILE));
    const gone = await db.query("SELECT to_regclass('public.member_roles') AS t, to_regproc('public.member_roles_guard') AS f");
    expect(gone.rows).toEqual([{ t: null, f: null }]);
    expect((await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [FILE])).rows).toEqual([]);
    const staff = await db.query("SELECT count(*)::int AS n FROM library_staff WHERE role = 'curador'");
    expect(staff.rows[0].n).toBe(4);
    await db.exec(readSql(FILE));
    expect(await rolesOf(CURATOR_MFA)).toEqual(['curador']);
  });
});
