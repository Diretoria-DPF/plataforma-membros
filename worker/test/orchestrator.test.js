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
import { normalizeQuestion } from '../src/ai/semanticCache.js';
import { routedSql, callsMatching, groqReply, httpError } from './helpers/aiTestUtils.js';
import { makeEnv } from './helpers/mockEnv.js';

const MEMBER = { profileId: '22222222-2222-4222-8222-222222222222', role: 'member' };
const REQ = { feature: 'lab_preceptor', messages: [{ role: 'user', content: 'pergunta' }], profileId: MEMBER.profileId };
const QUESTION = 'Qual é a diferença entre agonista e antagonista farmacológico?';
const ID = '11111111-1111-4111-8111-111111111111';
// Linha do cache como o banco devolve: a guarda de sentido compara `question_norm`.
const cacheRow = (answer, sim) => [{ id: ID, answer, sim, question_norm: normalizeQuestion(QUESTION) }];

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
    // Parâmetros do UPSERT: 1 recurso, 2 modelo, 3 provedor, 4 chamadas, 5 ok, 6 429, 7 tokens_in, 8 tokens_out, 9 hits, 10 misses.
    expect([insert[1], insert[3], insert[4], insert[5], insert[6], insert[7], insert[8]]).toEqual(['lab_preceptor', 'groq', 1, 1, 0, 11, 22]);
  });

  test('com cacheQuestion guarda a resposta e conta o cache_miss', async () => {
    const sql = world();
    await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    const store = callsMatching(sql, 'INSERT INTO ai_semantic_cache');
    expect(store).toHaveLength(1);
    expect(store[0]).toContain('Resposta do Groq');
    expect(store[0]).not.toContain(QUESTION); // vai normalizada
    expect(store[0]).toContain(normalizeQuestion(QUESTION));
    const metrics = callsMatching(sql, 'INSERT INTO ai_metrics_daily')[0];
    expect(metrics[10]).toBe(1); // cache_misses
    expect(metrics[9]).toBe(0);  // cache_hits
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
    expect(insert[6]).toBe(1); // rate_limited: um 429 da primeira chave
    expect(insert[4]).toBe(1); // mas é UMA chamada
  });
});

describe('lookupCache (antes da cota)', () => {
  const hitRow = cacheRow('Do cache', 0.93);

  test('acerto devolve a resposta e registra cache_hit', async () => {
    const sql = world({ cache: hitRow });
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toEqual({ answer: 'Do cache', similarity: 0.93 });
    const metrics = callsMatching(sql, 'INSERT INTO ai_metrics_daily');
    expect(metrics).toHaveLength(1);
    expect([metrics[0][3], metrics[0][4], metrics[0][9]]).toEqual(['cache', 0, 1]); // provedor cache, 0 chamadas, 1 hit
  });

  test('similaridade abaixo de 0,85 não conta', async () => {
    const sql = world({ cache: cacheRow('Parecida', 0.7) });
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toBeNull();
  });

  test('linha com sentido diferente (negação) não vale mesmo com similaridade alta', async () => {
    const opposite = [{ id: ID, answer: 'Oposta', sim: 0.97, question_norm: normalizeQuestion('Qual NÃO é a diferença entre agonista e antagonista farmacológico?') }];
    expect(await lookupCache(world({ cache: opposite }), env(), MEMBER, 'lab_preceptor', QUESTION)).toBeNull();
  });

  test('o limite de consultas ao cache é por pessoa: passou, segue sem cache (sem erro)', async () => {
    const sql = routedSql([
      ['FROM feature_flags', [flag('use_orchestrator', true)]],
      ['INSERT INTO rate_limit_buckets', (values) => [{ attempts: values[0] === 'AI_CACHE_LOOKUP' ? 121 : 1 }]],
      ['FROM ai_semantic_cache', hitRow],
    ]);
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toBeNull();
    expect(callsMatching(sql, 'FROM ai_semantic_cache')).toHaveLength(0);
  });

  test('flag ilegível (banco instável) = caminho antigo, nunca erro', async () => {
    const sql = routedSql([['FROM feature_flags', new Error('connection reset')]]);
    expect(await lookupCache(sql, env(), MEMBER, 'lab_preceptor', QUESTION)).toBeNull();
    expect((await complete(sql, env(), MEMBER, REQ)).content).toBe('Resposta do Groq');
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
    const sql = world({ tokens: 450000, cache: cacheRow('Aproximada', 0.9) });
    const out = await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    expect(out).toMatchObject({ content: 'Aproximada', cached: true, degraded: true, provider: 'cache' });
    expect(global.fetch).not.toHaveBeenCalled();
    // Só o acerto de cache entra nas métricas: o provedor não foi chamado.
    const metrics = callsMatching(sql, 'INSERT INTO ai_metrics_daily');
    expect(metrics).toHaveLength(1);
    expect([metrics[0][3], metrics[0][4], metrics[0][9], metrics[0][10]]).toEqual(['cache', 0, 1, 0]);
  });

  test('estourado SEM cache nem reserva: nenhuma chamada é registrada (não houve chamada ao provedor)', async () => {
    const sql = world({ tokens: 450000 });
    await expect(complete(sql, env(), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true });
    expect(callsMatching(sql, 'INSERT INTO ai_metrics_daily')).toHaveLength(0);
  });

  test('estourado com a reserva NVIDIA ligada e configurada: a NVIDIA atende (o orçamento é do Groq)', async () => {
    global.fetch = fetchByHost({ groq: () => groqReply('não deveria'), nvidia: () => groqReply('Resposta da NVIDIA') });
    const flags = [flag('use_orchestrator', true), flag('nvidia_fallback', true)];
    const out = await complete(world({ flags, tokens: 450000 }), env(), MEMBER, REQ);
    expect(out).toMatchObject({ content: 'Resposta da NVIDIA', provider: 'nvidia' });
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('groq'))).toBe(false);
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
    const cache = cacheRow('Aproximada', 0.9);
    const out = await complete(world({ flags, cache }), env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    expect(out).toMatchObject({ content: 'Aproximada', degraded: true });
  });

  test('a flag da reserva ilegível não troca o erro do Groq por um erro de banco', async () => {
    global.fetch = fetchByHost({ groq: groqDown, nvidia: () => groqReply('não deveria') });
    const sql = routedSql([
      ['FROM feature_flags', (_v, text) => [flag('use_orchestrator', true)]],
      ['FROM ai_usage_log', [{ tokens: 0 }]],
    ]);
    await expect(complete(sql, env(), MEMBER, REQ)).rejects.toMatchObject({ aiUnavailable: true, message: AI_MESSAGES.UNAVAILABLE });
  });

  test('resposta aproximada não é contada como cache_miss, só como hit', async () => {
    global.fetch = fetchByHost({ groq: groqDown });
    const sql = world({ cache: cacheRow('Aproximada', 0.9) });
    await complete(sql, env(), MEMBER, REQ, { cacheQuestion: QUESTION });
    const rows = callsMatching(sql, 'INSERT INTO ai_metrics_daily');
    const miss = rows.filter((r) => r[10] === 1);
    expect(miss).toHaveLength(0);
  });

  test('saída inválida do provedor NÃO vira cache nem reserva (o erro sobe)', async () => {
    global.fetch = fetchByHost({ groq: () => groqReply('   ') });
    await expect(complete(world(), env(), MEMBER, REQ, { cacheQuestion: QUESTION })).rejects.toMatchObject({ aiInvalidOutput: true });
  });

  test('falha também aparece nas métricas (chamada não-ok)', async () => {
    global.fetch = fetchByHost({ groq: groqDown });
    const sql = world();
    await expect(complete(sql, env(), MEMBER, REQ)).rejects.toBeTruthy();
    const rows = callsMatching(sql, 'INSERT INTO ai_metrics_daily');
    expect(rows).toHaveLength(1);
    expect([rows[0][4], rows[0][5]]).toEqual([1, 0]); // uma chamada, nenhuma com sucesso
  });
});
