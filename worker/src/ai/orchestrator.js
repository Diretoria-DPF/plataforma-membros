/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/orchestrator.js
 * Porta única das chamadas de IA dos services. Com a flag `use_orchestrator`
 * DESLIGADA (padrão) é só um repasse para o Groq — o comportamento anterior,
 * intocado. Ligada, aplica as camadas da Fase 3, SEM usar um LLM para decidir
 * rota (isso gastaria a própria cota):
 *
 *   1. orçamento de tokens/dia: passou do teto, não chama o provedor;
 *   2. cache semântico (antes da cota, em lookupCache; aqui só o fallback);
 *   3. Groq (modelo rápido/inteligente por recurso, regra em ai/config.js);
 *   4. NVIDIA como reserva, se a flag `nvidia_fallback` estiver ligada e o
 *      provedor configurado;
 *   5. último recurso: resposta aproximada do cache (marcada `degraded`).
 *
 * Cada chamada alimenta ai_metrics_daily. Erros de IA têm texto fixo
 * (ai/errors.js): nada do provedor chega à pessoa.
 */
import * as C from '../constants.js';
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

export function orchestratorEnabled(sql, identity) {
  return isEnabled(sql, FLAG_ORCHESTRATOR, identity);
}

/**
 * Consulta o cache ANTES de consumir cota: acerto não chama a IA, então não
 * custa nada à pessoa. Devolve { answer, similarity } ou null.
 */
export async function lookupCache(sql, env, identity, feature, question) {
  if (!(await orchestratorEnabled(sql, identity))) return null;
  if (!Cache.isCacheable(question)) return null;
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

async function staleFallback(sql, req, opts) {
  if (!opts.cacheQuestion) return null;
  const hit = await Cache.lookup(sql, req.feature, opts.cacheQuestion, C.AI_CACHE.STALE_SIMILARITY, { allowExpired: true });
  if (!hit) return null;
  await Metrics.recordCall(sql, { feature: req.feature, model: 'cache', provider: 'cache', ok: true, cacheHit: true });
  return { content: hit.answer, model: 'cache', provider: 'cache', keyIndex: null, usage: {}, latencyMs: 0, finishReason: 'stop', cached: true, degraded: true };
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
  const model = resolveModel(env, FEATURE_CONFIG[feature].tier);

  // 1. Orçamento diário de tokens.
  const budget = await Metrics.budgetStatus(sql, env);
  if (budget.exceeded) {
    const stale = await staleFallback(sql, req, options);
    if (stale) return stale;
    await Metrics.recordCall(sql, { feature, model, provider: 'groq', ok: false, cacheMiss: !!options.cacheQuestion });
    throw AiUnavailableError(AI_MESSAGES.BUDGET);
  }

  // 3/4. Groq e, se preciso, NVIDIA.
  const seen = { rateLimited: 0 };
  const observer = (event) => { if (event.status === 429) seen.rateLimited += 1; };
  const tracked = Object.assign({}, req, { observer });

  let result = null;
  let failure = null;
  try {
    result = await Groq.complete(env, sql, tracked);
  } catch (err) {
    failure = err;
    if (err && err.aiUnavailable && nvidiaReady(env, feature) && (await isEnabled(sql, FLAG_NVIDIA_FALLBACK, identity))) {
      try {
        result = await Pool.complete(nvidiaProvider, env, sql, tracked);
        failure = null;
      } catch (nvidiaErr) {
        // Mantém o erro do Groq: é o provedor principal e a mensagem é a mesma.
      }
    }
  }

  if (!result) {
    await Metrics.recordCall(sql, { feature, model, provider: 'groq', ok: false, rateLimited: seen.rateLimited, cacheMiss: !!options.cacheQuestion });
    if (failure && failure.aiUnavailable) {
      const stale = await staleFallback(sql, req, options);
      if (stale) return stale;
    }
    throw failure;
  }

  const provider = result.provider || 'groq';
  const usage = result.usage || {};
  const tokensIn = Number(usage.prompt_tokens) || 0;
  const tokensOut = Number(usage.completion_tokens) || 0;
  if (provider === 'groq') Metrics.noteTokens(tokensIn + tokensOut);
  await Metrics.recordCall(sql, {
    feature, model: result.model, provider, ok: true, rateLimited: seen.rateLimited,
    tokensIn, tokensOut, latencyMs: result.latencyMs, cacheMiss: !!options.cacheQuestion,
  });

  // Resposta cortada pelo max_tokens não vai para o cache (seria servida cortada por 7 dias).
  if (options.cacheQuestion && result.finishReason !== 'length') {
    await Cache.store(sql, feature, options.cacheQuestion, result.content);
  }
  return Object.assign({}, result, { provider, cached: false });
}
