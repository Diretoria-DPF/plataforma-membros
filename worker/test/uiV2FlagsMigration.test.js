/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * uiV2FlagsMigration.test.js — sql/049_ui_v2_flags.sql em Postgres de verdade (PGlite, todas as migrações):
 * duas flags desligadas (home_v2_enabled, entrada_v2_enabled), idempotente (nunca desfaz decisão do admin),
 * sem tabela nova, e o down que apaga as flags e tira a migração do ledger (schema_migrations).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const KEYS = ['home_v2_enabled', 'entrada_v2_enabled'];

let db;
beforeAll(async () => { db = await createMigratedDb(); }, 120000);
afterAll(async () => { if (db) await db.close(); });

const flag = async (key) => (await db.query('SELECT key, enabled, description FROM feature_flags WHERE key = $1', [key])).rows[0];

describe('049_ui_v2_flags', () => {
  test('cria as duas flags DESLIGADAS, com descrição', async () => {
    for (const key of KEYS) {
      const row = await flag(key);
      expect(row).toMatchObject({ key, enabled: false });
      expect(row.description.length).toBeGreaterThan(20);
    }
  });

  test('reaplicar é idempotente e NUNCA desfaz a decisão do admin', async () => {
    await db.exec("UPDATE feature_flags SET enabled = TRUE, description = 'nota do admin' WHERE key = 'home_v2_enabled'");
    await db.exec(readSql('049_ui_v2_flags.sql'));
    await db.exec(readSql('049_ui_v2_flags.sql'));
    expect(await flag('home_v2_enabled')).toMatchObject({ enabled: true, description: 'nota do admin' });
    expect(await flag('entrada_v2_enabled')).toMatchObject({ enabled: false });
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'home_v2_enabled'");
  });

  test('não cria tabela nova e só toca em feature_flags', () => {
    const text = readSql('049_ui_v2_flags.sql');
    expect(text).not.toMatch(/CREATE\s+TABLE/i);
    expect(text).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    expect(text.match(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/gi).map((m) => m.split(/\s+/).pop())).toEqual(['feature_flags']);
  });
});

describe('down/049_ui_v2_flags', () => {
  test('apaga as duas flags e só a própria linha do ledger; sem o ledger não falha', async () => {
    await expect(db.exec(readSql('down/049_ui_v2_flags.sql'))).resolves.toBeDefined();
    for (const key of KEYS) expect(await flag(key)).toBeUndefined();

    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('049_ui_v2_flags.sql', 'h'), ('048_home_highlights.sql', 'h')");
    await db.exec(readSql('down/049_ui_v2_flags.sql'));
    const left = (await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name);
    expect(left).toEqual(['048_home_highlights.sql']);
    await db.exec('DROP TABLE schema_migrations');
  });

  test('reaplicar depois do down recria as flags desligadas', async () => {
    await db.exec(readSql('049_ui_v2_flags.sql'));
    for (const key of KEYS) expect(await flag(key)).toMatchObject({ key, enabled: false });
  });
});
