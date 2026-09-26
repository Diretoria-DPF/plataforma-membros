import { jest } from '@jest/globals';
import * as Groq from '../src/ai/groqClient.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql, callsMatching, groqReply, httpError, abortError, memoryKv, KEYS } from './helpers/aiTestUtils.js';

const MESSAGES = [{ role: 'system', content: 'x' }, { role: 'user', content: 'oi' }];

function envWith(overrides) {
  return makeEnv(Object.assign({ GROQ_API_KEYS: KEYS.join(','), HOT_CACHE: memoryKv() }, overrides || {}));
}

function authOf(call) {
  return call[1].headers.Authorization;
}

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
  Groq.__resetPoolStateForTests(0);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('groqClient — configuração do pool', () => {
  test('parseKeys aceita vírgula, quebra de linha e espaços, sem vazias nem repetidas', () => {
    const env = { GROQ_API_KEYS: ' a1,\n b2 \r\n,, c3\na1 ; d4 ' };
    expect(Groq.parseKeys(env)).toEqual(['a1', 'b2', 'c3', 'd4']);
    expect(Groq.parseKeys({})).toEqual([]);
  });

  test('maskKey mostra só os 4 últimos caracteres (e nada se a chave for curta)', () => {
    expect(Groq.maskKey(KEYS[0])).toBe('…1111');
    expect(Groq.maskKey('curta')).toBe('…');
  });

  test('sem chave configurada: erro esperado de "não configurada", sem chamar a rede', async () => {
    const env = envWith({ GROQ_API_KEYS: '' });
    await expect(Groq.complete(env, null, { feature: 'chat', messages: MESSAGES })).rejects.toMatchObject({
      expected: true, aiUnavailable: true, message: expect.stringContaining('não foi configurada'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('groqClient — rodízio e failover', () => {
  test('round-robin: chamadas consecutivas começam em chaves diferentes', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('ok'));
    const env = envWith();
    const used = [];
    for (let i = 0; i < 4; i++) {
      const out = await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES });
      used.push(out.keyIndex);
    }
    expect(used).toEqual([0, 1, 2, 0]);
    expect(authOf(globalThis.fetch.mock.calls[1])).toBe('Bearer ' + KEYS[1]);
  });

  test('failover em 429: pula para a próxima chave e põe a que falhou em cooldown (TTL do Retry-After)', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(httpError(429, { 'retry-after': '120' }))
      .mockResolvedValueOnce(groqReply('resposta'));
    const env = envWith();
    const out = await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES });
    expect(out).toMatchObject({ content: 'resposta', keyIndex: 1 });
    expect(env.HOT_CACHE.put).toHaveBeenCalledWith('ai:key-cooldown:0', expect.any(String), { expirationTtl: 120 });
  });

  test.each([401, 403, 500, 503])('failover em HTTP %i, com cooldown padrão de 60 s', async (status) => {
    globalThis.fetch.mockResolvedValueOnce(httpError(status)).mockResolvedValueOnce(groqReply('ok'));
    const env = envWith();
    const out = await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES });
    expect(out.keyIndex).toBe(1);
    expect(env.HOT_CACHE.put).toHaveBeenCalledWith('ai:key-cooldown:0', expect.any(String), { expirationTtl: 60 });
  });

  test('failover em timeout (AbortError)', async () => {
    globalThis.fetch.mockRejectedValueOnce(abortError()).mockResolvedValueOnce(groqReply('ok'));
    const env = envWith();
    const out = await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES });
    expect(out.keyIndex).toBe(1);
    expect(env.HOT_CACHE.put).toHaveBeenCalledWith('ai:key-cooldown:0', expect.any(String), { expirationTtl: 60 });
  });

  test('cada tentativa leva um AbortSignal (timeout real, não só no papel)', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('ok'));
    await Groq.complete(envWith(), null, { feature: 'evaluate', messages: MESSAGES });
    expect(globalThis.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  test('chave em cooldown no KV (marcada por outro isolate) é pulada sem chamar a rede com ela', async () => {
    const env = envWith();
    await env.HOT_CACHE.put('ai:key-cooldown:0', JSON.stringify({ until: Date.now() + 60000 }));
    globalThis.fetch.mockResolvedValue(groqReply('ok'));
    const out = await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES });
    expect(out.keyIndex).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(authOf(globalThis.fetch.mock.calls[0])).toBe('Bearer ' + KEYS[1]);
  });

  test('cooldown lembrado em memória (sem KV): a chave que falhou é pulada quando o rodízio volta a ela', async () => {
    const env = envWith({ HOT_CACHE: undefined });
    globalThis.fetch.mockResolvedValueOnce(httpError(429)).mockResolvedValue(groqReply('ok'));
    await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES }); // começa na 0: falha → cooldown; usa a 1
    await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES }); // começa na 1
    await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES }); // começa na 2
    globalThis.fetch.mockClear();
    const out = await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES }); // voltaria à 0, em cooldown
    expect(out.keyIndex).toBe(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('todas as chaves falhando → erro esperado GENÉRICO, marcado para devolver a cota', async () => {
    globalThis.fetch
      .mockResolvedValueOnce(httpError(429))
      .mockResolvedValueOnce(httpError(500))
      .mockRejectedValueOnce(abortError());
    const err = await Groq.complete(envWith(), null, { feature: 'chat', messages: MESSAGES }).catch((e) => e);
    expect(err).toMatchObject({ expected: true, aiUnavailable: true, name: 'AiUnavailableError' });
    expect(err.message).toMatch(/indisponível/);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });

  test('400 (requisição recusada) não faz failover: trocar de chave não resolveria', async () => {
    globalThis.fetch.mockResolvedValueOnce(httpError(400));
    const err = await Groq.complete(envWith(), null, { feature: 'evaluate', messages: MESSAGES }).catch((e) => e);
    expect(err).toMatchObject({ expected: true, aiInvalidOutput: true });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('resposta 200 vazia (raciocínio consumiu o max_tokens) → erro esperado de saída inválida', async () => {
    globalThis.fetch.mockResolvedValueOnce(groqReply('', { finishReason: 'length' }));
    await expect(Groq.complete(envWith(), null, { feature: 'chat', messages: MESSAGES })).rejects.toMatchObject({ aiInvalidOutput: true });
  });
});

describe('groqClient — corpo da requisição', () => {
  test('modelo por recurso (FAST no chat, SMART na avaliação), JSON mode e parâmetros do gpt-oss', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('{}'));
    const env = envWith();
    await Groq.complete(env, null, { feature: 'chat', messages: MESSAGES });
    await Groq.complete(env, null, { feature: 'evaluate', messages: MESSAGES });
    const chatBody = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    const evalBody = JSON.parse(globalThis.fetch.mock.calls[1][1].body);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(chatBody).toMatchObject({ model: 'openai/gpt-oss-20b', max_tokens: 700, reasoning_effort: 'low', include_reasoning: false });
    expect(chatBody.response_format).toBeUndefined();
    expect(evalBody).toMatchObject({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' } });
  });

  test('um modelo só: GROQ_MODEL_SMART = GROQ_MODEL_FAST; modelo fora da família gpt-oss não recebe parâmetros dela', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('{}'));
    const env = envWith({ GROQ_MODEL_FAST: 'llama-3.1-8b-instant', GROQ_MODEL_SMART: 'llama-3.1-8b-instant' });
    await Groq.complete(env, null, { feature: 'evaluate', messages: MESSAGES });
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.model).toBe('llama-3.1-8b-instant');
    expect(body.reasoning_effort).toBeUndefined();
  });
});

describe('groqClient — a chave nunca vaza', () => {
  test('nem no erro, nem no ai_usage_log, nem no console, mesmo com todas falhando', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const sql = routedSql([['INSERT INTO ai_usage_log', new Error('banco fora: ' + 'detalhe')]]);
    globalThis.fetch
      .mockResolvedValueOnce(httpError(401))
      .mockRejectedValueOnce(new Error('falha de rede com Bearer ' + KEYS[1]))
      .mockResolvedValueOnce(httpError(500));
    const err = await Groq.complete(envWith(), sql, { feature: 'chat', messages: MESSAGES, profileId: 'p1' }).catch((e) => e);

    const everything = JSON.stringify({
      message: err.message, stack: err.stack,
      sqlCalls: sql.mock.calls, console: consoleSpy.mock.calls,
    });
    KEYS.forEach((k) => expect(everything).not.toContain(k));
    KEYS.forEach((k) => expect(everything).not.toContain(k.slice(4, 20)));
    consoleSpy.mockRestore();
  });

  test('ai_usage_log recebe o ÍNDICE da chave, tokens, latência e ok — sem conteúdo', async () => {
    const sql = routedSql([]);
    globalThis.fetch.mockResolvedValueOnce(httpError(429)).mockResolvedValueOnce(groqReply('segredo do paciente'));
    await Groq.complete(envWith(), sql, { feature: 'chat', messages: MESSAGES, profileId: 'p1' });
    const logs = callsMatching(sql, 'INSERT INTO ai_usage_log');
    expect(logs).toHaveLength(2);
    // valores: profileId, feature, model, key_index, prompt_tokens, completion_tokens, latency_ms, ok
    expect(logs[0].slice(1)).toEqual(['p1', 'chat', 'openai/gpt-oss-20b', 0, null, null, expect.any(Number), false]);
    expect(logs[1].slice(1)).toEqual(['p1', 'chat', 'openai/gpt-oss-20b', 1, 11, 22, expect.any(Number), true]);
    expect(JSON.stringify(logs)).not.toContain('segredo do paciente');
  });
});

describe('groqClient — saúde das chaves', () => {
  test('checkKeys usa o endpoint barato /models, devolve só dados mascarados e tira do cooldown quem respondeu', async () => {
    const env = envWith();
    await env.HOT_CACHE.put('ai:key-cooldown:0', JSON.stringify({ until: Date.now() + 60000 }));
    globalThis.fetch
      .mockResolvedValueOnce(httpError(200))
      .mockResolvedValueOnce(httpError(401))
      .mockRejectedValueOnce(abortError());
    const keys = await Groq.checkKeys(env);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/models');
    expect(keys).toEqual([
      { index: 0, masked: '…1111', ok: true, latencyMs: expect.any(Number), status: 200 },
      { index: 1, masked: '…2222', ok: false, latencyMs: expect.any(Number), status: 401 },
      { index: 2, masked: '…3333', ok: false, latencyMs: expect.any(Number), status: 'timeout' },
    ]);
    expect(env.HOT_CACHE.delete).toHaveBeenCalledWith('ai:key-cooldown:0');
    KEYS.forEach((k) => expect(JSON.stringify(keys)).not.toContain(k));
  });
});
