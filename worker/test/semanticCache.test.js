/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { normalizeQuestion, hasPii, isCacheable, lookup, store, stats } from '../src/ai/semanticCache.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

describe('semanticCache — texto', () => {
  test('normaliza: minúsculas, sem acento nem pontuação, espaços colapsados', () => {
    expect(normalizeQuestion('  O que é um ANTÍDOTO?!  ')).toBe('o que e um antidoto');
    expect(normalizeQuestion('Paracetamol — dose tóxica (adulto)')).toBe('paracetamol dose toxica adulto');
    expect(normalizeQuestion(null)).toBe('');
    expect(normalizeQuestion('a'.repeat(1000)).length).toBe(300);
  });

  test.each([
    ['e-mail', 'meu email é ana@exemplo.com, pode responder?'],
    ['telefone com DDD', 'me liga no (11) 98765-4321 para explicar'],
    ['CPF', 'meu cpf 123.456.789-09 está certo?'],
    ['documento corrido', 'matricula 20240012345 do aluno'],
    ['link', 'veja https://site.exemplo/arquivo e responda'],
    ['link sem protocolo', 'abra www.exemplo.com agora'],
  ])('detecta dado pessoal: %s', (_label, text) => {
    expect(hasPii(text)).toBe(true);
    expect(isCacheable(text)).toBe(false);
  });

  test.each([
    'Qual a diferença entre agonista e antagonista?',
    'Como funciona a toxicocinética do paracetamol em doses altas',
    'o que é meia-vida de eliminação',
    'dose de 500 mg a cada 8 horas é segura?',
  ])('pergunta genérica é cacheável: %s', (text) => {
    expect(hasPii(text)).toBe(false);
    expect(isCacheable(text)).toBe(true);
  });

  test('pergunta curta demais ou vazia não é cacheável', () => {
    expect(isCacheable('oi')).toBe(false);
    expect(isCacheable('')).toBe(false);
    expect(isCacheable(undefined)).toBe(false);
  });
});

describe('semanticCache — SQL real (pg_trgm)', () => {
  let db;
  let sql;

  beforeAll(async () => {
    db = await createMigratedDb();
    sql = toSql(db);
  }, 60000);
  afterAll(async () => { await db.close(); });
  beforeEach(async () => { await db.exec('DELETE FROM ai_semantic_cache'); });

  const Q = 'Quais são os sintomas da intoxicação por paracetamol?';
  const A = 'Náuseas, vômitos e, tardiamente, lesão hepática.';

  test('guarda e recupera a mesma pergunta (mesmo escrita diferente)', async () => {
    expect(await store(sql, 'lab_preceptor', Q, A)).toBe(true);
    const hit = await lookup(sql, 'lab_preceptor', 'quais sao os sintomas da intoxicacao por paracetamol', 0.85);
    expect(hit).toMatchObject({ answer: A });
    expect(hit.similarity).toBeGreaterThanOrEqual(0.85);
  });

  test('pergunta parecida entra com limiar menor e fica de fora com limiar alto', async () => {
    await store(sql, 'lab_preceptor', Q, A);
    const near = 'quais os sintomas da intoxicacao por paracetamol em adultos';
    expect(await lookup(sql, 'lab_preceptor', near, 0.5)).not.toBeNull();
    expect(await lookup(sql, 'lab_preceptor', near, 0.99)).toBeNull();
  });

  test('pergunta de outro assunto não acerta', async () => {
    await store(sql, 'lab_preceptor', Q, A);
    expect(await lookup(sql, 'lab_preceptor', 'como calibrar o pHmetro antes da titulacao', 0.5)).toBeNull();
  });

  test('o cache é separado por recurso', async () => {
    await store(sql, 'lab_preceptor', Q, A);
    expect(await lookup(sql, 'chat', Q, 0.85)).toBeNull();
  });

  test('guardar de novo a mesma pergunta atualiza a resposta, sem duplicar', async () => {
    await store(sql, 'lab_preceptor', Q, 'resposta antiga');
    await store(sql, 'lab_preceptor', Q, 'resposta nova');
    const rows = await sql`SELECT answer FROM ai_semantic_cache`;
    expect(rows).toEqual([{ answer: 'resposta nova' }]);
  });

  test('entrada vencida não serve, a não ser como último recurso (allowExpired)', async () => {
    await store(sql, 'lab_preceptor', Q, A);
    await db.exec("UPDATE ai_semantic_cache SET expires_at = now() - interval '1 day'");
    expect(await lookup(sql, 'lab_preceptor', Q, 0.85)).toBeNull();
    expect(await lookup(sql, 'lab_preceptor', Q, 0.85, { allowExpired: true })).toMatchObject({ answer: A });
  });

  test('cada acerto soma em hits e as estatísticas só contam entradas válidas', async () => {
    await store(sql, 'lab_preceptor', Q, A);
    await lookup(sql, 'lab_preceptor', Q, 0.85);
    await lookup(sql, 'lab_preceptor', Q, 0.85);
    expect(await stats(sql)).toEqual({ entries: 1, hits: 2 });
    await db.exec("UPDATE ai_semantic_cache SET expires_at = now() - interval '1 day'");
    expect(await stats(sql)).toEqual({ entries: 0, hits: 0 });
  });

  test('NUNCA guarda pergunta com dado pessoal nem resposta vazia ou enorme', async () => {
    expect(await store(sql, 'lab_preceptor', 'meu email ana@exemplo.com, qual a dose de paracetamol?', A)).toBe(false);
    expect(await store(sql, 'lab_preceptor', Q, '   ')).toBe(false);
    expect(await store(sql, 'lab_preceptor', Q, 'x'.repeat(9000))).toBe(false);
    expect((await sql`SELECT count(*)::int AS n FROM ai_semantic_cache`)[0].n).toBe(0);
  });

  test('a validade é de 7 dias', async () => {
    await store(sql, 'lab_preceptor', Q, A);
    const [{ days }] = await sql`SELECT round(extract(epoch FROM (expires_at - created_at)) / 86400)::int AS days FROM ai_semantic_cache`;
    expect(days).toBe(7);
  });
});

describe('semanticCache — falhas do banco nunca chegam à pessoa', () => {
  const broken = () => Promise.reject(new Error('banco fora'));

  test('lookup, store e stats viram "não achei", "não guardei" e zeros', async () => {
    expect(await lookup(broken, 'lab_preceptor', 'qual a dose segura de paracetamol', 0.85)).toBeNull();
    expect(await store(broken, 'lab_preceptor', 'qual a dose segura de paracetamol', 'x')).toBe(false);
    expect(await stats(broken)).toEqual({ entries: 0, hits: 0 });
  });

  test('antes da migração 018 (tabela ausente) é igual', async () => {
    const missing = () => Promise.reject(Object.assign(new Error('relation "ai_semantic_cache" does not exist'), { code: '42P01' }));
    expect(await lookup(missing, 'lab_preceptor', 'qual a dose segura de paracetamol', 0.85)).toBeNull();
  });
});
