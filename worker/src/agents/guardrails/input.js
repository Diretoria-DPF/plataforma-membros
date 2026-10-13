/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/guardrails/input.js
 * Guardrail de ENTRADA dos agentes: PURO (sem banco, rede ou relógio) e linear. Roda ANTES de gastar cota ou
 * modelo; recusa não é erro (o serviço devolve success:true, refused:true, rule). Ordem fixa e estável:
 *   I1 forma/tamanho → I2 injeção → emergência (I5) → I3 dado pessoal → I4 ofensa → I5 caso pessoal →
 *   I6 dose → I7 fora de escopo.
 * A emergência vem antes do dado pessoal para a pessoa em risco sempre ver o SAMU 192.
 *
 * Reaproveita, importando (sem alterar a Lia): looksLikeInjection e containsOffensiveTerm de
 * assistant/moderationRules.js. A suspensão da moderação é lida pelo serviço (aqui não há banco).
 */
import { looksLikeInjection, containsOffensiveTerm } from '../../assistant/moderationRules.js';
import {
  REFUSALS, REFUSAL_I1_TOO_LONG, REFUSAL_I5_EMERGENCY, REFUSAL_I5_SELF_HARM, INPUT_RULE_IDS, fold,
} from './rules.js';
import { emergencyKind, isPersonalCase, isDoseRequest, isOutOfScope } from './clinicalScope.js';

export const DEFAULT_MESSAGE_MAX = 1000;
const MAX_REPEAT_RUN = 25;
const BASE64_RUN = 80;

// ---------------------------------------------------------------------------
// I1 — forma e tamanho
// ---------------------------------------------------------------------------
const LETTER_RE = /\p{L}/u;
const REPEAT_RUN_RE = new RegExp('(.)\\1{' + MAX_REPEAT_RUN + ',}', 's');

/** @returns {null | 'not_string' | 'empty' | 'too_long' | 'no_text' | 'repetitive'} */
function formProblem(message, maxChars) {
  if (typeof message !== 'string') return 'not_string';
  if (message.length > maxChars) return 'too_long';
  if (!message.trim()) return 'empty';
  if (!LETTER_RE.test(message)) return 'no_text';
  return REPEAT_RUN_RE.test(message) ? 'repetitive' : null;
}

// ---------------------------------------------------------------------------
// I2 — injeção (a da Lia, importada, mais padrões próprios de troca de papel e extração do prompt)
// ---------------------------------------------------------------------------
const INJECTION_EXTRA = [
  /\b(?:ignore|ignora|ignorar|desconsidere|desconsidera|esqueca|despreze|substitua|sobrescreva)\b.{0,50}\b(?:tudo|instrucoes|regras|anterior|anteriores|acima|prompt|restricoes|limites|diretrizes)\b/,
  /\b(?:finja|finge|aja como|atue como|haja como|comporte-se como|comporte se como|assuma o papel|voce agora e|voce passa a ser|a partir de agora voce|de agora em diante voce)\b/,
  /\b(?:sem restricoes|sem filtro|sem filtros|sem limites|sem censura|modo livre|modo deus|do anything now|dan)\b/,
  /\b(?:seu|sua|seus|suas)\s+(?:prompt|instrucoes|regras|configuracao|programacao)\b/,
  /\bprompt\b.{0,20}\b(?:sistema|inicial|interno|original)\b/,
  /\b(?:system|assistant|developer)\s*(?:prompt|message|mensagem)\b/,
];
const INJECTION_MARKUP_RE = /<\/?\s*(?:system|assistant|user|instructions?)\s*>|\[\/?(?:inst|system)\]|\{\{.{0,40}\}\}/i;
const BASE64_RE = new RegExp('[A-Za-z0-9+/]{' + BASE64_RUN + ',}={0,2}');

/** A forma dobrada (largura total, cirílico, letras espaçadas) também passa pelos filtros da Lia e pelo marcador. */
function isInjection(message, folded) {
  return looksLikeInjection(message) || looksLikeInjection(folded) || INJECTION_MARKUP_RE.test(message) || INJECTION_MARKUP_RE.test(folded)
    || BASE64_RE.test(message) || INJECTION_EXTRA.some((re) => re.test(folded));
}

// ---------------------------------------------------------------------------
// I3 — dado pessoal (e-mail, telefone, documento, endereço, autoidentificação)
// ---------------------------------------------------------------------------
const EMAIL_LOCAL_END = /[a-z0-9._%+-]$/i;
const EMAIL_DOMAIN_START = /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,4}\.[a-z]{2,}/i;
const PERSONAL_DATA = [
  /\(\d{2}\)\s?9?\d{4}[-\s]?\d{4}/,
  /\b9?\d{4}-\d{4}\b/,
  /\b\d{2}\s?9\d{4}[-\s]?\d{4}\b/,
  /\+55\s?\d{2}\s?\d{4,5}[-\s]?\d{4}/,
  /\b\d{10,11}\b/,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
  /\b\d{5}-\d{3}\b/,
  /\b(?:\d[ -]?){13,16}\b/,
  /\b(?:cpf|rg|cnh|cns|cartao sus|prontuario|matricula)\b.{0,12}\d/,
  /\b(?:meu nome (?:e|eh)|me chamo|meu cpf|meu telefone|meu celular|meu e.?mail|meu whatsapp|meu endereco|moro (?:na|no|em)|resido)\b/,
  /\b(?:rua|avenida|av|travessa|alameda)\.?\s+[a-z ]{2,30},?\s*\d{1,5}\b/,
  /\b(?:nasci|nascido|nascida|data de nascimento)\b.{0,20}\d/,
];

/** E-mail sem regex quadrática: olha só a vizinhança de cada '@' (janelas curtas). */
function hasEmail(message) {
  let at = message.indexOf('@');
  for (let n = 0; at !== -1 && n < 5; n += 1) {
    const left = message.slice(Math.max(0, at - 64), at);
    const right = message.slice(at + 1, at + 1 + 130);
    if (EMAIL_LOCAL_END.test(left) && EMAIL_DOMAIN_START.test(right)) return true;
    at = message.indexOf('@', at + 1);
  }
  return false;
}

function hasPersonalData(message, folded) {
  return hasEmail(message) || hasEmail(folded) || PERSONAL_DATA.some((re) => re.test(folded));
}

// ---------------------------------------------------------------------------
// Orquestração
// ---------------------------------------------------------------------------
const refuse = (rule, reply, extra) => Object.assign({ ok: false, rule, reply }, extra || {});

/**
 * @param {string} message  texto bruto do estudante
 * @param {{ maxChars?: number, rules?: string[] }} [opts]  rules = quais regras a persona usa (padrão: todas)
 * @returns {{ ok: true } | { ok: false, rule: string, reply: string, reason?: string }}
 */
export function checkInput(message, opts = {}) {
  const maxChars = opts.maxChars || DEFAULT_MESSAGE_MAX;
  const active = new Set(opts.rules || INPUT_RULE_IDS);
  const problem = formProblem(message, maxChars);
  if (problem) return refuse('I1', problem === 'too_long' ? REFUSAL_I1_TOO_LONG : REFUSALS.I1, { reason: problem });

  const folded = fold(message);
  if (active.has('I2') && isInjection(message, folded)) return refuse('I2', REFUSALS.I2);
  const emergency = active.has('I5') ? emergencyKind(folded) : null;
  if (emergency) return refuse('I5', emergency === 'self_harm' ? REFUSAL_I5_SELF_HARM : REFUSAL_I5_EMERGENCY, { reason: emergency });
  if (active.has('I3') && hasPersonalData(message, folded)) return refuse('I3', REFUSALS.I3);
  if (active.has('I4') && containsOffensiveTerm(message)) return refuse('I4', REFUSALS.I4);
  if (active.has('I5') && isPersonalCase(folded)) return refuse('I5', REFUSALS.I5, { reason: 'personal' });
  if (active.has('I6') && isDoseRequest(folded)) return refuse('I6', REFUSALS.I6);
  if (active.has('I7') && isOutOfScope(folded)) return refuse('I7', REFUSALS.I7);
  return { ok: true };
}

/**
 * Histórico do cliente sem os turnos que a entrada recusaria por injeção, dado pessoal ou ofensa. Lista nova
 * (nada é alterado). Turno de caso pessoal ou dose NÃO sai: só a mensagem atual é julgada por I5-I7.
 */
export function screenHistory(history) {
  return (Array.isArray(history) ? history : []).filter((turn) => {
    const text = turn && typeof turn.text === 'string' ? turn.text : '';
    const folded = fold(text);
    return !isInjection(text, folded) && !hasPersonalData(text, folded) && !containsOffensiveTerm(text);
  });
}
