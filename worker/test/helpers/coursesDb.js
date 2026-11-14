/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Banco PGlite com todas as migrações e sementes de cursos para os testes da Onda 1 (sql/056–058).
import { createMigratedDb, toSql } from './pgliteSql.js';
import { __resetFlagCacheForTests } from '../../src/services/featureFlagService.js';

let seq = 0;
const hex = (n, width) => n.toString(16).padStart(width, '0');
export const uuid = () => { seq++; return `${hex(seq, 8)}-0000-4000-8000-${hex(seq, 12)}`; };

export async function makeDb() {
  const db = await createMigratedDb();
  return { db, sql: toSql(db) };
}

export async function addPerson(db, { role = 'member', name = 'Maria José da Silva' } = {}) {
  const id = uuid();
  const user = 'p' + id.slice(0, 8) + id.slice(-4);
  await db.query(
    `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, status, email_confirmed_at)
     VALUES ($1, $2, $3, $4, 'x', '11999990000', $5, 'active', now())`,
    [id, name, user, user + '@exemplo.com', role]
  );
  return { profileId: id, role, capabilities: [], mfaConfirmed: true };
}

export async function setFlags(db, flags) {
  for (const [key, enabled] of Object.entries(flags)) {
    await db.query('UPDATE feature_flags SET enabled = $2 WHERE key = $1', [key, enabled]);
  }
  __resetFlagCacheForTests();
}

/**
 * Curso publicado com `lessons` aulas e `questions` questões (as `critical` primeiras são críticas; gabarito = 0).
 * Devolve { id, questionIds }.
 */
export async function addCourse(db, opts = {}) {
  const o = Object.assign({
    slug: 'curso-' + (++seq), status: 'publicado', lessons: 2, questions: 8, critical: 3, examSize: 5, minCritical: 2,
    passPct: 80, maxAttempts: 3, retryWaitHours: 24, minStudyPct: 0, validityMonths: 12, attemptMinutes: 30, version: 1,
  }, opts);
  const id = uuid();
  await db.query(
    `INSERT INTO courses (id, slug, title, summary, kind, workload_minutes, version, pass_pct, max_attempts, retry_wait_hours,
       exam_size, min_critical, attempt_minutes, min_study_pct, validity_months, status, published_at)
     VALUES ($1, $2, $3, 'Resumo do curso.', 'diretriz', 30, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [id, o.slug, 'Curso ' + o.slug, o.version, o.passPct, o.maxAttempts, o.retryWaitHours, o.examSize, o.minCritical,
      o.attemptMinutes, o.minStudyPct, o.validityMonths, o.status, o.status === 'publicado' ? new Date() : null]
  );
  for (let p = 1; p <= o.lessons; p++) {
    await db.query('INSERT INTO course_lessons (course_id, position, title, body_md, min_minutes, source_refs) VALUES ($1, $2, $3, $4, 5, $5)',
      [id, p, 'Aula ' + p, 'Texto da aula ' + p + '.', JSON.stringify(['NR-32'])]);
  }
  const questionIds = [];
  for (let q = 1; q <= o.questions; q++) {
    const qid = uuid();
    questionIds.push(qid);
    await db.query(
      `INSERT INTO assessment_questions (id, course_id, ext_ref, stem, options, correct, explanation, source_ref, is_critical)
       VALUES ($1, $2, $3, $4, $5, 0, 'Justificativa ' || $3, 'Aula 1', $6)`,
      [qid, id, 'Q' + q, 'Enunciado da questão ' + q + '?', JSON.stringify(['certa ' + q, 'errada a ' + q, 'errada b ' + q, 'errada c ' + q]), q <= o.critical]
    );
  }
  return { id, questionIds };
}

/** Respostas (posição exibida) a partir do gabarito real: `wrong` = índices da prova a errar de propósito. */
export async function answersFor(db, attemptId, wrong = []) {
  const { rows } = await db.query('SELECT question_ids, option_order FROM assessment_attempts WHERE id = $1', [attemptId]);
  const { question_ids: ids, option_order: order } = rows[0];
  const key = (await db.query('SELECT id, correct FROM assessment_questions WHERE id = ANY($1::uuid[])', [ids])).rows;
  const correctOf = Object.fromEntries(key.map((r) => [r.id, r.correct]));
  return ids.map((id, i) => {
    const right = order[i].indexOf(correctOf[id]);
    return wrong.includes(i) ? (right + 1) % order[i].length : right;
  });
}

export async function readAll(db, sql, profile, courseId, lessons = 2) {
  const CourseService = await import('../../src/services/courseService.js');
  for (let p = 1; p <= lessons; p++) await CourseService.markLesson(sql, profile, { courseId, position: p });
}
