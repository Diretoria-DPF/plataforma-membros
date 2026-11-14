/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Requisito de curso para inscrição em evento (sql/058) contra um Postgres real (PGlite): os 7 casos do estudo
// (sem certificado, com certificado, vencido, versão antiga, revogado, dispensa, flag desligada) e a gestão.
import * as Assessment from '../src/services/assessmentService.js';
import * as Cert from '../src/services/certificateService.js';
import * as Prereq from '../src/services/eventPrereqService.js';
import { makeDb, addPerson, setFlags, addCourse, answersFor, readAll, uuid } from './helpers/coursesDb.js';

const ENV = { CERTIFICATE_SECRET: 'segredo-de-certificado-de-teste', clientIp: '203.0.113.8' };
const CID = '99999999-9999-4999-8999-999999999999';
let db; let sql; let admin; let course; let eventId;

async function certified() {
  const me = await addPerson(db);
  await readAll(db, sql, me, course.id);
  const start = await Assessment.startExam(sql, me, { courseId: course.id }, CID);
  await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: await answersFor(db, start.attemptId) }, CID);
  const { certificate } = await Cert.issue(sql, ENV, me, { courseId: course.id }, CID);
  return { me, code: certificate.code };
}

beforeAll(async () => {
  ({ db, sql } = await makeDb());
  await setFlags(db, { courses_enabled: true, certificates_enabled: true });
  admin = await addPerson(db, { role: 'admin' });
  course = await addCourse(db);
  eventId = uuid();
  await db.query(`INSERT INTO events (id, title, description, status, visibility, event_date)
    VALUES ($1, 'Prática de bancada', 'Atividade prática no laboratório.', 'published', 'members', now() + interval '7 days')`, [eventId]);
  await Prereq.setRequirements(sql, admin, { eventId, courseIds: [course.id] }, CID);
}, 120000);
afterAll(async () => { await db.close(); });

describe('flag event_prereq_enabled desligada', () => {
  test('caso 7: sem a flag, a inscrição não é conferida', async () => {
    const me = await addPerson(db);
    await expect(Prereq.enforceForRegistration(sql, me, eventId)).resolves.toBeUndefined();
    await expect(Prereq.myStatus(sql, me, { eventId })).resolves.toMatchObject({ enabled: false, eligible: true });
  });
});

describe('com a flag ligada', () => {
  beforeAll(async () => { await setFlags(db, { event_prereq_enabled: true }); });

  test('caso 1: sem certificado, recusa com a lista do que falta', async () => {
    const me = await addPerson(db);
    const err = await Prereq.enforceForRegistration(sql, me, eventId).catch((e) => e);
    expect(err).toMatchObject({ name: 'ConflictError', payload: { missingCourses: [{ courseId: course.id, state: 'sem_certificado' }] } });
    expect(err.message).toMatch(/conclua antes/);
  });

  test('caso 2: com certificado válido, passa', async () => {
    const { me } = await certified();
    await expect(Prereq.enforceForRegistration(sql, me, eventId)).resolves.toBeUndefined();
    await expect(Prereq.myStatus(sql, me, { eventId })).resolves.toMatchObject({ enabled: true, eligible: true, waived: false });
  });

  test('caso 3: certificado vencido', async () => {
    const { me, code } = await certified();
    await db.query("UPDATE certificates SET issued_at = now() - interval '2 years', valid_until = now() - interval '1 day' WHERE code = $1", [code]);
    await expect(Prereq.enforceForRegistration(sql, me, eventId)).rejects.toMatchObject({ payload: { missingCourses: [{ state: 'vencido' }] } });
  });

  test('caso 4: certificado de versão antiga do curso', async () => {
    const other = await addCourse(db);
    const ev = uuid();
    await db.query(`INSERT INTO events (id, title, description, status, visibility, event_date)
      VALUES ($1, 'Outra prática', 'Atividade prática no laboratório.', 'published', 'members', now() + interval '7 days')`, [ev]);
    await Prereq.setRequirements(sql, admin, { eventId: ev, courseIds: [other.id] }, CID);
    const me = await addPerson(db);
    await readAll(db, sql, me, other.id);
    const start = await Assessment.startExam(sql, me, { courseId: other.id }, CID);
    await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: await answersFor(db, start.attemptId) }, CID);
    await Cert.issue(sql, ENV, me, { courseId: other.id }, CID);
    await db.query('UPDATE courses SET version = 2 WHERE id = $1', [other.id]);
    await expect(Prereq.enforceForRegistration(sql, me, ev)).rejects.toMatchObject({ payload: { missingCourses: [{ state: 'versao_antiga' }] } });
  });

  test('caso 5: certificado revogado não vale', async () => {
    const { me, code } = await certified();
    await Cert.revoke(sql, admin, { code, reason: 'Revisão do caso' }, CID);
    await expect(Prereq.enforceForRegistration(sql, me, eventId)).rejects.toMatchObject({ payload: { missingCourses: [{ state: 'sem_certificado' }] } });
  });

  test('caso 6: dispensa auditada libera a pessoa naquele evento', async () => {
    const me = await addPerson(db);
    const member = await addPerson(db);
    await expect(Prereq.waive(sql, member, { eventId, profileId: me.profileId, reason: 'Professora convidada' }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Prereq.waive(sql, admin, { eventId, profileId: me.profileId, reason: 'x' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Prereq.waive(sql, admin, { eventId, profileId: me.profileId, reason: 'Professora convidada' }, CID)).resolves.toMatchObject({ success: true });
    await expect(Prereq.enforceForRegistration(sql, me, eventId)).resolves.toBeUndefined();
    await expect(Prereq.myStatus(sql, me, { eventId })).resolves.toMatchObject({ waived: true, eligible: true });
    const { rows } = await db.query("SELECT count(*)::int AS n FROM audit_logs WHERE action = 'EVENT_WAIVE_REQUIREMENT'");
    expect(rows[0].n).toBe(1);
    await expect(Prereq.waive(sql, admin, { eventId, profileId: uuid(), reason: 'Pessoa inexistente' }, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  test('evento sem exigência e identificador malformado não bloqueiam', async () => {
    const me = await addPerson(db);
    await expect(Prereq.enforceForRegistration(sql, me, uuid())).resolves.toBeUndefined();
    await expect(Prereq.enforceForRegistration(sql, me, 'nao-e-uuid')).resolves.toBeUndefined();
  });
});

describe('gestão das exigências (events.manage)', () => {
  test('membro comum não define; só curso publicado; lista substitui a anterior', async () => {
    const me = await addPerson(db);
    const draft = await addCourse(db, { status: 'rascunho_interno' });
    await expect(Prereq.setRequirements(sql, me, { eventId, courseIds: [] }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Prereq.setRequirements(sql, admin, { eventId, courseIds: [draft.id] }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Prereq.setRequirements(sql, admin, { eventId, courseIds: 'x' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Prereq.setRequirements(sql, admin, { eventId: uuid(), courseIds: [] }, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
    await expect(Prereq.setRequirements(sql, admin, { eventId, courseIds: [] }, CID)).resolves.toMatchObject({ courseIds: [] });
    const { rows } = await db.query('SELECT count(*)::int AS n FROM event_requirements WHERE event_id = $1', [eventId]);
    expect(rows[0].n).toBe(0);
    await Prereq.setRequirements(sql, admin, { eventId, courseIds: [course.id, course.id] }, CID);
    expect((await db.query('SELECT count(*)::int AS n FROM event_requirements WHERE event_id = $1', [eventId])).rows[0].n).toBe(1);
  });

  test('requirementState (pura)', () => {
    expect(Prereq.requirementState({ cert_version: null, course_version: 1 })).toBe('sem_certificado');
    expect(Prereq.requirementState({ cert_version: 1, course_version: 2 })).toBe('versao_antiga');
    expect(Prereq.requirementState({ cert_version: 2, course_version: 2, cert_valid_until: null })).toBe('ok');
  });
});
