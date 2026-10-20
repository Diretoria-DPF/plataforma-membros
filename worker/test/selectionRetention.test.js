/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * Retenção do processo seletivo (12 meses, LGPD) rodada pelo cron diário, contra um Postgres real em memória
 * (PGlite). Quem usa: `npm test -- selectionRetention`.
 */
import { runMaintenance } from '../src/maintenance.js';
import { SELECTION_RETENTION } from '../src/constants.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const PEOPLE = Array.from({ length: 6 }, (_, i) => `77777777-7777-4777-8777-77777777777${i}`);
const ACTIVE = ['submitted', 'in_review', 'interview', 'waitlist'];
const FINAL = ['approved', 'not_selected', 'withdrawn', 'expired'];

let db;
let sql;
let seq = 0;

beforeAll(async () => {
  db = await createMigratedDb();
  sql = toSql(db);
  for (const [i, id] of PEOPLE.entries()) {
    await db.query(
      `INSERT INTO profiles (id, full_name, username, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, 'x', $5, 'visitor') ON CONFLICT (id) DO NOTHING`,
      [id, 'Pessoa ' + i, 'reten' + i, `r${i}@exemplo.com`, '1199977000' + i],
    );
  }
}, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.exec('TRUNCATE selection_events, selection_applications'); });

const rows = async (text, params = []) => (await db.query(text, params)).rows;

/** Insere uma inscrição com texto sensível em todos os campos e a idade (em dias) de updated_at/decided_at. */
async function app({ status, profile = PEOPLE[0], updatedDaysAgo = 0, decidedDaysAgo = null }) {
  const [row] = await rows(
    `INSERT INTO selection_applications (profile_id, status, bank_version, seed, deadline_at, receipt_code, data, ai_triage, ai_triage_at,
       decision_note, appeal_note, decided_at, updated_at)
     VALUES ($1, $2, 'v1', 1, now(), $3, '{"scenario":{"text":"texto do candidato"}}'::jsonb, '{"resumo":"x"}'::jsonb, now(),
       'obs interna', 'pedido de revisão', CASE WHEN $5::int IS NULL THEN NULL ELSE now() - make_interval(days => $5::int) END,
       now() - make_interval(days => $4::int))
     RETURNING id`,
    [profile, status, 'LAIFT-' + (++seq), updatedDaysAgo, decidedDaysAgo],
  );
  return row.id;
}
const event = (id, daysAgo) => db.query(
  `INSERT INTO selection_events (application_id, kind, created_at) VALUES ($1, 'submitted', now() - make_interval(days => $2::int))`, [id, daysAgo]);
const get = async (id) => (await rows('SELECT * FROM selection_applications WHERE id = $1', [id]))[0];
const OLD = 400;
const RECENT = 30;

describe('retenção do processo seletivo', () => {
  test('constantes: 12 meses, rascunho parado 60 dias, lote de 200', () => {
    expect(SELECTION_RETENTION).toEqual({ RETAIN_MONTHS: 12, DRAFT_IDLE_DAYS: 60, BATCH_SIZE: 200 });
  });

  test.each(FINAL)('anonimiza inscrição %s antiga e mantém a linha mínima', async (status) => {
    const id = await app({ status, updatedDaysAgo: OLD });
    const before = await get(id);
    const out = await runMaintenance(sql, 'cid');
    expect(out.selectionAnonymize).toBe(1);
    const after = await get(id);
    expect(after.data).toEqual({});
    expect(after.ai_triage).toBeNull();
    expect(after.ai_triage_at).toBeNull();
    expect(after.decision_note).toBeNull();
    expect(after.appeal_note).toBeNull();
    for (const k of ['id', 'profile_id', 'status', 'receipt_code', 'created_at', 'updated_at', 'started_at', 'deadline_at']) {
      expect(after[k]).toEqual(before[k]);
    }
  });

  test('usa o mais recente entre updated_at e decided_at', async () => {
    const recentDecision = await app({ status: 'approved', updatedDaysAgo: OLD, decidedDaysAgo: RECENT });
    const oldDecision = await app({ status: 'not_selected', profile: PEOPLE[1], updatedDaysAgo: OLD, decidedDaysAgo: OLD });
    await runMaintenance(sql, 'cid');
    expect((await get(recentDecision)).decision_note).toBe('obs interna');
    expect((await get(oldDecision)).decision_note).toBeNull();
  });

  test('não toca inscrição final recente nem as ativas, mesmo antigas', async () => {
    const ids = [await app({ status: 'approved', updatedDaysAgo: RECENT })];
    for (const [i, status] of ACTIVE.entries()) ids.push(await app({ status, profile: PEOPLE[i + 1], updatedDaysAgo: OLD }));
    const out = await runMaintenance(sql, 'cid');
    expect(out.selectionAnonymize).toBe(0);
    for (const id of ids) {
      const r = await get(id);
      expect(r.data).toEqual({ scenario: { text: 'texto do candidato' } });
      expect(r.decision_note).toBe('obs interna');
    }
  });

  test('é idempotente: a segunda execução não muda nada', async () => {
    const id = await app({ status: 'withdrawn', updatedDaysAgo: OLD });
    await app({ status: 'draft', profile: PEOPLE[1], updatedDaysAgo: 90 });
    await runMaintenance(sql, 'cid');
    const snap = JSON.stringify(await rows('SELECT * FROM selection_applications ORDER BY id'));
    const second = await runMaintenance(sql, 'cid');
    expect(second).toMatchObject({ selectionDraftsExpire: 0, selectionAnonymize: 0, selectionEventsPurge: 0 });
    expect(JSON.stringify(await rows('SELECT * FROM selection_applications ORDER BY id'))).toBe(snap);
    expect((await get(id)).data).toEqual({});
  });

  test('trabalha em lotes de BATCH_SIZE por execução', async () => {
    const total = SELECTION_RETENTION.BATCH_SIZE + 5;
    await db.query(
      `INSERT INTO selection_applications (profile_id, status, bank_version, seed, deadline_at, data, updated_at)
       SELECT $1, 'withdrawn', 'v1', 1, now(), '{"a":1}'::jsonb, now() - interval '400 days' FROM generate_series(1, $2::int)`,
      [PEOPLE[0], total],
    );
    expect((await runMaintenance(sql, 'cid')).selectionAnonymize).toBe(SELECTION_RETENTION.BATCH_SIZE);
    expect((await runMaintenance(sql, 'cid')).selectionAnonymize).toBe(5);
    expect((await runMaintenance(sql, 'cid')).selectionAnonymize).toBe(0);
  });

  test('rascunho parado há mais de 60 dias expira; o recente e o antigo-mas-ativo ficam', async () => {
    const stale = await app({ status: 'draft', updatedDaysAgo: 61 });
    const fresh = await app({ status: 'draft', profile: PEOPLE[1], updatedDaysAgo: 10 });
    const out = await runMaintenance(sql, 'cid');
    expect(out.selectionDraftsExpire).toBe(1);
    expect((await get(stale)).status).toBe('expired');
    expect((await get(fresh)).status).toBe('draft');
    // Recém-expirado ainda guarda o texto: entra na regra dos 12 meses a partir de agora.
    expect((await get(stale)).data).toEqual({ scenario: { text: 'texto do candidato' } });
  });

  test('rascunho muito antigo expira e, em 12 meses depois de expirado, é anonimizado', async () => {
    const id = await app({ status: 'draft', updatedDaysAgo: OLD });
    await runMaintenance(sql, 'cid');
    expect((await get(id)).status).toBe('expired');
    await db.query("UPDATE selection_applications SET updated_at = now() - interval '400 days' WHERE id = $1", [id]);
    await runMaintenance(sql, 'cid');
    expect((await get(id)).data).toEqual({});
  });

  test('apaga eventos antigos só de inscrições anonimizadas', async () => {
    const anon = await app({ status: 'approved', updatedDaysAgo: OLD });
    const live = await app({ status: 'submitted', profile: PEOPLE[1], updatedDaysAgo: OLD });
    const recentFinal = await app({ status: 'approved', profile: PEOPLE[2], updatedDaysAgo: RECENT });
    for (const id of [anon, live, recentFinal]) { await event(id, OLD); await event(id, RECENT); }
    const out = await runMaintenance(sql, 'cid');
    expect(out.selectionEventsPurge).toBe(1);
    const left = await rows('SELECT application_id, created_at < now() - interval \'12 months\' AS old FROM selection_events');
    expect(left).toHaveLength(5);
    expect(left.filter((r) => r.application_id === anon)).toEqual([{ application_id: anon, old: false }]);
    expect(left.filter((r) => r.old)).toHaveLength(2);
  });

  test('o resumo traz só contagens (sem texto de candidato)', async () => {
    await app({ status: 'approved', updatedDaysAgo: OLD });
    const out = await runMaintenance(sql, 'cid');
    expect(JSON.stringify(out)).not.toMatch(/texto do candidato|obs interna/);
    for (const k of ['selectionDraftsExpire', 'selectionAnonymize', 'selectionEventsPurge']) expect(typeof out[k]).toBe('number');
  });
});
