/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/trace.js
 * Rastro de cada chamada ao agente: linha em agent_traces (sql/035) e UMA linha JSON no log. Regra inegociável: o
 * rastro NUNCA leva o texto do usuário, a resposta do agente, e-mail ou nome. `decisions` passa por uma lista
 * fechada de chaves (IDs de regra, contagens e booleanos), então mesmo um chamador descuidado não consegue gravar
 * texto livre. O traceId é o correlationId do pedido.
 */
import * as Logging from '../logging.js';

const ID_RE = /^[A-Za-z0-9_.:-]{1,40}$/;
const OUTCOMES = new Set(['answered', 'rewritten', 'replaced', 'refused', 'degraded', 'error']);

const isId = (v) => typeof v === 'string' && ID_RE.test(v);
const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 100000;

/** chave -> validador do valor. Nada fora desta lista chega ao rastro. */
const DECISION_KEYS = {
  input: isId,
  inputRule: isId,
  outputAction: isId,
  outputRules: (v) => Array.isArray(v) && v.length <= 6 && v.every(isId),
  sources: isCount,
  history: isCount,
  cached: (v) => typeof v === 'boolean',
  degraded: (v) => typeof v === 'boolean',
  quotaRefunded: (v) => typeof v === 'boolean',
  errorCode: isId,
  reason: isId,
};

export function safeDecisions(decisions) {
  const source = decisions && typeof decisions === 'object' ? decisions : {};
  return Object.keys(DECISION_KEYS).reduce((acc, key) => (
    key in source && DECISION_KEYS[key](source[key]) ? Object.assign(acc, { [key]: source[key] }) : acc
  ), {});
}

const countOrNull = (v) => (isCount(v) ? v : null);

/**
 * @param {object} f  { traceId, profileId, agent, model, usage:{tokensIn,tokensOut,estimated}, latencyMs, outcome, decisions, memoryUsed }
 * @returns {object} linha pronta para agent_traces (sem texto livre)
 */
export function buildTrace(f) {
  const usage = f.usage || {};
  return {
    traceId: f.traceId,
    profileId: f.profileId || null,
    persona: f.agent.id,
    personaVersion: f.agent.version,
    personaHash: f.agent.hash,
    feature: f.agent.feature,
    model: typeof f.model === 'string' ? f.model.slice(0, 100) : null,
    tokensIn: countOrNull(usage.tokensIn),
    tokensOut: countOrNull(usage.tokensOut),
    estimated: usage.estimated === true,
    latencyMs: countOrNull(f.latencyMs),
    outcome: OUTCOMES.has(f.outcome) ? f.outcome : 'error',
    decisions: safeDecisions(f.decisions),
    memoryUsed: f.memoryUsed === true,
  };
}

/** A linha JSON do log: mesmos campos, sem pessoa. */
export function traceLine(t) {
  return JSON.stringify({
    evt: 'agent_trace', traceId: t.traceId, ref: t.persona + '@' + t.personaVersion + '#' + t.personaHash, feature: t.feature,
    model: t.model, tokensIn: t.tokensIn, tokensOut: t.tokensOut, estimated: t.estimated, latencyMs: t.latencyMs,
    outcome: t.outcome, decisions: t.decisions, memoryUsed: t.memoryUsed,
  });
}

/** Grava o rastro e emite a linha de log. Nunca lança: perder o rastro não pode derrubar a resposta ao estudante. */
export async function recordTrace(sql, trace) {
  console.log(traceLine(trace));
  try {
    await sql`
      INSERT INTO agent_traces (trace_id, profile_id, persona, persona_version, persona_hash, feature, model, tokens_in, tokens_out,
        estimated, latency_ms, outcome, decisions, memory_used)
      VALUES (${trace.traceId}::uuid, ${trace.profileId}::uuid, ${trace.persona}, ${trace.personaVersion}, ${trace.personaHash}, ${trace.feature},
        ${trace.model}, ${trace.tokensIn}, ${trace.tokensOut}, ${trace.estimated}, ${trace.latencyMs}, ${trace.outcome},
        ${JSON.stringify(trace.decisions)}::jsonb, ${trace.memoryUsed})
    `;
    return true;
  } catch (err) {
    await Logging.logError(sql, trace.traceId, 'AGENT_TRACE_FAILED', 'Falha ao gravar agent_traces.', { feature: trace.feature });
    return false;
  }
}
