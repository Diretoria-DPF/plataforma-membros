/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agentsCoreMigration.test.js — sql/035_agents_core.sql em Postgres de verdade (PGlite, todas as migrações):
 * as 5 flags nascem DESLIGADAS e a reaplicação nunca desfaz a decisão do admin; agent_traces com RLS forçado e
 * privilégio mínimo (laift_worker), restrições (sem lugar para texto do usuário) e CASCADE; ai_usage_log.feature
 * por formato; retenção de 90 dias no cron; e o down (apaga a linha do ledger).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMaintenance } from '../src/maintenance.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const FILE = '035_agents_core.sql';
const FLAGS = ['agents_enabled', 'agents_tutor_enabled', 'agents_curator_enabled', 'memory_enabled', 'clinical_sim_enabled'];
const PROFILE = '11111111-1111-4111-8111-111111111111';
const CID = '99999999-9999-4999-8999-999999999999';

let db;
let sql;

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, 'Membro Alfa', 'alfa@example.com', 'hash-de-teste', '11999990000', 'member', 'active', now(), 'alfa_membro')`,
    [PROFILE]
  );
}, 120000);
afterAll(async () => { await db.close(); });

const flag = async (key) => (await db.query('SELECT key, enabled, description FROM feature_flags WHERE key = $1', [key])).rows[0];

let seq = 0;
const traceId = () => '00000000-0000-4000-8000-' + String(++seq).padStart(12, '0');
const insertTrace = (over = {}) => {
  const t = Object.assign({
    trace_id: traceId(), profile_id: PROFILE, persona: 'tutor-clinico', persona_version: '1.0.0', persona_hash: 'a1b2c3d4e5f6',
    feature: 'agent_tutor', model: 'openai/gpt-oss-20b', tokens_in: 120, tokens_out: 80, estimated: false, latency_ms: 900,
    outcome: 'answered', decisions: { input: 'ok', output: { action: 'allow', rules: [] } }, memory_used: false,
  }, over);
  return db.query(
    `INSERT INTO agent_traces (trace_id, profile_id, persona, persona_version, persona_hash, feature, model, tokens_in, tokens_out,
       estimated, latency_ms, outcome, decisions, memory_used)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
    [t.trace_id, t.profile_id, t.persona, t.persona_version, t.persona_hash, t.feature, t.model, t.tokens_in, t.tokens_out,
      t.estimated, t.latency_ms, t.outcome, JSON.stringify(t.decisions), t.memory_used]
  ).then(() => t.trace_id);
};

describe('035 — flags', () => {
  test.each(FLAGS)('%s nasce DESLIGADA, com descrição', async (key) => {
    const row = await flag(key);
    expect(row).toMatchObject({ key, enabled: false });
    expect(row.description.length).toBeGreaterThan(20);
  });

  test('reaplicar é idempotente e NUNCA desfaz a decisão do admin', async () => {
    await db.exec("UPDATE feature_flags SET enabled = TRUE, description = 'nota do admin' WHERE key = 'agents_enabled'");
    await db.exec(readSql(FILE));
    await db.exec(readSql(FILE));
    expect(await flag('agents_enabled')).toMatchObject({ enabled: true, description: 'nota do admin' });
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'agents_enabled'");
  });
});

describe('035 — agent_traces', () => {
  test('RLS ligado e forçado, com a política única laift_worker_all', async () => {
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
              (SELECT array_agg(polname) FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas
       FROM pg_class c WHERE c.relname = 'agent_traces'`
    );
    expect(rows).toEqual([{ rls: true, forcado: true, politicas: ['laift_worker_all'] }]);
  });

  test('o laift_worker lê, grava e apaga; outro papel não enxerga nada', async () => {
    const id = await insertTrace();
    await db.exec('SET ROLE laift_worker');
    try {
      expect((await db.query('SELECT trace_id FROM agent_traces WHERE trace_id = $1', [id])).rows).toHaveLength(1);
      await insertTrace();
      const del = await db.query('DELETE FROM agent_traces WHERE trace_id = $1', [id]);
      expect(del.affectedRows).toBe(1);
      await expect(db.exec('TRUNCATE agent_traces')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('RESET ROLE');
    }
    await db.exec('CREATE ROLE zz_sonda_agentes NOLOGIN');
    await db.exec('GRANT SELECT ON agent_traces TO zz_sonda_agentes');
    await db.exec('SET ROLE zz_sonda_agentes');
    try {
      expect((await db.query('SELECT count(*)::int AS n FROM agent_traces')).rows[0].n).toBe(0);
    } finally {
      await db.exec('RESET ROLE');
    }
  });

  test('não há coluna que comporte texto do usuário ou da resposta', async () => {
    const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'agent_traces' ORDER BY ordinal_position");
    expect(rows.map((r) => r.column_name)).toEqual([
      'trace_id', 'profile_id', 'persona', 'persona_version', 'persona_hash', 'feature', 'model', 'tokens_in', 'tokens_out',
      'estimated', 'latency_ms', 'outcome', 'decisions', 'memory_used', 'created_at',
    ]);
  });

  test.each([
    ['persona fora do formato', { persona: 'Tutor Clínico' }],
    ['versão fora do formato', { persona_version: '1.0' }],
    ['hash fora do formato', { persona_hash: 'XYZ' }],
    ['recurso fora do formato', { feature: 'Agent Tutor' }],
    ['desfecho desconhecido', { outcome: 'ok' }],
    ['tokens negativos', { tokens_in: -1 }],
    ['latência negativa', { latency_ms: -5 }],
    ['decisions que não é objeto', { decisions: ['a'] }],
    ['decisions grande demais (texto livre)', { decisions: { text: 'x'.repeat(1200) } }],
  ])('restrição: %s', async (_nome, over) => {
    await expect(insertTrace(over)).rejects.toThrow(/violates check constraint|invalid input/);
  });

  test('a mesma chamada não grava dois rastros (trace_id é único)', async () => {
    const id = await insertTrace();
    await expect(insertTrace({ trace_id: id })).rejects.toThrow(/duplicate key/);
  });

  test('exclusão de conta leva os rastros junto (CASCADE)', async () => {
    const other = '22222222-2222-4222-8222-222222222222';
    await db.query(
      `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
       VALUES ($1, 'Membro Beta', 'beta@example.com', 'hash-de-teste', '11999990001', 'member', 'active', now(), 'beta_membro')`,
      [other]
    );
    const id = await insertTrace({ profile_id: other });
    await db.query('DELETE FROM profiles WHERE id = $1', [other]);
    expect((await db.query('SELECT 1 FROM agent_traces WHERE trace_id = $1', [id])).rows).toHaveLength(0);
  });
});

describe('035 — ai_usage_log.feature por formato', () => {
  const log = (feature) => db.query(
    "INSERT INTO ai_usage_log (profile_id, feature, model, prompt_tokens, completion_tokens, ok) VALUES ($1, $2, 'm', 1, 2, TRUE)",
    [PROFILE, feature]
  );

  test.each(['chat', 'assistant', 'health', 'agent_tutor', 'agent_curator', 'agent_patient'])('aceita %s', async (feature) => {
    await expect(log(feature)).resolves.toBeDefined();
  });

  test.each(['Agent', 'x', 'com espaço', 'a;drop', '1abc', 'a'.repeat(41)])('rejeita %p', async (feature) => {
    await expect(log(feature)).rejects.toThrow(/violates check constraint/);
  });
});

describe('035 — retenção de 90 dias no cron (maintenance.js)', () => {
  test('agentTracesPurge apaga só o que passou de 90 dias', async () => {
    await db.exec('DELETE FROM agent_traces');
    const velho = await insertTrace();
    const limite = await insertTrace();
    const novo = await insertTrace();
    await db.query("UPDATE agent_traces SET created_at = now() - interval '91 days' WHERE trace_id = $1", [velho]);
    await db.query("UPDATE agent_traces SET created_at = now() - interval '89 days' WHERE trace_id = $1", [limite]);
    const res = await runMaintenance(sql, CID);
    expect(res.agentTracesPurge).toBe(1);
    const left = (await db.query('SELECT trace_id FROM agent_traces ORDER BY trace_id')).rows.map((r) => r.trace_id);
    expect(left).toEqual([limite, novo].sort());
  });
});

describe('down/035_agents_core', () => {
  test('apaga flags, tabela e usos de agente; devolve a lista fechada; só a própria linha do ledger sai', async () => {
    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('035_agents_core.sql', 'h'), ('034_lia_membros_flags.sql', 'h')");
    await db.query("INSERT INTO ai_usage_log (profile_id, feature, model, ok) VALUES ($1, 'agent_tutor', 'm', TRUE), ($1, 'chat', 'm', TRUE)", [PROFILE]);

    await db.exec(readSql('down/' + FILE));

    for (const key of FLAGS) expect(await flag(key)).toBeUndefined();
    expect((await db.query("SELECT to_regclass('public.agent_traces') AS t")).rows[0].t).toBeNull();
    expect((await db.query("SELECT feature FROM ai_usage_log WHERE feature LIKE 'agent_%'")).rows).toEqual([]);
    expect((await db.query("SELECT count(*)::int AS n FROM ai_usage_log WHERE feature = 'chat'")).rows[0].n).toBeGreaterThan(0);
    await expect(db.query("INSERT INTO ai_usage_log (feature, model, ok) VALUES ('agent_tutor', 'm', TRUE)")).rejects.toThrow(/violates check constraint/);
    expect((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)).toEqual(['034_lia_membros_flags.sql']);
    await db.exec('DROP TABLE schema_migrations');
  });

  test('reaplicar depois do down recria tudo (flags desligadas, tabela com RLS, formato aceito)', async () => {
    await db.exec(readSql(FILE));
    for (const key of FLAGS) expect(await flag(key)).toMatchObject({ enabled: false });
    expect((await db.query("SELECT relforcerowsecurity AS f FROM pg_class WHERE relname = 'agent_traces'")).rows[0].f).toBe(true);
    await expect(db.query("INSERT INTO ai_usage_log (feature, model, ok) VALUES ('agent_tutor', 'm', TRUE)")).resolves.toBeDefined();
  });
});
