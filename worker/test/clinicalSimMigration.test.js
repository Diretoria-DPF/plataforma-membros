/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSimMigration.test.js — sql/037_clinical_sim.sql (PGlite, todas as migrações): colunas novas, a trava de revisão
 * humana em dois passos (lista de conferência completa + revisor diferente do autor), caso de IA nunca com sim_profile,
 * edição de caso publicado, exclusão de conta, RLS/privilégios herdados, reaplicação e o down.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMigratedDb } from './helpers/pgliteSql.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const readSql = (rel) => fs.readFileSync(path.join(SQL_DIR, rel), 'utf8');
const FILE = '037_clinical_sim.sql';
const AUTHOR = '11111111-1111-4111-8111-111111111111';
const REVIEWER = '22222222-2222-4222-8222-222222222222';
const CHECKLIST = { semDadoReal: true, gabaritoConferido: true, estagiosPlausiveis: true, linguagemRevisada: true };
const PROFILE = { v: 1, difficulty: 'avancado', stages: [{ id: 'inicio', severity: 'estavel', when: { afterMin: 0 } }] };

let db;
let seq = 0;

const addProfile = (id, name) => db.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', 'admin', 'active', now(), $4)`,
  [id, 'Admin ' + name, name + '@example.com', name]
);

/** Insere um caso pendente e devolve o id. `over` sobrescreve colunas. */
async function addCase(over = {}) {
  seq += 1;
  const c = Object.assign({
    title: 'Caso de teste ' + seq, source: 'admin', status: 'pending', created_by: AUTHOR, sim_profile: PROFILE,
  }, over);
  const cols = Object.keys(c);
  const vals = cols.map((k) => (c[k] !== null && typeof c[k] === 'object' ? JSON.stringify(c[k]) : c[k]));
  const marks = cols.map((_, i) => '$' + (i + 1) + (c[cols[i]] !== null && typeof c[cols[i]] === 'object' ? '::jsonb' : ''));
  const res = await db.query(
    `INSERT INTO clinical_cases (${cols.join(', ')}, payload) VALUES (${marks.join(', ')}, '{"queixaPrincipal":"x"}'::jsonb) RETURNING id`,
    vals
  );
  return res.rows[0].id;
}

const approve = (id, over = {}) => {
  const f = Object.assign({
    review_checklist: JSON.stringify(CHECKLIST), clinical_reviewed_by: REVIEWER,
  }, over);
  return db.query(
    `UPDATE clinical_cases SET status = 'approved', reviewed_at = now(), reviewed_by = $2,
       review_checklist = $3::jsonb, clinical_reviewed_by = $4, clinical_reviewed_at = now() WHERE id = $1`,
    [id, REVIEWER, f.review_checklist, f.clinical_reviewed_by]
  );
};

beforeAll(async () => {
  db = await createMigratedDb();
  await addProfile(AUTHOR, 'autora');
  await addProfile(REVIEWER, 'revisor');
}, 120000);
afterAll(async () => { await db.close(); });

describe('037 — colunas novas', () => {
  test('as 5 colunas existem e casos antigos seguem válidos (campos novos nulos, versão 1)', async () => {
    const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'clinical_cases'");
    const names = rows.map((r) => r.column_name);
    ['sim_profile', 'content_version', 'review_checklist', 'clinical_reviewed_by', 'clinical_reviewed_at'].forEach((c) => expect(names).toContain(c));
    const id = await addCase({ sim_profile: null });
    const row = (await db.query('SELECT sim_profile, content_version, review_checklist, clinical_reviewed_by FROM clinical_cases WHERE id = $1', [id])).rows[0];
    expect(row).toEqual({ sim_profile: null, content_version: 1, review_checklist: null, clinical_reviewed_by: null });
  });

  test('caso SEM sim_profile aprova como sempre (sem lista de conferência, mesmo revisor do autor)', async () => {
    const id = await addCase({ sim_profile: null });
    await db.query("UPDATE clinical_cases SET status = 'approved', reviewed_at = now(), reviewed_by = $2 WHERE id = $1", [id, AUTHOR]);
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [id])).rows[0].status).toBe('approved');
  });

  test.each([
    ['sim_profile que não é objeto', { sim_profile: '[1]' }],
    ['sim_profile acima de 4 KB', { sim_profile: { v: 1, pad: 'x'.repeat(4100) } }],
    ['lista de conferência que não é objeto', { review_checklist: '[true]' }],
    ['content_version zero', { content_version: 0 }],
  ])('recusa: %s', async (_n, over) => {
    await expect(addCase(over)).rejects.toThrow(/violates check constraint|invalid input/);
  });

  test('caso gerado por IA nunca leva sim_profile e continua pendente', async () => {
    await expect(addCase({ source: 'ia' })).rejects.toThrow(/clinical_cases_sim_source_chk/);
    const id = await addCase({ source: 'ia', sim_profile: null });
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [id])).rows[0].status).toBe('pending');
  });
});

describe('037 — trava de revisão humana (dois passos)', () => {
  test('aprovação completa: checklist com 4 itens e revisor diferente do autor', async () => {
    const id = await addCase();
    await approve(id);
    const row = (await db.query('SELECT status, clinical_reviewed_by FROM clinical_cases WHERE id = $1', [id])).rows[0];
    expect(row).toEqual({ status: 'approved', clinical_reviewed_by: REVIEWER });
  });

  test('sem lista de conferência não publica', async () => {
    const id = await addCase();
    await expect(db.query("UPDATE clinical_cases SET status = 'approved', reviewed_at = now() WHERE id = $1", [id])).rejects.toThrow(/clinical_sim_review/);
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [id])).rows[0].status).toBe('pending');
  });

  test.each(['semDadoReal', 'gabaritoConferido', 'estagiosPlausiveis', 'linguagemRevisada'])('item %s falso ou ausente não publica', async (item) => {
    for (const bad of [Object.assign({}, CHECKLIST, { [item]: false }), Object.fromEntries(Object.entries(CHECKLIST).filter(([k]) => k !== item)), Object.assign({}, CHECKLIST, { [item]: 'true' })]) {
      const id = await addCase();
      await expect(approve(id, { review_checklist: JSON.stringify(bad) })).rejects.toThrow(/clinical_sim_review/);
    }
  });

  test('revisor igual ao autor não publica (nem por gravação direta)', async () => {
    const id = await addCase();
    await expect(approve(id, { clinical_reviewed_by: AUTHOR })).rejects.toThrow(/mesma pessoa/);
    await expect(db.query(
      "INSERT INTO clinical_cases (title, source, status, created_by, sim_profile, payload, reviewed_at, review_checklist, clinical_reviewed_by, clinical_reviewed_at) VALUES ('Caso inserido já aprovado', 'admin', 'approved', $1, $2::jsonb, '{}'::jsonb, now(), $3::jsonb, $1, now())",
      [AUTHOR, JSON.stringify(PROFILE), JSON.stringify(CHECKLIST)]
    )).rejects.toThrow(/clinical_sim_review/);
  });

  test('sem revisor informado não publica', async () => {
    const id = await addCase();
    await expect(approve(id, { clinical_reviewed_by: null })).rejects.toThrow(/informe o revisor/);
  });

  test('a regra de revisor distinto também vale como CHECK (garante no banco mesmo sem o gatilho)', async () => {
    const id = await addCase();
    await db.exec('ALTER TABLE clinical_cases DISABLE TRIGGER trg_clinical_cases_sim_review');
    try {
      await expect(db.query('UPDATE clinical_cases SET clinical_reviewed_by = created_by WHERE id = $1', [id])).rejects.toThrow(/clinical_cases_sim_reviewer_chk/);
      await expect(db.query("UPDATE clinical_cases SET status = 'approved', reviewed_at = now() WHERE id = $1", [id])).rejects.toThrow(/clinical_cases_sim_publish_chk/);
    } finally {
      await db.exec('ALTER TABLE clinical_cases ENABLE TRIGGER trg_clinical_cases_sim_review');
    }
  });

  test('editar sim_profile ou payload de caso publicado exige nova revisão e content_version maior', async () => {
    const id = await addCase();
    await approve(id);
    await expect(db.query("UPDATE clinical_cases SET sim_profile = $2::jsonb WHERE id = $1", [id, JSON.stringify({ v: 1, difficulty: 'basico' })])).rejects.toThrow(/clinical_sim_review/);
    await expect(db.query("UPDATE clinical_cases SET payload = '{\"queixaPrincipal\":\"y\"}'::jsonb WHERE id = $1", [id])).rejects.toThrow(/clinical_sim_review/);
    await expect(db.query(
      "UPDATE clinical_cases SET sim_profile = $2::jsonb, clinical_reviewed_at = now() + interval '1 second' WHERE id = $1",
      [id, JSON.stringify({ v: 1, difficulty: 'basico' })]
    )).rejects.toThrow(/content_version/);
    await db.query(
      "UPDATE clinical_cases SET sim_profile = $2::jsonb, content_version = content_version + 1, clinical_reviewed_at = now() + interval '1 second' WHERE id = $1",
      [id, JSON.stringify({ v: 1, difficulty: 'basico' })]
    );
    expect((await db.query('SELECT content_version FROM clinical_cases WHERE id = $1', [id])).rows[0].content_version).toBe(2);
  });

  test('pôr sim_profile num caso já aprovado sem sim_profile também exige a revisão', async () => {
    const id = await addCase({ sim_profile: null });
    await db.query("UPDATE clinical_cases SET status = 'approved', reviewed_at = now() WHERE id = $1", [id]);
    await expect(db.query('UPDATE clinical_cases SET sim_profile = $2::jsonb WHERE id = $1', [id, JSON.stringify(PROFILE)])).rejects.toThrow(/clinical_sim_review/);
  });

  test('rejeitar um caso com sim_profile não exige checklist', async () => {
    const id = await addCase();
    await db.query("UPDATE clinical_cases SET status = 'rejected', reviewed_at = now(), reviewed_by = $2 WHERE id = $1", [id, REVIEWER]);
    expect((await db.query('SELECT status FROM clinical_cases WHERE id = $1', [id])).rows[0].status).toBe('rejected');
  });

  test('excluir a conta do revisor ou do autor não trava nem invalida o caso publicado (SET NULL)', async () => {
    const author2 = '33333333-3333-4333-8333-333333333333';
    const reviewer2 = '44444444-4444-4444-8444-444444444444';
    await addProfile(author2, 'autor2');
    await addProfile(reviewer2, 'revisor2');
    const id = await addCase({ created_by: author2 });
    await approve(id, { clinical_reviewed_by: reviewer2 });
    await db.query('DELETE FROM profiles WHERE id = $1', [reviewer2]);
    await db.query('DELETE FROM profiles WHERE id = $1', [author2]);
    expect((await db.query('SELECT status, clinical_reviewed_by, created_by FROM clinical_cases WHERE id = $1', [id])).rows[0]).toEqual({ status: 'approved', clinical_reviewed_by: null, created_by: null });
  });
});

describe('037 — RLS, privilégios, flag, reaplicação e down', () => {
  test('RLS forçada e política única seguem valendo; o laift_worker grava as colunas novas e não faz DDL', async () => {
    const { rows } = await db.query(
      `SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS forcado,
              (SELECT array_agg(polname) FROM pg_policy p WHERE p.polrelid = c.oid) AS politicas
       FROM pg_class c WHERE c.relname = 'clinical_cases'`
    );
    expect(rows[0].rls).toBe(true);
    expect(rows[0].forcado).toBe(true);
    const id = await addCase();
    await db.exec('SET ROLE laift_worker');
    try {
      await db.query("UPDATE clinical_cases SET review_checklist = $2::jsonb WHERE id = $1", [id, JSON.stringify({ semDadoReal: true })]);
      await expect(db.exec('ALTER TABLE clinical_cases DROP COLUMN sim_profile')).rejects.toThrow(/must be owner|permission denied/);
    } finally {
      await db.exec('RESET ROLE');
    }
  });

  test('a flag clinical_sim_enabled segue DESLIGADA, agora com descrição da exigência de revisor', async () => {
    const { rows } = await db.query("SELECT enabled, description FROM feature_flags WHERE key = 'clinical_sim_enabled'");
    expect(rows[0].enabled).toBe(false);
    expect(rows[0].description).toMatch(/revisor clínico/);
  });

  test('reaplicar é idempotente e não religa a flag nem apaga descrição escrita pelo admin', async () => {
    await db.exec("UPDATE feature_flags SET enabled = TRUE, description = 'nota do admin' WHERE key = 'clinical_sim_enabled'");
    await db.exec(readSql(FILE));
    await db.exec(readSql(FILE));
    expect((await db.query("SELECT enabled, description FROM feature_flags WHERE key = 'clinical_sim_enabled'")).rows[0]).toEqual({ enabled: true, description: 'nota do admin' });
    await db.exec("UPDATE feature_flags SET enabled = FALSE WHERE key = 'clinical_sim_enabled'");
    expect((await db.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'trg_clinical_cases_sim_review'")).rows[0].n).toBe(1);
    const id = await addCase();
    await expect(db.query("UPDATE clinical_cases SET status = 'approved', reviewed_at = now() WHERE id = $1", [id])).rejects.toThrow(/clinical_sim_review/);
  });

  test('down: tira colunas, gatilho e função, preserva os casos e só a própria linha do ledger', async () => {
    await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('037_clinical_sim.sql', 'h'), ('036_memory_consent.sql', 'h')");
    const before = (await db.query('SELECT count(*)::int AS n FROM clinical_cases')).rows[0].n;
    await db.exec(readSql('down/' + FILE));
    const { rows } = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'clinical_cases'");
    ['sim_profile', 'content_version', 'review_checklist', 'clinical_reviewed_by', 'clinical_reviewed_at'].forEach((c) => expect(rows.map((r) => r.column_name)).not.toContain(c));
    expect((await db.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'clinical_sim_review_guard'")).rows[0].n).toBe(0);
    expect((await db.query('SELECT count(*)::int AS n FROM clinical_cases')).rows[0].n).toBe(before);
    expect((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name)).toEqual(['036_memory_consent.sql']);
    await db.exec('DROP TABLE schema_migrations');
  });

  test('reaplicar depois do down recria tudo e a trava volta a valer', async () => {
    await db.exec(readSql(FILE));
    const id = await addCase();
    await expect(db.query("UPDATE clinical_cases SET status = 'approved', reviewed_at = now() WHERE id = $1", [id])).rejects.toThrow(/clinical_sim_review/);
    await approve(id);
  });
});
