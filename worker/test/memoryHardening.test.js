/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryHardening.test.js — regressões da revisão de segurança da memória:
 *   H1  URL do banco de memória malformada: o erro do driver do Neon traz a URL (com a senha) na mensagem; ela nunca pode ir
 *       a log, a error_logs nem à resposta, nem derrubar o cron; revogar continua funcionando (enfileira);
 *   M5  revogar/apagar não podem mentir nem ficar presos em rate limit; a gravação do tutor reconfere o consentimento; fila e
 *       varredura respeitam o orçamento de subrequisições;
 *   L1  o banco só aceita os temas/preferências/objetivos do vocabulário e o prompt descarta o que não for conhecido;
 *   L2  MEMORY_UNAVAILABLE não diz ao cliente se faltou banco, chave ou houve falha.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import * as C from '../src/constants.js';
import { createDb, createMemoryDb } from '../src/db.js';
import { redactSecrets, logError } from '../src/logging.js';
import { API_REGISTRY } from '../src/handlers.js';
import * as S from '../src/security.js';
import * as Cleanup from '../src/memory/cleanup.js';
import * as MemoryService from '../src/memory/service.js';
import * as MemoryAdmin from '../src/memory/admin.js';
import * as Store from '../src/memory/store.js';
import { readMemory, writeMemory, NO_MEMORY } from '../src/agents/memoryProvider.js';
import { readForTutor, writeTutorSignals, tutorMemoryAvailable } from '../src/memory/tutor.js';
import { subjectIdFor } from '../src/memory/subject.js';
import { TOPICS, GOALS, PREFERENCES, DIFFICULTY_VALUES, promptItem } from '../src/memory/vocabulary.js';
import { getAgent } from '../src/agents/registry.js';
import { runMaintenance } from '../src/maintenance.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { __resetTutorCacheForTests } from '../src/memory/tutorCache.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { createMemoryPglite, toMemorySql, withoutTopicCheck } from './helpers/memoryDb.js';
import { makeEnv } from './helpers/mockEnv.js';

const CID = '99999999-9999-4999-8999-999999999999';
const KEY = 'k'.repeat(40);
const V = C.MEMORY.PURPOSE_VERSION;
const ME = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const MEMBER = { profileId: ME, role: 'member', status: 'active', fullName: 'Maria Teste', email: 'maria@exemplo.com' };
const ADMIN = { profileId: ADMIN_ID, role: 'admin', status: 'active', fullName: 'Admin Teste', email: 'admin@exemplo.com' };
const tutor = getAgent('tutor-clinico');
const SECRET = 'SENHA-SUPER-SECRETA-123';
const BAD_URLS = ['postgres://u:' + SECRET + '@', 'not a url ' + SECRET, 'postgresql://u:' + SECRET + '@h:abc/db'];
const SQL_FILE = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql', 'memory', '001_memory.sql'), 'utf8');

let core;
let sql;
let mdb;
let msql;

const addProfile = (id, name, role = 'member') => core.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', $4::user_role, 'active', now(), $5)`,
  [id, 'Pessoa ' + name, name + '@example.com', role, name]
);
const env = (over) => makeEnv(Object.assign({ memorySql: msql, MEMORY_SUBJECT_KEY: KEY, GROQ_API_KEYS: 'k' }, over || {}));
const badEnv = (url = BAD_URLS[1]) => env({ memorySql: undefined, DATABASE_URL_MEMORY: url });
const grant = (identity = MEMBER, over) => MemoryService.setConsent(sql, env(over), identity, { granted: true, purposeVersion: V }, CID);
const remember = async (...items) => Store.upsertItems(msql, await subjectIdFor(env(), ME), items, V);
const rows = async () => (await mdb.query('SELECT kind, slug, value FROM memory_items ORDER BY kind, slug')).rows;
const level = (slug, lv) => ({ kind: 'topic_level', slug, level: lv, value: null, source: 'quiz' });

beforeAll(async () => {
  core = await createMigratedDb();
  sql = toSql(core);
  await addProfile(ME, 'maria');
  await addProfile(ADMIN_ID, 'admin', 'admin');
  mdb = await createMemoryPglite();
  msql = toMemorySql(mdb);
}, 180000);
afterAll(async () => { await core.close(); await mdb.close(); });

beforeEach(async () => {
  C.MEMORY.PURPOSE_VERSION = V;
  __resetFlagCacheForTests();
  __resetTutorCacheForTests();
  await core.query("UPDATE feature_flags SET enabled = TRUE WHERE key = 'memory_enabled'");
  await core.exec('DELETE FROM rate_limit_buckets; DELETE FROM member_memory_consent; DELETE FROM memory_purge_queue; DELETE FROM audit_logs; DELETE FROM error_logs;');
  await mdb.exec('DELETE FROM memory_items');
  msql.history.length = 0;
  msql.fail(null, 0);
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('H1 — URL do banco de memória malformada nunca vaza nem derruba', () => {
  test.each(BAD_URLS)('createMemoryDb(%j) devolve null, sem lançar e sem ecoar a URL', (url) => {
    let result;
    expect(() => { result = createMemoryDb({ DATABASE_URL_MEMORY: url }); }).not.toThrow();
    expect(result).toBeNull();
  });

  test('createDb (núcleo) com URL malformada lança erro GENÉRICO, sem a URL; com URL boa segue igual', () => {
    for (const url of BAD_URLS) {
      let message = '';
      try { createDb(url); } catch (err) { message = err.message; }
      expect(message).toMatch(/DATABASE_URL/);
      expect(message).not.toContain(SECRET);
    }
    expect(typeof createDb('postgres://u:p@h.example/db')).toBe('function');
  });

  test('redactSecrets tira strings de conexão e a frase "Connection string" do driver', () => {
    expect(redactSecrets('falhou em postgres://u:' + SECRET + '@h/db?sslmode=require agora')).toBe('falhou em [redigido] agora');
    expect(redactSecrets('POSTGRESQL://u:x@h/db')).toBe('[redigido]');
    expect(redactSecrets('is not a valid URL. Connection string: not a url ' + SECRET)).not.toContain(SECRET);
    expect(redactSecrets(null)).toBe('');
    expect(redactSecrets('mensagem normal sem segredo')).toBe('mensagem normal sem segredo');
  });

  test('logError grava e imprime a mensagem JÁ redigida', async () => {
    await logError(sql, CID, 'X', 'Database connection string provided to `neon()` is not a valid URL. Connection string: postgres://u:' + SECRET + '@', null);
    const { rows: logged } = await core.query("SELECT message FROM error_logs WHERE code = 'X'");
    expect(logged[0].message).not.toContain(SECRET);
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(SECRET);
  });

  test('erro inesperado dentro de um handler não grava nem devolve a URL (run())', async () => {
    const token = await S.createSession(sql, env().SESSION_TOKEN_PEPPER, ADMIN_ID, 'jest');
    const leaky = Object.assign((strings, ...values) => {
      if (strings.join('?').includes('FROM member_memory_consent GROUP BY')) return Promise.reject(new Error('boom em postgres://u:' + SECRET + '@h/db'));
      return sql(strings, ...values);
    }, {});
    const res = await API_REGISTRY.apiAdminMemoryStats(leaky, env(), [token]);
    expect(JSON.stringify(res)).not.toContain(SECRET);
    expect(res.success).toBe(false);
    const { rows: logged } = await core.query("SELECT message FROM error_logs WHERE message LIKE '%redigido%'");
    expect(logged.length).toBeGreaterThan(0);
    expect(JSON.stringify((await core.query('SELECT message, context FROM error_logs')).rows)).not.toContain(SECRET);
  });

  test('memoryContext, tutorMemoryAvailable, leitura do tutor e tela: memória indisponível, sem lançar', async () => {
    for (const url of BAD_URLS) {
      const e = badEnv(url);
      expect(Cleanup.memoryContext(e)).toBeNull();
      expect(await tutorMemoryAvailable(sql, e, MEMBER, tutor)).toBe(false);
      expect(await readMemory({ sql, env: e, identity: MEMBER, agent: tutor })).toBe(NO_MEMORY);
      expect(await writeMemory({ env: e, identity: MEMBER, agent: tutor, memory: NO_MEMORY, message: 'meia-vida' })).toBe(0);
    }
    await grant();
    await expect(MemoryService.getState(sql, badEnv(), MEMBER, CID)).resolves.toMatchObject({ success: true, available: false, items: [] });
  });

  test('o cron com URL malformada: as DEMAIS limpezas rodam, a memória falha isolada e a URL não aparece em lugar nenhum', async () => {
    await core.query("INSERT INTO sessions (profile_id, token_hash, expires_at) VALUES ($1, 'h-velha', now() - interval '3 days')", [ME]);
    const res = await runMaintenance(sql, CID, badEnv());
    expect(res.sessions).toBe(1);
    expect(res.memoryPurgeQueue).toBeNull();
    expect(res.memoryExpiredPurge).toBeNull();
    expect(res.memoryOrphanSweep).toBeNull();
    const logged = JSON.stringify((await core.query('SELECT message, context FROM error_logs')).rows) + JSON.stringify(console.error.mock.calls);
    expect(logged).not.toContain(SECRET);
    expect(logged).toMatch(/DATABASE_URL_MEMORY inválida/);
  });

  test('memoryTasks nunca lança, mesmo com env estranho', () => {
    for (const e of [undefined, null, {}, { DATABASE_URL_MEMORY: 42 }, { DATABASE_URL_MEMORY: BAD_URLS[0] }, badEnv()]) {
      expect(() => Cleanup.memoryTasks(sql, e)).not.toThrow();
    }
    expect(Cleanup.memoryTasks(sql, { DATABASE_URL_MEMORY: BAD_URLS[0] })).toEqual({}); // sem chave: nada
  });

  test('revogar com a memória indisponível (URL malformada) continua funcionando: núcleo primeiro e fila', async () => {
    await grant();
    const res = await MemoryService.setConsent(sql, badEnv(), MEMBER, { granted: false }, CID);
    expect(res).toMatchObject({ success: true, erased: false, queued: true, consent: { status: 'revoked' } });
    expect((await core.query('SELECT reason, last_error_code FROM memory_purge_queue')).rows).toEqual([{ reason: 'revoked', last_error_code: 'MEMORY_OFF' }]);
    expect(JSON.stringify(res)).not.toContain(SECRET);
  });

  test('apagar tudo / purgar com a URL malformada: erro genérico (apagar) ou fila (purga do admin), nunca a URL', async () => {
    await grant();
    const err = await MemoryService.deleteAll(sql, badEnv(), MEMBER, CID).catch((e) => e);
    expect(err).toMatchObject({ code: 'MEMORY_UNAVAILABLE' });
    expect(err.message).not.toContain(SECRET);
    const purge = await MemoryAdmin.purgeMemberMemory(sql, badEnv(), ADMIN, { profileId: ME }, CID);
    expect(purge).toMatchObject({ success: true, erased: false, queued: true });
  });
});

describe('M5 — revogar e apagar não mentem nem ficam presos', () => {
  const noQueue = (core2) => Object.assign((strings, ...values) => {
    if (strings.join('?').includes('INSERT INTO memory_purge_queue')) return Promise.reject(new Error('fila fora'));
    return core2(strings, ...values);
  }, {});

  test('revogar sem apagar E sem enfileirar: ERRO (a revogação já vale, o cliente sabe e pode tentar de novo)', async () => {
    await grant();
    msql.fail(new Error('banco de memória fora'));
    const err = await MemoryService.setConsent(noQueue(sql), env(), MEMBER, { granted: false }, CID).catch((e) => e);
    expect(err).toMatchObject({ expected: true, code: 'MEMORY_UNAVAILABLE', payload: { code: 'MEMORY_UNAVAILABLE', revoked: true } });
    expect(err.message).not.toMatch(/3 meses/);
    expect(err.message).toMatch(/desativada/);
    expect((await core.query('SELECT status FROM member_memory_consent WHERE profile_id = $1', [ME])).rows[0].status).toBe('revoked');
    expect((await core.query("SELECT result FROM audit_logs WHERE action = 'MEMORY_CONSENT_REVOKED'")).rows).toEqual([{ result: 'failure' }]);
    // tentar de novo funciona
    await expect(MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID)).resolves.toMatchObject({ erased: true });
  });

  test('purga do admin sem apagar E sem enfileirar: ERRO, nunca "em até 3 meses"', async () => {
    msql.fail(new Error('fora'));
    const err = await MemoryAdmin.purgeMemberMemory(noQueue(sql), env(), ADMIN, { profileId: ME }, CID).catch((e) => e);
    expect(err).toMatchObject({ code: 'MEMORY_UNAVAILABLE' });
    expect(err.message).not.toMatch(/3 meses/);
    expect((await core.query("SELECT result FROM audit_logs WHERE action = 'MEMORY_ADMIN_PURGE'")).rows).toEqual([{ result: 'failure' }]);
  });

  test('a mensagem de "até 3 meses" só aparece quando de fato enfileirou', async () => {
    await grant();
    msql.fail(new Error('fora'));
    const res = await MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID);
    expect(res).toMatchObject({ erased: false, queued: true, message: expect.stringMatching(/3 meses/) });
  });

  test('revogar/apagar não sofrem o limite de 10/h do consentimento nem o de 30/h da escrita: só o teto extremo', async () => {
    await grant();
    for (let i = 0; i < 40; i++) await MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID);
    for (let i = 0; i < 40; i++) await MemoryService.deleteAll(sql, env(), MEMBER, CID);
    const used = (await core.query('SELECT bucket, attempts FROM rate_limit_buckets ORDER BY bucket')).rows;
    expect(used.find((r) => r.bucket === 'MEMORY_WRITE')).toBeUndefined();
    expect(used.find((r) => r.bucket === 'MEMORY_CONSENT').attempts).toBe(1); // só o aceite inicial
    expect(used.find((r) => r.bucket === 'MEMORY_ERASE').attempts).toBe(80);
  });

  test('a gravação em segundo plano RECONFERE o consentimento: revogou entre a leitura e a escrita = nada é gravado', async () => {
    await grant();
    const memory = await readForTutor(sql, env(), MEMBER, tutor);
    expect(memory).toMatchObject({ available: true, canWrite: true });
    await MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID); // revoga na corrida
    msql.history.length = 0;
    const wrote = await writeTutorSignals({ env: env(), identity: MEMBER, agent: tutor, memory, message: 'Explique a meia-vida do fármaco' });
    expect(wrote).toBe(0);
    expect(await rows()).toEqual([]);
    expect(msql.history).toEqual([]);
  });

  test('a reconferência também fecha quando a versão da finalidade mudou entre a leitura e a escrita', async () => {
    await grant();
    const memory = await readForTutor(sql, env(), MEMBER, tutor);
    C.MEMORY.PURPOSE_VERSION = 'memoria-2026-11-v2';
    expect(await writeTutorSignals({ env: env(), identity: MEMBER, agent: tutor, memory, message: 'meia-vida' })).toBe(0);
    expect(await rows()).toEqual([]);
  });

  test('com o consentimento mantido, a gravação acontece (e a reconferência custa 1 consulta ao núcleo)', async () => {
    await grant();
    const memory = await readForTutor(sql, env(), MEMBER, tutor);
    expect(await writeTutorSignals({ env: env(), identity: MEMBER, agent: tutor, memory, message: 'Explique a meia-vida do fármaco' })).toBe(1);
    expect(await rows()).toEqual([{ kind: 'difficulty', slug: 'farmacocinetica', value: 'duvida' }]);
  });

  test('memória sem confirmConsent (provedor de teste ou adulterado): FALHA FECHADA, não grava', async () => {
    await grant();
    const memory = { available: true, canWrite: true, consentVersion: V };
    expect(await writeTutorSignals({ env: env(), identity: MEMBER, agent: tutor, memory, message: 'meia-vida' })).toBe(0);
    expect(await rows()).toEqual([]);
  });

  test('drenagem em lote: 10 pessoas = 1 leitura + 1 remoção no núcleo e UMA transação no banco de memória', async () => {
    const people = Array.from({ length: 10 }, (_, i) => '7777777' + i + '-7777-4777-8777-777777777777');
    for (const id of people) {
      await Store.upsertItems(msql, await subjectIdFor(env(), id), [level('aines', 3)], V);
      await core.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'admin')", [id]);
    }
    let calls = 0;
    const counting = Object.assign((strings, ...values) => { calls += 1; return sql(strings, ...values); }, {});
    msql.history.length = 0;
    expect(await Cleanup.drainQueue(counting, env())).toBe(10);
    expect(calls).toBe(2);
    expect(msql.history.filter((t) => /DELETE FROM memory_items/.test(t))).toHaveLength(10); // 10 DELETEs na mesma transação
    expect(await rows()).toEqual([]);
    expect((await core.query('SELECT 1 FROM memory_purge_queue')).rows).toHaveLength(0);
  });

  test('o lote padrão da fila é pequeno (orçamento de subrequisições do cron)', () => {
    expect(C.MEMORY.PURGE_DRAIN_BATCH).toBeLessThanOrEqual(10);
  });
});

describe('L1 — o banco só aceita o vocabulário', () => {
  const listFrom = (text) => [...text.matchAll(/'([a-z0-9_-]+)'/g)].map((m) => m[1]);
  const block = (startMarker, endMarker) => {
    const from = SQL_FILE.indexOf(startMarker);
    return SQL_FILE.slice(from, SQL_FILE.indexOf(endMarker, from));
  };

  test('os temas da CHECK do SQL são EXATAMENTE os do vocabulário (sem divergir)', () => {
    const topics = listFrom(block('CONSTRAINT memory_items_topic_chk', 'CONSTRAINT memory_items_shape_chk'))
      .filter((s) => !['topic_level', 'difficulty'].includes(s));
    expect([...topics].sort()).toEqual(Object.keys(TOPICS).sort());
  });

  test('objetivos, preferências e valores de dúvida do SQL batem com o vocabulário', () => {
    const shape = block('CONSTRAINT memory_items_shape_chk', 'CONSTRAINT memory_items_retention_chk');
    const goal = shape.slice(shape.indexOf("kind = 'goal'"));
    expect(listFrom(goal.slice(goal.indexOf('slug IN'))).sort()).toEqual([...GOALS].sort());
    for (const [slug, values] of Object.entries(PREFERENCES)) {
      const piece = shape.slice(shape.indexOf("slug = '" + slug + "'"));
      expect(listFrom(piece.slice(piece.indexOf('IN ('), piece.indexOf(')'))).sort()).toEqual([...values].sort());
    }
    const difficulty = shape.slice(shape.indexOf("kind = 'difficulty'"), shape.indexOf("kind = 'study_pref'"));
    expect(listFrom(difficulty.slice(difficulty.indexOf('value IN'))).sort()).toEqual([...DIFFICULTY_VALUES].sort());
  });

  test('o banco recusa cada tipo com tema/valor fora da lista (e aceita todos os da lista)', async () => {
    const subject = await subjectIdFor(env(), ME);
    for (const slug of Object.keys(TOPICS)) await expect(Store.upsertItems(msql, subject, [level(slug, 3)], V)).resolves.toHaveLength(1);
    await expect(Store.upsertItems(msql, subject, [level('qualquer-coisa', 3)], V)).rejects.toThrow(/violates check constraint/);
    await expect(Store.upsertItems(msql, subject, [{ kind: 'goal', slug: 'emagrecer', level: null, value: 'ativo', source: 'member' }], V)).rejects.toThrow(/violates check constraint/);
    await expect(Store.upsertItems(msql, subject, [{ kind: 'study_pref', slug: 'humor', level: null, value: 'resumo', source: 'member' }], V)).rejects.toThrow(/violates check constraint/);
  });

  test('promptItem DESCARTA o que não é do vocabulário (nunca cai em tema = slug)', () => {
    expect(promptItem({ kind: 'topic_level', slug: 'texto-livre-qualquer', level: 3 })).toBeNull();
    expect(promptItem({ kind: 'difficulty', slug: 'minha-mae-diabetica', level: 2, value: 'duvida' })).toBeNull();
    expect(promptItem({ kind: 'study_pref', slug: 'humor', value: 'triste' })).toBeNull();
    expect(promptItem({ kind: 'study_pref', slug: 'formato', value: 'poesia' })).toBeNull();
    expect(promptItem({ kind: 'goal', slug: 'emagrecer', value: 'ativo' })).toBeNull();
    expect(promptItem({ kind: 'nota', slug: 'aines' })).toBeNull();
    expect(promptItem(null)).toBeNull();
    expect(promptItem({ kind: 'topic_level', slug: 'aines', level: 3 })).toEqual({ tipo: 'nivel_no_tema', tema: 'AINEs', nivel: 3 });
  });

  test('linha fora do vocabulário (corrompida) existente no banco NÃO chega ao prompt do tutor', async () => {
    await grant();
    await withoutTopicCheck(mdb, async () => {
      await remember(level('texto-livre-corrompido', 4), level('aines', 3));
      const memory = await readForTutor(sql, env(), MEMBER, tutor);
      expect(memory.items).toEqual([{ tipo: 'nivel_no_tema', tema: 'AINEs', nivel: 3 }]);
      expect(JSON.stringify(memory)).not.toContain('corrompido');
    });
  });
});

describe('L2 — MEMORY_UNAVAILABLE não revela o motivo interno', () => {
  const keys = (err) => Object.keys(err.payload).sort();

  test('sem banco, sem chave, id inválido ou falha: payload só com o code', async () => {
    const cases = [
      () => grant(MEMBER, { memorySql: undefined }),
      () => grant(MEMBER, { MEMORY_SUBJECT_KEY: 'curta' }),
      () => MemoryService.deleteAll(sql, badEnv(), MEMBER, CID),
      async () => { msql.fail(new Error('banco fora')); return MemoryService.deleteAll(sql, env(), MEMBER, CID); },
      () => MemoryService.exportData(sql, env({ memorySql: undefined }), MEMBER, CID),
    ];
    for (const run of cases) {
      const err = await run().catch((e) => e);
      expect(err).toMatchObject({ code: 'MEMORY_UNAVAILABLE' });
      expect(keys(err)).toEqual(['code']);
      expect(JSON.stringify(err.payload)).not.toMatch(/config|subject|db|key|chave/i);
    }
  });

  test('o detalhe fica só no log técnico (sem segredos)', async () => {
    await grant();
    msql.fail(new Error('connection refused postgres://u:' + SECRET + '@h/db'));
    await MemoryService.deleteAll(sql, env(), MEMBER, CID).catch(() => {});
    const logged = JSON.stringify((await core.query("SELECT code, message, context FROM error_logs WHERE code = 'MEMORY_DB_FAILED'")).rows);
    expect(logged).toContain('MEMORY_DB_FAILED');
    expect(logged).not.toContain(SECRET);
  });

  test('novo aceite bloqueado por apagamento pendente é um aviso legítimo (mantém o reason pending_purge)', async () => {
    await grant();
    msql.fail(new Error('fora'));
    await MemoryService.setConsent(sql, env(), MEMBER, { granted: false }, CID);
    msql.fail(new Error('fora'), 3);
    await expect(grant()).rejects.toMatchObject({ code: 'MEMORY_UNAVAILABLE', payload: { reason: 'pending_purge' } });
  });
});

describe('M4 — minors_enabled na memória segue o mesmo caminho do agente (falha fechada)', () => {
  test('com menores habilitados e sem maioridade confirmada, a memória fecha por idade', async () => {
    await core.query("INSERT INTO feature_flags (key, enabled, description) VALUES ('minors_enabled', TRUE, 'teste') ON CONFLICT (key) DO UPDATE SET enabled = TRUE");
    __resetFlagCacheForTests();
    try {
      expect(await MemoryService.featureReason(sql, MEMBER)).toBe('age');
      expect(await MemoryService.featureReason(sql, Object.assign({}, MEMBER, { adultConfirmed: true }))).toBeNull();
    } finally {
      await core.query("DELETE FROM feature_flags WHERE key = 'minors_enabled'");
      __resetFlagCacheForTests();
    }
  });

  test('sem a flag minors_enabled, conta existente segue a premissa de maioridade', async () => {
    __resetFlagCacheForTests();
    expect(await MemoryService.featureReason(sql, MEMBER)).toBeNull();
  });
});
