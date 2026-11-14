/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Rotas da Onda 1 (handlers.js) contra um Postgres real (PGlite): sessão obrigatória, prova de ponta a ponta sem
// gabarito na resposta, requisito de evento na inscrição, verificação pública sem sessão e revogação com 2º fator.
import { jest } from '@jest/globals';
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { makeDb, addPerson, setFlags, addCourse, answersFor, uuid } from './helpers/coursesDb.js';

const ENV = { SESSION_TOKEN_PEPPER: 'pepper-de-teste-com-tamanho-suficiente', CERTIFICATE_SECRET: 'segredo-de-certificado-de-teste', clientIp: '192.0.2.10' };
let db; let sql; let token; let me; let course;
const call = (name, ...args) => API_REGISTRY[name](sql, ENV, args);

beforeAll(async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
  ({ db, sql } = await makeDb());
  me = await addPerson(db);
  token = await S.createSession(sql, ENV.SESSION_TOKEN_PEPPER, me.profileId, 'jest');
  course = await addCourse(db);
}, 120000);
afterAll(async () => { await db.close(); });

test('sem sessão válida, nenhuma rota de curso responde', async () => {
  const res = await call('apiLearnCourseList', 'token-invalido');
  expect(res.success).toBe(false);
});

test('flags desligadas: lista vazia e verificação pública indisponível', async () => {
  await expect(call('apiLearnCourseList', token)).resolves.toMatchObject({ success: true, enabled: false });
  await expect(call('apiCertificateVerify', { code: 'LAIFT-ABCDE-FGHJK' })).resolves.toMatchObject({ success: true, found: false, enabled: false });
});

test('ponta a ponta: aulas, prova sem gabarito, aprovação, certificado e verificação pública', async () => {
  await setFlags(db, { courses_enabled: true, certificates_enabled: true });
  for (const position of [1, 2]) {
    await expect(call('apiLearnCourseLesson', token, { courseId: course.id, position })).resolves.toMatchObject({ success: true });
    await expect(call('apiLearnCourseMarkLesson', token, { courseId: course.id, position })).resolves.toMatchObject({ success: true });
  }
  const start = await call('apiLearnCourseExamStart', token, { courseId: course.id });
  expect(start.success).toBe(true);
  expect(JSON.stringify(start)).not.toMatch(/"correct"|Justificativa/);
  const out = await call('apiLearnCourseExamSubmit', token, { attemptId: start.attemptId, answers: await answersFor(db, start.attemptId) });
  expect(out).toMatchObject({ success: true, passed: true });
  const issued = await call('apiLearnCertificateIssue', token, { courseId: course.id, publicConsent: true });
  expect(issued.success).toBe(true);
  await expect(call('apiLearnCertificateListMine', token)).resolves.toMatchObject({ certificates: [{ code: issued.certificate.code }] });
  await expect(call('apiCertificateVerify', { code: issued.certificate.code })).resolves.toMatchObject({ found: true, status: 'valido' });
});

test('inscrição em evento confere o curso exigido quando event_prereq_enabled está ligada', async () => {
  const admin = await addPerson(db, { role: 'admin' });
  const other = await addPerson(db);
  const otherToken = await S.createSession(sql, ENV.SESSION_TOKEN_PEPPER, other.profileId, 'jest');
  const eventId = uuid();
  await db.query(`INSERT INTO events (id, title, description, status, visibility, event_date)
    VALUES ($1, 'Prática', 'Atividade prática.', 'published', 'members', now() + interval '3 days')`, [eventId]);
  await db.query('INSERT INTO event_requirements (event_id, course_id, created_by) VALUES ($1, $2, $3)', [eventId, course.id, admin.profileId]);
  await setFlags(db, { event_prereq_enabled: true });
  const refused = await call('apiRegisterForEvent', otherToken, eventId);
  expect(refused).toMatchObject({ success: false, missingCourses: [{ courseId: course.id, state: 'sem_certificado' }] });
  await expect(call('apiLearnEventPrereqStatus', otherToken, { eventId })).resolves.toMatchObject({ eligible: false });
  await expect(call('apiRegisterForEvent', token, eventId)).resolves.toMatchObject({ success: true });
});

test('rotas de gestão recusam membro comum', async () => {
  await expect(call('apiAdminLearnCourseList', token)).resolves.toMatchObject({ success: false });
  await expect(call('apiAdminLearnCertificateRevoke', token, { code: 'LAIFT-ABCDE-FGHJK', reason: 'Teste de recusa' })).resolves.toMatchObject({ success: false });
  await expect(call('apiAdminLearnEventWaive', token, { eventId: uuid(), profileId: uuid(), reason: 'Teste de recusa' })).resolves.toMatchObject({ success: false });
});
