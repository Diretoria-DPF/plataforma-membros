/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * eventCancel.test.js — EventService.cancelEventRegistration contra um Postgres de verdade (PGlite com as
 * migrações): só a inscrição da PRÓPRIA pessoa, antes do evento começar e sem presença registrada; o DELETE é
 * atômico e protegido; a vaga é liberada (o gatilho de capacidade volta a aceitar); o cache de eventos é
 * invalidado; auditoria sem e-mail; limite contra vai e vem.
 */
import { jest } from '@jest/globals';
import * as EventService from '../src/services/eventService.js';
import { RATE_LIMITS } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const CID = '00000000-0000-4000-8000-0000000000e1';
const P_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const A = { profileId: P_A, role: 'member', email: 'a@exemplo.com', fullName: 'Pessoa A' };
const B = { profileId: P_B, role: 'member', email: 'b@exemplo.com', fullName: 'Pessoa B' };
const MSG_NOT_REGISTERED = 'Você não está inscrito neste evento.';
const MSG_CHECKED_IN = 'Sua presença já foi registrada; não é possível cancelar.';
const MSG_STARTED = 'O evento já começou ou terminou.';

let db;
let sql;
let env;
let seq = 0;

async function addEvent(over = {}) {
  seq += 1;
  const row = {
    title: `Evento ${seq}`, description: 'Descrição do evento', status: 'published', visibility: 'authenticated',
    event_date: new Date(Date.now() + 7 * 86400000).toISOString(), capacity: null, ...over,
  };
  const cols = Object.keys(row);
  const res = await db.query(
    `INSERT INTO events (${cols.join(', ')}) VALUES (${cols.map((c, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
    cols.map((c) => row[c]),
  );
  return res.rows[0].id;
}

/** Inscreve pelo INSERT normal (passa pelo gatilho de capacidade e de status). */
const enroll = (eventId, profileId) => db.query('INSERT INTO event_registrations (event_id, profile_id) VALUES ($1, $2)', [eventId, profileId]);
const regsOf = async (eventId) => (await db.query('SELECT profile_id FROM event_registrations WHERE event_id = $1 ORDER BY profile_id', [eventId])).rows.map((r) => r.profile_id);
const cancel = (eventId, identity = A) => EventService.cancelEventRegistration(sql, env, identity, eventId, CID);
const audits = async () => (await db.query("SELECT actor_id, action, target_type, target_id, result FROM audit_logs WHERE action = 'CANCEL_EVENT_REGISTRATION'")).rows;

async function expectConflict(promise, message) {
  const err = await promise.then(() => null, (e) => e);
  expect(err).not.toBeNull();
  expect(err.name).toBe('ConflictError');
  expect(err.message).toBe(message);
}

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [id, name] of [[P_A, 'a'], [P_B, 'b'], [P_C, 'c']]) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role, email_confirmed_at)
       VALUES ($1, $2, $3, $4, 'x', '11999990000', 'member', now())`,
      [id, `Pessoa ${name}`, `pessoa_${name}`, `${name}@exemplo.com`],
    );
  }
}, 60000);
afterAll(async () => { await db.close(); });

beforeEach(async () => {
  env = makeEnv();
  global.fetch = jest.fn();
  await db.exec('DELETE FROM event_registrations; DELETE FROM audit_logs; DELETE FROM rate_limit_buckets;');
});

describe('cancelEventRegistration — sucesso', () => {
  test('apaga SÓ a inscrição da pessoa, devolve a mensagem, audita e não manda e-mail', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await enroll(event, P_B);
    const res = await cancel(event);
    expect(res).toEqual({ success: true, message: 'Inscrição cancelada.' });
    expect(await regsOf(event)).toEqual([P_B]); // a de outra pessoa nunca é tocada
    expect(await audits()).toEqual([{ actor_id: P_A, action: 'CANCEL_EVENT_REGISTRATION', target_type: 'event', target_id: event, result: 'success' }]);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('invalida o cache de eventos das três camadas de visibilidade', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await cancel(event);
    expect(env.HOT_CACHE.delete.mock.calls.map((c) => c[0]).sort()).toEqual([
      'cache:events:authenticated:v2', 'cache:events:members:v2', 'cache:events:public:v2',
    ]);
  });

  test('a vaga é liberada: o contador cai e outra pessoa consegue se inscrever num evento lotado', async () => {
    const event = await addEvent({ capacity: 2 });
    await enroll(event, P_A);
    await enroll(event, P_B);
    await expect(enroll(event, P_C)).rejects.toThrow(/sem vagas/);
    await cancel(event);
    const counted = await db.query('SELECT (SELECT count(*) FROM event_registrations r WHERE r.event_id = e.id)::int AS registered_count FROM events e WHERE e.id = $1', [event]);
    expect(counted.rows[0].registered_count).toBe(1);
    await expect(enroll(event, P_C)).resolves.toBeDefined();
    expect(await regsOf(event)).toEqual([P_B, P_C]);
  });

  test('pode se inscrever de novo depois de cancelar', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await cancel(event);
    await expect(EventService.registerForEvent(sql, env, A, event, CID)).resolves.toMatchObject({ success: true });
  });
});

describe('cancelEventRegistration — recusas', () => {
  test('sem inscrição: conflito, e a inscrição de outra pessoa continua', async () => {
    const event = await addEvent();
    await enroll(event, P_B);
    await expectConflict(cancel(event), MSG_NOT_REGISTERED);
    expect(await regsOf(event)).toEqual([P_B]);
    expect(await audits()).toEqual([]);
  });

  test('evento que não existe: mesmo conflito (nada a cancelar)', async () => {
    await expectConflict(cancel('99999999-9999-4999-8999-999999999999'), MSG_NOT_REGISTERED);
  });

  test('presença já registrada: conflito e a inscrição fica', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await db.query("UPDATE event_registrations SET checked_in_at = now(), checkin_method = 'qr' WHERE event_id = $1", [event]);
    await expectConflict(cancel(event), MSG_CHECKED_IN);
    expect(await regsOf(event)).toEqual([P_A]);
  });

  test.each(['in_progress', 'completed', 'closed', 'archived'])('evento %s: já começou ou terminou', async (status) => {
    const event = await addEvent();
    await enroll(event, P_A);
    // O gatilho de transição só aceita published -> in_progress -> completed.
    if (status === 'completed') await db.query("UPDATE events SET status = 'in_progress'::event_status WHERE id = $1", [event]);
    await db.query('UPDATE events SET status = $2::event_status WHERE id = $1', [event, status]);
    await expectConflict(cancel(event), MSG_STARTED);
    expect(await regsOf(event)).toEqual([P_A]);
  });

  test('evento ainda "publicado" mas com a hora já passada: já começou', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await db.query("UPDATE events SET event_date = now() - interval '1 minute' WHERE id = $1", [event]);
    await expectConflict(cancel(event), MSG_STARTED);
    expect(await regsOf(event)).toEqual([P_A]);
  });

  test.each([[''], [null], [undefined], ['abc'], [42], [{}], ['1; DROP TABLE events']])('id inválido %p: erro de validação, sem tocar nas inscrições', async (bad) => {
    const event = await addEvent();
    await enroll(event, P_A);
    const err = await cancel(bad).then(() => null, (e) => e);
    expect(err).toMatchObject({ name: 'ValidationError', message: 'Evento inválido.' });
    expect(await regsOf(event)).toEqual([P_A]);
  });
});

describe('cancelEventRegistration — concorrência e proteção do DELETE', () => {
  test('o DELETE leva evento, pessoa e checked_in_at IS NULL (nunca a inscrição de outra pessoa)', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    const spy = jest.fn(sql);
    await EventService.cancelEventRegistration(spy, env, A, event, CID);
    const del = spy.mock.calls.find((c) => c[0].join('?').includes('DELETE FROM event_registrations'));
    const text = del[0].join('?');
    expect(text).toMatch(/event_id = \?::uuid AND profile_id = \?::uuid AND checked_in_at IS NULL/);
    expect(text).toMatch(/RETURNING id/);
    expect(del.slice(1)).toEqual([event, P_A]);
  });

  test('o DELETE que não apaga nada (presença registrada ou cancelamento em paralelo no meio) vira conflito', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    const racing = jest.fn((strings, ...values) => (strings.join('?').includes('DELETE FROM event_registrations') ? Promise.resolve([]) : sql(strings, ...values)));
    const err = await EventService.cancelEventRegistration(racing, env, A, event, CID).then(() => null, (e) => e);
    expect(err).toMatchObject({ name: 'ConflictError' });
    expect(await audits()).toEqual([]);
    expect(env.HOT_CACHE.delete).not.toHaveBeenCalled();
  });

  test('dois cancelamentos seguidos: o segundo é conflito (não há o que apagar), nunca erro de banco', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await cancel(event);
    await expectConflict(cancel(event), MSG_NOT_REGISTERED);
    expect(await audits()).toHaveLength(1);
  });

  test('outra pessoa cancelando o mesmo evento não apaga a minha', async () => {
    const event = await addEvent();
    await enroll(event, P_A);
    await enroll(event, P_B);
    await cancel(event, B);
    expect(await regsOf(event)).toEqual([P_A]);
  });
});

describe('cancelEventRegistration — limite de vai e vem (EVENT_CANCEL)', () => {
  test('20 por hora por pessoa; o 21º é barrado antes de qualquer consulta de inscrição', async () => {
    expect(RATE_LIMITS.EVENT_CANCEL).toEqual({ MAX_ATTEMPTS: 20, WINDOW_SECONDS: 3600 });
    const event = await addEvent();
    for (let i = 0; i < 20; i += 1) await expectConflict(cancel(event), MSG_NOT_REGISTERED);
    await enroll(event, P_A);
    const err = await cancel(event).then(() => null, (e) => e);
    expect(err).toMatchObject({ name: 'RateLimitError' });
    expect(await regsOf(event)).toEqual([P_A]);
  });

  test('o contador é por pessoa: outra pessoa não é afetada', async () => {
    const event = await addEvent();
    for (let i = 0; i < 20; i += 1) await expectConflict(cancel(event), MSG_NOT_REGISTERED);
    await enroll(event, P_B);
    await expect(cancel(event, B)).resolves.toMatchObject({ success: true });
  });
});
