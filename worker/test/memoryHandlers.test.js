/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryHandlers.test.js — as 9 actions novas pelo API_REGISTRY, com sessão de verdade (núcleo em PGlite) e o banco de
 * memória em PGlite: contrato de erro com `code`, flag desligada, fluxo completo do membro, e o admin: só agregados
 * (NÃO lê a memória de ninguém), apagar memória de uma pessoa só com senha, estatísticas dos agentes.
 */
import { jest } from '@jest/globals';
import * as C from '../src/constants.js';
import * as S from '../src/security.js';
import { API_REGISTRY } from '../src/handlers.js';
import * as MemoryAdmin from '../src/memory/admin.js';
import * as Store from '../src/memory/store.js';
import { subjectIdFor } from '../src/memory/subject.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { createMemoryPglite, toMemorySql } from './helpers/memoryDb.js';
import { makeEnv } from './helpers/mockEnv.js';

const KEY = 'k'.repeat(40);
const V = C.MEMORY.PURPOSE_VERSION;
const MEMBER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const PASSWORD = 'Senha-Forte-123';

let core;
let sql;
let mdb;
let msql;
let memberToken;
let adminToken;

const addProfile = (id, name, role) => core.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, crypt($6, gen_salt('bf', 4)), '11999990000', $4::user_role, 'active', now(), $5)`,
  [id, 'Pessoa ' + name, name + '@example.com', role, name, PASSWORD]
);
const env = (over) => makeEnv(Object.assign({ memorySql: msql, MEMORY_SUBJECT_KEY: KEY }, over || {}));
const call = (name, token, ...args) => API_REGISTRY[name](sql, env(), [token, ...args]);
const setFlag = (enabled) => core.query("UPDATE feature_flags SET enabled = $1 WHERE key = 'memory_enabled'", [enabled]);

beforeAll(async () => {
  core = await createMigratedDb();
  sql = toSql(core);
  await addProfile(MEMBER_ID, 'maria', 'member');
  await addProfile(ADMIN_ID, 'admin', 'admin');
  memberToken = await S.createSession(sql, env().SESSION_TOKEN_PEPPER, MEMBER_ID, 'jest');
  adminToken = await S.createSession(sql, env().SESSION_TOKEN_PEPPER, ADMIN_ID, 'jest');
  mdb = await createMemoryPglite();
  msql = toMemorySql(mdb);
}, 180000);
afterAll(async () => { await core.close(); await mdb.close(); });

beforeEach(async () => {
  __resetFlagCacheForTests();
  await setFlag(true);
  await core.exec('DELETE FROM rate_limit_buckets; DELETE FROM member_memory_consent; DELETE FROM memory_purge_queue; DELETE FROM audit_logs; DELETE FROM agent_traces;');
  await mdb.exec('DELETE FROM memory_items');
  msql.history.length = 0;
  msql.fail(null, 0);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

const MEMBER_ACTIONS = {
  apiMemoryGet: [],
  apiMemorySetConsent: [{ granted: true, purposeVersion: V }],
  apiMemoryDeleteItem: [{ id: '33333333-3333-4333-8333-333333333333' }],
  apiMemoryDeleteAll: [],
  apiMemorySetPreference: [{ kind: 'study_pref', slug: 'formato', value: 'exemplos' }],
  apiMemoryExport: [],
};

describe('contrato dos handlers', () => {
  test.each(Object.keys(MEMBER_ACTIONS))('%s sem sessão válida: recusa sem tocar em nada', async (name) => {
    const res = await call(name, 'token-invalido', ...MEMBER_ACTIONS[name]);
    expect(res).toMatchObject({ success: false, message: expect.stringContaining('Sessão') });
    expect(msql.history).toEqual([]);
  });

  test.each(['apiMemoryGet', 'apiMemorySetConsent', 'apiMemorySetPreference', 'apiMemoryExport'])('%s com a flag desligada: success:false, code MEMORY_DISABLED e nada acontece', async (name) => {
    await setFlag(false);
    const res = await call(name, memberToken, ...MEMBER_ACTIONS[name]);
    expect(res).toMatchObject({ success: false, code: 'MEMORY_DISABLED', reason: 'flag' });
    expect(msql.history).toEqual([]);
    expect((await core.query('SELECT 1 FROM member_memory_consent')).rows).toHaveLength(0);
  });

  test('fluxo completo do membro: ativar, preferir, ver, exportar, apagar item, apagar tudo, desativar', async () => {
    expect(await call('apiMemoryGet', memberToken)).toMatchObject({ success: true, available: true, consent: { status: 'none' }, items: [] });
    expect(await call('apiMemorySetPreference', memberToken, { kind: 'goal', slug: 'prova' })).toMatchObject({ success: false, code: 'CONSENT_REQUIRED' });
    expect(await call('apiMemorySetConsent', memberToken, { granted: true, purposeVersion: V })).toMatchObject({ success: true, consent: { current: true } });
    expect(await call('apiMemorySetPreference', memberToken, { kind: 'goal', slug: 'prova' })).toMatchObject({ success: true, item: { kind: 'goal', slug: 'prova' } });
    expect(await call('apiMemorySetPreference', memberToken, { kind: 'topic_level', slug: 'aines', level: 4 })).toMatchObject({ success: true });
    const state = await call('apiMemoryGet', memberToken);
    expect(state.items.map((i) => i.slug)).toEqual(['prova', 'aines']);
    expect(await call('apiMemoryExport', memberToken)).toMatchObject({ success: true, format: 'laift-memory/v1', items: [{ slug: 'prova' }, { slug: 'aines' }] });
    expect(await call('apiMemoryDeleteItem', memberToken, { id: state.items[0].id })).toMatchObject({ success: true, deleted: 1 });
    expect(await call('apiMemoryDeleteAll', memberToken)).toMatchObject({ success: true, deleted: 1 });
    expect(await call('apiMemorySetConsent', memberToken, { granted: false })).toMatchObject({ success: true, erased: true, consent: { status: 'revoked' } });
    expect((await call('apiMemoryGet', memberToken)).items).toEqual([]);
  });

  test('erros de validação chegam com code e mensagem em português', async () => {
    await call('apiMemorySetConsent', memberToken, { granted: true, purposeVersion: V });
    const res = await call('apiMemorySetPreference', memberToken, { kind: 'study_pref', slug: 'formato', value: 'texto livre aqui' });
    expect(res).toMatchObject({ success: false, code: 'VALIDATION', message: expect.stringMatching(/lista/) });
  });

  test('entrada que não é objeto vira {} e cai na validação (nunca TypeError)', async () => {
    for (const bad of [null, 'x', 5, [1]]) {
      expect(await call('apiMemorySetConsent', memberToken, bad)).toMatchObject({ success: false, code: 'VALIDATION' });
    }
  });

  test('erro inesperado do banco de memória não vaza detalhe', async () => {
    await call('apiMemorySetConsent', memberToken, { granted: true, purposeVersion: V });
    msql.fail(new Error('detalhe interno com postgres://u:p@h/db'));
    const res = await call('apiMemoryGet', memberToken);
    expect(JSON.stringify(res)).not.toMatch(/postgres:|detalhe interno/);
  });
});

describe('admin: só agregados, nunca o conteúdo da memória', () => {
  const seed = async () => {
    await call('apiMemorySetConsent', memberToken, { granted: true, purposeVersion: V });
    await call('apiMemorySetPreference', memberToken, { kind: 'topic_level', slug: 'aines', level: 4 });
    await call('apiMemorySetPreference', memberToken, { kind: 'goal', slug: 'prova' });
  };

  test('não existe action de admin que leia itens: só estatísticas e purga', () => {
    const adminMemory = Object.keys(API_REGISTRY).filter((n) => /^apiAdmin/.test(n) && /memor|purge/i.test(n)).sort();
    expect(adminMemory).toEqual(['apiAdminMemoryStats', 'apiAdminPurgeMemberMemory']);
  });

  test('apiAdminMemoryStats: membro é recusado; admin vê contagens e nada de pessoa, tema ou pseudônimo', async () => {
    await seed();
    expect(await call('apiAdminMemoryStats', memberToken)).toMatchObject({ success: false, message: expect.stringMatching(/autorizado/) });
    const res = await call('apiAdminMemoryStats', adminToken);
    expect(res).toMatchObject({
      success: true, configured: true, purposeVersion: V,
      consent: { grantedCurrent: 1, grantedOldVersion: 0, revoked: 0 },
      purgeQueue: { pending: 0, maxAttempts: 0, oldestHours: null },
      memory: { available: true, items: 2, subjects: 1, byKind: { goal: 1, topic_level: 1 } },
    });
    const text = JSON.stringify(res);
    expect(text).not.toMatch(/aines|prova|[0-9a-f]{64}|maria|slug|subject_?id|profile/i);
  });

  test('apiAdminMemoryStats conta aceite de versão antiga e fila; sem banco de memória segue com o núcleo', async () => {
    await seed();
    await core.query("UPDATE member_memory_consent SET purpose_version = 'memoria-antiga'");
    await core.query("INSERT INTO memory_purge_queue (profile_ref, reason, attempts, enqueued_at) VALUES ($1, 'revoked', 3, now() - interval '5 hours')", [ADMIN_ID]);
    const res = await API_REGISTRY.apiAdminMemoryStats(sql, makeEnv(), [adminToken]);
    expect(res).toMatchObject({
      success: true, configured: false, consent: { grantedCurrent: 0, grantedOldVersion: 1, revoked: 0 },
      purgeQueue: { pending: 1, maxAttempts: 3, oldestHours: 5 }, memory: { available: false },
    });
  });

  test('apiAdminMemoryStats com o banco de memória fora do ar: available:false, sem erro', async () => {
    msql.fail(new Error('fora'));
    expect(await call('apiAdminMemoryStats', adminToken)).toMatchObject({ success: true, memory: { available: false } });
  });

  describe('apiAdminPurgeMemberMemory (exige senha)', () => {
    const purge = (token, input) => call('apiAdminPurgeMemberMemory', token, input);

    test('membro comum é recusado', async () => {
      await seed();
      expect(await purge(memberToken, { profileId: MEMBER_ID, password: PASSWORD })).toMatchObject({ success: false, message: expect.stringMatching(/autorizado/) });
      expect((await mdb.query('SELECT count(*)::int AS n FROM memory_items')).rows[0].n).toBe(2);
    });

    test('sem senha ou com senha errada: NADA é apagado', async () => {
      await seed();
      expect(await purge(adminToken, { profileId: MEMBER_ID })).toMatchObject({ success: false, message: expect.stringMatching(/senha/i) });
      expect(await purge(adminToken, { profileId: MEMBER_ID, password: 'errada' })).toMatchObject({ success: false, message: expect.stringMatching(/Senha incorreta/) });
      expect((await mdb.query('SELECT count(*)::int AS n FROM memory_items')).rows[0].n).toBe(2);
    });

    test('com a senha certa apaga a memória da pessoa (não o consentimento) e deixa auditoria sem conteúdo', async () => {
      await seed();
      const res = await purge(adminToken, { profileId: MEMBER_ID.toUpperCase(), password: PASSWORD });
      expect(res).toMatchObject({ success: true, erased: true, queued: false });
      expect((await mdb.query('SELECT count(*)::int AS n FROM memory_items')).rows[0].n).toBe(0);
      expect((await core.query('SELECT status FROM member_memory_consent')).rows).toEqual([{ status: 'granted' }]);
      const audit = (await core.query("SELECT actor_id, target_id, details FROM audit_logs WHERE action = 'MEMORY_ADMIN_PURGE'")).rows;
      expect(audit).toEqual([{ actor_id: ADMIN_ID, target_id: MEMBER_ID, details: { erased: true, queued: false } }]);
    });

    test('funciona mesmo com a flag desligada (higiene) e aceita um perfil que já foi excluído', async () => {
      await seed();
      await setFlag(false);
      __resetFlagCacheForTests();
      const sub = await subjectIdFor(env(), MEMBER_ID);
      expect(await Store.listItems(msql, sub)).toHaveLength(2);
      expect(await purge(adminToken, { profileId: MEMBER_ID, password: PASSWORD })).toMatchObject({ success: true, erased: true });
      expect(await purge(adminToken, { profileId: '44444444-4444-4444-8444-444444444444', password: PASSWORD })).toMatchObject({ success: true });
    });

    test('se o banco de memória falhar, a purga entra na fila e o cron conclui', async () => {
      await seed();
      msql.fail(new Error('fora'));
      expect(await purge(adminToken, { profileId: MEMBER_ID, password: PASSWORD })).toMatchObject({ success: true, erased: false, queued: true });
      expect((await core.query('SELECT profile_ref, reason FROM memory_purge_queue')).rows).toEqual([{ profile_ref: MEMBER_ID, reason: 'admin' }]);
    });

    test.each([undefined, '', 'x', '../..', 42, { a: 1 }])('profileId inválido (%p): VALIDATION antes de qualquer senha', async (profileId) => {
      const res = await purge(adminToken, { profileId, password: PASSWORD });
      expect(res).toMatchObject({ success: false, code: 'VALIDATION' });
    });

    test('purgeMemberMemory sem stepUp injetado ainda exige admin (defesa em profundidade)', async () => {
      await expect(MemoryAdmin.purgeMemberMemory(sql, env(), { role: 'member', profileId: MEMBER_ID }, { profileId: ADMIN_ID }, 'c0000000-0000-4000-8000-000000000000'))
        .rejects.toMatchObject({ name: 'ForbiddenError' });
    });
  });
});

describe('apiAdminAgentsStats (agregados de agent_traces)', () => {
  const trace = (n, over = {}) => core.query(
    `INSERT INTO agent_traces (trace_id, profile_id, persona, persona_version, persona_hash, feature, model, tokens_in, tokens_out, estimated, latency_ms, outcome, memory_used, created_at)
     VALUES (gen_random_uuid(), $1, 'tutor-clinico', '1.0.0', 'a1b2c3d4e5f6', 'agent_tutor', 'm', $2, $3, $4, $5, $6, $7, now() - make_interval(days => $8::int))`,
    [MEMBER_ID, over.tin ?? 100, over.tout ?? 50, over.estimated ?? false, over.lat ?? 800, over.outcome ?? 'answered', over.mem ?? false, over.daysAgo ?? 0]
  );

  test('somas, médias, desfechos e dias; sem texto nem pessoa; só admin', async () => {
    await trace(1, { tin: 100, tout: 50, lat: 1000, mem: true });
    await trace(2, { tin: 200, tout: 100, lat: 3000, estimated: true });
    await trace(3, { outcome: 'refused', tin: 0, tout: 0, lat: 5 });
    await trace(4, { daysAgo: 45 });
    expect(await call('apiAdminAgentsStats', memberToken, {})).toMatchObject({ success: false });
    const res = await call('apiAdminAgentsStats', adminToken, { days: 30 });
    expect(res).toMatchObject({ success: true, days: 30 });
    expect(res.totals).toMatchObject({ calls: 3, tokensIn: 300, tokensOut: 150, estimatedCalls: 1, memoryUsedCalls: 1 });
    expect(res.totals.avgLatencyMs).toBe(1335);
    expect(res.byPersona).toEqual([{ persona: 'tutor-clinico', version: '1.0.0', calls: 3, tokensIn: 300, tokensOut: 150 }]);
    expect(res.byOutcome).toEqual([{ outcome: 'answered', calls: 2 }, { outcome: 'refused', calls: 1 }]);
    expect(res.byDay).toHaveLength(1);
    expect(JSON.stringify(res)).not.toMatch(/profile|trace_id|maria/i);
    expect((await call('apiAdminAgentsStats', adminToken, { days: 90 })).totals.calls).toBe(4);
  });

  test.each([[undefined, 30], [0, 30], [-5, 30], ['abc', 30], [7, 7], [500, 90]])('days %p vira %p', async (days, expected) => {
    expect((await call('apiAdminAgentsStats', adminToken, { days })).days).toBe(expected);
  });

  test('sem registros: zeros', async () => {
    const res = await call('apiAdminAgentsStats', adminToken, {});
    expect(res.totals).toEqual({ calls: 0, tokensIn: 0, tokensOut: 0, estimatedCalls: 0, memoryUsedCalls: 0, avgLatencyMs: 0, p95LatencyMs: 0 });
    expect(res.byPersona).toEqual([]);
  });

  test('035 não aplicada (tabela ausente): zeros em vez de erro', async () => {
    const missing = Object.assign((strings, ...values) => {
      if (strings.join('?').includes('FROM agent_traces')) return Promise.reject(Object.assign(new Error('relation "agent_traces" does not exist'), { code: '42P01' }));
      return sql(strings, ...values);
    }, {});
    const res = await MemoryAdmin.agentsStats(missing, { role: 'admin', profileId: ADMIN_ID }, {});
    expect(res.totals.calls).toBe(0);
  });
});
