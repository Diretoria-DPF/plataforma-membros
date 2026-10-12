/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * visitorAiService.js
 * PRÉVIA de IA da Lia para quem não tem conta (flag lia_visitor_ai_enabled). Isolada de propósito:
 *
 *   - usa SOMENTE o Workers AI (env.AI). Não importa nem chama o Groq nem o orquestrador, para jamais
 *     reduzir a cota dos membros (há um teste que confere isso no código-fonte);
 *   - turno único (sem histórico), saída curta, temperatura baixa e o MESMO prompt de RAG do membro
 *     (trechos como DADO não confiável, citação [n], recusa honesta, nada de conduta clínica);
 *   - protegida por: segredo e desafio do Turnstile (turnstileService.js), 5 tentativas por dia por IP (rate limit
 *     do Neon, bucket LIA_VISITOR_AI_IP, chave = hash do IP + sal, nunca o IP cru; NÃO usa o KV, que no plano
 *     gratuito aceita só 1.000 gravações por dia), teto diário de neurons da prévia e reserva para o resto
 *     (neuronLedger.js, gravação em lote);
 *   - cache compartilhado entre visitantes no KV (7 dias): acerto não gasta limite por IP nem neurons, e cada
 *     resposta nova de IA com fontes e não degradada custa UMA gravação no KV.
 *
 * Qualquer falha devolve null e quem chama responde com o trecho EXTRATIVO do acervo (assistant/extractive.js):
 * o visitante nunca vê erro técnico. Nada aqui recebe dado de pessoa além do IP (só como hash).
 */
import * as C from '../constants.js';
import { getCached, setCached } from '../cache.js';
import { enforceRateLimit } from '../security.js';
import { buildAssistantMessages } from '../ai/prompts.js';
import { cleanReply } from '../ai/validators.js';
import { isCacheable, normalizeQuestion } from '../ai/semanticCache.js';
import { withCitations } from '../assistant/citations.js';
import { sha256Hex } from './ragService.js';
import { recordNeurons, neuronsToday, neuronsForGemma } from './neuronLedger.js';
import { challengeConfigured, verifyVisitorChallenge } from './turnstileService.js';

const SCOPE = 'visitor';
const CHARS_PER_TOKEN = 4;

/** Variável numérica do Worker (inteiro >= 0), ou o padrão. */
function numberVar(env, name, fallback) {
  const raw = env && env[name];
  const n = typeof raw === 'string' || typeof raw === 'number' ? Number(String(raw).trim()) : NaN;
  return Number.isFinite(n) && n >= 0 && String(raw).trim() !== '' ? n : fallback;
}

export const neuronCapOf = (env) => numberVar(env, 'LIA_VISITOR_NEURON_CAP', C.LIA_VISITOR.NEURON_CAP);

export function modelOf(env) {
  const v = env && typeof env.LIA_VISITOR_MODEL === 'string' ? env.LIA_VISITOR_MODEL.trim() : '';
  return v || C.LIA_VISITOR.MODEL;
}

/** Pré-condições de infraestrutura: segredo do Turnstile, KV (livro-caixa, limite e cache) e sal do hash. */
export function previewConfigured(env) {
  return challengeConfigured(env) && !!env.HOT_CACHE && !!env.AI && typeof env.AI.run === 'function'
    && typeof env.SESSION_TOKEN_PEPPER === 'string' && env.SESSION_TOKEN_PEPPER.length > 0;
}

// ---------------------------------------------------------------------------
// Cache compartilhado
// ---------------------------------------------------------------------------
/** `cache:liav:{versão do acervo}:{sha256 da pergunta normalizada}`; null se a pergunta não pode ir ao cache. */
export async function cacheKeyFor(version, message) {
  if (!version || !isCacheable(message)) return null;
  return 'cache:liav:' + version + ':' + (await sha256Hex(normalizeQuestion(message)));
}

/** Resposta de IA já guardada para esta pergunta e versão, ou null. */
export async function readCachedPreview(env, key) {
  const hit = key ? await getCached(env, key) : null;
  return hit && typeof hit.reply === 'string' && Array.isArray(hit.sources) && hit.sources.length ? hit : null;
}

// ---------------------------------------------------------------------------
// Limite por IP (5 tentativas por dia)
// ---------------------------------------------------------------------------
/**
 * Conta uma tentativa deste IP no rate limit do Neon (bucket LIA_VISITOR_AI_IP; o visitante já gera um UPSERT
 * desses por pergunta). A chave é "sal + IP": o enforceRateLimit ainda faz o hash, e o IP cru nunca é gravado.
 * Passou do limite, IP ausente ou falha do banco: false (a pergunta cai no extrativo).
 */
async function ipAllowed(sql, env, ip) {
  if (typeof ip !== 'string' || !ip.trim()) return false;
  const limit = C.RATE_LIMITS.LIA_VISITOR_AI_IP;
  try {
    await enforceRateLimit(sql, 'LIA_VISITOR_AI_IP', 'liav-ip:' + env.SESSION_TOKEN_PEPPER + ':' + ip.trim(), limit.MAX_ATTEMPTS, limit.WINDOW_SECONDS);
    return true;
  } catch (err) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Orçamento de neurons
// ---------------------------------------------------------------------------
/** A prévia ainda cabe? Gasto da prévia abaixo do teto E total do dia abaixo da reserva. Sem como saber: não. */
export async function budgetAllows(env) {
  const [spent, total] = await Promise.all([neuronsToday(env, SCOPE), neuronsToday(env, null)]);
  if (spent === null || total === null) return false;
  return spent < neuronCapOf(env) && total < C.LIA_VISITOR.DAY_TOTAL_LIMIT;
}

// ---------------------------------------------------------------------------
// Chamada ao Workers AI
// ---------------------------------------------------------------------------
function replyText(out) {
  if (typeof out === 'string') return out;
  if (out && typeof out.response === 'string') return out.response;
  const content = out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
  return typeof content === 'string' ? content : '';
}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Neurons da chamada: pelo `usage`; sem ele, estimativa pelo tamanho do prompt e da resposta. */
function neuronsOf(out, messages, text) {
  if (out && out.usage && typeof out.usage === 'object') return neuronsForGemma(out.usage);
  return neuronsForGemma({
    prompt_tokens: Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN),
    completion_tokens: Math.ceil(text.length / CHARS_PER_TOKEN),
  });
}

async function runModel(env, messages) {
  const input = {
    messages,
    max_tokens: C.LIA_VISITOR.MAX_TOKENS,
    temperature: C.LIA_VISITOR.TEMPERATURE,
    chat_template_kwargs: { enable_thinking: false },
  };
  const out = await withTimeout(Promise.resolve().then(() => env.AI.run(modelOf(env), input)), C.LIA_VISITOR.TIMEOUT_MS);
  const text = replyText(out).trim();
  await recordNeurons(env, neuronsOf(out, messages, text), SCOPE);
  return text;
}

// ---------------------------------------------------------------------------
// Geração
// ---------------------------------------------------------------------------
async function admitted(sql, env, args) {
  if (!previewConfigured(env)) return false;
  // Ordem pensada para não gastar siteverify nem neurons à toa: limite por IP -> desafio -> orçamento.
  if (!(await ipAllowed(sql, env, args.ip))) return false;
  if (!(await verifyVisitorChallenge(env, args.turnstileToken, args.ip))) return false;
  return budgetAllows(env);
}

/**
 * Gera a prévia. `args`: { message, chunks (melhores do RRF), ip, turnstileToken, cacheKey, degraded }.
 * Devolve { reply, sources, refused } ou null (qualquer falha, limite ou condição não atendida). A resposta
 * só vai ao cache compartilhado (uma gravação no KV) se tem fonte, não é recusa, não é degradada e a pergunta é cacheável.
 */
export async function generatePreview(sql, env, args) {
  try {
    if (!args.chunks.length || !(await admitted(sql, env, args))) return null;
    const context = args.chunks.slice(0, C.LIA_VISITOR.CONTEXT_CHUNKS);
    const messages = buildAssistantMessages({ question: args.message, history: [], role: null, context });
    const text = cleanReply(await runModel(env, messages), C.AI_LIMITS.REPLY_MAX);
    if (!text) return null;
    const cited = withCitations({ reply: text }, context, { withUrl: true });
    const refused = cited.sources.length === 0;
    if (!refused && args.cacheKey && !args.degraded) {
      await setCached(env, args.cacheKey, { reply: cited.reply, sources: cited.sources }, C.LIA_VISITOR.CACHE_TTL_SECONDS);
    }
    return { reply: cited.reply, sources: cited.sources, refused };
  } catch (err) {
    return null;
  }
}
