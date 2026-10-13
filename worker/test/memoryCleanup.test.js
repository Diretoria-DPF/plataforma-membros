/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryCleanup.test.js — apagamento da memória em OUTRO banco (memory/cleanup.js + maintenance.js), com os dois Postgres
 * de verdade: exclusão de conta -> gatilho -> fila -> limpeza (cascata sem FK), falha de limpeza que fica na fila e nunca
 * derruba o cron, itens vencidos, varredura semanal de quem não tem consentimento, e "nada muda" sem DATABASE_URL_MEMORY.
 */
import { jest } from '@jest/globals';
import * as C from '../src/constants.js';
import * as Cleanup from '../src/memory/cleanup.js';
import * as Store from '../src/memory/store.js';
import { subjectIdFor } from '../src/memory/subject.js';
import { runMaintenance } from '../src/maintenance.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';
import { createMemoryPglite, toMemorySql } from './helpers/memoryDb.js';
import { makeEnv } from './helpers/mockEnv.js';

const CID = '99999999-9999-4999-8999-999999999999';
const KEY = 'k'.repeat(40);
const V = C.MEMORY.PURPOSE_VERSION;
const P = {
  alfa: '11111111-1111-4111-8111-111111111111',
  beta: '22222222-2222-4222-8222-222222222222',
  gama: '33333333-3333-4333-8333-333333333333',
};
const SUNDAY = new Date('2026-10-11T12:00:00Z');
const MONDAY = new Date('2026-10-12T12:00:00Z');

let core;
let sql;
let mdb;
let msql;

const addProfile = (id, name) => core.query(
  `INSERT INTO profiles (id, full_name, email, password_hash, phone, role, status, email_confirmed_at, username)
   VALUES ($1, $2, $3, 'hash-de-teste', '11999990000', 'member', 'active', now(), $4)`,
  [id, 'Pessoa ' + name, name + '@example.com', name]
);
const grantRow = (id) => core.query("INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at) VALUES ($1, 'granted', $2, now())", [id, V]);
const env = (over) => makeEnv(Object.assign({ memorySql: msql, MEMORY_SUBJECT_KEY: KEY }, over || {}));
const item = (slug) => ({ kind: 'topic_level', slug, level: 3, value: null, source: 'quiz' });
const give = async (id, ...slugs) => Store.upsertItems(msql, await subjectIdFor(env(), id), slugs.map(item), V);
const itemsOf = async (id) => Store.listItems(msql, await subjectIdFor(env(), id));
const queue = async () => (await core.query('SELECT profile_ref, reason, attempts, last_error_code FROM memory_purge_queue ORDER BY profile_ref')).rows;
const age = (hours) => mdb.exec(`UPDATE memory_items SET updated_at = now() - interval '${hours} hours'`);

beforeAll(async () => {
  core = await createMigratedDb();
  sql = toSql(core);
  mdb = await createMemoryPglite();
  msql = toMemorySql(mdb);
}, 180000);
afterAll(async () => { await core.close(); await mdb.close(); });

beforeEach(async () => {
  // apagar perfis dispara o gatilho: por isso a fila é esvaziada DEPOIS
  await core.exec('DELETE FROM member_memory_consent; DELETE FROM profiles; DELETE FROM memory_purge_queue; DELETE FROM error_logs;');
  await mdb.exec('DELETE FROM memory_items');
  msql.history.length = 0;
  msql.fail(null, 0);
  for (const [name, id] of Object.entries(P)) await addProfile(id, name);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { jest.restoreAllMocks(); });

describe('cascata por exclusão de perfil: gatilho -> fila -> limpeza', () => {
  test('apagar a conta enfileira; o cron apaga a memória do outro banco e esvazia a fila', async () => {
    await grantRow(P.alfa);
    await give(P.alfa, 'aines', 'coagulacao');
    await give(P.beta, 'aines');
    await core.query('DELETE FROM profiles WHERE id = $1', [P.alfa]);
    expect(await queue()).toEqual([{ profile_ref: P.alfa, reason: 'account_deleted', attempts: 0, last_error_code: null }]);
    expect(await itemsOf(P.alfa)).toHaveLength(2); // ainda não apagou: é o prazo-alvo de 24 h

    const res = await runMaintenance(sql, CID, env());
    expect(res.memoryPurgeQueue).toBe(1);
    expect(await itemsOf(P.alfa)).toEqual([]);
    expect(await itemsOf(P.beta)).toHaveLength(1);
    expect(await queue()).toEqual([]);
  });

  test('falha ao apagar: a pessoa FICA na fila (tentativas e código, sem mensagem) e o cron não cai; a próxima drenagem conclui', async () => {
    await give(P.alfa, 'aines');
    await core.query('DELETE FROM profiles WHERE id = $1', [P.alfa]);
    msql.fail(Object.assign(new Error('connection refused postgres://u:senha@h/db'), { code: 'ECONNREFUSED' }), 3); // o lote e a nova tentativa individual falham
    const res = await runMaintenance(sql, CID, env());
    expect(res.memoryPurgeQueue).toBe(0);
    expect(await queue()).toEqual([{ profile_ref: P.alfa, reason: 'account_deleted', attempts: 1, last_error_code: 'ECONNREFUSED' }]);
    expect(JSON.stringify(await queue())).not.toMatch(/senha|postgres/);
    expect(await itemsOf(P.alfa)).toHaveLength(1);

    expect(await Cleanup.drainQueue(sql, env())).toBe(1);
    expect(await queue()).toEqual([]);
    expect(await itemsOf(P.alfa)).toEqual([]);
  });

  test('o cron isola a falha da memória: as outras limpezas rodam e o erro vai ao log técnico', async () => {
    msql.fail(new Error('banco fora'), 10);
    await give(P.alfa, 'aines').catch(() => {});
    msql.fail(null, 0);
    await core.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'admin')", [P.beta]);
    await core.query("INSERT INTO member_memory_consent (profile_id, status, purpose_version, granted_at) VALUES ($1, 'granted', $2, now())", [P.beta, V]);
    // a consulta do núcleo da expiração falha: a tarefa vira null, o resto segue
    const brokenSql = Object.assign((strings, ...values) => {
      if (strings.join('?').includes('FROM member_memory_consent WHERE status')) return Promise.reject(new Error('núcleo instável'));
      return sql(strings, ...values);
    }, {});
    const res = await runMaintenance(brokenSql, CID, env());
    expect(res.memoryExpiredPurge).toBeNull();
    expect(res.memoryPurgeQueue).toBe(1);
    expect(res.sessions).toBe(0);
    // a consulta quebrada atinge as duas tarefas que contam consentimentos (vencidos e varredura); cada uma falha isolada
    expect((await core.query("SELECT code FROM error_logs WHERE code = 'MAINTENANCE_FAILED'")).rows).toHaveLength(2);
  });

  test('sem DATABASE_URL_MEMORY ou sem chave: nada da memória roda e a fila fica esperando (nenhuma consulta a mais)', async () => {
    await core.query('DELETE FROM profiles WHERE id = $1', [P.alfa]);
    for (const e of [makeEnv(), makeEnv({ memorySql: msql }), makeEnv({ MEMORY_SUBJECT_KEY: KEY })]) {
      const calls = [];
      const spy = Object.assign((strings, ...values) => { calls.push(strings.join('?')); return sql(strings, ...values); }, {});
      const res = await runMaintenance(spy, CID, e);
      expect(Object.keys(res).filter((k) => k.startsWith('memory'))).toEqual([]);
      expect(calls.filter((t) => /memory_purge_queue|member_memory_consent/.test(t))).toEqual([]);
    }
    expect(await queue()).toHaveLength(1);
    expect(msql.history).toEqual([]);
  });
});

describe('drainQueue, drainSoon e settlePurge', () => {
  test('drena em lotes, na ordem de chegada, e só tira da fila depois de apagar', async () => {
    for (const id of [P.alfa, P.beta, P.gama]) {
      await give(id, 'aines');
      await core.query("INSERT INTO memory_purge_queue (profile_ref, reason, enqueued_at) VALUES ($1, 'admin', now() - make_interval(mins => $2::int))", [id, id === P.alfa ? 30 : id === P.beta ? 20 : 10]);
    }
    expect(await Cleanup.drainQueue(sql, env(), 2)).toBe(2);
    expect((await queue()).map((r) => r.profile_ref)).toEqual([P.gama]);
    expect(await itemsOf(P.gama)).toHaveLength(1);
    expect(await itemsOf(P.alfa)).toEqual([]);
  });

  test('uma pessoa que falha não trava as outras', async () => {
    await give(P.alfa, 'aines');
    await give(P.beta, 'aines');
    await core.query("INSERT INTO memory_purge_queue (profile_ref, reason, enqueued_at) VALUES ($1, 'admin', now() - interval '2 hours'), ($2, 'admin', now())", [P.alfa, P.beta]);
    msql.fail(new Error('falha'), 2); // o lote falha e a primeira pessoa também; a segunda passa
    expect(await Cleanup.drainQueue(sql, env())).toBe(1);
    expect((await queue()).map((r) => [r.profile_ref, r.attempts])).toEqual([[P.alfa, 1]]);
  });

  test('drainSoon vai ao waitUntil (não bloqueia) e conclui', async () => {
    await give(P.alfa, 'aines');
    await core.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'admin')", [P.alfa]);
    const waitUntil = jest.fn();
    expect(Cleanup.drainSoon(sql, env({ waitUntil }))).toBeUndefined();
    await waitUntil.mock.calls[0][0];
    expect(await queue()).toEqual([]);
  });

  test('settlePurge: nada pendente = true; pendente conclui se der; se não der, false', async () => {
    expect(await Cleanup.settlePurge(sql, env(), P.alfa)).toBe(true);
    await give(P.alfa, 'aines');
    await core.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'revoked')", [P.alfa]);
    msql.fail(new Error('fora'));
    expect(await Cleanup.settlePurge(sql, env(), P.alfa)).toBe(false);
    expect(await Cleanup.settlePurge(sql, env(), P.alfa)).toBe(true);
    expect(await itemsOf(P.alfa)).toEqual([]);
    await core.query("INSERT INTO memory_purge_queue (profile_ref, reason) VALUES ($1, 'revoked')", [P.alfa]);
    expect(await Cleanup.settlePurge(sql, makeEnv(), P.alfa)).toBe(false);
  });

  test('enqueuePurge nunca lança, mesmo com o núcleo fora', async () => {
    const down = () => Promise.reject(new Error('núcleo fora'));
    await expect(Cleanup.enqueuePurge(down, P.alfa, 'admin', 'X')).resolves.toBe(false);
    await expect(Cleanup.enqueuePurge(sql, P.alfa, 'admin', 'X')).resolves.toBe(true);
    await expect(Cleanup.enqueuePurge(sql, P.alfa, 'admin', 'Y')).resolves.toBe(true);
    expect((await queue())[0]).toMatchObject({ reason: 'admin', last_error_code: 'Y' });
  });

  test('errorCode só devolve um código curto, nunca a mensagem', () => {
    expect(Cleanup.errorCode(Object.assign(new Error('postgres://u:p@h'), { code: 'ECONNRESET' }))).toBe('ECONNRESET');
    expect(Cleanup.errorCode(new TypeError('x'))).toBe('TypeError');
    expect(Cleanup.errorCode(null)).toBe('ERRO');
    expect(Cleanup.errorCode({ code: 'texto com espaço e símbolos !!!' + 'a'.repeat(80) }).length).toBeLessThanOrEqual(40);
  });
});

describe('eraseSubject', () => {
  test('apaga na hora quando dá', async () => {
    await give(P.alfa, 'aines', 'coagulacao');
    expect(await Cleanup.eraseSubject(sql, env(), P.alfa, 'admin')).toEqual({ erased: true, queued: false, deleted: 2 });
    expect(await queue()).toEqual([]);
  });

  test('enfileira quando falha e quando a memória não está configurada', async () => {
    msql.fail(new Error('fora'));
    expect(await Cleanup.eraseSubject(sql, env(), P.alfa, 'admin')).toEqual({ erased: false, queued: true, deleted: 0 });
    expect(await Cleanup.eraseSubject(sql, makeEnv(), P.beta, 'revoked')).toEqual({ erased: false, queued: true, deleted: 0 });
    expect((await queue()).map((r) => [r.profile_ref, r.reason, r.last_error_code])).toEqual([[P.alfa, 'admin', 'Error'], [P.beta, 'revoked', 'MEMORY_OFF']]);
  });
});

describe('itens vencidos (cron diário)', () => {
  const expired = async (id) => mdb.query(
    `INSERT INTO memory_items (subject_id, kind, slug, level, source, consent_version, created_at, expires_at)
     VALUES ($1, 'topic_level', 'diureticos', 3, 'quiz', 'memoria-v1', now() - interval '200 days', now() - interval '1 day')`, [await subjectIdFor(env(), id)]
  );

  test('apaga o vencido e poupa o vivo', async () => {
    await grantRow(P.alfa);
    await give(P.alfa, 'aines');
    await expired(P.alfa);
    expect(await Cleanup.purgeExpiredItems(sql, env())).toBe(1);
    expect((await itemsOf(P.alfa)).map((i) => i.slug)).toEqual(['aines']);
  });

  test('ninguém consentiu e a fila está vazia: nem acorda o banco de memória', async () => {
    expect(await Cleanup.purgeExpiredItems(sql, env())).toBe(0);
    expect(msql.history).toEqual([]);
  });

  test('o cron o inclui (memoryExpiredPurge) quando há memória configurada', async () => {
    await grantRow(P.beta);
    await give(P.beta, 'aines');
    await expired(P.beta);
    expect((await runMaintenance(sql, CID, env())).memoryExpiredPurge).toBe(1);
  });
});

describe('varredura diária de quem não tem consentimento vigente', () => {
  async function seed() {
    await grantRow(P.alfa); // vivo
    await give(P.alfa, 'aines');
    await give(P.beta, 'aines'); // sem consentimento (revogou e a limpeza falhou)
    await give(P.gama, 'aines'); // conta excluída
    await core.query('DELETE FROM profiles WHERE id = $1', [P.gama]);
    await core.exec('DELETE FROM memory_purge_queue'); // a fila falhou/perdeu: só a varredura salva
    await age(3);
  }

  test('até o teto de consentimentos: apaga o órfão na hora e mantém quem tem consentimento concedido (qualquer dia da semana)', async () => {
    await seed();
    expect(await Cleanup.sweepOrphans(sql, env(), MONDAY)).toBe(2);
    expect(await itemsOf(P.alfa)).toHaveLength(1);
    expect(await itemsOf(P.beta)).toEqual([]);
    expect(await itemsOf(P.gama)).toEqual([]);
  });

  test('poupa o que foi escrito há menos de 1 hora (aceite recém-concedido)', async () => {
    await give(P.beta, 'aines');
    expect(await Cleanup.sweepOrphans(sql, env(), SUNDAY)).toBe(0);
    expect(await itemsOf(P.beta)).toHaveLength(1);
  });

  test('o cron roda a varredura (memoryOrphanSweep) via memoryTasks', async () => {
    await seed();
    const tasks = Cleanup.memoryTasks(sql, env(), SUNDAY);
    expect(Object.keys(tasks)).toEqual(['memoryPurgeQueue', 'memoryExpiredPurge', 'memoryOrphanSweep']);
    expect(await tasks.memoryOrphanSweep()).toBe(2);
    expect(Cleanup.memoryTasks(sql, makeEnv(), SUNDAY)).toEqual({});
  });

  describe('SEM teto: acima do limite de CPU a varredura é particionada por dia (verified_at)', () => {
    const NAMES = ['pessoa_um', 'pessoa_dois', 'pessoa_tres', 'pessoa_quatro', 'pessoa_cinco', 'pessoa_seis'];
    const ids = NAMES.map((n, i) => '5555555' + i + '-5555-4555-8555-555555555555');
    const day = (n) => new Date(Date.UTC(2026, 9, 1 + n, 12));
    let original;

    beforeEach(async () => {
      original = C.MEMORY.SWEEP_MAX_PROFILES;
      C.MEMORY.SWEEP_MAX_PROFILES = 2; // 6 consentimentos > 2: 6 fatias
      for (let i = 0; i < ids.length; i++) {
        await addProfile(ids[i], NAMES[i]);
        await grantRow(ids[i]);
        await give(ids[i], 'aines');
      }
      await give(P.beta, 'aines'); // órfã: sem consentimento
      await age(3);
    });
    afterEach(() => { C.MEMORY.SWEEP_MAX_PROFILES = original; });

    const verifiedOf = async (id) => (await mdb.query('SELECT verified_at FROM memory_items WHERE subject_id = $1', [await subjectIdFor(env(), id)])).rows[0].verified_at;

    test('cada dia confirma UMA fatia; a órfã sem confirmação é apagada; ninguém vivo é apagado', async () => {
      // estado normal: quem tem consentimento foi confirmado há poucos dias; a órfã, há muito
      await mdb.exec("UPDATE memory_items SET verified_at = now() - interval '3 days'");
      await mdb.exec("UPDATE memory_items SET verified_at = now() - interval '40 days' WHERE subject_id = '" + (await subjectIdFor(env(), P.beta)) + "'");
      for (let d = 0; d < 6; d++) await Cleanup.sweepOrphans(sql, env(), day(d));
      for (const id of ids) expect(new Date(await verifiedOf(id)) > new Date(Date.now() - 60000)).toBe(true);
      expect(await itemsOf(P.beta)).toEqual([]);
      for (const id of ids) expect(await itemsOf(id)).toHaveLength(1);
    });

    test('a órfã só sai depois do prazo sem confirmação (2 ciclos + 14 dias); antes disso fica', async () => {
      await mdb.exec("UPDATE memory_items SET verified_at = now() - interval '10 days'");
      await Cleanup.sweepOrphans(sql, env(), day(0));
      expect(await itemsOf(P.beta)).toHaveLength(1);
      await mdb.exec("UPDATE memory_items SET verified_at = now() - interval '27 days' WHERE subject_id = '" + (await subjectIdFor(env(), P.beta)) + "'");
      await Cleanup.sweepOrphans(sql, env(), day(1));
      expect(await itemsOf(P.beta)).toEqual([]);
      for (const id of ids) expect(await itemsOf(id)).toHaveLength(1);
    });

    test('poucas subrequisições por execução (2 no núcleo; a verificação e a remoção são transações no banco de memória)', async () => {
      let calls = 0;
      const counting = Object.assign((strings, ...values) => { calls += 1; return sql(strings, ...values); }, {});
      msql.history.length = 0;
      await Cleanup.sweepOrphans(counting, env(), day(0));
      expect(calls).toBe(2);
    });

    test('fatia acima do teto (hash torto): pula com aviso e NUNCA apaga', async () => {
      C.MEMORY.SWEEP_MAX_PROFILES = 1;
      const crowded = Object.assign((strings, ...values) => (
        strings.join('?').includes('ORDER BY profile_id LIMIT') ? Promise.resolve([{ profile_id: ids[0] }, { profile_id: ids[1] }]) : sql(strings, ...values)
      ), {});
      expect(await Cleanup.sweepOrphans(crowded, env(), day(0))).toBe(0);
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('MEMORY_SWEEP_SKIPPED'));
      expect(await itemsOf(P.beta)).toHaveLength(1);
    });
  });
});
