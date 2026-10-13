/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * liaMembrosMigration.test.js — sql/034_lia_membros_flags.sql em Postgres de verdade (PGlite, todas as
 * migrações): a flag rag_cache_enabled passa a existir DESLIGADA (o código a lê, mas ela nunca foi semeada),
 * idempotente (nunca desfaz a decisão do admin), sem tabela nova, e o down que apaga a flag e tira a
 * migração do ledger (schema_migrations).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const FILE = '034_lia_membros_flags.sql';
const KEY = 'rag_cache_enabled';

let db;
beforeAll(async () => { db = await createMigratedDb(); }, 120000);
afterAll(async () => { if (db) await db.close(); });

const flag = async (key) => (await db.query('SELECT key, enabled, description FROM feature_flags WHERE key = $1', [key])).rows[0];

describe('034_lia_membros_flags', () => {
  test('cria rag_cache_enabled DESLIGADA, com descrição', async () => {
    const row = await flag(KEY);
    expect(row).toMatchObject({ key: KEY, enabled: false });
    expect(row.description.length).toBeGreaterThan(20);
  });

  test('reaplicar é idempotente e NUNCA desfaz a decisão do admin', async () => {
    await db.exec("UPDATE feature_flags SET enabled = TRUE, description = 'nota do admin' WHERE key = 'rag_cache_enabled'");
    await db.exec(readSql(FILE));
    await db.exec(readSql(FILE));
    expect(await flag(KEY)).toMatchObject({ enabled: true, description: 'nota do admin' });
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'rag_cache_enabled'");
  });

  test('não mexe na lia_library_enabled (semeada na 029, desligada) nem cria tabela', async () => {
    expect(await flag('lia_library_enabled')).toMatchObject({ enabled: false });
    const text = readSql(FILE);
    expect(text).not.toMatch(/CREATE\s+TABLE/i);
    expect(text).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    expect(text.match(/\b(INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/gi).map((m) => m.split(/\s+/).pop())).toEqual(['feature_flags']);
  });
});

describe('down/034_lia_membros_flags', () => {
  test('apaga a flag e só a própria linha do ledger; sem o ledger não falha', async () => {
    await expect(db.exec(readSql('down/' + FILE))).resolves.toBeDefined();
    expect(await flag(KEY)).toBeUndefined();

    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('034_lia_membros_flags.sql', 'h'), ('033_lia_hibrida_flag.sql', 'h')");
    await db.exec(readSql('down/' + FILE));
    const left = (await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name);
    expect(left).toEqual(['033_lia_hibrida_flag.sql']);
    await db.exec('DROP TABLE schema_migrations');
  });

  test('reaplicar depois do down recria a flag desligada', async () => {
    await db.exec(readSql(FILE));
    expect(await flag(KEY)).toMatchObject({ enabled: false });
  });
});
