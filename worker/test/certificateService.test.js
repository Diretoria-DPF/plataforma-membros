/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
// Certificado (sql/057) contra um Postgres real (PGlite): emissão só depois da aprovação, assinatura conferida na
// verificação pública, resposta mínima (LGPD) e uniforme quando não acha, revogação só do admin.
import * as Assessment from '../src/services/assessmentService.js';
import * as Cert from '../src/services/certificateService.js';
import { makeDb, addPerson, setFlags, addCourse, answersFor, readAll } from './helpers/coursesDb.js';

const ENV = { CERTIFICATE_SECRET: 'segredo-de-certificado-de-teste', clientIp: '203.0.113.7' };
const CID = '99999999-9999-4999-8999-999999999999';
let db; let sql;

beforeAll(async () => {
  ({ db, sql } = await makeDb());
  await setFlags(db, { courses_enabled: true });
}, 120000);
afterAll(async () => { await db.close(); });

async function passedPerson(opts = {}) {
  const me = await addPerson(db, { name: opts.name || 'Maria José da Silva' });
  const c = await addCourse(db, opts.course);
  await readAll(db, sql, me, c.id);
  const start = await Assessment.startExam(sql, me, { courseId: c.id }, CID);
  await Assessment.submitExam(sql, me, { attemptId: start.attemptId, answers: await answersFor(db, start.attemptId) }, CID);
  return { me, c };
}

describe('puras', () => {
  test('código: formato, 50 bits de alfabeto sem 0/O/1/I e normalização do que foi digitado', () => {
    const code = Cert.generateCode();
    expect(code).toMatch(/^LAIFT-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(Cert.normalizeCode(' laift abcde fghjk ')).toBe('LAIFT-ABCDE-FGHJK');
    expect(Cert.normalizeCode('ABCDEFGHJK')).toBe('LAIFT-ABCDE-FGHJK');
    expect(Cert.normalizeCode('LAIFT-ABCDE-FGHJ0')).toBeNull();
    expect(Cert.normalizeCode(123)).toBeNull();
    expect(Cert.normalizeName('  MARIA  José ')).toBe('maria jose');
  });
  test('situação: revogado vence vencido', () => {
    const now = Date.now();
    expect(Cert.statusOf({ valid_until: new Date(now - 1) }, now)).toBe('vencido');
    expect(Cert.statusOf({ revoked_at: new Date(), valid_until: new Date(now - 1) }, now)).toBe('revogado');
    expect(Cert.statusOf({ valid_until: null }, now)).toBe('valido');
  });
});

describe('flag certificates_enabled desligada', () => {
  test('emitir é recusado, lista vazia e verificação pública responde desligada', async () => {
    const { me, c } = await passedPerson();
    await expect(Cert.issue(sql, ENV, me, { courseId: c.id }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Cert.listMine(sql, me)).resolves.toMatchObject({ enabled: false, certificates: [] });
    await expect(Cert.verify(sql, ENV, { code: 'LAIFT-ABCDE-FGHJK' })).resolves.toEqual({ success: true, enabled: false, found: false });
  });
});

test('sem CERTIFICATE_SECRET a assinatura falha (nunca cai no pepper das sessões)', async () => {
  await expect(Cert.sign({ SESSION_TOKEN_PEPPER: 'p' }, { code: 'LAIFT-ABCDE-FGHJK', issued_at: new Date() })).rejects.toThrow();
});

describe('com as flags ligadas', () => {
  beforeAll(async () => { await setFlags(db, { certificates_enabled: true }); });

  test('sem aprovação não emite', async () => {
    const me = await addPerson(db);
    const c = await addCourse(db);
    await expect(Cert.issue(sql, ENV, me, { courseId: c.id }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: 'sim' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
  });

  test('emite com carga, validade e assinatura; repetir devolve o mesmo', async () => {
    const { me, c } = await passedPerson();
    const first = await Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: true }, CID);
    expect(first.created).toBe(true);
    expect(first.certificate).toMatchObject({ holderName: 'Maria José da Silva', workloadMinutes: 30, scorePct: 100, status: 'valido', publicConsent: true });
    const months = (new Date(first.certificate.validUntil) - new Date(first.certificate.issuedAt)) / (30.4 * 86400000);
    expect(Math.round(months)).toBe(12);
    const again = await Cert.issue(sql, ENV, me, { courseId: c.id }, CID);
    expect(again).toMatchObject({ created: false, certificate: { code: first.certificate.code } });
    const mine = await Cert.listMine(sql, me);
    expect(mine.certificates.map((x) => x.code)).toEqual([first.certificate.code]);
  });

  test('verificação pública com consentimento: só nome, curso, carga, datas e situação', async () => {
    const { me, c } = await passedPerson();
    const { certificate } = await Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: true }, CID);
    const res = await Cert.verify(sql, ENV, { code: certificate.code.toLowerCase() });
    expect(res).toMatchObject({ found: true, status: 'valido', holderName: 'Maria José da Silva', workloadMinutes: 30 });
    expect(Object.keys(res).sort()).toEqual(['courseTitle', 'courseVersion', 'found', 'holderName', 'issuedAt', 'status', 'success', 'validUntil', 'workloadMinutes']);
    expect(JSON.stringify(res)).not.toMatch(/@|score|email|profile/i);
  });

  test('sem consentimento exige o nome; nome errado, código inexistente e formato inválido respondem igual', async () => {
    const { me, c } = await passedPerson({ name: 'João Antônio' });
    const { certificate } = await Cert.issue(sql, ENV, me, { courseId: c.id }, CID);
    const miss = { success: true, found: false };
    await expect(Cert.verify(sql, ENV, { code: certificate.code })).resolves.toEqual(miss);
    await expect(Cert.verify(sql, ENV, { code: certificate.code, name: 'Outra Pessoa' })).resolves.toEqual(miss);
    await expect(Cert.verify(sql, ENV, { code: 'LAIFT-ZZZZZ-ZZZZZ' })).resolves.toEqual(miss);
    await expect(Cert.verify(sql, ENV, { code: '<script>' })).resolves.toEqual(miss);
    await expect(Cert.verify(sql, ENV, { code: certificate.code, name: 'joao antonio' })).resolves.toMatchObject({ found: true, status: 'valido' });
  });

  test('linha adulterada no banco não passa (assinatura recalculada)', async () => {
    const { me, c } = await passedPerson();
    const { certificate } = await Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: true }, CID);
    await db.query('UPDATE certificates SET workload_minutes = 600 WHERE code = $1', [certificate.code]);
    await expect(Cert.verify(sql, ENV, { code: certificate.code })).resolves.toEqual({ success: true, found: false });
  });

  test('vencido aparece como vencido', async () => {
    const { me, c } = await passedPerson();
    const { certificate } = await Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: true }, CID);
    const later = Date.now() + 400 * 86400000;
    await expect(Cert.verify(sql, ENV, { code: certificate.code }, later)).resolves.toMatchObject({ found: true, status: 'vencido' });
  });

  test('revogação: membro não revoga; admin revoga com motivo; página mostra revogado sem o motivo', async () => {
    const { me, c } = await passedPerson();
    const admin = await addPerson(db, { role: 'admin' });
    const { certificate } = await Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: true }, CID);
    await expect(Cert.revoke(sql, me, { code: certificate.code, reason: 'Motivo qualquer' }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
    await expect(Cert.revoke(sql, admin, { code: certificate.code, reason: 'x' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Cert.revoke(sql, admin, { code: 'nada', reason: 'Fraude na prova' }, CID)).rejects.toMatchObject({ name: 'ValidationError' });
    await expect(Cert.revoke(sql, admin, { code: certificate.code, reason: 'Fraude na prova' }, CID)).resolves.toMatchObject({ status: 'revogado' });
    await expect(Cert.revoke(sql, admin, { code: certificate.code, reason: 'Fraude na prova' }, CID)).rejects.toMatchObject({ name: 'NotFoundError' });
    const res = await Cert.verify(sql, ENV, { code: certificate.code });
    expect(res).toMatchObject({ found: true, status: 'revogado' });
    expect(JSON.stringify(res)).not.toMatch(/Fraude/);
    await expect(Cert.issue(sql, ENV, me, { courseId: c.id }, CID)).rejects.toMatchObject({ name: 'ForbiddenError' });
  });

  test('conta apagada: a linha mínima fica sem profile_id e a verificação segue', async () => {
    const { me, c } = await passedPerson();
    const { certificate } = await Cert.issue(sql, ENV, me, { courseId: c.id, publicConsent: true }, CID);
    await db.query('DELETE FROM profiles WHERE id = $1', [me.profileId]);
    const { rows } = await db.query('SELECT profile_id FROM certificates WHERE code = $1', [certificate.code]);
    expect(rows[0].profile_id).toBeNull();
    await expect(Cert.verify(sql, ENV, { code: certificate.code })).resolves.toMatchObject({ found: true });
  });

  test('limite por IP na verificação pública', async () => {
    const env = Object.assign({}, ENV, { clientIp: '198.51.100.99' });
    for (let i = 0; i < 30; i++) await Cert.verify(sql, env, { code: 'x' });
    await expect(Cert.verify(sql, env, { code: 'x' })).rejects.toMatchObject({ name: 'RateLimitError' });
  });
});
