/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/orchestrator.js
 * Porta única das chamadas de IA dos services. Com a flag `use_orchestrator`
 * DESLIGADA (padrão) é só um repasse para o Groq — o comportamento anterior,
 * intocado (e qualquer falha ao ler a flag também cai nele). Ligada, aplica as
 * camadas da Fase 3, SEM usar um LLM para decidir rota (isso gastaria a
 * própria cota):
 *
 *   1. cache semântico (antes da cota, em lookupCache);
 *   2. orçamento de tokens/dia do Groq: estourado, o Groq não é chamado;
 *   3. Groq (modelo rápido/inteligente por recurso, regra em ai/config.js);
 *   4. NVIDIA como reserva se o Groq está fora OU o orçamento acabou, quando
 *      a flag `nvidia_fallback` está ligada e o provedor configurado (o
 *      orçamento é do Groq: a NVIDIA não entra nele);
 *   5. último recurso: resposta aproximada do cache (marcada `degraded`).
 *
 * Cada chamada alimenta ai_metrics_daily. Erros de IA têm texto fixo
 * (ai/errors.js): nada do provedor chega à pessoa.
 */
import * as C from '../constants.js';
import { enforceRateLimit } from '../security.js';
import * as Groq from './groqClient.js';
import * as Pool from './providers/poolClient.js';
import { nvidiaProvider } from './providers/nvidia.js';
import { FEATURE_CONFIG, resolveModel } from './config.js';
import { AiUnavailableError, AI_MESSAGES } from './errors.js';
import * as Cache from './semanticCache.js';
import * as Metrics from './metrics.js';
import { isEnabled } from '../services/featureFlagService.js';

export const FLAG_ORCHESTRATOR = 'use_orchestrator';
export const FLAG_NVIDIA_FALLBACK = 'nvidia_fallback';

/** Qualquer falha ao ler a flag cai no caminho antigo: a IA nunca depende do orquestrador para funcionar. */
export async function orchestratorEnabled(sql, identity) {
  try {
    return await isEnabled(sql, FLAG_ORCHESTRATOR, identity);
  } catch (err) {
    return false;
  }
}

/**
 * Consulta o cache ANTES de consumir cota: acerto não chama a IA, então não
 * custa nada à pessoa. Devolve { answer, similarity } ou null. As consultas têm
 * limite próprio por pessoa (acerto não gasta cota, então não pode ser martelado);
 * passou do limite, segue sem cache — pelo caminho normal, com cota.
 */
export async function lookupCache(sql, env, identity, feature, question) {
  if (!(await orchestratorEnabled(sql, identity))) return null;
  if (!Cache.isCacheable(question)) return null;
  try {
    const limit = C.RATE_LIMITS.AI_CACHE_LOOKUP;
    await enforceRateLimit(sql, 'AI_CACHE_LOOKUP', identity.profileId, limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') return null;
    throw err;
  }
  const hit = await Cache.lookup(sql, feature, question, C.AI_CACHE.SIMILARITY);
  if (hit) {
    await Metrics.recordCall(sql, { feature, model: 'cache', provider: 'cache', ok: true, cacheHit: true });
    return { answer: hit.answer, similarity: hit.similarity };
  }
  return null;
}

function nvidiaReady(env, feature) {
  const cfg = FEATURE_CONFIG[feature];
  return Pool.parseKeys(nvidiaProvider, env).length > 0 && !!nvidiaProvider.resolveModel(env, cfg && cfg.tier);
}

/** NVIDIA como reserva; qualquer problema aqui vira "sem reserva" (o erro do Groq é o que sobe). */
async function tryNvidia(sql, env, identity, req, feature) {
  try {
    if (!nvidiaReady(env, feature) || !(await isEnabled(sql, FLAG_NVIDIA_FALLBACK, identity))) return null;
    return await Pool.complete(nvidiaProvider, env, sql, req);
  } catch (err) {
    return null;
  }
}

async function staleFallback(sql, req, opts) {
  if (!opts.cacheQuestion) return null;
  const hit = await Cache.lookup(sql, req.feature, opts.cacheQuestion, C.AI_CACHE.STALE_SIMILARITY, { allowExpired: true });
  if (!hit) return null;
  await Metrics.recordCall(sql, { feature: req.feature, model: 'cache', provider: 'cache', ok: true, cacheHit: true });
  return { content: hit.answer, model: 'cache', provider: 'cache', keyIndex: null, usage: {}, latencyMs: 0, finishReason: 'stop', cached: true, degraded: true };
}

async function recordSuccess(sql, req, opts, result, rateLimited) {
  const provider = result.provider || 'groq';
  const usage = result.usage || {};
  const tokensIn = Number(usage.prompt_tokens) || 0;
  const tokensOut = Number(usage.completion_tokens) || 0;
  if (provider === 'groq') Metrics.noteTokens(tokensIn + tokensOut);
  await Metrics.recordCall(sql, {
    feature: req.feature, model: result.model, provider, ok: true, rateLimited,
    tokensIn, tokensOut, latencyMs: result.latencyMs, cacheMiss: !!opts.cacheQuestion,
  });
  // Resposta cortada pelo max_tokens não vai para o cache (seria servida cortada por 7 dias).
  if (opts.cacheQuestion && result.finishReason !== 'length') {
    await Cache.store(sql, req.feature, opts.cacheQuestion, result.content);
  }
  return Object.assign({}, result, { provider, cached: false });
}

/**
 * @param {object} req  { feature, messages, profileId }
 * @param {object} [opts]  { cacheQuestion } — pergunta genérica a guardar/recuperar no cache semântico
 * @returns {Promise<{content, model, provider, usage, latencyMs, finishReason, cached?, degraded?}>}
 * @throws AiUnavailableError | AiInvalidOutputError (mesmos do Groq)
 */
export async function complete(sql, env, identity, req, opts) {
  const options = opts || {};
  if (!(await orchestratorEnabled(sql, identity))) return Groq.complete(env, sql, req);

  const feature = req.feature;
  const seen = { rateLimited: 0 };
  const tracked = Object.assign({}, req, { observer: (event) => { if (event.status === 429) seen.rateLimited += 1; } });

  // 2/3. Orçamento do Groq e, havendo espaço, a chamada.
  const budget = await Metrics.budgetStatus(sql, env);
  let result = null;
  let failure = null;
  if (budget.exceeded) {
    failure = AiUnavailableError(AI_MESSAGES.BUDGET);
  } else {
    try {
      result = await Groq.complete(env, sql, tracked);
    } catch (err) {
      failure = err;
    }
  }

  // 4. Reserva: só quando o problema é de disponibilidade (não de saída inválida).
  if (!result && failure && failure.aiUnavailable) result = await tryNvidia(sql, env, identity, tracked, feature);
  if (result) return recordSuccess(sql, req, options, result, seen.rateLimited);

  // 5. Último recurso e erro. Orçamento estourado não é chamada ao provedor: não entra em `calls`.
  const stale = failure && failure.aiUnavailable ? await staleFallback(sql, req, options) : null;
  if (!budget.exceeded) {
    await Metrics.recordCall(sql, {
      feature, model: resolveModel(env, FEATURE_CONFIG[feature].tier), provider: 'groq', ok: false,
      rateLimited: seen.rateLimited, cacheMiss: !!options.cacheQuestion && !stale,
    });
  }
  if (stale) return stale;
  throw failure;
}
