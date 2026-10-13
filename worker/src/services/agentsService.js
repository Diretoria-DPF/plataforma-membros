/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agentsService.js
 * Agentes de IA (ADR 0007; API alfa, apiVersion 'agents/v1-alpha'): apiAgentsList e apiAgentsInvoke. A identidade
 * vem sempre da sessão. Tudo atrás de agents_enabled + a flag da persona (desligadas = AGENT_DISABLED, nenhum custo).
 *
 * Fluxo de uma chamada (a memória de estudo é opcional e à prova de falha: agents/memoryProvider.js, ADR 0007):
 *   persona e flags → maioridade (agents/eligibility.js) → rate limit por papel (ANTES dos guardrails) →
 *   guardrail de ENTRADA (recusa = success:true, refused:true; não gasta cota nem modelo) → fontes (até 3 artigos
 *   publicados da Biblioteca, lista permitida de citações) → cache semântico (acerto não gasta cota) → cota diária →
 *   memória (só persona que a permite + memory_enabled + consentimento vigente + banco e chave; até 8 itens, 1,2 s; qualquer
 *   falha = segue SEM memória) → modelo (ai/orchestrator.js: só Groq, orçamento global, cache) → guardrail de SAÍDA
 *   (allow/rewrite/replace) → rastro (agent_traces + linha JSON, sem texto do usuário) → gravação das dúvidas do vocabulário
 *   em segundo plano (waitUntil; sinal determinístico, nunca por modelo; sem consentimento NADA é lido nem escrito).
 *
 * Plano gratuito da Cloudflare: nada é gravado no KV, o modelo é só o Groq (nunca Workers AI) e o caminho faz
 * poucas subrequisições (sessão, flags em cache, limite, moderação, fontes, cota, modelo, uso, rastro).
 */
import * as C from '../constants.js';
import * as S from '../security.js';
import * as E from '../errors.js';
import * as Logging from '../logging.js';
import * as Orchestrator from '../ai/orchestrator.js';
import { AI_MESSAGES } from '../ai/errors.js';
import { cleanText, sanitizeHistory } from '../ai/validators.js';
import { isEnabled } from './featureFlagService.js';
import { asObject, consumeQuota, refundQuota, quotaEntries, quotaLimit } from './aiService.js';
import { searchForLia } from './libraryService.js';
import * as ModerationService from './moderationService.js';
import { cleanLibraryQuery, studyQuery, toReferences, referenceView } from '../assistant/libraryRefs.js';
import { LIBRARY_FLAGS } from '../library/limits.js';
import { getAgent, listAgents } from '../agents/registry.js';
import { isEligibleAdult, readMinorsEnabled } from '../agents/eligibility.js';
import { checkInput, screenHistory } from '../agents/guardrails/input.js';
import { checkOutput } from '../agents/guardrails/output.js';
import { isDoseRequest } from '../agents/guardrails/clinicalScope.js';
import { fold } from '../agents/guardrails/rules.js';
import { buildAgentMessages, canaryFor } from '../agents/promptBuilder.js';
import { readMemory, writeMemory } from '../agents/memoryProvider.js';
import { tutorMemoryAvailable } from '../memory/tutor.js';
import { runInBackground } from '../memory/background.js';
import { buildTrace, recordTrace } from '../agents/trace.js';

const { AgentError } = E;
const FLAG_MODERATION = 'moderation_enabled';
const FLAG_MINORS = 'minors_enabled';
const AGENT_ID_RE = /^[a-z][a-z0-9-]{2,39}$/;
const CHARS_PER_TOKEN = 4;
const ZERO_USAGE = Object.freeze({ tokensIn: 0, tokensOut: 0, estimated: false });

const MESSAGES = Object.freeze({
  flag: 'O agente está indisponível no momento.',
  status: 'Este agente ainda não está disponível.',
  role: 'Este agente não está disponível para o seu perfil.',
  age: 'O Tutor está disponível apenas para maiores de 18 anos.',
  rate: 'Você fez muitas perguntas ao agente nesta hora. Tente novamente mais tarde.',
  suspended: 'Seu acesso aos chats de IA está suspenso por moderação. Volte mais tarde.',
});

async function flagOn(sql, identity, key) {
  try {
    return await isEnabled(sql, key, identity);
  } catch (err) {
    return false; // falha fechada: sem saber, o agente fica desligado
  }
}

// ---------------------------------------------------------------------------
// Disponibilidade
// ---------------------------------------------------------------------------
/** null quando a pessoa pode usar o agente; senão o motivo: 'flag' | 'status' | 'role' | 'age'. */
async function unavailableReason(sql, identity, agent) {
  if (!(await flagOn(sql, identity, C.AGENTS.FLAG)) || !(await flagOn(sql, identity, agent.flag))) return 'flag';
  if (agent.status !== 'active') return 'status';
  if (!agent.roles.includes(identity.role)) return 'role';
  const minorsEnabled = await readMinorsEnabled(() => isEnabled(sql, FLAG_MINORS, identity));
  return isEligibleAdult(identity, { minorsEnabled }) ? null : 'age';
}

function disabled(reason) {
  return AgentError('AGENT_DISABLED', MESSAGES[reason], { reason });
}

async function resolveAgent(sql, identity, rawId) {
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!AGENT_ID_RE.test(id)) throw AgentError('VALIDATION', 'Informe qual agente deseja usar.');
  const agent = getAgent(id);
  if (!agent) throw AgentError('VALIDATION', 'Agente desconhecido.');
  const reason = await unavailableReason(sql, identity, agent);
  if (reason) throw disabled(reason);
  return agent;
}

async function enforceInvokeLimit(sql, identity) {
  const limit = C.RATE_LIMITS.AGENTS_INVOKE;
  const max = limit.BY_ROLE[identity.role] || limit.BY_ROLE.visitor;
  try {
    await S.enforceRateLimit(sql, 'AGENTS_INVOKE', identity.profileId, max, limit.WINDOW_SECONDS);
  } catch (err) {
    if (err && err.name === 'RateLimitError') throw AgentError('RATE_LIMIT', MESSAGES.rate, { rateLimited: true });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Entrada do estudante (saneamento puro)
// ---------------------------------------------------------------------------
function safeHistory(raw, agent) {
  const max = agent.context.history;
  if (!max) return [];
  const turns = sanitizeHistory(raw, ['user', 'assistant'], max, agent.limits.historyTurnMax);
  // TODOS os turnos vêm do cliente (o "assistant" também pode ser forjado para preparar o terreno): injeção, dado pessoal,
  // ofensa e dose valem para os dois papéis; na dúvida, o turno sai.
  const clean = new Set(screenHistory(turns));
  const inputRules = agent.guardrails.input.filter((r) => r !== 'I1' && r !== 'I7');
  const userOk = (t) => checkInput(t.text, { maxChars: agent.limits.historyTurnMax, rules: inputRules }).ok;
  // Resposta antiga do agente só vale se passaria na própria saída (sem dose, sem vazamento) e não pede dose.
  const botOk = (t) => checkOutput(t.text, { rules: ['O3', 'O4'], promptText: agent.prompt }).action === 'allow'
    && !isDoseRequest(fold(t.text));
  return turns.filter((t) => clean.has(t) && (t.role === 'user' ? userOk(t) : botOk(t)));
}

function safeContext(raw, agent) {
  const input = asObject(raw);
  const mod = typeof input.module === 'string' ? input.module.trim().toLowerCase() : '';
  const topic = agent.context.topic && typeof input.topic === 'string' ? cleanText(input.topic, C.AGENTS.TOPIC_MAX) : '';
  return {
    module: agent.context.module && C.LEARNING_MODULES.includes(mod) ? mod : '',
    topic: topic && screenHistory([{ text: topic }]).length ? topic : '',
  };
}

function prepareTurn(agent, input) {
  if (typeof input.message !== 'string') throw AgentError('VALIDATION', 'Escreva sua pergunta para o agente.');
  return {
    message: cleanText(input.message, agent.limits.messageMax + 1),
    history: safeHistory(input.history, agent),
    context: safeContext(input.context, agent),
  };
}

async function isSuspended(sql, identity) {
  try {
    if (!(await ModerationService.moderationEnabled(sql, identity))) return false;
    return (await ModerationService.resolveSuspension(sql, identity.profileId)).status === 'suspended';
  } catch (err) {
    return false;
  }
}

/** Recusa de entrada (I1–I7, mais a suspensão da moderação da Lia, só lida) ou null. */
async function inputRefusal(sql, identity, agent, turn) {
  const verdict = checkInput(turn.message, { maxChars: agent.limits.messageMax, rules: agent.guardrails.input });
  if (!verdict.ok) return verdict;
  if (agent.guardrails.input.includes('I4') && (await isSuspended(sql, identity))) {
    return { ok: false, rule: 'I4', reply: MESSAGES.suspended, reason: 'suspended' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Resposta
// ---------------------------------------------------------------------------
const agentView = (agent) => ({ id: agent.id, name: agent.name, version: agent.version, ref: agent.ref });

function baseResponse(ctx) {
  return { success: true, alpha: true, apiVersion: C.AGENTS.API_VERSION, traceId: ctx.correlationId, agent: agentView(ctx.agent) };
}

async function track(ctx, f) {
  await recordTrace(ctx.sql, buildTrace({
    traceId: ctx.correlationId, profileId: ctx.identity.profileId, agent: ctx.agent, latencyMs: Date.now() - ctx.started, ...f,
  }));
}

async function refuse(ctx, turn, verdict) {
  await track(ctx, { outcome: 'refused', decisions: { input: 'refused', inputRule: verdict.rule, history: turn.history.length } });
  return {
    ...baseResponse(ctx),
    refused: true,
    rule: verdict.rule,
    reply: verdict.reply,
    sources: [],
    usage: ZERO_USAGE,
    guardrails: { input: { ok: false, rule: verdict.rule }, output: null },
    memory: { available: false, used: false },
  };
}

/** Até 3 artigos publicados da Biblioteca (library_enabled): a lista permitida de citações. Nunca lança. */
async function librarySources(ctx, turn) {
  const { sql, identity, agent } = ctx;
  if (!agent.context.library) return [];
  try {
    if (!(await flagOn(sql, identity, LIBRARY_FLAGS.ENABLED))) return [];
    const query = cleanLibraryQuery(turn.context.topic || studyQuery(turn.message));
    if (query.length < 2) return [];
    const items = await searchForLia(sql, query, Math.min(agent.context.library, C.AGENTS.SOURCES_MAX));
    return toReferences(items, false).refs.map(referenceView);
  } catch (err) {
    await Logging.logError(sql, ctx.correlationId, 'AGENT_LIBRARY_FAILED', 'Falha ao buscar fontes da Biblioteca.', { feature: agent.feature });
    return [];
  }
}

async function takeQuota(ctx) {
  try {
    await consumeQuota(ctx.sql, ctx.identity, ctx.agent.feature);
  } catch (err) {
    if (err && err.quotaExceeded) throw AgentError('QUOTA', err.message, { quotaExceeded: true });
    throw err;
  }
}

async function failed(ctx, turn, err) {
  const refunded = !!(err && err.aiUnavailable);
  if (refunded) await refundQuota(ctx.sql, ctx.identity, ctx.agent.feature);
  const code = refunded ? 'AI_UNAVAILABLE' : 'INVALID_OUTPUT';
  await track(ctx, { outcome: 'error', decisions: { input: 'ok', errorCode: code, quotaRefunded: refunded, history: turn.history.length } });
  return AgentError(code, err.message || (refunded ? AI_MESSAGES.UNAVAILABLE : AI_MESSAGES.INVALID_OUTPUT));
}

async function callModel(ctx, turn, messages, cacheable) {
  const { sql, env, identity, agent } = ctx;
  try {
    const out = await Orchestrator.complete(sql, env, identity,
      { feature: agent.feature, messages, profileId: identity.profileId },
      { cacheQuestion: cacheable ? turn.message : null });
    if (out.degraded) await refundQuota(sql, identity, agent.feature);
    return out;
  } catch (err) {
    if (err && (err.aiUnavailable || err.aiInvalidOutput)) throw await failed(ctx, turn, err);
    throw err;
  }
}

function usageOf(out, messages) {
  if (out.cached) return ZERO_USAGE;
  const u = out.usage || {};
  const tokensIn = Math.round(Number(u.prompt_tokens));
  const tokensOut = Math.round(Number(u.completion_tokens));
  if (Number.isFinite(tokensIn) && Number.isFinite(tokensOut) && tokensIn + tokensOut > 0) return { tokensIn, tokensOut, estimated: false };
  const chars = (list) => list.reduce((n, m) => n + String(m.content).length, 0);
  return {
    tokensIn: Math.ceil(chars(messages) / CHARS_PER_TOKEN),
    tokensOut: Math.ceil(String(out.content || '').length / CHARS_PER_TOKEN),
    estimated: true,
  };
}

/** Fontes de fato citadas na resposta final, com o número [n] que o estudante vê. */
function citedSources(reply, sources) {
  const refs = new Set([...reply.matchAll(/\[(\d{1,3})\]/g)].map((m) => Number(m[1])));
  return sources.map((s, i) => Object.assign({ ref: i + 1 }, s)).filter((s) => refs.has(s.ref));
}

const OUTCOME_OF = { allow: 'answered', rewrite: 'rewritten', replace: 'replaced' };

/** O que o cliente vê da memória: `used` e `count` alimentam o selo "usou sua memória de estudo". */
function memoryView(memory) {
  return memory.used
    ? { available: true, used: true, count: Number.isInteger(memory.count) ? memory.count : memory.items.length }
    : { available: memory.available === true, used: false };
}

/** Grava, em segundo plano, as dúvidas do vocabulário da pergunta. Só se a leitura confirmou o consentimento. */
async function rememberSignals(ctx, turn, memory, verdict, deps) {
  if (!memory.available || (verdict.action !== 'allow' && verdict.action !== 'rewrite')) return;
  const write = deps.memoryWriter || writeMemory;
  await runInBackground(ctx.env, () => write({ env: ctx.env, identity: ctx.identity, agent: ctx.agent, memory, message: turn.message }));
}

async function conclude(ctx, turn, out, messages, sources, memory, deps) {
  const { agent } = ctx;
  const verdict = checkOutput(out.content, {
    rules: agent.guardrails.output, sources, replyMax: agent.limits.replyMax, finishReason: out.finishReason,
    promptText: agent.prompt, canary: canaryFor(agent),
  });
  const usage = usageOf(out, messages);
  const degraded = out.degraded === true;
  await track(ctx, {
    model: out.model, usage, memoryUsed: memory.used,
    outcome: degraded ? 'degraded' : OUTCOME_OF[verdict.action],
    decisions: {
      input: 'ok', outputAction: verdict.action, outputRules: verdict.rules, sources: sources.length, history: turn.history.length,
      cached: out.cached === true, degraded,
    },
  });
  await rememberSignals(ctx, turn, memory, verdict, deps);
  return {
    ...baseResponse(ctx),
    reply: verdict.reply,
    sources: citedSources(verdict.reply, sources),
    usage,
    guardrails: { input: { ok: true }, output: { action: verdict.action, rules: verdict.rules } },
    memory: memoryView(memory),
    ...(out.cached ? { cached: true } : {}),
    ...(degraded ? { degraded: true } : {}),
  };
}

async function respond(ctx, turn, deps) {
  const sources = await librarySources(ctx, turn);
  const memory = await (deps.memoryProvider || readMemory)({ sql: ctx.sql, env: ctx.env, identity: ctx.identity, agent: ctx.agent });
  const messages = buildAgentMessages({ agent: ctx.agent, message: turn.message, history: turn.history, context: turn.context, sources, memory });
  // Pergunta genérica (sem histórico, tema nem fontes) pode vir do cache semântico: não chama a IA nem gasta cota.
  // Com memória no prompt a resposta é DA PESSOA: nunca lê nem grava o cache compartilhado (vazaria entre pessoas).
  const personal = memory.used === true || (Array.isArray(memory.items) && memory.items.length > 0);
  const cacheable = !personal && !turn.history.length && !turn.context.module && !turn.context.topic && !sources.length;
  const hit = cacheable ? await Orchestrator.lookupCache(ctx.sql, ctx.env, ctx.identity, ctx.agent.feature, turn.message) : null;
  if (hit) return conclude(ctx, turn, { content: hit.answer, model: 'cache', cached: true }, messages, sources, memory, deps);
  await takeQuota(ctx);
  const out = await callModel(ctx, turn, messages, cacheable);
  return conclude(ctx, turn, out, messages, sources, memory, deps);
}

// ---------------------------------------------------------------------------
// apiAgentsInvoke
// ---------------------------------------------------------------------------
/**
 * @param {object} rawInput  { agentId, message, history?, context?: { module?, topic? } }
 * @param {string} correlationId  vira o traceId
 * @param {{ memoryProvider?: Function }} [deps]  só para testes
 */
export async function invoke(sql, env, identity, rawInput, correlationId, deps = {}) {
  const input = asObject(rawInput);
  const agent = await resolveAgent(sql, identity, input.agentId);
  await enforceInvokeLimit(sql, identity);
  const turn = prepareTurn(agent, input);
  const ctx = { sql, env, identity, agent, correlationId, started: Date.now() };
  const verdict = await inputRefusal(sql, identity, agent, turn);
  if (verdict) return refuse(ctx, turn, verdict);
  return respond(ctx, turn, deps);
}

// ---------------------------------------------------------------------------
// apiAgentsList
// ---------------------------------------------------------------------------
export async function list(sql, env, identity) {
  const head = { success: true, alpha: true, apiVersion: C.AGENTS.API_VERSION };
  if (!(await flagOn(sql, identity, C.AGENTS.FLAG))) throw disabled('flag');
  const minorsEnabled = await readMinorsEnabled(() => isEnabled(sql, FLAG_MINORS, identity));
  if (!isEligibleAdult(identity, { minorsEnabled })) return { ...head, agents: [], unavailable: 'age' };
  const open = [];
  for (const agent of listAgents()) if (!(await unavailableReason(sql, identity, agent))) open.push(agent);
  const quotas = open.length ? await quotaEntries(sql, identity, open.map((a) => a.feature)) : {};
  const memoryOn = {};
  for (const agent of open) memoryOn[agent.id] = await tutorMemoryAvailable(sql, env, identity, agent);
  return {
    ...head,
    agents: open.map((a) => ({
      id: a.id, name: a.name, version: a.version, description: a.description, capabilities: a.capabilities,
      quota: quotas[a.feature] || { used: 0, limit: quotaLimit(identity.role, a.feature), remaining: quotaLimit(identity.role, a.feature), resetsAt: null },
      memory: { available: memoryOn[a.id] },
    })),
  };
}
