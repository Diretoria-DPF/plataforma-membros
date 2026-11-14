/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * courseService.js — lista de cursos, aula e progresso (sql/056; docs/cursos-operacao.md). Flag courses_enabled.
 *
 * O aluno só vê curso 'publicado'. Estado de revisão, notas internas e marcadores de conferência nunca saem para o
 * aluno; publicar é de quem tem content.review (revisor de conteúdo, com MFA, ou admin) e é recusado enquanto
 * houver marcador [VERIFICAR] no texto ou banco de questões insuficiente. A prévia de rascunho é só dessa equipe.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import {
  guarded, requireUuid, requireLearner, requireFlag, flagOn, limitRead, limitWrite, limitAdmin, iso, INTERNAL_MARK_RE,
} from './courseCommon.js';
import { loadPublishedCourse, examStatus } from './assessmentService.js';

const K = C.COURSES;
const REVIEW_CAP = 'content.review';
const STATUSES = ['rascunho_interno', 'em_revisao', 'publicado', 'arquivado'];

function requirePosition(value) {
  if (!Number.isInteger(value) || value < 1 || value > 200) throw E.ValidationError('Aula inválida.');
  return value;
}

const courseDto = (row) => ({
  id: row.id, slug: row.slug, title: row.title, summary: row.summary || '', kind: row.kind,
  workloadMinutes: Number(row.workload_minutes), version: Number(row.version),
  passPct: Number(row.pass_pct), maxAttempts: Number(row.max_attempts),
  validityMonths: row.validity_months === null || row.validity_months === undefined ? null : Number(row.validity_months),
});

/** apiLearnCourseList(): cursos publicados com o progresso da pessoa. Flag desligada: lista vazia (enabled:false). */
export async function listCourses(sql, identity) {
  requireLearner(identity);
  if (!(await flagOn(sql, K.FLAG, identity))) return { success: true, enabled: false, courses: [] };
  await limitRead(sql, identity);
  const rows = await guarded(() => sql`SELECT c.id, c.slug, c.title, c.summary, c.kind, c.workload_minutes, c.version, c.pass_pct,
      c.max_attempts, c.validity_months,
      (SELECT count(*)::int FROM course_lessons l WHERE l.course_id = c.id) AS lesson_count,
      p.lessons_done, p.course_version AS progress_version,
      EXISTS (SELECT 1 FROM assessment_attempts a WHERE a.profile_id = ${identity.profileId}::uuid AND a.course_id = c.id
              AND a.course_version = c.version AND a.passed) AS passed
    FROM courses c
    LEFT JOIN course_progress p ON p.course_id = c.id AND p.profile_id = ${identity.profileId}::uuid
    WHERE c.status = 'publicado'
    ORDER BY c.title
    LIMIT ${K.LIST_MAX}`);
  return {
    success: true,
    enabled: true,
    courses: rows.map((r) => Object.assign(courseDto(r), {
      lessonCount: Number(r.lesson_count),
      lessonsDone: Number(r.progress_version) === Number(r.version) && Array.isArray(r.lessons_done) ? r.lessons_done.length : 0,
      passed: r.passed === true,
    })),
  };
}

async function lessonsOf(sql, courseId) {
  return sql`SELECT position, title, min_minutes FROM course_lessons WHERE course_id = ${courseId}::uuid ORDER BY position`;
}

/** apiLearnCourseGet({ courseId }): ficha do curso, aulas (sem texto) e a situação da prova. */
export async function getCourse(sql, identity, input) {
  requireLearner(identity);
  await requireFlag(sql, K.FLAG, identity);
  const courseId = requireUuid(input.courseId, 'Curso');
  await limitRead(sql, identity);
  const course = await loadPublishedCourse(sql, courseId);
  const [lessons, progressRows] = await Promise.all([
    lessonsOf(sql, courseId),
    sql`SELECT course_version, lessons_done FROM course_progress WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid`,
  ]);
  const p = progressRows[0];
  const done = p && Number(p.course_version) === Number(course.version) ? new Set((p.lessons_done || []).map(Number)) : new Set();
  return {
    success: true,
    course: courseDto(course),
    lessons: lessons.map((l) => ({ position: Number(l.position), title: l.title, minMinutes: Number(l.min_minutes), done: done.has(Number(l.position)) })),
    exam: await examStatus(sql, identity, course),
  };
}

/** Abre o progresso na primeira aula lida; versão nova do curso zera as aulas lidas e o relógio de estudo. */
async function touchProgress(sql, profileId, course) {
  await sql`INSERT INTO course_progress (profile_id, course_id, course_version)
    VALUES (${profileId}::uuid, ${course.id}::uuid, ${course.version})
    ON CONFLICT (profile_id, course_id) DO UPDATE
      SET course_version = EXCLUDED.course_version, lessons_done = '{}', started_at = now(), updated_at = now()
      WHERE course_progress.course_version <> EXCLUDED.course_version`;
}

/** apiLearnCourseLesson({ courseId, position }): texto de uma aula. */
export async function getLesson(sql, identity, input) {
  requireLearner(identity);
  await requireFlag(sql, K.FLAG, identity);
  const courseId = requireUuid(input.courseId, 'Curso');
  const position = requirePosition(input.position);
  await limitRead(sql, identity);
  const course = await loadPublishedCourse(sql, courseId);
  const rows = await sql`SELECT position, title, body_md, min_minutes, source_refs FROM course_lessons
    WHERE course_id = ${courseId}::uuid AND position = ${position}`;
  if (!rows.length) throw E.NotFoundError('Aula não encontrada.');
  await touchProgress(sql, identity.profileId, course);
  const r = rows[0];
  const total = await sql`SELECT count(*)::int AS n FROM course_lessons WHERE course_id = ${courseId}::uuid`;
  return {
    success: true,
    lesson: {
      position: Number(r.position), title: r.title, body: r.body_md, minMinutes: Number(r.min_minutes),
      sources: Array.isArray(r.source_refs) ? r.source_refs.map(String) : [],
      total: Number(total[0].n),
    },
  };
}

/** apiLearnCourseMarkLesson({ courseId, position }): marca a aula como lida (idempotente). */
export async function markLesson(sql, identity, input) {
  requireLearner(identity);
  await requireFlag(sql, K.FLAG, identity);
  const courseId = requireUuid(input.courseId, 'Curso');
  const position = requirePosition(input.position);
  await limitWrite(sql, identity);
  const course = await loadPublishedCourse(sql, courseId);
  const exists = await sql`SELECT 1 FROM course_lessons WHERE course_id = ${courseId}::uuid AND position = ${position}`;
  if (!exists.length) throw E.NotFoundError('Aula não encontrada.');
  await touchProgress(sql, identity.profileId, course);
  const rows = await sql`UPDATE course_progress
    SET lessons_done = CASE WHEN ${position}::smallint = ANY(lessons_done) THEN lessons_done ELSE array_append(lessons_done, ${position}::smallint) END,
        updated_at = now()
    WHERE profile_id = ${identity.profileId}::uuid AND course_id = ${courseId}::uuid
    RETURNING lessons_done`;
  return { success: true, lessonsDone: (rows[0] && rows[0].lessons_done ? rows[0].lessons_done : []).map(Number).sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------------------------------------------
// Equipe de conteúdo (content.review)
// ---------------------------------------------------------------------------------------------------------------

/** O que impede a publicação (lista de frases curtas; vazia = pode publicar). */
export async function publishBlockers(sql, course) {
  const [lessons, questions] = await Promise.all([
    sql`SELECT title, body_md, source_refs FROM course_lessons WHERE course_id = ${course.id}::uuid`,
    sql`SELECT stem, options, explanation, source_ref, is_critical FROM assessment_questions WHERE course_id = ${course.id}::uuid AND active`,
  ]);
  const out = [];
  if (!lessons.length) out.push('O curso não tem aulas.');
  if (Array.isArray(course.review_notes) && course.review_notes.length) out.push('Há conferências internas pendentes (' + course.review_notes.length + ').');
  const texts = [course.title, course.summary]
    .concat(lessons.flatMap((l) => [l.title, l.body_md, JSON.stringify(l.source_refs || [])]))
    .concat(questions.flatMap((q) => [q.stem, JSON.stringify(q.options || []), q.explanation, q.source_ref]));
  if (texts.some((t) => INTERNAL_MARK_RE.test(String(t || '')))) out.push('Há marcador de conferência pendente no texto.');
  if (questions.length < Number(course.exam_size)) out.push('O banco tem menos questões que a prova.');
  if (questions.filter((q) => q.is_critical).length < Number(course.min_critical)) out.push('O banco tem menos questões críticas que o mínimo da prova.');
  return out;
}

async function loadAnyCourse(sql, courseId) {
  const rows = await guarded(() => sql`SELECT id, slug, title, summary, status, exam_size, min_critical, version, review_notes FROM courses WHERE id = ${courseId}::uuid`);
  if (!rows.length) throw E.NotFoundError('Curso não encontrado.');
  return rows[0];
}

/** apiAdminLearnCourseList(): todos os cursos com estado e o que falta para publicar. */
export async function adminListCourses(sql, identity) {
  S.requireCapability(identity, REVIEW_CAP);
  await limitAdmin(sql, identity);
  const rows = await guarded(() => sql`SELECT id, slug, title, summary, status, exam_size, min_critical, version, review_notes, updated_at FROM courses ORDER BY updated_at DESC LIMIT ${K.LIST_MAX}`);
  const out = [];
  for (const r of rows) out.push({ id: r.id, slug: r.slug, title: r.title, status: r.status, version: Number(r.version), updatedAt: iso(r.updated_at), blockers: await publishBlockers(sql, r) });
  return { success: true, courses: out };
}

/** apiAdminLearnCourseSetStatus({ courseId, status }): muda o estado; publicar exige zero impedimentos. */
export async function adminSetStatus(sql, identity, input, correlationId) {
  S.requireCapability(identity, REVIEW_CAP);
  const courseId = requireUuid(input.courseId, 'Curso');
  if (!STATUSES.includes(input.status)) throw E.ValidationError('Estado inválido.');
  await limitAdmin(sql, identity);
  const course = await loadAnyCourse(sql, courseId);
  if (input.status === 'publicado') {
    const blockers = await publishBlockers(sql, course);
    if (blockers.length) {
      const err = E.ConflictError('O curso ainda não pode ser publicado: ' + blockers.join(' '));
      err.payload = { blockers };
      throw err;
    }
  }
  await sql`UPDATE courses SET status = ${input.status}, updated_at = now(),
      published_at = CASE WHEN ${input.status} = 'publicado' THEN COALESCE(published_at, now()) ELSE published_at END,
      published_by = CASE WHEN ${input.status} = 'publicado' THEN ${identity.profileId}::uuid ELSE published_by END
    WHERE id = ${courseId}::uuid`;
  await Logging.logAudit(sql, correlationId, identity.profileId, 'COURSE_SET_STATUS', 'course', courseId, 'success', { from: course.status, to: input.status });
  return { success: true, status: input.status };
}
