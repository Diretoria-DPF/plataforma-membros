/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jest } from '@jest/globals';
import * as Pool from '../src/ai/providers/poolClient.js';
import { groqProvider } from '../src/ai/providers/groq.js';
import { nvidiaProvider } from '../src/ai/providers/nvidia.js';
import { makeEnv } from './helpers/mockEnv.js';
import { routedSql, callsMatching, groqReply, httpError, memoryKv, KEYS } from './helpers/aiTestUtils.js';

const MESSAGES = [{ role: 'system', content: 'x' }, { role: 'user', content: 'oi' }];
const NV_KEY = 'nvapi-test-key-number-one-ZZZZ9999';

function nvidiaEnv(overrides) {
  return makeEnv(Object.assign({
    NVIDIA_API_KEY: NV_KEY,
    NVIDIA_MODEL_FAST: 'vendor/fast-model',
    NVIDIA_MODEL_SMART: 'vendor/smart-model',
    HOT_CACHE: memoryKv(),
  }, overrides || {}));
}

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = jest.fn();
  Pool.__resetPoolStateForTests(0);
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('descritores de provedor', () => {
  test('cada provedor tem URL, secret e prefixo de cooldown próprios', () => {
    expect(groqProvider).toMatchObject({
      name: 'groq', keysEnvName: 'GROQ_API_KEYS',
      chatUrl: 'https://api.groq.com/openai/v1/chat/completions',
      modelsUrl: 'https://api.groq.com/openai/v1/models',
    });
    expect(nvidiaProvider).toMatchObject({
      name: 'nvidia', keysEnvName: 'NVIDIA_API_KEY',
      chatUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
      modelsUrl: 'https://integrate.api.nvidia.com/v1/models',
    });
    expect(groqProvider.cooldownPrefix).not.toBe(nvidiaProvider.cooldownPrefix);
    expect(groqProvider.cooldownPrefix).toBe('ai:key-cooldown:'); // compatível com o que já está no KV
  });

  test('NVIDIA não tem modelo embutido no código: vem de NVIDIA_MODEL_FAST/SMART', () => {
    expect(nvidiaProvider.resolveModel({}, 'fast')).toBe('');
    expect(nvidiaProvider.resolveModel({ NVIDIA_MODEL_FAST: ' a/b ', NVIDIA_MODEL_SMART: 'c/d' }, 'fast')).toBe('a/b');
    expect(nvidiaProvider.resolveModel({ NVIDIA_MODEL_FAST: 'a/b', NVIDIA_MODEL_SMART: 'c/d' }, 'smart')).toBe('c/d');
  });
});

describe('migrações x provedores', () => {
  test('todo provedor declarado cabe no CHECK de ai_usage_log.provider (senão o log falha em silêncio)', () => {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'sql');
    const sqlText = fs.readdirSync(dir).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort()
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const checks = [...sqlText.matchAll(/ai_usage_log_provider_chk\s+CHECK\s*\(\s*provider\s+IN\s*\(([^)]*)\)/g)];
    expect(checks.length).toBeGreaterThan(0);
    const allowed = checks[checks.length - 1][1].split(',').map((s) => s.trim().replace(/'/g, ''));
    for (const provider of [groqProvider, nvidiaProvider]) {
      expect(allowed).toContain(provider.name);
    }
  });
});

describe('poolClient com o provedor NVIDIA', () => {
  test('chama a URL da NVIDIA com a chave dela e o modelo configurado por nível', async () => {
    globalThis.fetch.mockResolvedValue(groqReply('{}'));
    const env = nvidiaEnv();
    await Pool.complete(nvidiaProvider, env, null, { feature: 'chat', messages: MESSAGES });
    await Pool.complete(nvidiaProvider, env, null, { feature: 'evaluate', messages: MESSAGES });
    const [chatCall, evalCall] = globalThis.fetch.mock.calls;
    expect(chatCall[0]).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(chatCall[1].headers.Authorization).toBe('Bearer ' + NV_KEY);
    const chatBody = JSON.parse(chatCall[1].body);
    const evalBody = JSON.parse(evalCall[1].body);
    expect(chatBody.model).toBe('vendor/fast-model');
    expect(evalBody).toMatchObject({ model: 'vendor/smart-model', response_format: { type: 'json_object' } });
    // Parâmetros da família gpt-oss não vão para outro provedor (evita 400).
    expect(chatBody.reasoning_effort).toBeUndefined();
    expect(chatBody.include_reasoning).toBeUndefined();
  });

  test('sem NVIDIA_API_KEY: erro esperado de "não configurada", sem chamar a rede', async () => {
    const env = nvidiaEnv({ NVIDIA_API_KEY: '' });
    await expect(Pool.complete(nvidiaProvider, env, null, { feature: 'chat', messages: MESSAGES })).rejects.toMatchObject({
      expected: true, aiUnavailable: true, message: expect.stringContaining('não foi configurada'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('com chave mas sem modelo configurado: não adivinha um ID, não chama a rede', async () => {
    const env = nvidiaEnv({ NVIDIA_MODEL_FAST: '', NVIDIA_MODEL_SMART: '' });
    await expect(Pool.complete(nvidiaProvider, env, null, { feature: 'chat', messages: MESSAGES })).rejects.toMatchObject({
      aiUnavailable: true, message: expect.stringContaining('não foi configurada'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('429 vira erro genérico e o cooldown usa o prefixo da NVIDIA, sem tocar o do Groq', async () => {
    globalThis.fetch.mockResolvedValueOnce(httpError(429, { 'retry-after': '120' }));
    const env = nvidiaEnv();
    const err = await Pool.complete(nvidiaProvider, env, null, { feature: 'chat', messages: MESSAGES }).catch((e) => e);
    expect(err).toMatchObject({ expected: true, aiUnavailable: true });
    expect(env.HOT_CACHE.put).toHaveBeenCalledWith('ai:key-cooldown:nvidia:0', expect.any(String), { expirationTtl: 120 });
    expect(env.HOT_CACHE.put).not.toHaveBeenCalledWith('ai:key-cooldown:0', expect.anything(), expect.anything());
    expect(JSON.stringify({ m: err.message, s: err.stack })).not.toContain(NV_KEY);
  });

  test('cooldown do Groq na chave 0 não impede a chave 0 da NVIDIA', async () => {
    const env = nvidiaEnv();
    await env.HOT_CACHE.put('ai:key-cooldown:0', JSON.stringify({ until: Date.now() + 60000 }));
    globalThis.fetch.mockResolvedValue(groqReply('ok'));
    const out = await Pool.complete(nvidiaProvider, env, null, { feature: 'chat', messages: MESSAGES });
    expect(out.keyIndex).toBe(0);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('ai_usage_log da NVIDIA leva a coluna provider; o do Groq continua com o INSERT de sempre', async () => {
    const sql = routedSql([]);
    globalThis.fetch.mockResolvedValue(groqReply('ok'));
    await Pool.complete(nvidiaProvider, nvidiaEnv(), sql, { feature: 'chat', messages: MESSAGES, profileId: 'p1' });
    await Pool.complete(groqProvider, makeEnv({ GROQ_API_KEYS: KEYS[0], HOT_CACHE: memoryKv() }), sql, { feature: 'chat', messages: MESSAGES, profileId: 'p1' });
    const logs = callsMatching(sql, 'INSERT INTO ai_usage_log');
    expect(logs).toHaveLength(2);
    expect(logs[0][0].join('?')).toMatch(/provider/);
    expect(logs[0].slice(1)).toEqual(['p1', 'chat', 'vendor/fast-model', 0, 11, 22, expect.any(Number), true, 'nvidia']);
    // O Groq não menciona a coluna: continua funcionando antes e depois da migração 015.
    expect(logs[1][0].join('?')).not.toMatch(/provider/);
    expect(logs[1].slice(1)).toEqual(['p1', 'chat', 'openai/gpt-oss-20b', 0, 11, 22, expect.any(Number), true]);
  });

  test('checkKeys consulta o /models da NVIDIA e devolve só dados mascarados', async () => {
    globalThis.fetch.mockResolvedValueOnce(httpError(200));
    const keys = await Pool.checkKeys(nvidiaProvider, nvidiaEnv());
    expect(globalThis.fetch.mock.calls[0][0]).toBe('https://integrate.api.nvidia.com/v1/models');
    expect(globalThis.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer ' + NV_KEY);
    expect(keys).toEqual([{ index: 0, masked: '…9999', ok: true, latencyMs: expect.any(Number), status: 200 }]);
    expect(JSON.stringify(keys)).not.toContain(NV_KEY);
  });
});
