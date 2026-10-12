/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * neuronLedger.test.js — livro-caixa de neurons do Workers AI (services/neuronLedger.js): UMA chave por dia
 * (dia UTC) com {total, visitor}, gravação em lote (debounce: >= 5 neurons acumulados ou >= 60 s desde a
 * última gravação), leitura com cache de ~30 s, e no-op sem KV. O KV gratuito aceita só 1.000 gravações/dia.
 */
import { jest } from '@jest/globals';
import { recordNeurons, neuronsToday, neuronsForGemma, neuronsForEmbedding, dayKey, __resetNeuronLedgerForTests } from '../src/services/neuronLedger.js';
import { memoryKv } from './helpers/aiTestUtils.js';

const T0 = new Date('2026-10-12T12:00:00Z');
const at = (base, seconds) => new Date(base.getTime() + seconds * 1000);
const D2 = new Date('2026-10-13T00:00:00Z');

beforeEach(() => { __resetNeuronLedgerForTests(); });

describe('estimativa de neurons', () => {
  test('gemma-4-26b: 9091 por milhão de entrada e 27273 por milhão de saída', () => {
    expect(neuronsForGemma({ prompt_tokens: 1e6, completion_tokens: 0 })).toBeCloseTo(9091, 5);
    expect(neuronsForGemma({ prompt_tokens: 0, completion_tokens: 1e6 })).toBeCloseTo(27273, 5);
    expect(neuronsForGemma({ prompt_tokens: 1000, completion_tokens: 300 })).toBeCloseTo(9.091 + 8.1819, 4);
  });

  test('aceita os dois nomes de campo e usage ausente ou inválido vale 0', () => {
    expect(neuronsForGemma({ input_tokens: 1e6, output_tokens: 0 })).toBeCloseTo(9091, 5);
    [undefined, null, {}, { prompt_tokens: 'x' }, { prompt_tokens: -5, completion_tokens: -1 }].forEach((u) => expect(neuronsForGemma(u)).toBe(0));
  });

  test('bge-m3: 1075 por milhão de tokens de entrada', () => {
    expect(neuronsForEmbedding(1e6)).toBeCloseTo(1075, 5);
    expect(neuronsForEmbedding(-3)).toBe(0);
    expect(neuronsForEmbedding(NaN)).toBe(0);
  });
});

describe('dia UTC', () => {
  test('a chave muda à meia-noite UTC, não à de Brasília', () => {
    expect(dayKey(new Date('2026-10-12T23:59:59Z'))).toBe('2026-10-12');
    expect(dayKey(D2)).toBe('2026-10-13');
  });
});

describe('livro-caixa: uma chave por dia, valor JSON {total, visitor}', () => {
  test('soma o total e o escopo "visitor" na MESMA chave', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 100, null, T0);
    await recordNeurons(env, 20, 'visitor', at(T0, 1));
    expect(JSON.parse(env.HOT_CACHE.store.get('neurons:2026-10-12'))).toEqual({ total: 120, visitor: 20 });
    expect([...env.HOT_CACHE.store.keys()]).toEqual(['neurons:2026-10-12']);
    expect(await neuronsToday(env, null, at(T0, 2))).toBe(120);
    expect(await neuronsToday(env, 'visitor', at(T0, 2))).toBe(20);
  });

  test('separa por dia UTC e a chave expira (TTL)', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 10, null, T0);
    await recordNeurons(env, 7, null, D2);
    expect(await neuronsToday(env, null, D2)).toBe(7);
    const [key, , opts] = env.HOT_CACHE.put.mock.calls[0];
    expect(key).toBe('neurons:2026-10-12');
    expect(opts.expirationTtl).toBeGreaterThanOrEqual(86400);
  });

  test('os resumos entram no total sem tocar no contador da prévia', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 50, null, T0);
    expect(await neuronsToday(env, 'visitor', at(T0, 1))).toBe(0);
  });
});

describe('debounce das gravações (limite gratuito do KV: 1.000/dia)', () => {
  test('a primeira grava; abaixo de 5 neurons e antes de 60 s, só acumula em memória', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 3, null, T0); // primeira: grava
    await recordNeurons(env, 1, null, at(T0, 5));
    await recordNeurons(env, 1.5, null, at(T0, 10));
    expect(env.HOT_CACHE.put).toHaveBeenCalledTimes(1);
    // A leitura enxerga o que está pendente na memória do isolate.
    expect(await neuronsToday(env, null, at(T0, 11))).toBeCloseTo(5.5, 5);
  });

  test('grava quando o acumulado pendente chega a 5 neurons', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 3, null, T0);
    await recordNeurons(env, 2, null, at(T0, 5));
    expect(env.HOT_CACHE.put).toHaveBeenCalledTimes(1);
    await recordNeurons(env, 5, null, at(T0, 6)); // 5 pendentes: grava
    expect(env.HOT_CACHE.put).toHaveBeenCalledTimes(2);
    expect(JSON.parse(env.HOT_CACHE.store.get('neurons:2026-10-12')).total).toBeCloseTo(10, 5);
  });

  test('grava quando passou 60 s desde a última gravação, mesmo com pouco acumulado', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 1, null, T0);
    await recordNeurons(env, 1, null, at(T0, 30));
    expect(env.HOT_CACHE.put).toHaveBeenCalledTimes(1);
    await recordNeurons(env, 1, null, at(T0, 61));
    expect(env.HOT_CACHE.put).toHaveBeenCalledTimes(2);
    expect(JSON.parse(env.HOT_CACHE.store.get('neurons:2026-10-12')).total).toBeCloseTo(3, 5);
  });

  test('100 registros pequenos em 30 s viram 1 gravação (nada de 1 por consulta)', async () => {
    const env = { HOT_CACHE: memoryKv() };
    for (let i = 0; i < 100; i += 1) await recordNeurons(env, 0.03, null, at(T0, i * 0.3));
    expect(env.HOT_CACHE.put.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe('leitura com cache em memória (~30 s)', () => {
  test('lê o KV uma vez a cada 30 s', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, 40, null, T0);
    env.HOT_CACHE.get.mockClear();
    await neuronsToday(env, null, at(T0, 1));
    await neuronsToday(env, 'visitor', at(T0, 10));
    await neuronsToday(env, null, at(T0, 29));
    expect(env.HOT_CACHE.get).toHaveBeenCalledTimes(1);
    await neuronsToday(env, null, at(T0, 31));
    expect(env.HOT_CACHE.get).toHaveBeenCalledTimes(2);
  });

  test('o teto lê o valor gravado por outro isolate depois que o cache vence', async () => {
    const env = { HOT_CACHE: memoryKv() };
    await env.HOT_CACHE.put('neurons:2026-10-12', JSON.stringify({ total: 900, visitor: 300 }));
    expect(await neuronsToday(env, null, T0)).toBe(900);
    expect(await neuronsToday(env, 'visitor', T0)).toBe(300);
    await env.HOT_CACHE.put('neurons:2026-10-12', JSON.stringify({ total: 1000, visitor: 400 }));
    expect(await neuronsToday(env, null, at(T0, 40))).toBe(1000);
  });
});

describe('sem KV ou com falha: nunca lança', () => {
  test('sem KV: registrar é no-op e a leitura devolve null (sem prévia de IA)', async () => {
    for (const env of [{}, { HOT_CACHE: null }, undefined, null]) {
      await expect(recordNeurons(env, 5)).resolves.toBeUndefined();
      expect(await neuronsToday(env)).toBeNull();
    }
  });

  test('KV que falha: a escrita some em silêncio e a leitura devolve null', async () => {
    const env = { HOT_CACHE: { get: jest.fn().mockRejectedValue(new Error('kv')), put: jest.fn().mockRejectedValue(new Error('kv')) } };
    await expect(recordNeurons(env, 50, null, T0)).resolves.toBeUndefined();
    __resetNeuronLedgerForTests();
    expect(await neuronsToday(env, null, T0)).toBeNull();
  });

  test.each([[NaN], [-5], [0], ['7'], [undefined], [Infinity]])('valor %p não é registrado', async (n) => {
    const env = { HOT_CACHE: memoryKv() };
    await recordNeurons(env, n, null, T0);
    expect(env.HOT_CACHE.put).not.toHaveBeenCalled();
  });
});

describe('quem registra no livro-caixa', () => {
  test('o resumo da Biblioteca registra pelo acúmulo em lote (uma chave, sem gravar a cada resumo)', async () => {
    const { runSummaryModel } = await import('../src/library/summaryProvider.js');
    const env = { HOT_CACHE: memoryKv(), AI: { run: jest.fn(async () => ({ response: 'Texto.', usage: { prompt_tokens: 100000, completion_tokens: 10000 } })) } };
    await runSummaryModel(env, { model: '@cf/x/y', messages: [{ role: 'user', content: 'x' }] });
    expect(await neuronsToday(env)).toBeCloseTo(0.1 * 9091 + 0.01 * 27273, 3);
    expect([...env.HOT_CACHE.store.keys()]).toHaveLength(1);
  });

  test('o embedding do RAG NÃO registra nada (nenhuma gravação no KV por consulta)', async () => {
    const { embedTexts } = await import('../src/services/ragService.js');
    const vector = Array.from({ length: 1024 }, () => 0.01);
    const env = { HOT_CACHE: memoryKv(), AI: { run: jest.fn(async () => ({ data: [vector], usage: { prompt_tokens: 12 } })) } };
    await embedTexts(env, ['pergunta']);
    expect(env.HOT_CACHE.put).not.toHaveBeenCalled();
  });
});
