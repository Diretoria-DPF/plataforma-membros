/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Importador de curso (scripts/import-course.mjs): marcador [VERIFICAR] nunca chega ao texto do aluno, vira nota
// interna; o curso entra em rascunho_interno e a Worker recusa publicá-lo enquanto houver conferência pendente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCourseDir, toSql, parseQuestions, stripLesson } from '../scripts/import-course.mjs';
import * as CourseService from '../src/services/courseService.js';
import { makeDb, addPerson, setFlags } from './helpers/coursesDb.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, 'fixtures', 'curso-exemplo');
const PILOT = process.env.LAIFT_CURSO_PILOTO || 'C:/Users/Administrador/Desktop/cortex/cursos/diretrizes-lab-pop01';
const CID = '99999999-9999-4999-8999-999999999999';

const visibleText = (data) => [data.course.title, data.course.summary]
  .concat(data.lessons.flatMap((l) => [l.title, l.body, ...l.sources]))
  .concat(data.questions.flatMap((q) => [q.stem, ...q.options, q.explanation, q.source]))
  .join('\n');

describe('leitura da pasta', () => {
  const data = readCourseDir(FIXTURE);

  test('metadados do curso.md e regras da prova', () => {
    expect(data.errors).toEqual([]);
    expect(data.course).toMatchObject({
      slug: 'curso-exemplo', kind: 'diretriz', riskClass: 'A', workloadMinutes: 30, passPct: 80,
      examSize: 2, minCritical: 1, maxAttempts: 3, retryWaitHours: 24, validityMonths: 12,
    });
    expect(data.warnings[0]).toMatch(/3 vezes/);
  });

  test('nenhum marcador, nota ao dono ou seção vazia chega ao texto do aluno', () => {
    const text = visibleText(data);
    expect(text).not.toMatch(/VERIFICAR|Notas ao dono|Texto interno|documento oficial|identificação/i);
    expect(data.lessons[0].body).toMatch(/Use jaleco fechado\./);
    expect(data.lessons[0].sources).toEqual(['NR-6', 'NR-32']);
    expect(data.questions[0]).toMatchObject({ ref: 'Q1', isCritical: true, correct: 1, source: 'Aula 1; NR-6.' });
    expect(data.notes.map((n) => n.where)).toEqual(expect.arrayContaining(['aula 1', 'Q1 (fonte)']));
    expect(data.notes.some((n) => /Seção retirada/.test(n.text))).toBe(true);
  });

  test('erros de formato do banco', () => {
    expect(() => parseQuestions('**Q1.** Pergunta?\n- A) x\n- B) y\n')).toThrow(/gabarito/);
    expect(() => parseQuestions('**Q1.** Pergunta?\n- A) x\n- B) y\n**Gabarito: D.** z')).toThrow(/fora/);
    expect(stripLesson('sem marcador', 'x')).toEqual({ body: 'sem marcador', notes: [] });
  });
});

describe('SQL gerado aplicado num Postgres real', () => {
  let db; let sql;
  beforeAll(async () => { ({ db, sql } = await makeDb()); await setFlags(db, { courses_enabled: true }); }, 120000);
  afterAll(async () => { await db.close(); });

  test('entra em rascunho_interno, não aparece para o aluno e não publica com conferência pendente', async () => {
    await db.exec(toSql(readCourseDir(FIXTURE)));
    const { rows } = await db.query("SELECT id, status, published_at, jsonb_array_length(review_notes) AS notes FROM courses WHERE slug = 'curso-exemplo'");
    expect(rows[0]).toMatchObject({ status: 'rascunho_interno', published_at: null });
    expect(rows[0].notes).toBeGreaterThan(0);
    const me = await addPerson(db);
    expect((await CourseService.listCourses(sql, me)).courses).toEqual([]);
    const admin = await addPerson(db, { role: 'admin' });
    await expect(CourseService.adminSetStatus(sql, admin, { courseId: rows[0].id, status: 'publicado' }, CID)).rejects.toMatchObject({ name: 'ConflictError' });
  });

  test('reimportar é idempotente e desativa questão retirada do banco', async () => {
    const data = readCourseDir(FIXTURE);
    await db.exec(toSql(data, 2));
    const trimmed = Object.assign({}, data, { questions: data.questions.slice(0, 2) });
    await db.exec(toSql(trimmed, 2));
    const q = await db.query("SELECT ext_ref, active FROM assessment_questions q JOIN courses c ON c.id = q.course_id WHERE c.slug = 'curso-exemplo' ORDER BY ext_ref");
    expect(q.rows).toEqual([{ ext_ref: 'Q1', active: true }, { ext_ref: 'Q2', active: true }, { ext_ref: 'Q3', active: false }]);
    const c = await db.query("SELECT version, (SELECT count(*)::int FROM course_lessons l WHERE l.course_id = courses.id) AS lessons FROM courses WHERE slug = 'curso-exemplo'");
    expect(c.rows[0]).toEqual({ version: 2, lessons: 1 });
  });
});

const pilotTest = fs.existsSync(path.join(PILOT, 'curso.md')) ? test : test.skip;
pilotTest('curso piloto Diretrizes do laboratório + POP 01: 5 aulas, 20 questões, 7 críticas, sem marcador visível', () => {
  const data = readCourseDir(PILOT);
  expect(data.errors).toEqual([]);
  expect(data.lessons).toHaveLength(5);
  expect(data.questions).toHaveLength(20);
  expect(data.questions.filter((q) => q.isCritical)).toHaveLength(7);
  expect(data.course).toMatchObject({ examSize: 12, minCritical: 6, passPct: 80, workloadMinutes: 30, validityMonths: 12 });
  expect(visibleText(data)).not.toMatch(/VERIFICAR|ao dono/i);
});
