/**
 * aiService.js
 * Fase 3 — IA na Worker (docs/FASE_3_IA_CLINICA.md). Três responsabilidades:
 *  1) Cotas: cota diária por pessoa, por recurso e papel (AI_QUOTAS), mais
 *     o disjuntor global de custo (AI_GLOBAL_DAILY_MAX). Usado também por
 *     clinicalService.js via withQuota().
 *  2) Preceptor do laboratório (apiLearnLabPreceptor), com cache de síntese
 *     que SÓ o servidor grava.
 *  3) Consulta da própria cota e saúde do pool de chaves (admin).
 *
 * A identidade sempre vem da sessão (runWithSession); nenhum endpoint aceita
 * profileId/e-mail do cliente.
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import { getCached, setCached } from '../cache.js';
import * as Groq from '../ai/groqClient.js';
import { resolveModel } from '../ai/config.js';
import { QuotaExceededError, AiInvalidOutputError, AI_MESSAGES } from '../ai/errors.js';
import { buildLabMessages, buildLabSynthesisMessages } from '../ai/prompts.js';
import { cleanText, cleanReply, sanitizeHistory, normalizeSynthTerm, byteLength } from '../ai/validators.js';

export const QUOTA_BUCKETS = {
  chat: 'AI_CHAT',
  evaluate: 'AI_EVALUATE',
  generate_case: 'AI_GENERATE_CASE',
  lab_preceptor: 'AI_LAB_PRECEPTOR',
};
export const GLOBAL_BUCKET = 'AI_GLOBAL';
const GLOBAL_IDENTIFIER = 'global';

const QUOTA_LABELS = {
  chat: 'perguntas ao paciente virtual',
  evaluate: 'avaliações do preceptor',
  generate_case: 'casos gerados com IA',
  lab_preceptor: 'perguntas ao preceptor do laboratório',
};

// 30 dias: uma rota de síntese didática não muda; o cache existe para não
// gastar tokens de novo com a mesma pergunta de outra pessoa.
export const LAB_SYNTH_TTL_SECONDS = 30 * 86400;
export function labSynthCacheKey(term) {
  return 'ai:lab-synth:' + term;
}

export function asObject(input) {
  return input && typeof input === 'object' && !Array.isArray(input) ? input : {};
}

export function quotaLimit(role, feature) {
  const table = C.AI_QUOTAS[feature];
  if (!table) return 0;
  return table[role] !== undefined ? table[role] : table.visitor;
}

/**
 * Mesmo hash de security.js (sha256Hex(normalizeText(id).toLowerCase())),
 * que não é exportado de lá. Precisa ficar idêntico para a leitura da cota
 * (getMyQuota) e a devolução (refundQuota) acharem a linha que
 * enforceRateLimit gravou — há um teste que garante isso.
 */
export async function identifierHash(identifier) {
  const data = new TextEncoder().encode(S.normalizeText(identifier).toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Consome 1 da cota da pessoa e 1 do disjuntor global. Estourou → lança
 * QuotaExceededError com mensagem clara (não a genérica "Muitas
 * tentativas" do rate limit de login).
 */
export async function consumeQuota(sql, identity, feature) {
  const limit = quotaLimit(identity.role, feature);
  try {
    await S.enforceRateLimit(sql, QUOTA_BUCKETS[feature], identity.profileId, limit, C.AI_QUOTA_WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') {
      throw QuotaExceededError('Você atingiu o limite diário de ' + limit + ' ' + QUOTA_LABELS[feature] + '; a cota volta amanhã.');
    }
    throw err;
  }
  try {
    await S.enforceRateLimit(sql, GLOBAL_BUCKET, GLOBAL_IDENTIFIER, C.AI_GLOBAL_DAILY_MAX, C.AI_QUOTA_WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') {
      // A chamada não vai acontecer: não faz sentido cobrar da pessoa.
      await refundBucket(sql, QUOTA_BUCKETS[feature], identity.profileId);
      throw QuotaExceededError('A IA da plataforma atingiu o limite diário de uso de toda a liga; volta amanhã.');
    }
    throw err;
  }
}

async function refundBucket(sql, bucket, identifier) {
  try {
    const hash = await identifierHash(identifier);
    await sql`UPDATE rate_limit_buckets SET attempts = GREATEST(attempts - 1, 0) WHERE bucket = ${bucket} AND identifier_hash = ${hash}`;
  } catch (err) {
    // Devolver cota é cortesia; se falhar, a pessoa só perde 1 unidade.
  }
}

/** Devolve a unidade consumida quando NENHUMA chave respondeu (não houve custo real de tokens). */
export async function refundQuota(sql, identity, feature) {
  await refundBucket(sql, QUOTA_BUCKETS[feature], identity.profileId);
  await refundBucket(sql, GLOBAL_BUCKET, GLOBAL_IDENTIFIER);
}

/**
 * Envolve uma chamada de IA com a cota: consome antes; se estourar, devolve
 * `{ success:false, quotaExceeded:true, message }` (o front-end usa a flag
 * para desabilitar o botão com elegância em vez de mostrar erro); se o pool
 * inteiro falhar, devolve a unidade e relança o erro esperado.
 */
export async function withQuota(sql, identity, feature, fn) {
  try {
    await consumeQuota(sql, identity, feature);
  } catch (err) {
    if (err && err.quotaExceeded) return { success: false, quotaExceeded: true, message: err.message };
    throw err;
  }
  try {
    return await fn();
  } catch (err) {
    if (err && err.aiUnavailable) await refundQuota(sql, identity, feature);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// apiLearnGetMyAiQuota
// ---------------------------------------------------------------------------
export async function getMyQuota(sql, env, identity) {
  const hash = await identifierHash(identity.profileId);
  const buckets = Object.values(QUOTA_BUCKETS);
  const rows = await sql`
    SELECT bucket, attempts,
           (window_started_at >= now() - (${C.AI_QUOTA_WINDOW_SECONDS} || ' seconds')::interval) AS active,
           window_started_at + (${C.AI_QUOTA_WINDOW_SECONDS} || ' seconds')::interval AS resets_at
    FROM rate_limit_buckets
    WHERE identifier_hash = ${hash} AND bucket = ANY(${buckets})
  `;
  const byBucket = {};
  (rows || []).forEach((r) => { byBucket[r.bucket] = r; });

  function entry(feature) {
    const limit = quotaLimit(identity.role, feature);
    const row = byBucket[QUOTA_BUCKETS[feature]];
    const used = row && row.active ? Math.min(limit, Number(row.attempts) || 0) : 0;
    return { used, limit, remaining: Math.max(0, limit - used), resetsAt: row && row.active ? row.resets_at : null };
  }

  return {
    success: true,
    aiConfigured: Groq.parseKeys(env).length > 0,
    quotas: {
      chat: entry('chat'),
      evaluate: entry('evaluate'),
      generateCase: entry('generate_case'),
      labPreceptor: entry('lab_preceptor'),
    },
  };
}

// ---------------------------------------------------------------------------
// apiLearnLabPreceptor
// ---------------------------------------------------------------------------
export async function askLabPreceptor(sql, env, identity, rawInput) {
  const input = asObject(rawInput);
  const question = cleanText(input.question);
  if (!question) throw E.ValidationError('Escreva sua dúvida para o preceptor.');
  if (question.length > C.AI_LIMITS.QUESTION_MAX) throw E.ValidationError('A pergunta passou do limite de ' + C.AI_LIMITS.QUESTION_MAX + ' caracteres.');

  const benchRaw = typeof input.benchContext === 'string' ? input.benchContext : (input.benchContext ? JSON.stringify(input.benchContext) : '');
  if (byteLength(benchRaw) > C.AI_LIMITS.CONTEXT_MAX_BYTES) throw E.ValidationError('O contexto da bancada é grande demais.');
  const benchContext = cleanText(benchRaw, C.AI_LIMITS.CONTEXT_MAX_BYTES);
  const history = sanitizeHistory(input.history, ['student', 'preceptor'], C.AI_LIMITS.HISTORY_MAX_TURNS, C.AI_LIMITS.HISTORY_TURN_MAX);

  // Termo inválido (curto, longo, só símbolos) não é erro: a pergunta segue
  // como dúvida normal, só sem cache compartilhado.
  const term = input.synthesisTerm ? normalizeSynthTerm(input.synthesisTerm, C.AI_LIMITS.SYNTH_TERM_MIN, C.AI_LIMITS.SYNTH_TERM_MAX) : '';

  if (term) {
    const cached = await getCached(env, labSynthCacheKey(term));
    if (cached && typeof cached.answer === 'string' && cached.answer) {
      // Acerto de cache não chama a IA, então não consome cota.
      return { success: true, answer: cached.answer, cached: true };
    }
  }

  return withQuota(sql, identity, C.AI_FEATURE.LAB_PRECEPTOR, async () => {
    const messages = term ? buildLabSynthesisMessages({ term }) : buildLabMessages({ question, benchContext, history });
    const out = await Groq.complete(env, sql, { feature: C.AI_FEATURE.LAB_PRECEPTOR, messages, profileId: identity.profileId });
    const answer = cleanReply(out.content, C.AI_LIMITS.REPLY_MAX);
    if (!answer) throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
    // Só respostas que terminaram normalmente vão para o cache — uma
    // resposta cortada pelo max_tokens seria servida cortada por 30 dias.
    if (term && out.finishReason !== 'length') {
      await setCached(env, labSynthCacheKey(term), { answer, createdAt: new Date().toISOString() }, LAB_SYNTH_TTL_SECONDS);
    }
    return { success: true, answer, cached: false };
  });
}

// ---------------------------------------------------------------------------
// apiAdminAiHealth
// ---------------------------------------------------------------------------
export async function adminHealth(sql, env, identity) {
  S.requireRole(identity, [C.ROLES.ADMIN]);
  await S.enforceRateLimit(sql, 'AI_HEALTH', identity.profileId, C.AI_HEALTH_RATE_LIMIT.MAX_ATTEMPTS, C.AI_HEALTH_RATE_LIMIT.WINDOW_SECONDS);

  const keys = await Groq.checkKeys(env);
  for (const k of keys) {
    await Groq.logUsage(sql, { profileId: identity.profileId, feature: C.AI_FEATURE.HEALTH, model: 'models-endpoint', keyIndex: k.index, latencyMs: k.latencyMs, ok: k.ok });
  }
  const okCount = keys.filter((k) => k.ok).length;

  const usageRows = await sql`
    SELECT feature, count(*)::int AS calls, count(*) FILTER (WHERE NOT ok)::int AS failures,
           coalesce(sum(prompt_tokens), 0)::int AS prompt_tokens, coalesce(sum(completion_tokens), 0)::int AS completion_tokens
    FROM ai_usage_log
    WHERE created_at > now() - interval '24 hours'
    GROUP BY feature
    ORDER BY feature
  `;

  return {
    success: true,
    configured: keys.length > 0,
    overallPct: keys.length ? Math.round((okCount / keys.length) * 100) : 0,
    keys,
    config: {
      models: { fast: resolveModel(env, 'fast'), smart: resolveModel(env, 'smart') },
      quotas: C.AI_QUOTAS,
      globalDailyMax: C.AI_GLOBAL_DAILY_MAX,
    },
    usage24h: (usageRows || []).map((r) => ({
      feature: r.feature, calls: Number(r.calls) || 0, failures: Number(r.failures) || 0,
      promptTokens: Number(r.prompt_tokens) || 0, completionTokens: Number(r.completion_tokens) || 0,
    })),
  };
}
