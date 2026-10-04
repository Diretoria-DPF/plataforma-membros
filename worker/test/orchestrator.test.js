/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
import { jest } from '@jest/globals';
import { complete, lookupCache } from '../src/ai/orchestrator.js';
import { __resetPoolStateForTests } from '../src/ai/groqClient.js';
import { __resetMetricsForTests } from '../src/ai/metrics.js';
import { __resetFlagCacheForTests } from '../src/services/featureFlagService.js';
import { AI_MESSAGES } from '../src/ai/errors.js';
import { routedSql, callsMatching, groqReply, httpError } from './helpers/aiTestUtils.js';
import { makeEnv } from './helpers/mockEnv.js';

const MEMBER = { profileId: '22222222-2222-4222-8222-222222222222', role: 'member' };
const REQ = { feature: 'lab_preceptor', messages: [{ role: 'user', content: 'pergunta' }], profileId: MEMBER.profileId };
const QUESTION = 'Qual é a diferença entre agonista e antagonista farmacológico?';

const flag = (key, enabled) => ({ key, enabled, rollout_pct: 100, conditions: {} });

function env(over) {
  return makeEnv(Object.assign({
    GROQ_API_KEYS: 'groq-key-1',
    NVIDIA_API_KEY: 'nv-key-1', NVIDIA_MODEL_FAST: 'vendor/fast', NVIDIA_MODEL_SMART: 'vendor/smart',
  }, over || {}));
}

/** Banco simulado. `flags` liga as flags; `tokens` é o uso das últimas 24 h; `cache` é o que o SELECT do cache devolve. */
function world({ flags = [flag('use_orchestrator', true)], tokens = 0, cache = [] } = {}) {
  return routedSql([
    ['FROM feature_flags', flags],
    ['FROM ai_usage_log', [{ tokens }]],
    ['FROM ai_semantic_cache', cache],
  ]);
}

function fetchByHost(handlers) {
  return jest.fn(async (url) => {
    const key = Object.keys(handlers).find((k) => String(url).includes(k));
    return handlers[key]();
  });
}

beforeEach(() => {
  __resetPoolStateForTests(0);
  __resetMetricsForTests();
  __resetFlagCacheForTests();
  global.fetch = fetchByHost({ groq: () => groqReply('Resposta do Groq') });
});

describe('flag desligada — caminho antigo intocado', () => {
  test('repassa direto ao Groq, sem cache, sem métricas e sem consultar o orçamento', async () => {
    const sql = world({ flags: [flag('use_orchestrator', false)] });
    const out = await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    expect(out.content).toBe('Resposta do Groq');
    expect(callsMatching(sql, 'ai_metrics_daily')).toHaveLength(0);
    expect(callsMatching(sql, 'ai_semantic_cache')).toHaveLength(0);
    expect(callsMatching(sql, 'FROM ai_usage_log')).toHaveLength(0);
  });

  test('antes da migração 016 (tabela de flags ausente) também é o caminho antigo', async () => {
    const sql = routedSql([['FROM feature_flags', Object.assign(new Error('relation "feature_flags" does not exist'), { code: '42P01' })]]);
    expect((await complete(sql, env(), MEMBER, REQ)).content).toBe('Resposta do Groq');
  });

  test('lookupCache devolve null e não toca no cache', async () => {
    const sql = world({ flags: [flag('use_orchestrator', false)] });
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toBeNull();
    expect(callsMatching(sql, 'ai_semantic_cache')).toHaveLength(0);
  });
});

describe('flag ligada — caminho feliz', () => {
  test('registra tokens, latência e o provedor nas métricas', async () => {
    const sql = world();
    const out = await complete(sql, env(), MEMBER, REQ);
    expect(out).toMatchObject({ content: 'Resposta do Groq', provider: 'groq', cached: false });
    const insert = callsMatching(sql, 'INSERT INTO ai_metrics_daily')[0];
    expect(insert).toEqual(expect.arrayContaining(['lab_preceptor', 'groq', 11, 22]));
  });

  test('com cacheQuestion guarda a resposta e conta o cache_miss', async () => {
    const sql = world();
    await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    const store = callsMatching(sql, 'INSERT INTO ai_semantic_cache');
    expect(store).toHaveLength(1);
    expect(store[0]).toContain('Resposta do Groq');
    expect(store[0]).not.toContain(QUESTION); // vai normalizada
  });

  test('resposta cortada pelo max_tokens NÃO vai para o cache', async () => {
    global.fetch = fetchByHost({ groq: () => groqReply('Cortada...', { finishReason: 'length' }) });
    const sql = world();
    await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    expect(callsMatching(sql, 'INSERT INTO ai_semantic_cache')).toHaveLength(0);
  });

  test('sem cacheQuestion (chat, avaliação, caso) nunca toca no cache', async () => {
    const sql = world();
    await complete(sql, env(), MEMBER, REQ);
    expect(callsMatching(sql, 'ai_semantic_cache')).toHaveLength(0);
  });

  test('conta os 429 das tentativas nas métricas', async () => {
    let n = 0;
    global.fetch = fetchByHost({ groq: () => (++n === 1 ? httpError(429) : groqReply('Segunda chave')) });
    const sql = world();
    const out = await complete(sql, env({ GROQ_API_KEYS: 'k1,k2' }), MEMBER, REQ);
    expect(out.content).toBe('Segunda chave');
    const insert = callsMatching(sql, 'INSERT INTO ai_metrics_daily')[0];
    expect(insert).toContain(1); // rate_limited
  });
});

describe('lookupCache (antes da cota)', () => {
  const hitRow = [{ id: '11111111-1111-4111-8111-111111111111', answer: 'Do cache', sim: 0.93 }];

  test('acerto devolve a resposta e registra cache_hit', async () => {
    const sql = world({ cache: hitRow });
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toEqual({ answer: 'Do cache', similarity: 0.93 });
    expect(callsMatching(sql, 'INSERT INTO ai_metrics_daily')).toHaveLength(1);
  });

  test('similaridade abaixo de 0,85 não conta', async () => {
    const sql = world({ cache: [{ id: '11111111-1111-4111-8111-111111111111', answer: 'Parecida', sim: 0.7 }] });
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toBeNull();
  });

  test('pergunta com dado pessoal nem chega a consultar o cache', async () => {
    const sql = world({ cache: hitRow });
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', 'meu email é ana@exemplo.com, qual a dose?')).toBeNull();
    expect(callsMatching(sql, 'ai_semantic_cache')).toHaveLength(0);
  });
});

describe('orçamento diário de tokens', () => {
  test('estourado: não chama o provedor e avisa que volta amanhã', async () => {
    const sql = world({ tokens: 450000 });
    await expect(complete(sql, env(), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true, message: AI_MESSAGES.BUDGET });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('estourado com pergunta parecida no cache: devolve a resposta aproximada, marcada', async () => {
    const sql = world({ tokens: 450000, cache: [{ id: '11111111-1111-4111-8111-111111111111', answer: 'Aproximada', sim: 0.6 }] });
    const out = await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    expect(out).toMatchObject({ content: 'Aproximada', cached: true, degraded: true, provider: 'cache' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('o teto vem de AI_DAILY_TOKEN_BUDGET quando definido', async () => {
    const sql = world({ tokens: 90000 });
    await expect(complete(sql, env({ AI_DAILY_TOKEN_BUDGET: '100000' }), MEMBER, REQ)).resolves.toMatchObject({ content: 'Resposta do Groq' });
    __resetMetricsForTests();
    await expect(complete(world({ tokens: 90000 }), env({ AI_DAILY_TOKEN_BUDGET: '80000' }), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true });
  });
});

describe('provedor indisponível', () => {
  const groqDown = () => httpError(503);

  test('Groq fora, sem NVIDIA ligada: erro padrão (a cota é devolvida pelo service)', async () => {
    global.fetch = fetchByHost({ groq: groqDown });
    await expect(complete(world(), env(), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true, message: AI_MESSAGES.UNAVAILABLE });
  });

  test('Groq fora, flag nvidia_fallback ligada e NVIDIA configurada: a NVIDIA responde', async () => {
    global.fetch = fetchByHost({ groq: groqDown, nvidia: () => groqReply('Resposta da NVIDIA') });
    const sql = world({ flags: [flag('use_orchestrator', true), flag('nvidia_fallback', true)] });
    const out = await complete(sql, env(), MEMBER, REQ);
    expect(out).toMatchObject({ content: 'Resposta da NVIDIA', provider: 'nvidia' });
    expect(callsMatching(sql, 'INSERT INTO ai_metrics_daily')[0]).toContain('nvidia');
  });

  test('flag nvidia_fallback DESLIGADA: não usa a NVIDIA mesmo configurada', async () => {
    global.fetch = fetchByHost({ groq: groqDown, nvidia: () => groqReply('não deveria') });
    await expect(complete(world(), env(), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true });
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('nvidia'))).toBe(false);
  });

  test('flag ligada mas NVIDIA sem chave ou sem modelo: ignora a reserva', async () => {
    global.fetch = fetchByHost({ groq: groqDown, nvidia: () => groqReply('não deveria') });
    const flags = [flag('use_orchestrator', true), flag('nvidia_fallback', true)];
    await expect(complete(world({ flags }), env({ NVIDIA_API_KEY: '' }), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true });
    await expect(complete(world({ flags }), env({ NVIDIA_MODEL_FAST: '', NVIDIA_MODEL_SMART: '' }), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true });
  });

  test('Groq e NVIDIA fora: erro do Groq, e a resposta aproximada do cache quando existe', async () => {
    global.fetch = fetchByHost({ groq: groqDown, nvidia: groqDown });
    const flags = [flag('use_orchestrator', true), flag('nvidia_fallback', true)];
    await expect(complete(world({ flags }), env(), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true });
    const cache = [{ id: '11111111-1111-4111-8111-111111111111', answer: 'Aproximada', sim: 0.6 }];
    const out = await complete(world({ flags, cache }), env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    expect(out).toMatchObject({ content: 'Aproximada', degraded: true });
  });

  test('saída inválida do provedor NÃO vira cache nem reserva (o erro sobe)', async () => {
    global.fetch = fetchByHost({ groq: () => groqReply('   ') });
    await expect(complete(world(), env(), MEMBER, REQ, { cacheQuestion: QUESTION })).rejects.toMatchObject({ aiInvalidOutput: true });
  });

  test('falha também aparece nas métricas (chamada não-ok)', async () => {
    global.fetch = fetchByHost({ groq: groqDown });
    const sql = world();
    await expect(complete(sql, env(), MEMBER, REQ)).rejects.toBeTruthy();
    expect(callsMatching(sql, 'INSERT INTO ai_metrics_daily')).toHaveLength(1);
  });
});
