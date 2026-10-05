/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/providers/poolClient.js
 * Motor de chamada de IA com POOL de chaves e failover, independente do
 * provedor. Cada provedor é um descritor (providers/groq.js, nvidia.js) com
 * URL, nome do secret, prefixo de cooldown e a escolha de modelo.
 *
 * As chaves vêm do secret do provedor (uma por linha ou separadas por
 * vírgula) e só existem dentro deste arquivo.
 *
 * Estratégia de seleção (env.AI_KEY_STRATEGY):
 * - 'failover' (PADRÃO): usa a primeira chave até ela falhar (401/403/429/
 *   5xx/timeout); então passa para a seguinte. Como o limite dos provedores
 *   é por ORGANIZAÇÃO, chaves da mesma organização estouram juntas e girar
 *   entre elas não adiciona capacidade; o failover para de insistir numa
 *   chave que acabou de dizer "não".
 * - 'round-robin': round-robin por isolate, começando num ponto aleatório.
 *   Serve quando as chaves são de organizações diferentes (espalha o limite
 *   de tokens por minuto). Não há ponteiro compartilhado em KV porque cada
 *   chamada gravaria no KV, e o plano gratuito permite só 1.000 gravações/dia.
 * Qualquer outro valor cai no failover.
 *
 * Cooldown por chave: quando uma chave falha, ela é marcada em KV
 * (`<cooldownPrefix><i>`, TTL do Retry-After — até 1 h — ou 60 s) e em
 * memória, e as próximas chamadas a pulam. Só falhas gravam no KV, então o
 * custo de KV acompanha os problemas, não o uso.
 *
 * SEGURANÇA — a chave NUNCA sai daqui: não vai para log, error_logs,
 * ai_usage_log (só o ÍNDICE no pool), resposta ou mensagem de erro. Os
 * erros lançados são sempre textos fixos de ai/errors.js; nenhum detalhe
 * de rede/cabeçalho/corpo do provedor é propagado.
 */
import { getCached, setCached, invalidateCached } from '../../cache.js';
import { FEATURE_CONFIG, KEY_COOLDOWN_DEFAULT_SECONDS, KEY_COOLDOWN_MAX_SECONDS, HEALTH_TIMEOUT_MS } from '../config.js';
import { AiUnavailableError, AiInvalidOutputError, AI_MESSAGES } from '../errors.js';

/** Lista de chaves do secret do provedor, sem vazios nem repetidas, na ordem cadastrada. */
export function parseKeys(provider, env) {
  const raw = env && env[provider.keysEnvName] ? String(env[provider.keysEnvName]) : '';
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

export function cooldownCacheKey(provider, index) {
  return provider.cooldownPrefix + index;
}

// Estado por isolate e por provedor (some quando o isolate é reciclado —
// por isso o cooldown também vai para o KV, compartilhado entre isolates).
let rrStart = Math.floor(Math.random() * 1000000);
const poolState = new Map();

function stateOf(provider) {
  let state = poolState.get(provider.name);
  if (!state) {
    state = { rrCounter: rrStart, localCooldownUntil: new Map() };
    poolState.set(provider.name, state);
  }
  return state;
}

/** Só para testes: zera o estado em memória dos pools. */
export function __resetPoolStateForTests(startAt) {
  rrStart = typeof startAt === 'number' ? startAt : 0;
  poolState.clear();
}

function strategyOf(env) {
  const value = env && env.AI_KEY_STRATEGY ? String(env.AI_KEY_STRATEGY).trim().toLowerCase() : '';
  return value === 'round-robin' ? 'round-robin' : 'failover';
}

function keyOrder(provider, env, n) {
  if (strategyOf(env) === 'failover') return Array.from({ length: n }, (_, i) => i);
  const state = stateOf(provider);
  const start = state.rrCounter % n;
  state.rrCounter = (state.rrCounter + 1) % 1000000000;
  const order = [];
  for (let i = 0; i < n; i++) order.push((start + i) % n);
  return order;
}

async function isCoolingDown(provider, env, index) {
  const local = stateOf(provider).localCooldownUntil;
  const until = local.get(index);
  if (until && until > Date.now()) return true;
  const cached = await getCached(env, cooldownCacheKey(provider, index));
  if (cached && typeof cached.until === 'number' && cached.until > Date.now()) {
    local.set(index, cached.until);
    return true;
  }
  return false;
}

function parseRetryAfter(res) {
  const value = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function startCooldown(provider, env, index, seconds) {
  const ttl = Math.min(KEY_COOLDOWN_MAX_SECONDS, Math.max(KEY_COOLDOWN_DEFAULT_SECONDS, seconds || KEY_COOLDOWN_DEFAULT_SECONDS));
  const until = Date.now() + ttl * 1000;
  stateOf(provider).localCooldownUntil.set(index, until);
  await setCached(env, cooldownCacheKey(provider, index), { until }, ttl);
}

async function clearCooldown(provider, env, index) {
  stateOf(provider).localCooldownUntil.delete(index);
  await invalidateCached(env, cooldownCacheKey(provider, index));
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

/** Avisa quem observa (o orquestrador) o resultado de CADA tentativa; nunca derruba a chamada. */
function notify(req, event) {
  if (!req || typeof req.observer !== 'function') return;
  try { req.observer(event); } catch (err) { /* observador não pode afetar a IA */ }
}

function toIntOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/**
 * Registro de uso/custo (sql/013_clinical_ai.sql). Sem conteúdo nenhum —
 * só métricas. Falhar aqui nunca derruba a resposta ao usuário, e o
 * console.error não leva nenhum dado da requisição.
 *
 * A coluna `provider` (sql/015) só é mencionada para provedores diferentes
 * do Groq. Os INSERTs do Groq ficam idênticos aos de antes da migração (a
 * coluna tem DEFAULT 'groq'), então o deploy do código e a aplicação da 015
 * podem acontecer em qualquer ordem sem perder registros.
 */
export async function logUsage(sql, entry) {
  if (!sql) return;
  const model = String(entry.model || 'desconhecido').slice(0, 100);
  const keyIndex = Number.isInteger(entry.keyIndex) ? entry.keyIndex : null;
  try {
    if (entry.provider && entry.provider !== 'groq') {
      await sql`
        INSERT INTO ai_usage_log (profile_id, feature, model, key_index, prompt_tokens, completion_tokens, latency_ms, ok, provider)
        VALUES (${entry.profileId || null}::uuid, ${entry.feature}, ${model}, ${keyIndex}, ${toIntOrNull(entry.promptTokens)},
                ${toIntOrNull(entry.completionTokens)}, ${toIntOrNull(entry.latencyMs)}, ${!!entry.ok}, ${entry.provider})
      `;
      return;
    }
    await sql`
      INSERT INTO ai_usage_log (profile_id, feature, model, key_index, prompt_tokens, completion_tokens, latency_ms, ok)
      VALUES (${entry.profileId || null}::uuid, ${entry.feature}, ${model}, ${keyIndex}, ${toIntOrNull(entry.promptTokens)},
              ${toIntOrNull(entry.completionTokens)}, ${toIntOrNull(entry.latencyMs)}, ${!!entry.ok})
    `;
  } catch (err) {
    console.error('Falha ao gravar ai_usage_log (feature=' + entry.feature + ').');
  }
}

/**
 * Chamada de chat completion com failover pelo pool do provedor.
 *
 * @param {object} provider  descritor (providers/groq.js, providers/nvidia.js)
 * @param {object} env  bindings da Worker (secret do provedor, modelos, HOT_CACHE)
 * @param {Function|null} sql  para o ai_usage_log (null = não registra)
 * @param {object} req  { feature, messages, profileId }
 * @returns {Promise<{content, model, keyIndex, usage, latencyMs, finishReason}>}
 * @throws AiUnavailableError (nenhuma chave respondeu ou provedor sem configuração) | AiInvalidOutputError
 */
export async function complete(provider, env, sql, req) {
  const cfg = FEATURE_CONFIG[req.feature];
  if (!cfg) throw new Error('Recurso de IA desconhecido: ' + req.feature);
  const keys = parseKeys(provider, env);
  if (!keys.length) throw AiUnavailableError(AI_MESSAGES.NOT_CONFIGURED);

  const model = provider.resolveModel(env, cfg.tier);
  // Nunca adivinha um ID de modelo: sem configuração, o provedor está "indisponível".
  if (!model) throw AiUnavailableError(AI_MESSAGES.NOT_CONFIGURED);
  const body = Object.assign(
    {
      model,
      messages: req.messages,
      temperature: cfg.temperature,
      max_tokens: cfg.maxTokens,
      stream: false,
    },
    cfg.json ? { response_format: { type: 'json_object' } } : {},
    provider.modelParams(model, cfg)
  );
  const bodyText = JSON.stringify(body);
  const deadline = Date.now() + cfg.totalBudgetMs;

  for (const index of keyOrder(provider, env, keys.length)) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    if (await isCoolingDown(provider, env, index)) continue;

    const started = Date.now();
    const base = { profileId: req.profileId, feature: req.feature, model, keyIndex: index, provider: provider.name };
    let res;
    try {
      res = await fetchWithTimeout(
        provider.chatUrl,
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
      await startCooldown(provider, env, index, KEY_COOLDOWN_DEFAULT_SECONDS);
      await logUsage(sql, Object.assign({}, base, { latencyMs: Date.now() - started, ok: false }));
      notify(req, { status: 0, ok: false });
      continue;
    }
    const latencyMs = Date.now() - started;
    notify(req, { status: res.status, ok: !!res.ok });

    if (res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) { data = null; }
      const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
      const content = choice && choice.message && typeof choice.message.content === 'string' ? choice.message.content : '';
      const usage = (data && data.usage) || {};
      await logUsage(sql, Object.assign({}, base, {
        promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, latencyMs, ok: !!content.trim(),
      }));
      if (!content.trim()) {
        // Resposta vazia costuma ser o raciocínio consumindo todo o
        // max_tokens (finish_reason "length"). Não é culpa da chave.
        throw AiInvalidOutputError(AI_MESSAGES.INVALID_OUTPUT);
      }
      return { content, model, keyIndex: index, usage, latencyMs, finishReason: (choice && choice.finish_reason) || null, provider: provider.name };
    }

    await logUsage(sql, Object.assign({}, base, { latencyMs, ok: false }));
    if (isFailoverStatus(res.status)) {
      await startCooldown(provider, env, index, res.status === 429 ? parseRetryAfter(res) : null);
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
export async function checkKeys(provider, env) {
  const keys = parseKeys(provider, env);
  return Promise.all(keys.map(async (key, index) => {
    const started = Date.now();
    let status;
    let ok = false;
    try {
      const res = await fetchWithTimeout(provider.modelsUrl, { method: 'GET', headers: { Authorization: 'Bearer ' + key } }, HEALTH_TIMEOUT_MS);
      status = res.status;
      ok = !!res.ok;
    } catch (err) {
      status = err && err.name === 'AbortError' ? 'timeout' : 'erro de rede';
    }
    const latencyMs = Date.now() - started;
    if (ok) await clearCooldown(provider, env, index);
    return { index, masked: maskKey(key), ok, latencyMs, status };
  }));
}

/** Indica, sem consultar o provedor, quais chaves estão de castigo agora. */
export async function cooldownStatus(provider, env) {
  const keys = parseKeys(provider, env);
  return Promise.all(keys.map((k, index) => isCoolingDown(provider, env, index)));
}
