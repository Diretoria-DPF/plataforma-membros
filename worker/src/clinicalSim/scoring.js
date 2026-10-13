/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/scoring.js
 * Nota da avaliação em modo simulação (ADR 0009). PURO. Pesos: hipótese 30, conduta 30, processo 20 e comunicação
 * adaptada 20 (SIM_SCORE_WEIGHTS). O modelo só SUGERE a nota de cada componente; o servidor limita cada uma ao teto do
 * componente, aplica os tetos por fatos do atendimento e soma. A nota total que o modelo porventura devolva é ignorada.
 *
 * Tetos por fatos (o prompt pede, mas quem garante é o servidor):
 *   sem hipótese diagnóstica escrita → hipótese 0;  sem conduta escrita → conduta 0;
 *   nenhuma pergunta ao paciente → processo 0 e comunicação 0 (não houve anamnese para avaliar).
 * O teto por desfecho (óbito 25, abandono 40) continua em clinicalService.js, aplicado sobre o total.
 */
import { SIM_LIMITS, SIM_SCORE_WEIGHTS } from '../constants.js';
import { cleanText, cleanList } from '../ai/validators.js';

const COMPONENT_KEYS = Object.freeze(Object.keys(SIM_SCORE_WEIGHTS));
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function readComponents(raw) {
  if (!isPlainObject(raw)) return null;
  const out = {};
  for (const key of COMPONENT_KEYS) {
    const n = typeof raw[key] === 'string' && raw[key].trim() !== '' ? Number(raw[key]) : raw[key];
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    out[key] = Math.min(SIM_SCORE_WEIGHTS[key], Math.max(0, Math.round(n)));
  }
  return out;
}

/**
 * Saída do modelo → { components, verdict, feedback, strengths, improvements } ou null se inutilizável.
 * Cada componente já sai limitado ao seu teto (0 a peso).
 */
export function parseSimEvaluation(obj) {
  if (!isPlainObject(obj)) return null;
  const components = readComponents(obj.components);
  const verdict = cleanText(obj.verdict, 200);
  const feedback = cleanText(obj.feedback, 3000);
  if (!components || !verdict || !feedback) return null;
  return {
    components,
    verdict,
    feedback,
    strengths: cleanList(obj.strengths, 6, SIM_LIMITS.COMPONENT_TEXT_MAX),
    improvements: cleanList(obj.improvements, 6, SIM_LIMITS.COMPONENT_TEXT_MAX),
  };
}

/**
 * @param {{hipotese:number, conduta:number, processo:number, comunicacao:number}} suggested componentes já limitados
 * @param {{ hasDiagnosis: boolean, hasConduct: boolean, questionsCount: number }} facts
 * @returns {{ score: number, components: object }} componentes finais (congelados) e a soma (0 a 100)
 */
export function computeSimScore(suggested, facts) {
  const capped = Object.assign({}, suggested);
  if (!facts.hasDiagnosis) capped.hipotese = 0;
  if (!facts.hasConduct) capped.conduta = 0;
  if (!(facts.questionsCount > 0)) {
    capped.processo = 0;
    capped.comunicacao = 0;
  }
  const score = COMPONENT_KEYS.reduce((sum, key) => sum + capped[key], 0);
  return { score: Math.min(100, Math.max(0, score)), components: Object.freeze(capped) };
}
