/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Migrações 056–058 (cursos, certificados, requisito de evento) contra um Postgres real (PGlite): flags desligadas,
// RLS forçado, regras do banco e reversão que tira a linha do ledger. As migrações NÃO são aplicadas em produção.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDb, addPerson, addCourse } from './helpers/coursesDb.js';

const SQL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
const TABLES = ['courses', 'course_lessons', 'course_progress', 'assessment_questions', 'assessment_attempts', 'certificates', 'event_requirements', 'event_requirement_waivers'];
const FLAGS = ['courses_enabled', 'certificates_enabled', 'event_prereq_enabled'];
const SIG = 'a'.repeat(43);
let db;

beforeAll(async () => { ({ db } = await makeDb()); }, 120000);
afterAll(async () => { await db.close(); });

test('as três flags nascem desligadas', async () => {
  const { rows } = await db.query('SELECT key, enabled FROM feature_flags WHERE key = ANY($1) ORDER BY key', [FLAGS]);
  expect(rows).toEqual(FLAGS.slice().sort().map((key) => ({ key, enabled: false })));
});

test('RLS forçado com a política laift_worker_all em todas as tabelas novas', async () => {
  const { rows } = await db.query(`SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
      EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'laift_worker_all') AS pol
    FROM pg_class c WHERE c.relname = ANY($1) ORDER BY c.relname`, [TABLES]);
  expect(rows).toHaveLength(TABLES.length);
  rows.forEach((r) => expect(r).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true, pol: true }));
});

test('curso nasce rascunho_interno; publicado exige data; gabarito dentro das alternativas', async () => {
  await db.query("INSERT INTO courses (slug, title, workload_minutes) VALUES ('novo-curso', 'Novo curso', 30)");
  expect((await db.query("SELECT status FROM courses WHERE slug = 'novo-curso'")).rows[0].status).toBe('rascunho_interno');
  await expect(db.query("UPDATE courses SET status = 'publicado' WHERE slug = 'novo-curso'")).rejects.toThrow();
  await expect(db.query("INSERT INTO courses (slug, title, workload_minutes) VALUES ('Mau Slug', 'Curso', 30)")).rejects.toThrow();
  const c = await addCourse(db, { status: 'rascunho_interno', questions: 0 });
  await expect(db.query(`INSERT INTO assessment_questions (course_id, ext_ref, stem, options, correct, source_ref) VALUES ($1, 'Q1', 'Pergunta?', '["a","b"]', 2, 'Aula 1')`, [c.id])).rejects.toThrow();
});

test('uma tentativa aberta por vez; código e assinatura do certificado com formato fixo; um certificado em vigor', async () => {
  const me = await addPerson(db);
  const c = await addCourse(db);
  const ids = c.questionIds.slice(0, 2);
  const open = `INSERT INTO assessment_attempts (profile_id, course_id, course_version, question_ids, option_order, expires_at)
    VALUES ($1, $2, 1, $3::uuid[], '[[0,1],[1,0]]', now() + interval '30 minutes')`;
  await db.query(open, [me.profileId, c.id, ids]);
  await expect(db.query(open, [me.profileId, c.id, ids])).rejects.toThrow();
  const cert = (code, sig = SIG) => db.query(`INSERT INTO certificates (code, profile_id, holder_name, course_id, course_title, course_version, workload_minutes, score_pct, signature)
    VALUES ($1, $2, 'Pessoa', $3, 'Curso X', 1, 30, 90, $4)`, [code, me.profileId, c.id, sig]);
  await expect(cert('LAIFT-OOOOO-11111')).rejects.toThrow();
  await expect(cert('LAIFT-ABCDE-FGHJK', 'curta')).rejects.toThrow();
  await cert('LAIFT-ABCDE-FGHJK');
  await expect(cert('LAIFT-ABCDE-FGHJM')).rejects.toThrow();
  await expect(db.query("UPDATE certificates SET revoked_at = now() WHERE code = 'LAIFT-ABCDE-FGHJK'")).rejects.toThrow();
});

test('reversão 058 → 056 remove tabelas, flags e a linha do ledger', async () => {
  await db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())");
  await db.query("INSERT INTO schema_migrations (name, hash) VALUES ('056_cursos.sql', 'x'), ('057_certificados.sql', 'y'), ('058_requisitos_evento.sql', 'z') ON CONFLICT DO NOTHING");
  for (const f of ['058_requisitos_evento.sql', '057_certificados.sql', '056_cursos.sql']) await db.exec(fs.readFileSync(path.join(SQL_DIR, 'down', f), 'utf8'));
  const left = await db.query('SELECT count(*)::int AS n FROM pg_class WHERE relname = ANY($1)', [TABLES]);
  expect(left.rows[0].n).toBe(0);
  expect((await db.query('SELECT count(*)::int AS n FROM feature_flags WHERE key = ANY($1)', [FLAGS])).rows[0].n).toBe(0);
  expect((await db.query("SELECT count(*)::int AS n FROM schema_migrations WHERE name LIKE '05%'")).rows[0].n).toBe(0);
});
