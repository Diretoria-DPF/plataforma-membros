/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import * as Rag from '../src/services/ragService.js';
import { buildDocuments, chunkMarkdown } from '../src/assistant/docs.js';
import { EMBEDDING_DIM, EMBEDDING_MODEL } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql, callsMatching } from './helpers/aiTestUtils.js';
import { createMigratedDb, toSql } from './helpers/pgliteSql.js';

const vec = (n) => Array.from({ length: EMBEDDING_DIM }, () => n);
const aiOk = () => ({ run: jest.fn(async (_model, { text }) => ({ data: text.map((_t, i) => vec(0.01 * (i + 1))) })) });

describe('docs — base de conhecimento embutida', () => {
  test('chunkMarkdown divide por "## " e prefixa o título', () => {
    const chunks = chunkMarkdown('guia', '# Titulo\n## A\ntexto a\n## B\ntexto b');
    expect(chunks).toEqual([
      { source: 'guia', section: 'A', content: 'Titulo — A. texto a' },
      { source: 'guia', section: 'B', content: 'Titulo — B. texto b' },
    ]);
  });

  test('buildDocuments: (source, section) únicos, nada vazio, nada de tela de administração', () => {
    const docs = buildDocuments();
    expect(docs.length).toBeGreaterThan(10);
    expect(new Set(docs.map((d) => d.source + '|' + d.section)).size).toBe(docs.length);
    expect(docs.every((d) => d.content.length > 10 && d.content.length <= 4000)).toBe(true);
    const sources = new Set(docs.map((d) => d.source));
    expect(sources).toEqual(new Set(['kb', 'destinos', 'guia', 'privacidade', 'convivencia']));
    expect(docs.find((d) => d.source === 'destinos').content).not.toMatch(/administrador|Terminal fiscal/);
  });
});

describe('embedTexts', () => {
  test('usa @cf/baai/bge-m3 e devolve vetores de 1024', async () => {
    const env = makeEnv({ AI: aiOk() });
    const out = await Rag.embedTexts(env, ['a', 'b']);
    expect(env.AI.run).toHaveBeenCalledWith(EMBEDDING_MODEL, { text: ['a', 'b'] });
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(EMBEDDING_DIM);
  });

  test.each([
    ['binding ausente', undefined],
    ['modelo falha', { run: jest.fn().mockRejectedValue(new Error('boom')) }],
    ['dimensão errada', { run: jest.fn().mockResolvedValue({ data: [[1, 2, 3]] }) }],
    ['resposta sem data', { run: jest.fn().mockResolvedValue({}) }],
    ['valor não numérico', { run: jest.fn().mockResolvedValue({ data: [Array.from({ length: EMBEDDING_DIM }, () => 'x')] }) }],
  ])('lança quando %s', async (_label, ai) => {
    await expect(Rag.embedTexts(makeEnv(ai ? { AI: ai } : {}), ['a'])).rejects.toThrow();
  });
});

describe('fuse (RRF)', () => {
  const row = (id) => ({ id, source: 's', section: id, content: 'c' + id });
  test('um item presente nas duas listas sobe acima de itens de uma lista só', () => {
    const out = Rag.fuse([[row('a'), row('b')], [row('c'), row('b')]], 3);
    expect(out[0].id).toBe('b');
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'b', 'c']);
  });
  test('respeita o limite', () => {
    expect(Rag.fuse([[row('a'), row('b'), row('c')]], 2)).toHaveLength(2);
  });
});

describe('retrieve — híbrido e degradação (SQL simulado)', () => {
  const V = [{ id: 'v1', source: 'kb', section: 'Eventos', content: 'eventos...', score: 0.9 }];
  const T = [{ id: 't1', source: 'guia', section: 'Cotas', content: 'cotas...', score: 0.4 }, { id: 'v1', source: 'kb', section: 'Eventos', content: 'eventos...', score: 0.3 }];

  test('com embedding: consulta vetorial + trigramas e funde', async () => {
    const sql = routedSql([['<=>', V], ['FROM kb_chunks', T]]);
    const out = await Rag.retrieve(sql, makeEnv({ AI: aiOk() }), 'Como funcionam os eventos?');
    expect(out.mode).toBe('hybrid');
    expect(out.embeddingError).toBeNull();
    expect(out.chunks[0].id).toBe('v1');
    expect(callsMatching(sql, '<=>').length).toBeGreaterThan(0);
  });

  test('embedding falha: segue só com trigramas, sem consulta vetorial', async () => {
    const sql = routedSql([['FROM kb_chunks', T]]);
    const ai = { run: jest.fn().mockRejectedValue(new Error('Workers AI fora')) };
    const out = await Rag.retrieve(sql, makeEnv({ AI: ai }), 'cotas');
    expect(out.mode).toBe('trigram');
    expect(out.embeddingError).toMatch(/Workers AI fora/);
    expect(out.chunks.map((c) => c.id)).toEqual(['t1', 'v1']);
    expect(callsMatching(sql, '<=>')).toHaveLength(0);
  });

  test('embedding ok mas consulta vetorial falha (extensão ausente): trigramas', async () => {
    const sql = routedSql([['<=>', new Error('type "vector" does not exist')], ['FROM kb_chunks', T]]);
    const out = await Rag.retrieve(sql, makeEnv({ AI: aiOk() }), 'cotas');
    expect(out.mode).toBe('trigram');
    expect(out.embeddingError).toMatch(/vector/);
  });

  test('trigramas falham (tabela ausente): lança, para a cascata degradar', async () => {
    const sql = routedSql([['FROM kb_chunks', new Error('relation "kb_chunks" does not exist')]]);
    await expect(Rag.retrieve(sql, makeEnv(), 'oi')).rejects.toThrow(/kb_chunks/);
  });
});

describe('reindex e retrieve — banco real (PGlite)', () => {
  let db;
  let sql;
  beforeAll(async () => { db = await createMigratedDb(); sql = toSql(db); }, 120000);
  afterAll(async () => { if (db) await db.close(); });

  test('reindex sem Workers AI: grava tudo sem embedding e avisa (trigramas seguem)', async () => {
    const res = await Rag.reindex(sql, makeEnv(), null);
    const docs = buildDocuments();
    expect(res).toMatchObject({ total: docs.length, upserted: docs.length, unchanged: 0, removed: 0, embedded: 0, embeddingAvailable: false });
    expect(res.embeddingError).toMatch(/binding/);
    const rows = await sql`SELECT count(*)::int AS n FROM kb_chunks`;
    expect(rows[0].n).toBe(docs.length);
  });

  test('reindex é idempotente: segunda rodada não regrava nada (sem embedding disponível, nada muda)', async () => {
    const res = await Rag.reindex(sql, makeEnv(), null);
    expect(res.removed).toBe(0);
    const rows = await sql`SELECT count(*)::int AS n FROM kb_chunks`;
    expect(rows[0].n).toBe(buildDocuments().length);
  });

  test('retrieve por trigramas acha o trecho certo e cita fonte/seção', async () => {
    const out = await Rag.retrieve(sql, makeEnv(), 'quantas perguntas com IA posso fazer por dia?');
    expect(out.mode).toBe('trigram');
    expect(out.chunks.length).toBeGreaterThan(0);
    expect(out.chunks.some((c) => c.source === 'guia' && /Quem pode usar a IA/.test(c.section))).toBe(true);
    expect(out.chunks[0]).toEqual(expect.objectContaining({ source: expect.any(String), section: expect.any(String) }));
  });

  test('reindex remove trecho que saiu da base e atualiza o que mudou', async () => {
    const docs = buildDocuments();
    const subset = docs.slice(0, 3).map((d, i) => (i === 0 ? Object.assign({}, d, { content: d.content + ' alterado' }) : d));
    const res = await Rag.reindex(sql, makeEnv(), subset);
    expect(res).toMatchObject({ total: 3, upserted: 1, unchanged: 2, removed: docs.length - 3 });
    const rows = await sql`SELECT count(*)::int AS n FROM kb_chunks`;
    expect(rows[0].n).toBe(3);
  });

  test('listSources agrupa seções por fonte', async () => {
    const sources = await Rag.listSources(sql);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]).toEqual({ source: expect.any(String), sections: expect.any(Array), updatedAt: expect.anything() });
  });
});

describe('reindex com embedding (SQL simulado)', () => {
  test('embute em lotes, grava o vetor como literal e conta', async () => {
    const sql = routedSql([['FROM kb_chunks', []]]);
    const ai = aiOk();
    const docs = [{ source: 'a', section: '1', content: 'um' }, { source: 'a', section: '2', content: 'dois' }];
    const res = await Rag.reindex(sql, makeEnv({ AI: ai }), docs);
    expect(res).toMatchObject({ total: 2, upserted: 2, embedded: 2, embeddingAvailable: true, embeddingError: null });
    const inserts = callsMatching(sql, 'INSERT INTO kb_chunks');
    expect(inserts).toHaveLength(2);
    expect
    const literal = inserts[0].slice(1).find((v) => typeof v === 'string' && v.startsWith('['));
    expect(literal.split(',')).toHaveLength(EMBEDDING_DIM);
  });
});
