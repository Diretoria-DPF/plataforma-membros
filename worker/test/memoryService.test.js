/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryService.test.js — memória de estudo (memory/service.js) com DOIS Postgres de verdade (PGlite): o núcleo (todas
 * as migrações) e o banco de memória (sql/memory/001, transações como laift_memory_worker, RLS valendo). Cobre flag,
 * papel e maioridade, consentimento e VERSÃO da finalidade, revogação falha-fechada, apagar item/tudo, exportação,
 * texto livre rejeitado, teto de 60, pseudônimo do sujeito, isolamento entre pessoas, rate limits e falhas do banco.
 */
import { jest } from '@jest/globals';
import * as C from '../src/constants.js';
import * as MemoryService from '../src/memory/service.js';
import * as Store from '../src/memory/store.js';
import { subjectIdFor } from '../src/memory/subject.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { __resetTutorCacheForTests } from '../src/memory/tutorCache.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { createMemoryPglite, toMemorySql, withoutTopicCheck } from './helpers/memoryDb.js';
import { makeEnv } from './helpers/mockEnv.js';

const CID = '99999999-9999-4999-8999-999999999999';
const KEY = 'k'.repeat(40);
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MEMBER = { profileId: ME, role: 'member', status: 'active', fullName: 'Maria Teste', email: 'maria@exemplo.com' };
const ADMIN = { profileId: OTHER, role: 'admin', status: 'active', fullName: 'Admin Teste', email: 'admin@exemplo.com' };
const VISITOR = { profileId: '33333333-3333-4333-8333-333333333333', role: 'visitor', status: 'active', fullName: 'V', email: 'v@exemplo.com' };
const VERSION = C.MEMORY.PURPOSE_VERSION;

let core;
let sql;
let mdb;
let msql;

const addProfile = (id, name, role = 'member') => core.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', $4::user_role, 'active', now(), $5)`,
  [id, 'Pessoa ' + name, name + '@example.com', role, name]
);

beforeAll(async () => {
  core = await createMigratedDb();
  sql = toSql(core);
  await addProfile(ME, 'maria');
  await addProfile(OTHER, 'admin', 'admin');
  mdb = await createMemoryPglite();
  msql = toMemorySql(mdb);
}, 180000);
afterAll(async () => { await core.close(); await mdb.close(); });

const setFlag = (enabled) => core.query("UPDATE feature_flags SET enabled = $1 WHERE key = 'memory_enabled'", [enabled]);

beforeEach(async () => {
  C.MEMORY.PURPOSE_VERSION = VERSION;
  __resetFlagCacheForTests();
  __resetTutorCacheForTests();
  await setFlag(true);
  await core.exec('DELETE FROM rate_limit_buckets; DELETE FROM member_memory_consent; DELETE FROM memory_purge_queue; DELETE FROM audit_logs; DELETE FROM error_logs;');
  await mdb.exec('DELETE FROM memory_items');
  msql.history.length = 0;
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

const env = (over) => makeEnv(Object.assign({ memorySql: msql, MEMORY_SUBJECT_KEY: KEY }, over || {}));
const grant = (identity = MEMBER, over) => MemoryService.setConsent(sql, env(over), identity, { granted: true, purposeVersion: C.MEMORY.PURPOSE_VERSION }, CID);
const pref = (input, identity = MEMBER, over) => MemoryService.setPreference(sql, env(over), identity, input, CID);
const get = (identity = MEMBER, over) => MemoryService.getState(sql, env(over), identity, CID);
const FORMATO = { kind: 'study_pref', slug: 'formato', value: 'exemplos' };
const memoryRows = async () => (await mdb.query('SELECT * FROM memory_items ORDER BY kind, slug')).rows;
const buckets = async () => (await core.query('SELECT bucket FROM rate_limit_buckets ORDER BY bucket')).rows.map((r) => r.bucket);
const touchedMemory = () => msql.history.length > 0;

describe('flag, papel e maioridade', () => {
  const calls = {
    get: () => get(),
    consent: () => grant(),
    pref: () => pref(FORMATO),
    export: () => MemoryService.exportData(sql, env(), MEMBER, CID),
  };

  test.each(Object.keys(calls))('memory_enabled desligada: %s responde MEMORY_DISABLED e nada acontece (sem banco de memória, sem cota)', async (name) => {
    await setFlag(false);
    await expect(calls[name]()).rejects.toMatchObject({ expected: true, code: 'MEMORY_DISABLED', payload: { code: 'MEMORY_DISABLED', reason: 'flag' } });
    expect(touchedMemory()).toBe(false);
    expect(await buckets()).toEqual([]);
    expect((await core.query('SELECT 1 FROM member_memory_consent')).rows).toHaveLength(0);
  });

  test('sem a tabela de flags ou com falha de leitura: desligada (falha fechada)', async () => {
    const broken = Object.assign(async () => { throw new Error('banco fora'); }, {});
    await expect(MemoryService.getState(broken, env(), MEMBER, CID)).rejects.toMatchObject({ code: 'MEMORY_DISABLED' });
  });

  test('visitante não tem memória', async () => {
    await expect(get(VISITOR)).rejects.toMatchObject({ code: 'MEMORY_DISABLED', payload: { reason: 'role' } });
  });

  test.each([{ isMinor: true }, { age: 16 }, { birthDate: '2015-05-05' }, { guardianProfileId: OTHER }, { ageBand: 'minor' }])('menor de idade (%j): MEMORY_DISABLED e nada é lido nem escrito', async (marker) => {
    const minor = Object.assign({}, MEMBER, marker);
    for (const fn of [() => get(minor), () => grant(minor), () => pref(FORMATO, minor)]) {
      await expect(fn()).rejects.toMatchObject({ code: 'MEMORY_DISABLED', payload: { reason: 'age' } });
    }
    expect(touchedMemory()).toBe(false);
  });

  test('o admin também tem memória', async () => {
    await expect(grant(ADMIN)).resolves.toMatchObject({ success: true, consent: { status: 'granted', current: true } });
  });
});

describe('infraestrutura ausente (falha fechada)', () => {
  test('sem DATABASE_URL_MEMORY: a tela mostra available:false e não há como consentir', async () => {
    const bare = { memorySql: undefined, MEMORY_SUBJECT_KEY: KEY };
    await expect(get(MEMBER, bare)).resolves.toMatchObject({ success: true, available: false, items: [], consent: { status: 'none', current: false } });
    await expect(grant(MEMBER, bare)).rejects.toMatchObject({ code: 'MEMORY_UNAVAILABLE', payload: { code: 'MEMORY_UNAVAILABLE' } });
    expect((await core.query('SELECT 1 FROM member_memory_consent')).rows).toHaveLength(0);
  });

  test.each([undefined, '', 'curta'])('sem MEMORY_SUBJECT_KEY válida (%p): memória indisponível', async (key) => {
    const noKey = { MEMORY_SUBJECT_KEY: key };
    await expect(grant(MEMBER, noKey)).rejects.toMatchObject({ code: 'MEMORY_UNAVAILABLE' });
    await expect(get(MEMBER, noKey)).resolves.toMatchObject({ available: false });
    expect(touchedMemory()).toBe(false);
  });
});

describe('consentimento e versão da finalidade', () => {
  test('estado inicial: sem consentimento, sem itens, com vocabulário e limites', async () => {
    const res = await get();
    expect(res).toMatchObject({
      success: true, alpha: true, available: true, items: [],
      consent: { status: 'none', current: false, needsReconsent: false, purposeVersion: VERSION },
      limits: { maxItems: 60, retentionUnusedDays: 180, retentionMaxMonths: 12 },
    });
    expect(res.vocabulary.topics.length).toBeGreaterThan(10);
    expect(res.vocabulary.preferences.map((p) => p.slug)).toEqual(['formato', 'profundidade', 'ritmo']);
  });

  test('ativar exige o aceite da versão atual do termo', async () => {
    for (const purposeVersion of [undefined, 'memoria-antiga', 42]) {
      await expect(MemoryService.setConsent(sql, env(), MEMBER, { granted: true, purposeVersion }, CID))
        .rejects.toMatchObject({ code: 'VALIDATION', payload: { reason: 'version', purposeVersion: VERSION } });
    }
    expect((await core.query('SELECT 1 FROM member_memory_consent')).rows).toHaveLength(0);
  });

  test.each([undefined, 'sim', 1, null])('granted precisa ser booleano (%p)', async (granted) => {
    await expect(MemoryService.setConsent(sql, env(), MEMBER, { granted }, CID)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  test('aceitar grava no núcleo (versão e data) e deixa trilha de auditoria sem conteúdo', async () => {
    const res = await grant();
    expect(res.consent).toMatchObject({ status: 'granted', current: true, acceptedVersion: VERSION });
    expect((await core.query('SELECT status, purpose_version FROM member_memory_consent WHERE profile_id = $1', [ME])).rows).toEqual([{ status: 'granted', purpose_version: VERSION }]);
    const audit = (await core.query("SELECT action, details FROM audit_logs WHERE action LIKE 'MEMORY_%'")).rows;
    expect(audit).toEqual([{ action: 'MEMORY_CONSENT_GRANTED', details: { purposeVersion: VERSION } }]);
  });

  test('mudou a versão da finalidade: a leitura e a escrita fecham até novo aceite; apagar e exportar seguem', async () => {
    await grant();
    await pref(FORMATO);
    C.MEMORY.PURPOSE_VERSION = 'memoria-2026-11-v2';
    const state = await get();
    expect(state.consent).toMatchObject({ status: 'granted', current: false, needsReconsent: true, acceptedVersion: VERSION, purposeVersion: 'memoria-2026-11-v2' });
    expect(state.items).toEqual([]);
    await expect(pref({ kind: 'study_pref', slug: 'ritmo', value: 'curto' })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', payload: { reason: 'version' } });
    const exported = await MemoryService.exportData(sql, env(), MEMBER, CID);
    expect(exported.items).toHaveLength(1);
    await expect(MemoryService.deleteAll(sql, env(), MEMBER, CID)).resolves.toMatchObject({ deleted: 1 });
    // novo aceite na versão nova reabre
    await expect(MemoryService.setConsent(sql, env(), MEMBER, { granted: true, purposeVersion: 'memoria-2026-11-v2' }, CID)).resolves.toMatchObject({ consent: { current: true } });
    await expect(pref(FORMATO)).resolves.toMatchObject({ success: true });
  });

  test('o termo é por pessoa: o consentimento de uma não vale para a outra', async () => {
    await grant(MEMBER);
    await expect(pref(FORMATO, ADMIN)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });
});

describe('preferências: só vocabulário, nunca texto livre', () => {
  beforeEach(async () => { await grant(); });

  test('sem consentimento nada é gravado (CONSENT_REQUIRED) e o banco de memória nem é tocado', async () => {
    await core.exec('DELETE FROM member_memory_consent');
    msql.history.length = 0;
    await expect(pref(FORMATO)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED', payload: { reason: 'none' } });
    expect(touchedMemory()).toBe(false);
  });

  test('grava preferência, objetivo e nível próprio; atualizar a mesma chave substitui', async () => {
    await pref(FORMATO);
    await pref({ kind: 'goal', slug: 'prova' });
    await pref({ kind: 'topic_level', slug: 'farmacocinetica', level: 4 });
    const second = await pref({ kind: 'study_pref', slug: 'formato', value: 'resumo' });
    expect(second.item).toMatchObject({ kind: 'study_pref', slug: 'formato', value: 'resumo', level: null, source: 'member', evidence: 1 });
    const rows = await memoryRows();
    expect(rows.map((r) => [r.kind, r.slug, r.value, r.level])).toEqual([
      ['goal', 'prova', 'ativo', null], ['study_pref', 'formato', 'resumo', null], ['topic_level', 'farmacocinetica', null, 4],
    ]);
    expect(rows.every((r) => r.consent_version === VERSION && r.source === 'member')).toBe(true);
  });

  test.each([
    ['campo extra com texto livre', { ...FORMATO, note: 'sou hipertensa e tomo losartana' }],
    ['texto livre no tema', { kind: 'topic_level', slug: 'minha mae tem diabetes', level: 3 }],
    ['texto livre no valor', { kind: 'study_pref', slug: 'formato', value: 'prefiro estudar de madrugada porque tenho insônia' }],
    ['tema fora do vocabulário', { kind: 'topic_level', slug: 'cardiologia-pediatrica', level: 3 }],
    ['preferência fora do vocabulário', { kind: 'study_pref', slug: 'humor', value: 'triste' }],
    ['objetivo livre', { kind: 'goal', slug: 'emagrecer', value: 'ativo' }],
    ['valor livre em objetivo', { kind: 'goal', slug: 'prova', value: 'prova de dia 10' }],
    ['tipo que o membro não define (dúvida)', { kind: 'difficulty', slug: 'coagulacao', level: 2, value: 'duvida' }],
    ['tipo desconhecido', { kind: 'diagnostico', slug: 'depressao' }],
    ['nível fora de 1–5', { kind: 'topic_level', slug: 'aines', level: 9 }],
    ['nível não inteiro', { kind: 'topic_level', slug: 'aines', level: 2.5 }],
    ['nível como texto', { kind: 'topic_level', slug: 'aines', level: '3' }],
    ['nível ausente', { kind: 'topic_level', slug: 'aines' }],
    ['valor em nível de tema', { kind: 'topic_level', slug: 'aines', level: 3, value: 'resumo' }],
    ['nível em preferência', { ...FORMATO, level: 2 }],
    ['slug objeto', { kind: 'study_pref', slug: { a: 1 }, value: 'resumo' }],
    ['array', [FORMATO]],
    ['texto', 'quero resumos'],
    ['vazio', undefined],
  ])('recusa (%s): VALIDATION e nada é gravado', async (_n, input) => {
    msql.history.length = 0;
    await expect(MemoryService.setPreference(sql, env(), MEMBER, input, CID)).rejects.toMatchObject({ expected: true, code: 'VALIDATION' });
    expect(await memoryRows()).toEqual([]);
    expect(touchedMemory()).toBe(false);
  });

  test('teto de 60 itens: o 61º recebe MEMORY_FULL; atualizar um existente continua possível; outra pessoa não é afetada', () => withoutTopicCheck(mdb, async () => {
    const subject = await subjectIdFor(env(), ME);
    const fill = Array.from({ length: 60 }, (_, i) => ({ kind: 'topic_level', slug: 'tema-' + String(i).padStart(2, '0'), level: 3, value: null, source: 'member' }));
    await Store.upsertItems(msql, subject, fill, VERSION);
    expect(await memoryRows()).toHaveLength(60);
    await expect(pref(FORMATO)).rejects.toMatchObject({ expected: true, code: 'MEMORY_FULL', payload: { code: 'MEMORY_FULL' } });
    await expect(Store.upsertItems(msql, subject, [{ ...fill[0], level: 5 }], VERSION)).resolves.toHaveLength(1);
    expect(await memoryRows()).toHaveLength(60);
    await grant(ADMIN);
    await expect(pref(FORMATO, ADMIN)).resolves.toMatchObject({ success: true });
    await MemoryService.deleteItem(sql, env(), MEMBER, { id: (await memoryRows()).find((r) => r.slug === 'tema-00').id }, CID);
    await expect(pref(FORMATO)).resolves.toMatchObject({ success: true });
  }));
});

describe('ver, apagar item e apagar tudo', () => {
  beforeEach(async () => {
    await grant();
    await pref(FORMATO);
    await pref({ kind: 'goal', slug: 'revisao' });
  });

  test('getState lista os itens da pessoa, sem identificadores do pseudônimo', async () => {
    const res = await get();
    expect(res.items.map((i) => [i.kind, i.slug])).toEqual([['goal', 'revisao'], ['study_pref', 'formato']]);
    expect(JSON.stringify(res)).not.toMatch(/subject/);
    expect(res.items[0]).toEqual(expect.objectContaining({ id: expect.any(String), source: 'member', evidence: 1, expiresAt: expect.any(String) }));
  });

  test('apagar um item: some só ele; NOT_FOUND se não existir; id inválido é VALIDATION', async () => {
    const [first, second] = (await get()).items;
    await expect(MemoryService.deleteItem(sql, env(), MEMBER, { id: first.id }, CID)).resolves.toMatchObject({ success: true, deleted: 1 });
    expect((await get()).items.map((i) => i.id)).toEqual([second.id]);
    await expect(MemoryService.deleteItem(sql, env(), MEMBER, { id: first.id }, CID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    for (const id of [undefined, 'x', 42, '../..', first.id + '0']) {
      await expect(MemoryService.deleteItem(sql, env(), MEMBER, { id }, CID)).rejects.toMatchObject({ code: 'VALIDATION' });
    }
  });

  test('ninguém apaga o item de outra pessoa, mesmo sabendo o id (RLS por pessoa)', async () => {
    await grant(ADMIN);
    await pref({ kind: 'goal', slug: 'prova' }, ADMIN);
    const adminItem = (await get(ADMIN)).items[0];
    await expect(MemoryService.deleteItem(sql, env(), MEMBER, { id: adminItem.id }, CID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await get(ADMIN)).items).toHaveLength(1);
    expect((await get(MEMBER)).items).toHaveLength(2);
  });

  test('apagar tudo: zera a pessoa, mantém o consentimento e não toca nas outras', async () => {
    await grant(ADMIN);
    await pref({ kind: 'goal', slug: 'prova' }, ADMIN);
    await expect(MemoryService.deleteAll(sql, env(), MEMBER, CID)).resolves.toMatchObject({ success: true, deleted: 2 });
    expect((await get(MEMBER)).items).toEqual([]);
    expect((await get(MEMBER)).consent.current).toBe(true);
    expect((await get(ADMIN)).items).toHaveLength(1);
  });

  test('apagar vale mesmo com a flag desligada (direito da pessoa); ler e gravar não', async () => {
    await setFlag(false);
    __resetFlagCacheForTests();
    await expect(MemoryService.deleteAll(sql, env(), MEMBER, CID)).resolves.toMatchObject({ deleted: 2 });
    await expect(get()).rejects.toMatchObject({ code: 'MEMORY_DISABLED' });
  });

  test('o banco de memória fora do ar: apagar falha com MEMORY_UNAVAILABLE (nunca finge que apagou)', async () => {
    msql.fail(new Error('connection refused postgres://user:segredo@host/db'));
    const err = await MemoryService.deleteAll(sql, env(), MEMBER, CID).catch((e) => e);
    expect(err).toMatchObject({ expected: true, code: 'MEMORY_UNAVAILABLE' });
    expect(err.message).not.toMatch(/segredo|postgres:/);
    expect((await core.query("SELECT context FROM error_logs WHERE code = 'MEMORY_DB_FAILED'")).rows[0].context).toEqual({ code: 'Error' });
    expect(await memoryRows()).toHaveLength(2);
  });
});

describe('revogação (falha fechada)', () => {
  beforeEach(async () => {
    await grant();
    await pref(FORMATO);
  });
  const revoke = (over) => MemoryService.setConsent(sql, env(over), MEMBER, { granted: false }, CID);

  test('revogar grava no núcleo e apaga a memória; a leitura fecha', async () => {
    const res = await revoke();
    expect(res).toMatchObject({ success: true, erased: true, queued: false, consent: { status: 'revoked', current: false } });
    expect(await memoryRows()).toEqual([]);
    expect((await core.query('SELECT status FROM member_memory_consent WHERE profile_id = $1', [ME])).rows[0].status).toBe('revoked');
    expect((await core.query('SELECT 1 FROM memory_purge_queue')).rows).toHaveLength(0);
    await expect(pref(FORMATO)).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  test('revogar sem nunca ter aceito é inofensivo (idempotente)', async () => {
    await core.exec('DELETE FROM member_memory_consent');
    await expect(revoke()).resolves.toMatchObject({ consent: { status: 'revoked' } });
    await expect(revoke()).resolves.toMatchObject({ consent: { status: 'revoked' } });
  });

  test('se o apagamento na memória falhar, a revogação JÁ vale e a limpeza entra na fila', async () => {
    msql.fail(new Error('banco de memória fora do ar'));
    const res = await revoke();
    expect(res).toMatchObject({ success: true, erased: false, queued: true, consent: { status: 'revoked' } });
    expect((await core.query('SELECT status FROM member_memory_consent WHERE profile_id = $1', [ME])).rows[0].status).toBe('revoked');
    expect((await core.query('SELECT profile_ref, reason FROM memory_purge_queue')).rows).toEqual([{ profile_ref: ME, reason: 'revoked' }]);
    expect(await memoryRows()).toHaveLength(1);
    expect(res.message).toMatch(/24 horas/);
  });

  test('sem o banco de memória configurado a revogação também vale e enfileira', async () => {
    const res = await revoke({ memorySql: undefined });
    expect(res).toMatchObject({ erased: false, queued: true, consent: { status: 'revoked' } });
  });

  test('FALHA FECHADA: se não der para gravar a revogação no núcleo, NADA é apagado nem dito ao membro', async () => {
    const failing = Object.assign((strings, ...values) => {
      if (strings.join('?').includes('INSERT INTO member_memory_consent')) return Promise.reject(new Error('núcleo fora'));
      return sql(strings, ...values);
    }, {});
    msql.history.length = 0;
    await expect(MemoryService.setConsent(failing, env(), MEMBER, { granted: false }, CID)).rejects.toThrow(/núcleo fora/);
    expect(touchedMemory()).toBe(false);
    expect(await memoryRows()).toHaveLength(1);
    expect((await core.query('SELECT status FROM member_memory_consent WHERE profile_id = $1', [ME])).rows[0].status).toBe('granted');
  });

  test('novo aceite fica bloqueado enquanto o apagamento anterior não terminou; depois de drenar, libera', async () => {
    msql.fail(new Error('fora'));
    await revoke();
    msql.fail(new Error('fora'), 3);
    await expect(grant()).rejects.toMatchObject({ code: 'MEMORY_UNAVAILABLE', payload: { reason: 'pending_purge' } });
    msql.fail(null, 0);
    await expect(grant()).resolves.toMatchObject({ consent: { current: true } });
    expect(await memoryRows()).toEqual([]);
    expect((await core.query('SELECT 1 FROM memory_purge_queue')).rows).toHaveLength(0);
  });
});

describe('exportação (portabilidade)', () => {
  test('devolve os itens legíveis, o consentimento e nenhum identificador interno', async () => {
    await grant();
    await pref(FORMATO);
    await pref({ kind: 'topic_level', slug: 'aines', level: 2 });
    const res = await MemoryService.exportData(sql, env(), MEMBER, CID);
    expect(res).toMatchObject({ success: true, format: 'laift-memory/v1', consent: { status: 'granted' } });
    expect(res.items.map((i) => [i.kind, i.slug, i.label])).toEqual([['study_pref', 'formato', null], ['topic_level', 'aines', 'AINEs']]);
    expect(JSON.stringify(res)).not.toMatch(/"id"|subject|profile/i);
    expect((await core.query("SELECT details FROM audit_logs WHERE action = 'MEMORY_EXPORTED'")).rows[0].details).toEqual({ items: 2 });
  });

  test('o que está vencido (e ainda não limpo) entra na exportação mas não na lista', async () => {
    await grant();
    const subject = await subjectIdFor(env(), ME);
    await mdb.query(
      `INSERT INTO memory_items (subject_id, kind, slug, level, source, consent_version, created_at, expires_at)
       VALUES ($1, 'topic_level', 'aines', 3, 'quiz', 'memoria-v1', now() - interval '200 days', now() - interval '1 day')`, [subject]
    );
    expect((await get()).items).toEqual([]);
    expect((await MemoryService.exportData(sql, env(), MEMBER, CID)).items).toHaveLength(1);
  });
});

describe('pseudônimo e isolamento', () => {
  test('subject_id é HMAC-SHA256 hexadecimal: não contém o id da pessoa e muda com a chave', async () => {
    await grant();
    await pref(FORMATO);
    const [row] = await memoryRows();
    expect(row.subject_id).toMatch(/^[0-9a-f]{64}$/);
    expect(row.subject_id).toBe(await subjectIdFor(env(), ME));
    expect(row.subject_id).not.toContain(ME.replace(/-/g, ''));
    expect(await subjectIdFor({ MEMORY_SUBJECT_KEY: 'z'.repeat(40) }, ME)).not.toBe(row.subject_id);
    expect(await subjectIdFor(env(), ME.toUpperCase())).toBe(row.subject_id);
  });

  test('cada pessoa vê só o que é dela', async () => {
    await grant(MEMBER);
    await grant(ADMIN);
    await pref(FORMATO, MEMBER);
    await pref({ kind: 'goal', slug: 'prova' }, ADMIN);
    expect((await get(MEMBER)).items.map((i) => i.slug)).toEqual(['formato']);
    expect((await get(ADMIN)).items.map((i) => i.slug)).toEqual(['prova']);
  });
});

describe('falhas do banco de memória na tela', () => {
  test('leitura com falha: success com available:false (a tela mostra "indisponível"), sem expor o erro', async () => {
    await grant();
    msql.fail(new Error('timeout'));
    const res = await get();
    expect(res).toMatchObject({ success: true, available: false, items: [], consent: { current: true } });
  });

  test('gravação com falha: MEMORY_UNAVAILABLE com mensagem genérica', async () => {
    await grant();
    msql.fail(new Error('boom'));
    await expect(pref(FORMATO)).rejects.toMatchObject({ code: 'MEMORY_UNAVAILABLE', message: expect.stringMatching(/indispon/) });
  });
});

describe('rate limits (60/h leitura, 30/h escrita, 10/h consentimento, 5/dia exportação)', () => {
  test('constantes combinadas com o dono', () => {
    expect(C.RATE_LIMITS.MEMORY_READ).toEqual({ MAX_ATTEMPTS: 60, WINDOW_SECONDS: 3600 });
    expect(C.RATE_LIMITS.MEMORY_WRITE).toEqual({ MAX_ATTEMPTS: 30, WINDOW_SECONDS: 3600 });
    expect(C.RATE_LIMITS.MEMORY_CONSENT).toEqual({ MAX_ATTEMPTS: 10, WINDOW_SECONDS: 3600 });
    expect(C.RATE_LIMITS.MEMORY_EXPORT).toEqual({ MAX_ATTEMPTS: 5, WINDOW_SECONDS: 86400 });
  });

  async function exhaust(max, fn) {
    for (let i = 0; i < max; i++) await fn();
    await expect(fn()).rejects.toMatchObject({ code: 'RATE_LIMIT', payload: { code: 'RATE_LIMIT', rateLimited: true } });
  }

  test('leitura: 60 por hora', async () => { await exhaust(60, () => get()); });
  test('consentimento (ativar): 10 por hora', async () => { await exhaust(10, () => grant()); });
  test('exportação: 5 por dia', async () => { await exhaust(5, () => MemoryService.exportData(sql, env(), MEMBER, CID)); });
  test('escrita de preferências: 30 por hora; esgotar NÃO impede revogar nem apagar (direito de eliminação)', async () => {
    await grant();
    await exhaust(30, () => pref(FORMATO));
    const [item] = (await get()).items;
    await expect(MemoryService.deleteItem(sql, env(), MEMBER, { id: item.id }, CID)).resolves.toMatchObject({ deleted: 1 });
    await expect(MemoryService.deleteAll(sql, env(), MEMBER, CID)).resolves.toMatchObject({ success: true });
    await expect(MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID)).resolves.toMatchObject({ erased: true });
  });

  test('ativar 10x/h esgotado NÃO impede revogar', async () => {
    for (let i = 0; i < 10; i++) await grant();
    await expect(grant()).rejects.toMatchObject({ code: 'RATE_LIMIT' });
    await expect(MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID)).resolves.toMatchObject({ consent: { status: 'revoked' } });
  });

  test('revogar e apagar têm bucket próprio e folgado (só contra abuso extremo)', () => {
    expect(C.RATE_LIMITS.MEMORY_ERASE.MAX_ATTEMPTS).toBeGreaterThanOrEqual(100);
    expect(C.RATE_LIMITS.MEMORY_ERASE.MAX_ATTEMPTS).toBeGreaterThan(C.RATE_LIMITS.MEMORY_WRITE.MAX_ATTEMPTS);
  });

  test('o limite é por pessoa', async () => {
    for (let i = 0; i < 60; i++) await get(MEMBER);
    await expect(get(ADMIN)).resolves.toMatchObject({ success: true });
  });
});
