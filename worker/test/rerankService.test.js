/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { rerank, RERANK } from '../src/services/rerankService.js';
import * as Rag from '../src/services/ragService.js';
import { EMBEDDING_DIM, EMBEDDING_MODEL, RAG } from '../src/constants.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql } from './helpers/aiTestUtils.js';

const sig = (x) => 1 / (1 + Math.exp(-x));
const chunk = (id) => ({ id, source: 'kb', section: 'Secao ' + id, content: 'texto ' + id, score: 0.5 });
const CHUNKS = [chunk('a'), chunk('b'), chunk('c')];
const ids = (list) => list.map((c) => c.id);
/** Resposta do reranker: o id é o índice do contexto, como no modelo. */
const reply = (scores) => ({ response: scores.map((score, id) => ({ id, score })) });
const aiReturning = (out) => ({ run: jest.fn(async () => out) });

describe('rerank — ordem pela nota', () => {
  test('a nota inverte a ordem e cada trecho recebe rerankScore (sigmoid)', async () => {
    const env = makeEnv({ AI: aiReturning(reply([0.1, -1, 2])) });
    const out = await rerank(env, 'pergunta', CHUNKS);
    expect(ids(out.chunks)).toEqual(['c', 'a', 'b']);
    expect(out.chunks[0].rerankScore).toBeCloseTo(sig(2));
    expect(out).toEqual({ chunks: expect.any(Array), answerable: true, provider: 'workers-ai', error: null });
  });

  test('envia a pergunta e os textos no formato do modelo', async () => {
    const env = makeEnv({ AI: aiReturning(reply([1, 1, 1])) });
    await rerank(env, 'pergunta', CHUNKS);
    expect(env.AI.run).toHaveBeenCalledWith(RERANK.MODEL, {
      query: 'pergunta',
      contexts: [{ text: 'texto a' }, { text: 'texto b' }, { text: 'texto c' }],
    });
  });

  test('não altera a lista recebida', async () => {
    const env = makeEnv({ AI: aiReturning(reply([0.1, -1, 2])) });
    await rerank(env, 'q', CHUNKS);
    expect(ids(CHUNKS)).toEqual(['a', 'b', 'c']);
    expect(CHUNKS[0]).not.toHaveProperty('rerankScore');
  });

  test('TOP_K corta a saída', async () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(chunk);
    const env = makeEnv({ AI: aiReturning(reply([1, 2, 3, 4, 5, 6])) });
    const out = await rerank(env, 'q', six);
    expect(out.chunks).toHaveLength(RERANK.TOP_K);
    expect(ids(out.chunks)).toEqual(['f', 'e', 'd', 'c'].slice(0, RERANK.TOP_K));
  });
});

describe('rerank — limiares injetados por opts', () => {
  test('minScore corta trechos abaixo da nota (sigmoid)', async () => {
    const env = makeEnv({ AI: aiReturning(reply([2, -2, 0.5])) });
    const out = await rerank(env, 'q', CHUNKS, { minScore: 0.5 });
    expect(ids(out.chunks)).toEqual(['a', 'c']);
  });

  test('answerableMin acima da maior nota: answerable false, trechos mantidos', async () => {
    const env = makeEnv({ AI: aiReturning(reply([-1, -2, -3])) });
    const out = await rerank(env, 'q', CHUNKS, { answerableMin: 0.5 });
    expect(out.answerable).toBe(false);
    expect(ids(out.chunks)).toEqual(['a', 'b', 'c']);
  });

  test('answerableMin atingido: answerable true', async () => {
    const env = makeEnv({ AI: aiReturning(reply([2, -2, 0.5])) });
    const out = await rerank(env, 'q', CHUNKS, { answerableMin: 0.5 });
    expect(out.answerable).toBe(true);
  });

  test('minScore que zera a lista: sem trechos e answerable false', async () => {
    const env = makeEnv({ AI: aiReturning(reply([-1, -2, -3])) });
    const out = await rerank(env, 'q', CHUNKS, { minScore: 0.5 });
    expect(out).toEqual({ chunks: [], answerable: false, provider: 'workers-ai', error: null });
  });

  test('sem opts, com RERANK nulo: nada é cortado nem marcado como não respondível', async () => {
    const env = makeEnv({ AI: aiReturning(reply([-1, -2, -3])) });
    const out = await rerank(env, 'q', CHUNKS);
    expect(ids(out.chunks)).toEqual(['a', 'b', 'c']);
    expect(out.answerable).toBe(true);
  });

  test('lista vazia: não chama o modelo e devolve answerable false', async () => {
    const env = makeEnv({ AI: aiReturning(reply([])) });
    const out = await rerank(env, 'q', []);
    expect(out).toEqual({ chunks: [], answerable: false, provider: null, error: null });
    expect(env.AI.run).not.toHaveBeenCalled();
  });
});

describe('rerank — degradação (ordem original, TOP_K, answerable true)', () => {
  test.each([
    ['sem binding AI', makeEnv(), 'binding AI ausente'],
    ['modelo rejeita', makeEnv({ AI: { run: jest.fn().mockRejectedValue(new Error('Workers AI fora')) } }), 'falha do modelo'],
    ['resposta sem lista', makeEnv({ AI: aiReturning({}) }), 'saída malformada'],
    ['quantidade diferente de trechos', makeEnv({ AI: aiReturning({ response: [{ id: 0, score: 1 }] }) }), 'saída malformada'],
    ['id repetido', makeEnv({ AI: aiReturning({ response: [{ id: 0, score: 1 }, { id: 0, score: 2 }, { id: 2, score: 3 }] }) }), 'saída malformada'],
    ['nota não numérica', makeEnv({ AI: aiReturning({ response: [{ id: 0, score: 'x' }, { id: 1, score: 1 }, { id: 2, score: 1 }] }) }), 'saída malformada'],
    ['id fora do intervalo', makeEnv({ AI: aiReturning({ response: [{ id: 0, score: 1 }, { id: 7, score: 1 }, { id: 2, score: 1 }] }) }), 'id fora do intervalo'],
  ])('%s: devolve a ordem original e marca o erro', async (_label, env, error) => {
    const out = await rerank(env, 'pergunta', CHUNKS);
    expect(out).toEqual({ chunks: CHUNKS, answerable: true, provider: null, error });
  });

  test('modelo rejeita: o erro não leva o texto da pergunta', async () => {
    const env = makeEnv({ AI: { run: jest.fn().mockRejectedValue(new Error('erro com a pergunta secreta')) } });
    const out = await rerank(env, 'pergunta secreta', CHUNKS);
    expect(out.error).toBe('falha do modelo');
    expect(JSON.stringify(out)).not.toMatch(/pergunta secreta/);
  });

  test('tempo esgotado: devolve a ordem original sem esperar a nota', async () => {
    jest.useFakeTimers();
    try {
      const env = makeEnv({ AI: { run: jest.fn(() => new Promise(() => {})) } });
      const pending = rerank(env, 'q', CHUNKS);
      jest.advanceTimersByTime(RERANK.TIMEOUT_MS);
      const out = await pending;
      expect(out).toEqual({ chunks: CHUNKS, answerable: true, provider: null, error: 'tempo esgotado' });
    } finally {
      jest.useRealTimers();
    }
  });

  test('provedor desconhecido: degrada sem chamar o modelo; workers-ai explícito funciona', async () => {
    const env = makeEnv({ AI: aiReturning(reply([1, 2, 3])) });
    const out = await rerank(env, 'q', CHUNKS, { provider: 'jev' });
    expect(out).toEqual({ chunks: CHUNKS, answerable: true, provider: null, error: 'provedor indisponível' });
    expect(env.AI.run).not.toHaveBeenCalled();
    const ok = await rerank(env, 'q', CHUNKS, { provider: 'workers-ai' });
    expect(ok.provider).toBe('workers-ai');
  });
});

describe('retrieve com rerank (SQL e AI simulados)', () => {
  const vec = Array.from({ length: EMBEDDING_DIM }, () => 0.01);
  const V = [{ id: 'v1', source: 'kb', section: 'Eventos', content: 'eventos...', score: 0.9 }];
  const T = [1, 2, 3, 4, 5, 6].map((n) => ({ id: 't' + n, source: 'guia', section: 'Cotas ' + n, content: 'cotas ' + n, score: 0.5 }));
  const sqlFor = () => routedSql([['<=>', V], ['FROM kb_chunks', T]]);
  const byContent = (input) => ({ response: input.contexts.map((c, id) => ({ id, score: c.text === 'eventos...' ? 3 : -1 })) });
  const aiRouter = (onRerank = byContent) => ({
    run: jest.fn(async (model, input) => (model === EMBEDDING_MODEL ? { data: [vec] } : onRerank(input))),
  });
  const rerankCalls = (env) => env.AI.run.mock.calls.filter((c) => c[0] === RERANK.MODEL);

  test('sem opts: só o embedding é chamado e o retorno não traz os campos novos', async () => {
    const env = makeEnv({ AI: aiRouter() });
    const out = await Rag.retrieve(sqlFor(), env, 'como funcionam os eventos?');
    expect(Object.keys(out).sort()).toEqual(['chunks', 'embeddingError', 'mode']);
    expect(out.chunks).toHaveLength(RAG.TOP_K);
    expect(rerankCalls(env)).toHaveLength(0);
  });

  test('com { rerank: true }: manda até CANDIDATES ao reranker e devolve a ordem da nota', async () => {
    const env = makeEnv({ AI: aiRouter() });
    const out = await Rag.retrieve(sqlFor(), env, 'como funcionam os eventos?', { rerank: true });
    const [call] = rerankCalls(env);
    expect(call[1].contexts.length).toBeGreaterThan(RAG.TOP_K);
    expect(call[1].contexts.length).toBeLessThanOrEqual(RAG.CANDIDATES);
    expect(out.chunks[0].id).toBe('v1');
    expect(out.chunks).toHaveLength(RAG.TOP_K);
    expect(out).toMatchObject({ mode: 'hybrid', embeddingError: null, reranked: true, answerable: true });
  });

  test('com rerank, falha do modelo: cai na ordem da fusão com reranked false', async () => {
    const env = makeEnv({ AI: aiRouter(() => { throw new Error('Workers AI fora'); }) });
    const out = await Rag.retrieve(sqlFor(), env, 'q', { rerank: true });
    expect(out).toMatchObject({ mode: 'hybrid', reranked: false, answerable: true });
    expect(out.chunks).toHaveLength(RAG.TOP_K);
  });

  test('com rerank e answerableMin: nota abaixo do limiar devolve answerable false', async () => {
    const allLow = (input) => ({ response: input.contexts.map((_c, id) => ({ id, score: -1 })) });
    const env = makeEnv({ AI: aiRouter(allLow) });
    const out = await Rag.retrieve(sqlFor(), env, 'q', { rerank: true, answerableMin: 0.5 });
    expect(out).toMatchObject({ reranked: true, answerable: false });
    expect(out.chunks).toHaveLength(RAG.TOP_K);
  });
});
