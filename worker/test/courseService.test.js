/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Cursos e prova (sql/056) contra um Postgres real (PGlite). Contrato central: o gabarito nunca sai em resposta;
// a nota é calculada na Worker; 3 tentativas com espera; questão crítica errada reprova.
import * as CourseService from '../src/services/courseService.js';
import * as Assessment from '../src/services/assessmentService.js';
import { makeDb, addPerson, setFlags, addCourse, answersFor, readAll } from './helpers/coursesDb.js';

const H = 3600 * 1000;
const CID = '99999999-9999-4999-8999-999999999999';
let db; let sql;

beforeAll(async () => {
  ({ db, sql } = await makeDb());
}, 120000);
afterAll(async () => { await db.close(); });

const forbiddenKeys = (obj) => JSON.stringify(obj).match(/"(correct|is_critical|isCritical|explanation|question_ids|option_order|review_notes|reviewNotes|status_interno)"/g);

describe('flag courses_enabled desligada', () => {
  test('nasce desligada: lista vazia e ações recusadas', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await expect(CourseService.listCourses(sql, me)).resolves.toEqual({ success: true, enabled: false, courses: [] });
    await expect(CourseService.getCourse(sql, me, { courseId: c.id })).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Assessment.startExam(sql, me, { courseId: c.id }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('visitante não acessa cursos', async () => {
    const visitor = await addPerson(db, { role: 'visitor' });
    await expect(CourseService.listCourses(sql, visitor)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });
});

describe('com a flag ligada', () => {
  beforeAll(async () => { await setFlags(db, { courses_enabled: true }); });

  test('rascunho interno não aparece nem abre; publicado aparece com progresso', async () => {
    const me = await addPerson(db);
    const draft = await addCourse(db, { status: 'rascunho_interno' });
    const pub = await addCourse(db);
    const list = await CourseService.listCourses(sql, me);
    const ids = list.courses.map((c) => c.id);
    expect(ids).toContain(pub.id);
    expect(ids).not.toContain(draft.id);
    expect(forbiddenKeys(list)).toBeNull();
    await expect(CourseService.getCourse(sql, me, { courseId: draft.id })).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(CourseService.getLesson(sql, me, { courseId: draft.id, position: 1 })).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('entrada inválida é recusada', async () => {
    const me = await addPerson(db);
    await expect(CourseService.getCourse(sql, me, { courseId: 'x' })).rejects.toMatchObject({ name: 'ValidationError' });
    const c = await addCourse(db);
    await expect(CourseService.getLesson(sql, me, { courseId: c.id, position: 0 })).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(CourseService.getLesson(sql, me, { courseId: c.id, position: 9 })).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(CourseService.markLesson(sql, me, { courseId: c.id, position: 9 })).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('aula abre, marca lida (idempotente) e a ficha mostra o andamento', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    const lesson = await CourseService.getLesson(sql, me, { courseId: c.id, position: 1 });
    expect(lesson.lesson).toMatchObject({ position: 1, title: 'Aula 1', total: 2, sources: ['NR-32'] });
    await CourseService.markLesson(sql, me, { courseId: c.id, position: 1 });
    const again = await CourseService.markLesson(sql, me, { courseId: c.id, position: 1 });
    expect(again.lessonsDone).toEqual([1]);
    const ficha = await CourseService.getCourse(sql, me, { courseId: c.id });
    expect(ficha.lessons.map((l) => l.done)).toEqual([true, false]);
    expect(ficha.exam.state).toBe('aulas_pendentes');
    expect(forbiddenKeys(ficha)).toBeNull();
  });

  test('prova só abre com as aulas lidas', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await expect(Assessment.startExam(sql, me, { courseId: c.id }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('sorteio: tamanho da prova, mínimo de críticas, alternativas embaralhadas e NENHUM gabarito na resposta', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await readAll(db, sql, me, c.id);
    const res = await Assessment.startExam(sql, me, { courseId: c.id }, CID);
    expect(res.questions).toHaveLength(5);
    expect(forbiddenKeys(res)).toBeNull();
    const text = JSON.stringify(res);
    c.questionIds.forEach((id) => expect(text).not.toContain(id));
    expect(text).not.toMatch(/Justificativa/);
    res.questions.forEach((q) => {
      expect(q.options).toHaveLength(4);
      expect(q.options.filter((o) => o.startsWith('certa '))).toHaveLength(1);
    });
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM assessment_questions WHERE id IN (SELECT unnest(question_ids) FROM assessment_attempts WHERE id = $1) AND is_critical', [res.attemptId]);
    expect(rows[0].n).toBeGreaterThanOrEqual(2);
    const resumed = await Assessment.startExam(sql, me, { courseId: c.id }, CID);
    expect(resumed).toMatchObject({ resumed: true, attemptId: res.attemptId });
  });

  test('aprovação: nota calculada na Worker, sem revisão de erros, e nova prova recusada', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await readAll(db, sql, me, c.id);
    const start = await Assessment.startExam(sql, me, { courseId: c.id }, CID);
    const answers = await answersFor(db, start.attemptId);
    const out = await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers }, CID);
    expect(out).toMatchObject({ passed: true, scorePct: 100, criticalMissed: 0, review: [] });
    expect(out.exam.state).toBe('aprovado');
    await expect(Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers }, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(Assessment.startExam(sql, me, { courseId: c.id }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    const list = await CourseService.listCourses(sql, me);
    expect(list.courses.find((x) => x.id === c.id).passed).toBe(true);
  });

  test('questão crítica errada reprova mesmo com nota acima da mínima', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db, { questions: 10, critical: 10, examSize: 10, minCritical: 1, passPct: 80 });
    await readAll(db, sql, me, c.id);
    const start = await Assessment.startExam(sql, me, { courseId: c.id }, CID);
    const out = await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: await answersFor(db, start.attemptId, [0]) }, CID);
    expect(out).toMatchObject({ passed: false, scorePct: 90, criticalMissed: 1, review: null });
  });

  test('3 tentativas com espera de 24 h; esgotadas, mostra QUAIS errou e a fonte, nunca a alternativa certa', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await readAll(db, sql, me, c.id);
    let now = Date.now();
    for (let i = 0; i < 3; i++) {
      const start = await Assessment.startExam(sql, me, { courseId: c.id }, CID, now);
      const answers = await answersFor(db, start.attemptId, [0, 1, 2, 3, 4]);
      const out = await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers }, CID, now);
      expect(out.passed).toBe(false);
      if (i < 2) {
        expect(out.exam.state).toBe('aguardar');
        expect(out.review).toBeNull();
        await expect(Assessment.startExam(sql, me, { courseId: c.id }, CID, now + H)).rejects.toMatchObject({ name: 'ForbiddenError' });
      } else {
        expect(out.exam.state).toBe('tentativas_esgotadas');
        expect(out.review).toHaveLength(5);
        out.review.forEach((r) => expect(Object.keys(r).sort()).toEqual(['n', 'source', 'stem']));
        expect(JSON.stringify(out.review)).not.toMatch(/certa /);
      }
      now += 25 * H;
    }
    await expect(Assessment.startExam(sql, me, { courseId: c.id }, CID, now)).rejects.toMatchObject({ name: 'ForbiddenError', payload: { exam: { state: 'tentativas_esgotadas', attemptsUsed: 3 } } });
  });

  test('tentativa vencida conta como nota 0 e o envio atrasado é recusado', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await readAll(db, sql, me, c.id);
    await db.query("UPDATE course_progress SET started_at = now() - interval '3 hours' WHERE profile_id = $1", [me.profileId]);
    const start = await Assessment.startExam(sql, me, { courseId: c.id }, CID, Date.now() - 2 * H);
    const answers = await answersFor(db, start.attemptId);
    await expect(Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    const { rows } = await db.query('SELECT score_pct, passed FROM assessment_attempts WHERE id = $1', [start.attemptId]);
    expect(rows[0]).toEqual({ score_pct: 0, passed: false });
  });

  test('respostas fora do formato e tentativa de outra pessoa são recusadas', async () => {
    const me = await addPerson(db);
    const other = await addPerson(db);
    const c = await addCourse(db);
    await readAll(db, sql, me, c.id);
    const start = await Assessment.startExam(sql, me, { courseId: c.id }, CID);
    await expect(Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: [0, 1] }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: [0, 1, 2, 3, 9] }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: ['0', 1, 2, 3, 0] }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Assessment.submitExam(sql, other, { attemptId: start.attemptId, answers: [0, 0, 0, 0, 0] }, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
    const blank = await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: [null, null, null, null, null] }, CID);
    expect(blank).toMatchObject({ passed: false, scorePct: 0 });
  });

  test('banco menor que a prova: prova indisponível', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db, { questions: 3, critical: 0, examSize: 5, minCritical: 0 });
    await readAll(db, sql, me, c.id);
    await expect(Assessment.startExam(sql, me, { courseId: c.id }, CID)).rejects.toMatchObject({ payload: { exam: { state: 'prova_indisponivel' } } });
  });

  test('versão nova do curso zera aulas lidas', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await readAll(db, sql, me, c.id);
    await db.query('UPDATE courses SET version = 2 WHERE id = $1', [c.id]);
    await CourseService.getLesson(sql, me, { courseId: c.id, position: 1 });
    const ficha = await CourseService.getCourse(sql, me, { courseId: c.id });
    expect(ficha.lessons.every((l) => !l.done)).toBe(true);
  });
});

describe('equipe de conteúdo (content.review)', () => {
  test('membro comum não muda estado', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db, { status: 'rascunho_interno' });
    await expect(CourseService.adminSetStatus(sql, me, { courseId: c.id, status: 'publicado' }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('publicar é recusado com marcador ou conferência pendente; liberado sem eles', async () => {
    const admin = await addPerson(db, { role: 'admin' });
    const c = await addCourse(db, { status: 'rascunho_interno' });
    await db.query("UPDATE course_lessons SET body_md = 'Texto [VERIFICAR item]' WHERE course_id = $1 AND position = 1", [c.id]);
    await db.query(`UPDATE courses SET review_notes = '[{"where":"aula 1","text":"x"}]' WHERE id = $1`, [c.id]);
    const listed = await CourseService.adminListCourses(sql, admin);
    expect(listed.courses.find((x) => x.id === c.id).blockers).toHaveLength(2);
    await expect(CourseService.adminSetStatus(sql, admin, { courseId: c.id, status: 'publicado' }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
    await db.query("UPDATE course_lessons SET body_md = 'Texto conferido.' WHERE course_id = $1", [c.id]);
    await db.query("UPDATE courses SET review_notes = '[]' WHERE id = $1", [c.id]);
    await expect(CourseService.adminSetStatus(sql, admin, { courseId: c.id, status: 'publicado' }, CID)).resolves.toMatchObject({ status: 'publicado' });
    await expect(CourseService.adminSetStatus(sql, admin, { courseId: c.id, status: 'outro' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
  });
});

describe('puras', () => {
  const course = { max_attempts: 3, retry_wait_hours: 24, min_study_pct: 40, exam_size: 2, min_critical: 0 };
  test('tempo mínimo de estudo', () => {
    const now = Date.now();
    const d = Assessment.decideExam({ course, progress: { lessons_done: [1], started_at: new Date(now - 60 * 1000) }, lessonsTotal: 1, totalMinutes: 10, attempts: [], bank: { total: 5, critical: 0 }, now });
    expect(d.state).toBe('tempo_minimo');
  });
  test('drawExam recusa banco insuficiente e gradeAttempt conta em branco como erro', () => {
    expect(() => Assessment.drawExam([{ id: 'a', is_critical: false, options: ['x', 'y'] }], 2, 0)).toThrow();
    const g = Assessment.gradeAttempt(['a', 'b'], [[1, 0], [0, 1]], [0, null], { a: { correct: 1, is_critical: true }, b: { correct: 0, is_critical: true } });
    expect(g).toEqual({ correctCount: 1, scorePct: 50, criticalMissed: 1, wrongIndexes: [1] });
  });
});
