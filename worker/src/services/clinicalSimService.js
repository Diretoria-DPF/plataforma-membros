/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSimService.js
 * Cola da simulação clínica com pacientes variados (ADR 0009) com o clinicalService.js. A simulação NÃO é um agente
 * do agentsService: é parâmetro novo (`simulation`) de apiLearnClinicalChat/Evaluate. A persona `paciente-virtual`
 * (rascunho) só empresta ao paciente o texto-base e as regras de saída (guardrails O1, O3, O4, O5, O6).
 *
 * Portões, nesta ordem: `simulation` presente → flag clinical_sim_enabled ligada para a pessoa → papel da persona e
 * maioridade (agents/eligibility.js) → caso permitido. Flag desligada, ou `simulation` ausente: devolve null e o
 * chamador segue o caminho antigo SEM nenhuma consulta nova e com o prompt idêntico byte a byte.
 *
 * Casos permitidos: embutidos (patients.js, conteúdo do repositório) e do acervo COM sim_profile (que só chega a
 * `approved` com a revisão clínica de sql/037). Casos gerados na sessão pela IA ('ia') nunca entram.
 */
import * as C from '../constants.js';
import * as E from '../errors.js';
import { isEnabled } from './featureFlagService.js';
import { isEligibleAdult } from '../agents/eligibility.js';
import { getAgent } from '../agents/registry.js';
import { checkOutput } from '../agents/guardrails/output.js';
import { parseSimulationInput } from '../clinicalSim/input.js';
import { parseSimProfile } from '../clinicalSim/profile.js';
import { buildSession } from '../clinicalSim/session.js';
import { buildSimPatientMessages } from '../clinicalSim/prompts.js';
import { describeAxes } from '../clinicalSim/catalog.js';

const PERSONA_ID = 'paciente-virtual';
const FLAG_MINORS = 'minors_enabled';
const FALLBACK_OUTPUT_RULES = Object.freeze(['O1', 'O3', 'O4', 'O5', 'O6']);
const FALLBACK_ROLES = Object.freeze([C.ROLES.MEMBER, C.ROLES.ADMIN]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function persona() {
  return getAgent(PERSONA_ID);
}

async function flagOn(sql, identity, key) {
  try {
    return await isEnabled(sql, key, identity);
  } catch (err) {
    return false; // falha fechada: sem saber, a simulação fica desligada
  }
}

function roleAllowed(identity) {
  const p = persona();
  return (p ? p.roles : FALLBACK_ROLES).includes(identity.role);
}

/** Pessoa que PODE simular, dado que a flag está ligada para ela. */
async function eligible(sql, identity) {
  if (!roleAllowed(identity)) return { ok: false, message: C.SIM_MESSAGES.unavailable };
  const minorsEnabled = await flagOn(sql, identity, FLAG_MINORS);
  if (!isEligibleAdult(identity, { minorsEnabled })) return { ok: false, message: C.SIM_MESSAGES.adultsOnly };
  return { ok: true };
}

/** Dica para o cliente: o módulo da Clínica só mostra o "Modo simulação (beta)" se isto for true. */
export async function simulationAvailable(sql, identity) {
  if (!(await flagOn(sql, identity, C.SIM_LIMITS.FLAG))) return false;
  return (await eligible(sql, identity)).ok;
}

/** Acrescenta `simulation: { available: true, version }` à resposta de uma chamada existente, só com a flag ligada. */
export async function withSimulationHint(sql, identity, result) {
  if (!result || result.success !== true || !(await simulationAvailable(sql, identity))) return result;
  return Object.assign({}, result, { simulation: { available: true, version: C.SIM_VERSION } });
}

async function gate(sql, identity, rawSimulation) {
  if (rawSimulation === undefined || rawSimulation === null) return null;
  if (!(await flagOn(sql, identity, C.SIM_LIMITS.FLAG))) return null;
  const check = await eligible(sql, identity);
  if (!check.ok) throw E.ForbiddenError(check.message);
  return parseSimulationInput(rawSimulation);
}

/** Caso do acervo APROVADO, com o perfil de simulação. Só é chamado com a flag ligada (a coluna vem da 037). */
export async function loadApprovedSimCase(sql, caseId) {
  if (!UUID_RE.test(caseId)) throw E.NotFoundError('Caso do acervo não encontrado.');
  const rows = await sql`
    SELECT id, title, toxindrome, agent, payload, sim_profile FROM clinical_cases
    WHERE id = ${caseId}::uuid AND status = 'approved'
  `;
  if (!rows.length) throw E.NotFoundError('Caso do acervo não encontrado ou ainda não aprovado.');
  return rows[0];
}

/**
 * @returns {Promise<null | { row: (object|null), session: object }>} null = simulação desligada ou não pedida
 */
export async function prepare(sql, identity, { rawSimulation, caseSource, caseId }) {
  const input = await gate(sql, identity, rawSimulation);
  if (!input) return null;
  if (caseSource !== 'builtin' && caseSource !== 'acervo') throw E.ValidationError(C.SIM_MESSAGES.sourceNotAllowed);
  const row = caseSource === 'acervo' ? await loadApprovedSimCase(sql, caseId) : null;
  const profile = row ? parseSimProfile(row.sim_profile) : null;
  if (row && !profile) throw E.ValidationError(C.SIM_MESSAGES.caseNotReady);
  return { row, session: await buildSession({ caseId, input, profile }) };
}

/** Mensagens do paciente em modo simulação (base idêntica ao chat clínico + persona + perfil sorteado). */
export function patientMessages(session, { context, question, history }) {
  const p = persona();
  return buildSimPatientMessages({
    context, question, history,
    axes: session.axes, version: session.version, stage: session.stage,
    personaPrompt: p ? p.prompt : '',
  });
}

/**
 * Guardrail de SAÍDA da fala do paciente (O1, O3, O4, O5, O6 da persona): sem diagnóstico, sem dose. A fala continua no
 * personagem: troca total vira a frase de reserva do paciente e os avisos do tutor ("consulte a bula") nunca saem dele.
 */
export function guardPatientReply(reply) {
  const p = persona();
  const out = checkOutput(reply, {
    rules: p ? p.guardrails.output : FALLBACK_OUTPUT_RULES,
    replyMax: p ? p.limits.replyMax : C.AI_LIMITS.REPLY_MAX,
    promptText: p ? p.prompt : '',
  });
  if (out.action === 'replace') return { reply: C.SIM_MESSAGES.patientFallback, rules: out.rules };
  const spoken = out.notices.reduce((text, notice) => text.split(notice).join(''), out.reply).replace(/ {2,}/g, ' ').trim();
  return { reply: spoken || C.SIM_MESSAGES.patientFallback, rules: out.rules };
}

/** O que a tentativa grava em learning_attempts.details.sim (semente e eixos; nada de texto do estudante). */
export function simDetails(session, components) {
  const p = persona();
  return {
    simId: session.simId,
    seed: session.seed,
    version: session.version,
    difficulty: session.difficulty,
    axes: Object.assign({}, session.axes),
    stage: session.stage ? session.stage.id : null,
    persona: p ? p.ref : null,
    components: components || null,
  };
}

/** Debrief devolvido SÓ pela avaliação: os eixos aparecem aqui pela primeira vez. */
export function debrief(session, components) {
  return {
    simId: session.simId,
    version: session.version,
    difficulty: session.difficulty,
    axes: describeAxes(session.axes, session.version),
    components,
    weights: Object.assign({}, C.SIM_SCORE_WEIGHTS),
  };
}

// ---------------------------------------------------------------------------
// Revisão clínica (trava em dois passos: lista de conferência completa + revisor diferente do autor)
// ---------------------------------------------------------------------------
/** Lista de conferência com os 4 itens booleanos, todos verdadeiros; senão ValidationError. */
export function parseChecklist(raw) {
  const keys = C.SIM_LIMITS.CHECKLIST_KEYS;
  const ok = !!raw && typeof raw === 'object' && !Array.isArray(raw)
    && Object.keys(raw).length === keys.length && keys.every((k) => raw[k] === true);
  if (!ok) throw E.ValidationError(C.SIM_MESSAGES.reviewIncomplete);
  return Object.fromEntries(keys.map((k) => [k, true]));
}

/** Traduz o erro do gatilho do banco (sql/037) em mensagem clara; qualquer outro erro sobe como está. */
export function translateReviewError(err) {
  const text = String((err && err.message) || '');
  if (!/clinical_sim_review/.test(text)) return err;
  if (/mesma pessoa|mesmo autor/.test(text)) return E.ValidationError(C.SIM_MESSAGES.reviewSameAuthor);
  return E.ValidationError(C.SIM_MESSAGES.reviewIncomplete);
}
