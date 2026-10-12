/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liaHibridaMigration.test.js — sql/033_lia_hibrida_flag.sql em Postgres de verdade (PGlite, todas as
 * migrações): duas flags desligadas, idempotente (nunca desfaz decisão do admin), sem tabela nova, e o
 * down que apaga as flags e tira a migração do ledger (schema_migrations).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const KEYS = ['lia_hibrida_enabled', 'lia_visitor_ai_enabled'];

let db;
beforeAll(async () => { db = await createMigratedDb(); }, 120000);
afterAll(async () => { if (db) await db.close(); });

const flag = async (key) => (await db.query('SELECT key, enabled, description, updated_by FROM feature_flags WHERE key = $1', [key])).rows[0];

describe('033_lia_hibrida_flag', () => {
  test('cria as duas flags DESLIGADAS, com descrição', async () => {
    for (const key of KEYS) {
      const row = await flag(key);
      expect(row).toMatchObject({ key, enabled: false });
      expect(row.description.length).toBeGreaterThan(20);
    }
  });

  test('reaplicar é idempotente e NUNCA desfaz a decisão do admin (nem religa o que ele desligou)', async () => {
    await db.exec("UPDATE feature_flags SET enabled = TRUE, description = 'nota do admin' WHERE key = 'lia_hibrida_enabled'");
    await db.exec(readSql('033_lia_hibrida_flag.sql'));
    await db.exec(readSql('033_lia_hibrida_flag.sql'));
    expect(await flag('lia_hibrida_enabled')).toMatchObject({ enabled: true, description: 'nota do admin' });
    expect(await flag('lia_visitor_ai_enabled')).toMatchObject({ enabled: false });
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'lia_hibrida_enabled'");
  });

  test('não cria tabela nova e só toca em feature_flags', () => {
    const text = readSql('033_lia_hibrida_flag.sql');
    expect(text).not.toMatch(/CREATE\s+TABLE/i);
    expect(text).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    expect(text.match(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/gi).map((m) => m.split(/\s+/).pop())).toEqual(['feature_flags']);
  });
});

describe('down/033_lia_hibrida_flag', () => {
  test('apaga as duas flags e só a própria linha do ledger; sem o ledger não falha', async () => {
    await expect(db.exec(readSql('down/033_lia_hibrida_flag.sql'))).resolves.toBeDefined();
    for (const key of KEYS) expect(await flag(key)).toBeUndefined();

    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('033_lia_hibrida_flag.sql', 'h'), ('032_rls_runtime_role.sql', 'h')");
    await db.exec(readSql('down/033_lia_hibrida_flag.sql'));
    const left = (await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name);
    expect(left).toEqual(['032_rls_runtime_role.sql']);
    await db.exec('DROP TABLE schema_migrations');
  });

  test('reaplicar depois do down recria as flags desligadas', async () => {
    await db.exec(readSql('033_lia_hibrida_flag.sql'));
    for (const key of KEYS) expect(await flag(key)).toMatchObject({ enabled: false });
  });
});
