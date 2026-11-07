/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * attendanceOverview.test.js — apiAdminAttendanceOverview e apiAdminAttendanceSheet (PGlite, todas as migrações):
 * quem pode ver (admin e cargo com attendance.manage + MFA), contagens por pessoa/evento/tarefa, janela de período,
 * eventos futuros fora da conta, visitante só com check-in, tarefas ligadas a evento, sem e-mail na resposta e auditoria.
 */
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { makeEnv } from './helpers/mockEnv.js';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const SEC = '22222222-2222-4222-8222-222222222222';
const SEC_NO_MFA = '33333333-3333-4333-8333-333333333333';
const PLAIN = '44444444-4444-4444-8444-444444444444';
const M1 = '55555555-5555-4555-8555-555555555555';
const M2 = '66666666-6666-4666-8666-666666666666';
const M3 = '77777777-7777-4777-8777-777777777777';
const VIS = '88888888-8888-4888-8888-888888888888';
const E1 = 'aaaaaaa1-0000-4000-8000-000000000001';
const E2 = 'aaaaaaa2-0000-4000-8000-000000000002';
const E3 = 'aaaaaaa3-0000-4000-8000-000000000003';
const E4 = 'aaaaaaa4-0000-4000-8000-000000000004';
const T1 = 'bbbbbbb1-0000-4000-8000-000000000001';
const T2 = 'bbbbbbb2-0000-4000-8000-000000000002';

let db;
let sql;
const env = makeEnv();
const tokens = {};

async function addProfile(id, name, role) {
  await db.query(
    `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
     VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', $4, 'active', now(), $5)`,
    [id, 'Membro de Teste ' + name, name + '@example.com', role, 'user_' + name]
  );
  tokens[id] = await S.createSession(sql, env.SESSION_TOKEN_PEPPER, id, 'jest');
}
const enrollMfa = (id) => db.query(
  "INSERT INTO mfa_credentials (profile_id, secret_enc, confirmed_at) VALUES ($1, 'v1.a.b', now()) ON CONFLICT DO NOTHING", [id]
);
const addEvent = (id, title, status, daysFromNow) => db.query(
  `INSERT INTO events (id, title, description, status, visibility, event_date)
   VALUES ($1, $2, 'Descrição de teste', $3, 'authenticated', now() + ($4 || ' days')::interval)`,
  [id, title, status, String(daysFromNow)]
);
const register = (eventId, profileId, present) => db.query(
  `INSERT INTO event_registrations (event_id, profile_id, checked_in_at, checkin_method)
   VALUES ($1, $2, $3, $4)`,
  [eventId, profileId, present ? new Date().toISOString() : null, present ? 'manual' : null]
);
const call = (name, actor, input) => API_REGISTRY[name](sql, env, [tokens[actor], input || {}]);
const audits = async (action) => (await db.query('SELECT actor_id, target_id, details FROM audit_logs WHERE action = $1', [action])).rows;
const row = (res, id) => res.members.find((m) => m.profileId === id);

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  await addProfile(ADMIN, 'admin', 'admin');
  await addProfile(SEC, 'secretaria', 'member');
  await addProfile(SEC_NO_MFA, 'semmfa', 'member');
  await addProfile(PLAIN, 'comum', 'member');
  await addProfile(M1, 'um', 'member');
  await addProfile(M2, 'dois', 'member');
  await addProfile(M3, 'tres', 'member');
  await addProfile(VIS, 'visita', 'visitor');
  await enrollMfa(SEC);
  await db.query("INSERT INTO member_roles (profile_id, role) VALUES ($1, 'secretaria'), ($2, 'secretaria')", [SEC, SEC_NO_MFA]);

  await addEvent(E1, 'Simpósio de Toxicologia', 'published', -10);
  await addEvent(E2, 'Reunião de diretoria', 'published', -5);
  await addEvent(E3, 'Aula antiga', 'published', -200);
  await addEvent(E4, 'Evento futuro', 'published', 10);
  await register(E1, M1, true); await register(E1, M2, false); await register(E1, VIS, true);
  await register(E2, M1, true); await register(E2, M2, true);
  await register(E3, M1, false);
  await register(E4, M1, false);
  // A inscrição só entra em evento aberto: fecha os eventos passados depois de inscrever.
  await db.query("UPDATE events SET status = 'closed' WHERE id = ANY($1::uuid[])", [[E1, E2, E3]]);
  await db.query("UPDATE events SET status = 'completed' WHERE id = ANY($1::uuid[])", [[E1, E2, E3]]);

  await db.query(`INSERT INTO tasks (id, event_id, title, description, status) VALUES ($1, $2, 'Montar a bancada', 'Tarefa de teste', 'published')`, [T1, E1]);
  await db.query(`INSERT INTO tasks (id, title, description, status) VALUES ($1, 'Revisar o resumo', 'Tarefa de teste', 'published')`, [T2]);
  await db.query('INSERT INTO task_signups (task_id, profile_id) VALUES ($1, $2), ($1, $3), ($4, $2)', [T1, M1, M2, T2]);
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.query('DELETE FROM rate_limit_buckets'); });

describe('apiAdminAttendanceOverview — quem pode', () => {
  test('admin e secretaria com MFA veem; membro comum e secretaria sem MFA não', async () => {
    expect((await call('apiAdminAttendanceOverview', ADMIN, { days: 90 })).success).toBe(true);
    expect((await call('apiAdminAttendanceOverview', SEC, { days: 90 })).success).toBe(true);
    expect((await call('apiAdminAttendanceOverview', PLAIN, { days: 90 })).success).toBe(false);
    expect((await call('apiAdminAttendanceOverview', SEC_NO_MFA, { days: 90 })).success).toBe(false);
    expect((await call('apiAdminAttendanceOverview', VIS, { days: 90 })).success).toBe(false);
  });
});

describe('apiAdminAttendanceOverview — contagens', () => {
  test('90 dias: inscrições, presenças, percentual e tarefas por pessoa; futuro e evento antigo ficam fora', async () => {
    const res = await call('apiAdminAttendanceOverview', ADMIN, { days: 90 });
    expect(res.days).toBe(90);
    expect(row(res, M1)).toMatchObject({ registered: 2, present: 2, pct: 100, tasks: 2 });
    expect(row(res, M2)).toMatchObject({ registered: 2, present: 1, pct: 50, tasks: 1 });
    expect(row(res, M3)).toMatchObject({ registered: 0, present: 0, pct: null, tasks: 0 });
    expect(row(res, VIS)).toMatchObject({ registered: 1, present: 1, pct: 100 });
    expect(res.totals).toMatchObject({ events: 2, registered: 5, present: 4 });
    expect(res.totals.members).toBeGreaterThanOrEqual(5);
  });

  test('tudo (days 0) inclui o evento antigo, mas nunca o futuro', async () => {
    const res = await call('apiAdminAttendanceOverview', ADMIN, { days: 0 });
    expect(row(res, M1)).toMatchObject({ registered: 3, present: 2, pct: 67 });
    expect(res.totals.events).toBe(3);
  });

  test('visitante sem check-in não aparece; com check-in aparece', async () => {
    const withVisit = await call('apiAdminAttendanceOverview', ADMIN, { days: 90 });
    expect(row(withVisit, VIS)).toBeTruthy();
    await db.query('UPDATE event_registrations SET checked_in_at = NULL, checkin_method = NULL WHERE profile_id = $1', [VIS]);
    const without = await call('apiAdminAttendanceOverview', ADMIN, { days: 90 });
    expect(row(without, VIS)).toBeUndefined();
    await db.query("UPDATE event_registrations SET checked_in_at = now(), checkin_method = 'manual' WHERE profile_id = $1", [VIS]);
  });

  test('balanço por evento (mais recente primeiro) e por tarefa (comparecimento do evento ligado)', async () => {
    const res = await call('apiAdminAttendanceOverview', ADMIN, { days: 90 });
    expect(res.events.map((e) => [e.id, e.registered, e.present])).toEqual([[E2, 2, 2], [E1, 3, 2]]);
    const t1 = res.tasks.find((t) => t.id === T1);
    const t2 = res.tasks.find((t) => t.id === T2);
    expect(t1).toMatchObject({ title: 'Montar a bancada', signups: 2, linked: true, signupsPresent: 1 });
    expect(t2).toMatchObject({ signups: 1, linked: false, signupsPresent: null });
  });

  test('período inválido cai no padrão de 90 dias; resposta sem e-mail nem telefone', async () => {
    const res = await call('apiAdminAttendanceOverview', ADMIN, { days: 'abc' });
    expect(res.days).toBe(90);
    expect(JSON.stringify(res)).not.toMatch(/@example\.com|11999990000/);
  });
});

describe('apiAdminAttendanceOverview — auditoria', () => {
  test('só a exportação deixa registro (ver na tela não)', async () => {
    await call('apiAdminAttendanceOverview', SEC, { days: 90 });
    expect(await audits('ATTENDANCE_OVERVIEW_EXPORT')).toEqual([]);
    await call('apiAdminAttendanceOverview', SEC, { days: 30, forExport: true });
    const logged = await audits('ATTENDANCE_OVERVIEW_EXPORT');
    expect(logged).toHaveLength(1);
    expect(logged[0].actor_id).toBe(SEC);
  });
});

describe('apiAdminAttendanceSheet — ficha de presença do evento', () => {
  test('lista nominal com presentes primeiro, totais e sem e-mail; deixa auditoria', async () => {
    const res = await call('apiAdminAttendanceSheet', SEC, { eventId: E1 });
    expect(res.success).toBe(true);
    expect(res.event).toMatchObject({ id: E1, title: 'Simpósio de Toxicologia' });
    expect(res.totals).toEqual({ registered: 3, present: 2 });
    expect(res.rows.map((r) => r.present)).toEqual([true, true, false]);
    expect(res.rows[0]).toEqual(expect.objectContaining({ fullName: expect.any(String), roleLabel: expect.any(String) }));
    expect(JSON.stringify(res)).not.toMatch(/@example\.com/);
    const logged = await audits('ATTENDANCE_SHEET');
    expect(logged).toHaveLength(1);
    expect(logged[0].target_id).toBe(E1);
  });

  test('evento inexistente, id inválido e quem não pode', async () => {
    expect((await call('apiAdminAttendanceSheet', ADMIN, { eventId: 'aaaaaaaa-0000-4000-8000-00000000ffff' })).success).toBe(false);
    expect((await call('apiAdminAttendanceSheet', ADMIN, { eventId: 'x' })).success).toBe(false);
    expect((await call('apiAdminAttendanceSheet', PLAIN, { eventId: E1 })).success).toBe(false);
  });
});
