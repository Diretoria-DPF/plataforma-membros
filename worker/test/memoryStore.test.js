/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memoryStore.test.js — memory/store.js contra o banco de memória de verdade (PGlite, papel laift_memory_worker):
 * uma transação por chamada começando em set_config('app.subject_id'), SQL só parametrizado, regras do UPSERT (média do
 * nível, recorrência da dúvida, renovação de prazo limitada a 12 meses, item vencido recomeça), leitura do tutor que
 * marca o uso, e as funções de manutenção (vencidos, quem não tem consentimento, agregados).
 */
import { MEMORY } from '../src/constants.js';
import * as Store from '../src/memory/store.js';
import { computeExpiry } from '../src/memory/policy.js';
import { createMemoryPglite, toMemorySql } from './helpers/memoryDb.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const V = 'memoria-2026-10-v1';
let mdb;
let msql;

beforeAll(async () => {
  mdb = await createMemoryPglite();
  msql = toMemorySql(mdb);
}, 60000);
afterAll(async () => { await mdb.close(); });
beforeEach(async () => {
  await mdb.exec('DELETE FROM memory_items');
  msql.history.length = 0;
});

const level = (slug, lv, source = 'quiz') => ({ kind: 'topic_level', slug, level: lv, value: null, source });
const dif = (slug, source = 'tutor') => ({ kind: 'difficulty', slug, level: 1, value: 'duvida', source });
const row = async (slug, kind = 'topic_level') => (await mdb.query('SELECT * FROM memory_items WHERE slug = $1 AND kind = $2', [slug, kind])).rows[0];

describe('transação por pessoa e SQL parametrizado', () => {
  test('toda chamada começa por set_config do sujeito e nenhum valor entra no texto do SQL', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    await Store.listItems(msql, A);
    await Store.readForTutor(msql, A);
    await Store.deleteAll(msql, A);
    const sentinel = 'zzz-valor-sentinela';
    await Store.deleteItem(msql, A, '11111111-1111-4111-8111-111111111111').catch(() => {});
    expect(msql.history.length).toBeGreaterThan(8);
    msql.history.forEach((text) => {
      expect(text).not.toContain(A);
      expect(text).not.toContain(sentinel);
      expect(text).not.toMatch(/'aines'/);
    });
    expect(msql.history.filter((t) => /set_config\('app\.subject_id'/.test(t))).toHaveLength(5);
  });

  test('listar não vê o que é de outra pessoa nem o vencido', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    await Store.upsertItems(msql, B, [level('aines', 5)], V);
    await mdb.query(
      `INSERT INTO memory_items (subject_id, kind, slug, level, source, consent_version, created_at, expires_at)
       VALUES ($1, 'topic_level', 'coagulacao', 3, 'quiz', 'memoria-v1', now() - interval '200 days', now() - interval '1 day')`, [A]
    );
    expect((await Store.listItems(msql, A)).map((i) => [i.slug, i.level])).toEqual([['aines', 3]]);
    expect((await Store.listAll(msql, A)).map((i) => i.slug)).toEqual(['aines', 'coagulacao']);
  });
});

describe('UPSERT: regras por tipo e origem', () => {
  test('topic_level de simulado: média ponderada pelas observações (arredondada), evidência cresce', async () => {
    await Store.upsertItems(msql, A, [level('aines', 5)], V);
    let r = await row('aines');
    expect([r.level, r.evidence]).toEqual([5, 1]);
    await Store.upsertItems(msql, A, [level('aines', 1)], V);
    r = await row('aines');
    expect([r.level, r.evidence]).toEqual([3, 2]);
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    r = await row('aines');
    expect([r.level, r.evidence]).toEqual([3, 3]);
  });

  test('topic_level definido pelo membro substitui e zera a evidência', async () => {
    await Store.upsertItems(msql, A, [level('aines', 5), level('aines', 4)], V);
    await Store.upsertItems(msql, A, [level('aines', 2, 'member')], V);
    const r = await row('aines');
    expect([r.level, r.evidence, r.source]).toEqual([2, 1, 'member']);
  });

  test('difficulty sobe 1 a cada recorrência, até 5', async () => {
    for (let i = 0; i < 7; i++) await Store.upsertItems(msql, A, [dif('coagulacao')], V);
    const r = await row('coagulacao', 'difficulty');
    expect([r.level, r.evidence]).toEqual([5, 7]);
  });

  test('preferência e objetivo: substituição simples, sem nível', async () => {
    await Store.upsertItems(msql, A, [{ kind: 'study_pref', slug: 'formato', level: null, value: 'exemplos', source: 'member' }], V);
    await Store.upsertItems(msql, A, [{ kind: 'study_pref', slug: 'formato', level: null, value: 'resumo', source: 'member' }], V);
    const r = await row('formato', 'study_pref');
    expect([r.value, r.level, r.evidence]).toEqual(['resumo', null, 1]);
  });

  test('várias linhas numa transação só: se uma falha, nenhuma entra', async () => {
    const items = [level('aines', 3), { kind: 'topic_level', slug: 'MAIÚSCULA', level: 3, value: null, source: 'quiz' }];
    await expect(Store.upsertItems(msql, A, items, V)).rejects.toThrow(/violates check constraint/);
    expect((await mdb.query('SELECT count(*)::int AS n FROM memory_items')).rows[0].n).toBe(0);
  });

  test('o banco confere o formato mesmo se o serviço falhasse (texto livre não entra)', async () => {
    await expect(Store.upsertItems(msql, A, [{ kind: 'study_pref', slug: 'formato', level: null, value: 'hipertensa, uso losartana', source: 'member' }], V)).rejects.toThrow(/violates check constraint/);
    await expect(Store.upsertItems(msql, 'nao-e-um-hmac', [level('aines', 3)], V)).rejects.toThrow(/row-level security|violates check constraint/);
  });

  test('o 61º item levanta o erro do teto, reconhecido por isCapError', async () => {
    await Store.upsertItems(msql, A, Array.from({ length: 60 }, (_, i) => level('tema-' + String(i).padStart(2, '0'), 3)), V);
    const err = await Store.upsertItems(msql, A, [level('tema-novo', 3)], V).catch((e) => e);
    expect(Store.isCapError(err)).toBe(true);
    expect(Store.isCapError(new Error('outra coisa'))).toBe(false);
    expect(Store.isCapError(null)).toBe(false);
  });
});

describe('retenção: 180 dias sem uso, no máximo 12 meses', () => {
  test('novo item vence em 180 dias; o prazo bate com a conta da política', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    const r = await row('aines');
    const days = (new Date(r.expires_at) - new Date(r.created_at)) / 86400000;
    expect(days).toBeCloseTo(180, 0);
    expect(Math.abs(new Date(r.expires_at) - computeExpiry(r.created_at, r.last_used_at))).toBeLessThan(2000);
  });

  test('usar de novo renova o prazo, mas nunca passa de 12 meses desde a criação', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    await mdb.exec("UPDATE memory_items SET created_at = now() - interval '11 months', expires_at = now() + interval '20 days'");
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    const r = await row('aines');
    const cap = new Date(r.created_at);
    cap.setUTCMonth(cap.getUTCMonth() + 12);
    expect(Math.abs(new Date(r.expires_at) - cap)).toBeLessThan(5000);
    expect(new Date(r.expires_at) < new Date(Date.now() + 100 * 86400000)).toBe(true);
    expect(Math.abs(new Date(r.expires_at) - computeExpiry(r.created_at, r.last_used_at))).toBeLessThan(5000);
  });

  test('item vencido que ainda não foi limpo recomeça do zero ao ser escrito de novo', async () => {
    await mdb.query(
      `INSERT INTO memory_items (subject_id, kind, slug, level, source, evidence, consent_version, created_at, expires_at)
       VALUES ($1, 'topic_level', 'aines', 5, 'quiz', 40, 'memoria-v1', now() - interval '13 months', now() - interval '7 months')`, [A]
    );
    await Store.upsertItems(msql, A, [level('aines', 2)], V);
    const r = await row('aines');
    expect([r.level, r.evidence, r.consent_version]).toEqual([2, 1, V]);
    expect(new Date(r.created_at) > new Date(Date.now() - 60000)).toBe(true);
    expect(new Date(r.expires_at) > new Date()).toBe(true);
  });
});

describe('leitura do tutor', () => {
  const seed = async () => {
    await Store.upsertItems(msql, A, [
      level('farmacocinetica', 4), level('aines', 2), dif('coagulacao'),
      { kind: 'study_pref', slug: 'formato', level: null, value: 'exemplos', source: 'member' },
      { kind: 'goal', slug: 'prova', level: null, value: 'ativo', source: 'member' },
    ], V);
    await Store.upsertItems(msql, B, [level('diureticos', 5)], V);
  };

  test('devolve só os da pessoa, objetivo e preferência primeiro, respeitando o limite', async () => {
    await seed();
    const all = await Store.readForTutor(msql, A, 8);
    expect(all.map((i) => i.kind).sort()).toEqual(['difficulty', 'goal', 'study_pref', 'topic_level', 'topic_level']);
    const two = await Store.readForTutor(msql, A, 2);
    expect(two.map((i) => i.kind).sort()).toEqual(['goal', 'study_pref']);
    expect(all.some((i) => i.slug === 'diureticos')).toBe(false);
  });

  test('ler MARCA como usado: renova last_used_at e o prazo (sem passar de 12 meses)', async () => {
    await seed();
    await mdb.exec("UPDATE memory_items SET last_used_at = now() - interval '100 days', expires_at = now() + interval '80 days' WHERE subject_id = '" + A + "'");
    await Store.readForTutor(msql, A, 8);
    const r = await row('aines');
    expect(new Date(r.last_used_at) > new Date(Date.now() - 60000)).toBe(true);
    expect((new Date(r.expires_at) - Date.now()) / 86400000).toBeGreaterThan(170);
    const other = await row('diureticos');
    expect(new Date(other.last_used_at) > new Date(Date.now() - 60000)).toBe(true); // B foi criado agora, mas não foi tocado pela leitura de A
    expect(other.updated_at).toEqual(other.created_at);
  });

  test('não devolve item vencido', async () => {
    await mdb.query(
      `INSERT INTO memory_items (subject_id, kind, slug, level, source, consent_version, created_at, expires_at)
       VALUES ($1, 'topic_level', 'aines', 3, 'quiz', 'memoria-v1', now() - interval '200 days', now() - interval '1 day')`, [A]
    );
    expect(await Store.readForTutor(msql, A, 8)).toEqual([]);
  });

  test('pessoa sem nada: lista vazia', async () => {
    expect(await Store.readForTutor(msql, A, 8)).toEqual([]);
  });
});

describe('apagar', () => {
  test('deleteItem e deleteAll respeitam a pessoa', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3), level('coagulacao', 3)], V);
    await Store.upsertItems(msql, B, [level('aines', 3)], V);
    const [first] = await Store.listItems(msql, A);
    expect(await Store.deleteItem(msql, B, first.id)).toBe(false);
    expect(await Store.deleteItem(msql, A, first.id)).toBe(true);
    expect(await Store.deleteAll(msql, A)).toBe(1);
    expect(await Store.deleteAll(msql, A)).toBe(0);
    expect(await Store.listItems(msql, B)).toHaveLength(1);
  });
});

describe('manutenção (app.maintenance)', () => {
  test('purgeExpired apaga só os vencidos, de qualquer pessoa', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    await Store.upsertItems(msql, B, [level('coagulacao', 3)], V);
    await mdb.query(
      `INSERT INTO memory_items (subject_id, kind, slug, level, source, consent_version, created_at, expires_at)
       VALUES ($1, 'topic_level', 'diureticos', 3, 'quiz', 'memoria-v1', now() - interval '200 days', now() - interval '1 day'),
              ($2, 'topic_level', 'diureticos', 3, 'quiz', 'memoria-v1', now() - interval '13 months', now() - interval '1 month')`, [A, B]
    );
    expect(await Store.purgeExpired(msql)).toBe(2);
    expect((await mdb.query('SELECT slug FROM memory_items ORDER BY slug')).rows.map((r) => r.slug)).toEqual(['aines', 'coagulacao']);
  });

  test('purgeNotIn apaga quem não está na lista de vivos; poupa o que acabou de ser escrito', async () => {
    const C = 'c'.repeat(64);
    await Store.upsertItems(msql, A, [level('aines', 3)], V);
    await Store.upsertItems(msql, B, [level('aines', 3)], V);
    await Store.upsertItems(msql, C, [level('aines', 3)], V);
    await mdb.exec("UPDATE memory_items SET updated_at = now() - interval '2 hours' WHERE subject_id IN ('" + A + "', '" + B + "')");
    expect(await Store.purgeNotIn(msql, [A])).toBe(1);
    expect((await mdb.query('SELECT subject_id FROM memory_items ORDER BY subject_id')).rows.map((r) => r.subject_id)).toEqual([A, C]);
    expect(await Store.purgeNotIn(msql, [])).toBe(1); // lista vazia = ninguém tem consentimento (C é novo, A cai)
  });

  test('aggregateStats devolve só números, sem pessoa nem item', async () => {
    await Store.upsertItems(msql, A, [level('aines', 3), dif('coagulacao')], V);
    await Store.upsertItems(msql, B, [level('aines', 3)], V);
    const stats = await Store.aggregateStats(msql);
    expect(stats).toEqual({ items: 3, subjects: 2, byKind: { difficulty: 1, topic_level: 2 } });
  });

  test('o modo de manutenção não consegue gravar linha de ninguém', async () => {
    const err = await msql.transaction((tx) => [
      tx`SELECT set_config('app.maintenance', 'on', true)`,
      tx`INSERT INTO memory_items (subject_id, kind, slug, level, source, consent_version, expires_at)
         VALUES (${A}, 'topic_level', 'aines', 3, 'quiz', 'memoria-v1', now() + interval '1 day')`,
    ]).catch((e) => e);
    expect(String(err.message)).toMatch(/row-level security/);
    expect(MEMORY.READ_LIMIT).toBe(8);
  });
});
