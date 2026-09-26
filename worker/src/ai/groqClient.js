/**
 * ai/groqClient.js
 * Cliente do Groq (API compatível com OpenAI) com POOL de chaves.
 *
 * Decisão do responsável: manter TODAS as chaves atuais (várias contas) num
 * pool com rodízio e failover. As chaves vêm do secret GROQ_API_KEYS (uma
 * por linha ou separadas por vírgula) e só existem dentro deste arquivo.
 *
 * Seleção de chave:
 * - Rodízio round-robin por isolate, começando num ponto aleatório. Não
 *   usamos um ponteiro compartilhado em KV porque cada chamada gravaria no
 *   KV, e o plano gratuito do Workers KV permite só 1.000 gravações/dia —
 *   menos do que o disjuntor global de chamadas (3.000). O ponto de partida
 *   aleatório já espalha a carga entre isolates.
 * - Cooldown por chave: quando uma chave falha (401/403/429/5xx/timeout),
 *   ela é marcada em KV (`ai:key-cooldown:<i>`, TTL do Retry-After ou 60 s)
 *   e em memória, e as próximas chamadas pulam para a seguinte. Só falhas
 *   gravam no KV, então o custo de KV acompanha os problemas, não o uso.
 *
 * SEGURANÇA — a chave NUNCA sai daqui: não vai para log, error_logs,
 * ai_usage_log (só o ÍNDICE no pool), resposta ou mensagem de erro. Os
 * erros lançados são sempre textos fixos de ai/errors.js; nenhum detalhe
 * de rede/cabeçalho/corpo do provedor é propagado.
 */
import { getCached, setCached, invalidateCached } from '../cache.js';
import {
  GROQ_CHAT_URL, GROQ_MODELS_URL, FEATURE_CONFIG, KEY_COOLDOWN_DEFAULT_SECONDS, KEY_COOLDOWN_MAX_SECONDS,
  HEALTH_TIMEOUT_MS, resolveModel, modelSpecificParams,
} from './config.js';
import { AiUnavailableError, AiInvalidOutputError, AI_MESSAGES } from './errors.js';

/** Lista de chaves do secret, sem vazios nem repetidas, na ordem cadastrada. */
export function parseKeys(env) {
  const raw = env && env.GROQ_API_KEYS ? String(env.GROQ_API_KEYS) : '';
  const seen = new Set();
  return raw
    .split(/[\s,;]+/)
    .map((k) => k.trim())
    .filter((k) => {
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

/** "…abcd": só os 4 últimos caracteres, e nada se a chave for curta demais para isso ser seguro. */
export function maskKey(key) {
  const s = String(key || '');
  return s.length >= 12 ? '…' + s.slice(-4) : '…';
}

export function cooldownCacheKey(index) {
  return 'ai:key-cooldown:' + index;
}

// Estado por isolate (some quando o isolate é reciclado — por isso o
// cooldown também vai para o KV, que é compartilhado entre isolates).
let rrCounter = Math.floor(Math.random() * 1000000);
const localCooldownUntil = new Map();

/** Só para testes: zera o estado em memória do pool. */
export function __resetPoolStateForTests(startAt) {
  rrCounter = typeof startAt === 'number' ? startAt : 0;
  localCooldownUntil.clear();
}

function rotationOrder(n) {
  const start = rrCounter % n;
  rrCounter = (rrCounter + 1) % 1000000000;
  const order = [];
  for (let i = 0; i < n; i++) order.push((start + i) % n);
  return order;
}

async function isCoolingDown(env, index) {
  const until = localCooldownUntil.get(index);
  if (until && until > Date.now()) return true;
  const cached = await getCached(env, cooldownCacheKey(index));
  if (cached && typeof cached.until === 'number' && cached.until > Date.now()) {
    localCooldownUntil.set(index, cached.until);
    return true;
  }
  return false;
}

function parseRetryAfter(res) {
  const value = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function startCooldown(env, index, seconds) {
  const ttl = Math.min(KEY_COOLDOWN_MAX_SECONDS, Math.max(KEY_COOLDOWN_DEFAULT_SECONDS, seconds || KEY_COOLDOWN_DEFAULT_SECONDS));
  const until = Date.now() + ttl * 1000;
  localCooldownUntil.set(index, until);
  await setCached(env, cooldownCacheKey(index), { until }, ttl);
}

async function clearCooldown(env, index) {
  localCooldownUntil.delete(index);
  await invalidateCached(env, cooldownCacheKey(index));
}

function getFetch() {
  if (typeof globalThis.fetch !== 'function') throw AiUnavailableError(AI_MESSAGES.UNAVAILABLE);
  return globalThis.fetch;
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await getFetch()(url, Object.assign({}, init, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function isFailoverStatus(status) {
  return status === 401 || status === 403 || status === 429 || status >= 500;
}

/**
 * Registro de uso/custo (sql/013_clinical_ai.sql). Sem conteúdo nenhum —
 * só métricas. Falhar aqui nunca derruba a resposta ao usuário, e o
 * console.error não leva nenhum dado da requisição.
 */
export async function logUsage(sql, entry) {
  if (!sql) return;
  try {
    await sql`
      INSERT INTO ai_usage_log (profile_id, feature, model, key_index, prompt_tokens, completion_tokens, latency_ms, ok)
      VALUES (${entry.profileId || null}::uuid, ${entry.feature}, ${String(entry.model || 'desconhecido').slice(0, 100)},
              ${Number.isInteger(entry.keyIndex) ? entry.keyIndex : null}, ${toIntOrNull(entry.promptTokens)},
              ${toIntOrNull(entry.completionTokens)}, ${toIntOrNull(entry.latencyMs)}, ${!!entry.ok})
    `;
  } catch (err) {
    console.error('Falha ao gravar ai_usage_log (feature=' + entry.feature + ').');
  }
}

function toIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Chamada de chat completion com failover pelo pool.
 *
 * @param {object} env  bindings da Worker (GROQ_API_KEYS, GROQ_MODEL_*, HOT_CACHE)
 * @param {Function|null} sql  para o ai_usage_log (null = não registra)
 * @param {object} req  { feature, messages, profileId }
 * @returns {Promise<{content, model, keyIndex, usage, latencyMs, finishReason}>}
 * @throws AiUnavailableError (nenhuma chave respondeu) | AiInvalidOutputError
 */
export async function complete(env, sql, req) {
  const cfg = FEATURE_CONFIG[req.feature];
  if (!cfg) throw new Error('Recurso de IA desconhecido: ' + req.feature);
  const keys = parseKeys(env);
  if (!keys.length) throw AiUnavailableError(AI_MESSAGES.NOT_CONFIGURED);

  const model = resolveModel(env, cfg.tier);
  const body = Object.assign(
    {
      model,
      messages: req.messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    },
    cfg.json ? { response_format: { type: 'json_object' } } : {},
    modelSpecificParams(model, cfg)
  );
  const bodyText = JSON.stringify(body);
  const deadline = Date.now() + cfg.totalBudgetMs;

  for (const index of rotationOrder(keys.length)) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    if (await isCoolingDown(env, index)) continue;

    const started = Date.now();
    let res;
    try {
      res = await fetchWithTimeout(
        GROQ_CHAT_URL,
        {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + keys[index], 'Content-Type': 'application/json' },
          body: bodyText,
        },
        Math.min(cfg.attemptTimeoutMs, remaining)
      );
    } catch (err) {
      // Timeout (AbortError) ou falha de rede: a chave fica de castigo e
      // tentamos a próxima. O erro original NÃO é propagado (poderia
      // carregar detalhes da requisição).
      await startCooldown(env, index, KEY_COOLDOWN_DEFAULT_SECONDS);
      await logUsage(sql, { profileId: req.profileId, feature: req.feature, model, keyIndex: index, latencyMs: Date.now() - started, ok: false });
      continue;
    }
    const latencyMs = Date.now() - started;

    if (res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
      const content = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
      const usage = (data && data.usage) || {};
      await logUsage(sql, {
        profileId: req.profileId, feature: req.feature, model, keyIndex: index,
        promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, latencyMs, ok: !!content.trim(),
      });
      if (!content.trim()) {
        // Resposta vazia costuma ser o raciocínio consumindo todo o
        // max_tokens (finish_reason "length"). Não é culpa da chave.
        throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
      }
      return { content, model, keyIndex: index, usage, latencyMs, finishReason: (choice && choice.finish_reason) || null };
    }

    await logUsage(sql, { profileId: req.profileId, feature: req.feature, model, keyIndex: index, latencyMs, ok: false });
    if (isFailoverStatus(res.status)) {
      await startCooldown(env, index, res.status === 429 ? parseRetryAfter(res) : null);
      continue;
    }
    // 400/404/413/422: problema da requisição (ex.: JSON mode que o modelo
    // não conseguiu cumprir) — trocar de chave não resolveria.
    throw AiInvalidOutputError(AI_MESSAGES.REJECTED);
  }

  throw AiUnavailableError(AI_MESSAGES.UNAVAILABLE);
}

/**
 * Teste de saúde (painel admin): uma chamada barata por chave, em paralelo,
 * com timeout. Devolve só índice, final mascarado, ok, latência e status.
 * Chave que responde bem sai do cooldown na hora.
 */
export async function checkKeys(env) {
  const keys = parseKeys(env);
  return Promise.all(keys.map(async (key, index) => {
    const started = Date.now();
    let status;
    let ok = false;
    try {
      const res = await fetchWithTimeout(GROQ_MODELS_URL, { method: 'GET', headers: { Authorization: 'Bearer ' + key } }, HEALTH_TIMEOUT_MS);
      status = res.status;
      ok = !!res.ok;
    } catch (err) {
      status = err && err.name === 'AbortError' ? 'timeout' : 'erro de rede';
    }
    const latencyMs = Date.now() - started;
    if (ok) await clearCooldown(env, index);
    return { index, masked: maskKey(key), ok, latencyMs, status };
  }));
}

/** Indica, sem consultar o provedor, quais chaves estão de castigo agora. */
export async function cooldownStatus(env) {
  const keys = parseKeys(env);
  return Promise.all(keys.map((k, index) => isCoolingDown(env, index)));
}
