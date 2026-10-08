/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Migrações 020–024 contra um Postgres de verdade (PGlite):
 *  - 023: as 5 flags nascem ligadas, mas reaplicá-la NUNCA desfaz decisão do admin
 *    (updated_by gravado por apiAdminSetFeatureFlag e trilha SET_FEATURE_FLAG em audit_logs);
 *  - 020/024: lock_timeout só em volta do DDL; índice da purga de rate_limit_buckets;
 *  - 021: origem 'moderation' aceita e índice por profile_id para o CASCADE;
 *  - down 020–024: tira a própria linha do ledger schema_migrations (e tolera o ledger ausente).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminSet, __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (relative) => fs.readFileSync(path.join(SQL_DIR, relative), 'utf8');

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN2_ID = '22222222-2222-4222-8222-222222222222';
const CID = '99999999-9999-4999-8999-999999999999';
const ADMIN = { profileId: ADMIN_ID, role: 'admin' };
const ADMIN2 = { profileId: ADMIN2_ID, role: 'admin' };

const FIVE_FLAGS = ['ux_v2_enabled', 'chatbot_enabled', 'rag_enabled', 'feedback_enabled', 'moderation_enabled'];
const NEW_FLAGS = ['rag_enabled', 'feedback_enabled', 'moderation_enabled'];
const DOWN_ORDER = ['024_indices', '023_flags_v2', '022_assistant_moderation', '021_assistant_feedback', '020_rag'];
const UP_FILES_FROM_020 = DOWN_ORDER.map((name) => name + '.sql');

let db;
let sql;

async function addAdmin(id, username) {
  await db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', 'admin', 'active', now(), $4)`,
    [id, 'Admin ' + username, username + '@example.com', username]
  );
}

const HERDADAS = ['ux_v2_enabled', 'chatbot_enabled'];
const flagRow = async (key) =>
  (await db.query('SELECT key, enabled, updated_by, description, rollout_pct, created_at, updated_at FROM feature_flags WHERE key = $1', [key])).rows[0];
const enabledOf = async (key) => (await flagRow(key)).enabled;
const apply023 = () => db.exec(readSql('023_flags_v2.sql'));
// tgtype: bit 2 = BEFORE, bit 16 = UPDATE. Exige um gatilho BEFORE UPDATE com esse nome.
const triggerExists = async () =>
  (await db.query("SELECT 1 FROM pg_trigger WHERE tgrelid = 'feature_flags'::regclass AND tgname = 'trg_feature_flags_updated_at' AND (tgtype & 2) = 2 AND (tgtype & 16) = 16 AND NOT tgisinternal")).rows.length === 1;

/**
 * Semente: as linhas como 016/019 deixaram (updated_at = created_at, sem updated_by).
 * O gatilho fica suspenso só aqui, porque ele é justamente o que marca todo UPDATE real.
 */
async function semearHerdadas() {
  await db.exec(`
    ALTER TABLE feature_flags DISABLE TRIGGER trg_feature_flags_updated_at;
    UPDATE feature_flags SET enabled = FALSE, updated_by = NULL, updated_at = created_at
      WHERE key IN ('ux_v2_enabled', 'chatbot_enabled');
    ALTER TABLE feature_flags ENABLE TRIGGER trg_feature_flags_updated_at;`);
}

/** Estado de antes da 023: as 3 novas removidas, herdadas na semente, sem trilha de admin. */
async function resetToBefore023() {
  await db.exec(readSql('down/023_flags_v2.sql'));
  await semearHerdadas();
  await db.exec(`
    DELETE FROM feature_flags WHERE key = 'chave_do_admin';
    DELETE FROM audit_logs;`);
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await addAdmin(ADMIN_ID, 'admin_um');
}, 120000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  __resetFlagCacheForTests();
  await resetToBefore023();
});

describe('023_flags_v2 — nascem ligadas, sem desfazer decisão do admin', () => {
  test('estrutura: created_at obrigatório com default now() e gatilho que marca todo UPDATE', async () => {
    const col = await db.query(
      "SELECT is_nullable, column_default FROM information_schema.columns WHERE table_name = 'feature_flags' AND column_name = 'created_at'"
    );
    expect(col.rows[0]).toMatchObject({ is_nullable: 'NO' });
    expect(col.rows[0].column_default).toMatch(/now\(\)/);
    expect(await triggerExists()).toBe(true);
  });

  test('(c) sem decisão de admin: liga as duas herdadas e cria as três novas, todas sem marca de admin', async () => {
    expect(await enabledOf('ux_v2_enabled')).toBe(false);
    expect(await enabledOf('chatbot_enabled')).toBe(false);
    await apply023();
    for (const key of FIVE_FLAGS) {
      const row = await flagRow(key);
      expect(row).toMatchObject({ enabled: true, updated_by: null });
    }
  });

  test('reaplicar sem decisão de admin é idempotente: nem o updated_at muda', async () => {
    await apply023();
    const before = await Promise.all(FIVE_FLAGS.map(flagRow));
    await apply023();
    const after = await Promise.all(FIVE_FLAGS.map(flagRow));
    expect(after).toEqual(before);
  });

  test('admin desligou chatbot_enabled (updated_by preenchido): reaplicar a 023 mantém desligada', async () => {
    await apply023();
    await adminSet(sql, ADMIN, 'chatbot_enabled', { enabled: false }, CID);
    expect(await flagRow('chatbot_enabled')).toMatchObject({ enabled: false, updated_by: ADMIN_ID });

    await apply023();

    expect(await enabledOf('chatbot_enabled')).toBe(false);
    expect((await flagRow('chatbot_enabled')).updated_by).toBe(ADMIN_ID);
    for (const key of FIVE_FLAGS.filter((k) => k !== 'chatbot_enabled')) expect(await enabledOf(key)).toBe(true);
  });

  test('admin desligou ux_v2_enabled ANTES da 023: continua desligada e a outra herdada liga', async () => {
    await adminSet(sql, ADMIN, 'ux_v2_enabled', { enabled: false }, CID);
    await apply023();
    expect(await enabledOf('ux_v2_enabled')).toBe(false);
    expect(await enabledOf('chatbot_enabled')).toBe(true);
  });

  test('chave criada pelo admin com enabled=false (rag_enabled) não é religada nem reescrita', async () => {
    await adminSet(sql, ADMIN, 'rag_enabled', { enabled: false, description: 'Descrição do admin' }, CID);
    await adminSet(sql, ADMIN, 'chave_do_admin', { enabled: false }, CID);

    await apply023();
    await apply023();

    expect(await flagRow('rag_enabled')).toMatchObject({ enabled: false, updated_by: ADMIN_ID, description: 'Descrição do admin' });
    expect(await enabledOf('chave_do_admin')).toBe(false);
    for (const key of ['feedback_enabled', 'moderation_enabled', 'ux_v2_enabled', 'chatbot_enabled']) {
      expect(await enabledOf(key)).toBe(true);
    }
  });

  test('admin desligou e teve a conta excluída (updated_by vira NULL): só a trilha de auditoria protege', async () => {
    await addAdmin(ADMIN2_ID, 'admin_dois');
    await apply023();
    await adminSet(sql, ADMIN2, 'chatbot_enabled', { enabled: false }, CID);
    await db.query('DELETE FROM profiles WHERE id = $1', [ADMIN2_ID]);
    // Pré-condição: a FK ON DELETE SET NULL apagou a marca de updated_by.
    expect(await flagRow('chatbot_enabled')).toMatchObject({ enabled: false, updated_by: null });
    // Linha com cara de semente (updated_at = created_at): só a trilha SET_FEATURE_FLAG guarda a decisão.
    await db.exec(`
      ALTER TABLE feature_flags DISABLE TRIGGER trg_feature_flags_updated_at;
      UPDATE feature_flags SET updated_at = created_at WHERE key = 'chatbot_enabled';
      ALTER TABLE feature_flags ENABLE TRIGGER trg_feature_flags_updated_at;`);

    await apply023();

    expect(await enabledOf('chatbot_enabled')).toBe(false);
  });

  test('(a) UPDATE manual de SQL numa linha de semente (ainda desligada) segura a reaplicação', async () => {
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key IN ('ux_v2_enabled', 'chatbot_enabled')");
    for (const key of HERDADAS) {
      const row = await flagRow(key);
      expect(row.updated_at.getTime()).toBeGreaterThan(row.created_at.getTime());
    }
    await apply023();
    for (const key of HERDADAS) expect(await enabledOf(key)).toBe(false);
    for (const key of NEW_FLAGS) expect(await enabledOf(key)).toBe(true);
  });

  test('(a) desligada à mão depois que a 023 ligou: reaplicar a 023 NÃO religa', async () => {
    await apply023();
    expect(await enabledOf('chatbot_enabled')).toBe(true);
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key IN ('ux_v2_enabled', 'chatbot_enabled')");
    await apply023();
    for (const key of HERDADAS) expect(await flagRow(key)).toMatchObject({ enabled: false, updated_by: null });
  });

  test.each([
    ['description', "UPDATE feature_flags SET description = 'nota manual' WHERE key = 'chatbot_enabled'"],
    ['rollout_pct', 'UPDATE feature_flags SET rollout_pct = 100 WHERE key = \'chatbot_enabled\''],
    ['conditions', "UPDATE feature_flags SET conditions = '{}'::jsonb WHERE key = 'chatbot_enabled'"],
    ['updated_at, sem mudar valor', "UPDATE feature_flags SET updated_at = updated_at WHERE key = 'chatbot_enabled'"],
  ])('(b) UPDATE manual de %s, sem mudar enabled, marca a linha e a 023 não a liga', async (_coluna, update) => {
    await db.exec(update);
    const row = await flagRow('chatbot_enabled');
    expect(row.updated_at.getTime()).toBeGreaterThan(row.created_at.getTime());
    await apply023();
    expect(await enabledOf('chatbot_enabled')).toBe(false);
  });

  test('down remove as três criadas e deixa as duas desligadas; reaplicar (o runner, com a linha do ledger removida) não as religa', async () => {
    await apply023();
    await db.exec(readSql('down/023_flags_v2.sql'));
    for (const key of NEW_FLAGS) expect(await flagRow(key)).toBeUndefined();
    for (const key of HERDADAS) expect(await enabledOf(key)).toBe(false);
    // O down mantém created_at e o gatilho de propósito: sem eles, a reaplicação religaria as duas.
    expect(await triggerExists()).toBe(true);
    await apply023();
    for (const key of HERDADAS) expect(await enabledOf(key)).toBe(false);
    for (const key of NEW_FLAGS) expect(await enabledOf(key)).toBe(true);
  });

  test('nenhuma flag nova depende de UPDATE incondicional: as novas só entram se ausentes', async () => {
    const text = readSql('023_flags_v2.sql');
    expect(text).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    expect(text).not.toMatch(/DO UPDATE SET enabled\s*=\s*TRUE/i);
    for (const key of NEW_FLAGS) expect(text).toContain(`'${key}'`);
  });
});

describe('020, 021 e 024 — lock_timeout, origem da resposta e índices', () => {
  test('lock_timeout só vale em volta do ALTER da 020 e do índice da 024 (sessão volta ao padrão)', async () => {
    expect((await db.query('SHOW lock_timeout')).rows[0].lock_timeout).toBe('0');
    const code = (file) => readSql(file).split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    const rag = code('020_rag.sql');
    const at = (needle) => rag.indexOf(needle);
    expect(at("SET lock_timeout = '3s'")).toBeGreaterThan(-1);
    expect(at("SET lock_timeout = '3s'")).toBeLessThan(at('ALTER TABLE ai_usage_log ADD COLUMN'));
    expect(at('ALTER TABLE ai_usage_log ADD COLUMN')).toBeLessThan(at('RESET lock_timeout'));
    expect(rag).not.toMatch(/SET LOCAL/i);
    expect(code('024_indices.sql')).toMatch(/SET lock_timeout = '3s';[\s\S]*CREATE INDEX IF NOT EXISTS[\s\S]*RESET lock_timeout;/);
  });

  test.each([
    ['rate_limit_buckets', 'idx_rate_limit_buckets_window', '(window_started_at)'],
    ['event_registrations', 'idx_event_registrations_profile_registered', '(profile_id, registered_at)'],
    ['task_signups', 'idx_task_signups_profile_completed', '(profile_id, completed_at)'],
    ['learning_attempts', 'idx_learning_attempts_profile_created', '(profile_id, created_at)'],
  ])('%s tem o índice %s por %s (colunas lidas por purga e séries do Início)', async (table, indexName, columns) => {
    const idx = await db.query('SELECT indexdef FROM pg_indexes WHERE tablename = $1 AND indexname = $2', [table, indexName]);
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toContain(columns);
  });

  test('as colunas indexadas são as que a purga e as séries realmente consultam', () => {
    const series = fs.readFileSync(path.resolve(SQL_DIR, '..', 'worker', 'src', 'services', 'timeseriesService.js'), 'utf8');
    for (const fragment of ['registered_at AT TIME ZONE', 'created_at AT TIME ZONE', 'completed_at AT TIME ZONE']) {
      expect(series).toContain(fragment);
    }
    const maintenance = fs.readFileSync(path.resolve(SQL_DIR, '..', 'worker', 'src', 'maintenance.js'), 'utf8');
    expect(maintenance).toMatch(/FROM rate_limit_buckets\s+WHERE window_started_at </);
  });

  test('rate_limit_buckets(window_started_at) tem índice e a purga diária o usa', async () => {
    const idx = await db.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'rate_limit_buckets' AND indexname = 'idx_rate_limit_buckets_window'"
    );
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/\(window_started_at\)/);
    await db.exec('SET enable_seqscan = off');
    const plan = await db.query(
      "EXPLAIN DELETE FROM rate_limit_buckets WHERE window_started_at < now() - make_interval(days => 8)"
    );
    await db.exec('RESET enable_seqscan');
    expect(plan.rows.map((r) => r['QUERY PLAN']).join('\n')).toContain('idx_rate_limit_buckets_window');
  });

  test('assistant_feedback(profile_id) tem índice próprio para o CASCADE da exclusão de conta', async () => {
    const idx = await db.query(
      "SELECT indexdef FROM pg_indexes WHERE tablename = 'assistant_feedback' AND indexname = 'idx_assistant_feedback_profile'"
    );
    expect(idx.rows).toHaveLength(1);
    expect(idx.rows[0].indexdef).toMatch(/\(profile_id\)/);
  });

  test("assistant_messages.source aceita 'moderation' e continua recusando valor fora da lista", async () => {
    const insert = (source) => db.query(
      "INSERT INTO assistant_messages (profile_id, question_hash, source, answer) VALUES ($1, 'h', $2, 'Resposta.')",
      [ADMIN_ID, source]
    );
    await expect(insert('moderation')).resolves.toBeDefined();
    await expect(insert('inventada')).rejects.toThrow(/assistant_messages_source_chk/);
    await db.query('DELETE FROM assistant_messages WHERE profile_id = $1', [ADMIN_ID]);
  });
});

// ATENÇÃO à ordem: este bloco DESFAZ as migrações 020–024 no banco compartilhado (criar outro
// banco migrado custa ~40 s). Por isso é o último e os testes dele rodam em sequência: o primeiro
// sem o ledger, o segundo com ele (os downs são idempotentes, então rodar de novo é legítimo).
describe('down 020–024 — saem do ledger schema_migrations', () => {
  const runDowns = async () => {
    for (const name of DOWN_ORDER) await db.exec(readSql(`down/${name}.sql`));
  };
  const ledgerTable = () => db.query("SELECT to_regclass('public.schema_migrations') AS t");

  test('sem a tabela schema_migrations (banco que nunca usou o runner) os downs não falham e removem os índices', async () => {
    expect((await ledgerTable()).rows[0].t).toBeNull();
    await expect(runDowns()).resolves.toBeUndefined();
    const leftover = await db.query(
      "SELECT indexname FROM pg_indexes WHERE indexname IN ('idx_rate_limit_buckets_window', 'idx_event_registrations_profile_registered', 'idx_task_signups_profile_completed', 'idx_learning_attempts_profile_created', 'idx_assistant_feedback_profile')"
    );
    expect(leftover.rows).toEqual([]);
  });

  test('cada down apaga só a própria linha do ledger e preserva as demais', async () => {
    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const name of ['019_assistant.sql', ...UP_FILES_FROM_020]) {
      await db.query('INSERT INTO schema_migrations (name, hash) VALUES ($1, $2)', [name, 'h']);
    }
    await runDowns();
    const left = (await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name);
    expect(left).toEqual(['019_assistant.sql']);
  });

  test('contrato: todo down a partir da 020 apaga do ledger o nome do próprio arquivo', () => {
    const downDir = path.join(SQL_DIR, 'down');
    const files = fs.readdirSync(downDir).filter((f) => /^\d{3}_.*\.sql$/.test(f) && parseInt(f.slice(0, 3), 10) >= 20);
    expect(files.length).toBeGreaterThanOrEqual(DOWN_ORDER.length);
    for (const file of files) {
      expect(fs.existsSync(path.join(SQL_DIR, file))).toBe(true);
      const text = readSql('down/' + file);
      expect(text).toContain("to_regclass('public.schema_migrations')");
      expect(text).toContain(`DELETE FROM schema_migrations WHERE name = '${file}';`);
    }
  });
});
