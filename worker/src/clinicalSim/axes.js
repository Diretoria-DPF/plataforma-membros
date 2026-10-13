/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/axes.js
 * Eixos do paciente simulado (ADR 0009; inspirados no PatientSim). PURO e determinístico: o perfil nasce de uma
 * semente, nunca do modelo de linguagem.
 *
 *   personalidade       direto | verboso | agradavel | impaciente | desconfiado | ansioso            (6)
 *   letramento em saúde baixo | medio | alto                                                        (3)
 *   recall do histórico alto | baixo                                                                (2)
 *   confusão cognitiva  lucido | confuso                                                            (2)
 *
 * Ordem de sorteio FIXA (personalidade, letramento, recall, confusão), um número do gerador por eixo, sempre. Os pesos
 * mudam com a dificuldade do caso. Combinações incoerentes são REMOVIDAS do sorteio (peso zero), nunca sorteadas e
 * descartadas: quem está confuso não tem recall alto do histórico. Mudar pesos ou ordem muda o paciente de cada
 * semente, então qualquer mudança aqui exige nova SIM_VERSION (o teste dourado pega).
 */
import { mulberry32, pickWeighted } from './prng.js';

export const AXIS_ORDER = Object.freeze(['personality', 'literacy', 'recall', 'confusion']);

export const AXIS_VALUES = Object.freeze({
  personality: Object.freeze(['direto', 'verboso', 'agradavel', 'impaciente', 'desconfiado', 'ansioso']),
  literacy: Object.freeze(['baixo', 'medio', 'alto']),
  recall: Object.freeze(['alto', 'baixo']),
  confusion: Object.freeze(['lucido', 'confuso']),
});

export const DIFFICULTIES = Object.freeze(['basico', 'intermediario', 'avancado']);
export const DEFAULT_DIFFICULTY = 'intermediario';

// Pesos por eixo e dificuldade, na ordem de AXIS_VALUES.
const WEIGHTS = Object.freeze({
  personality: {
    basico: [3, 2, 4, 1, 1, 1],
    intermediario: [2, 2, 2, 2, 2, 2],
    avancado: [1, 2, 1, 3, 3, 3],
  },
  literacy: {
    basico: [1, 3, 3],
    intermediario: [2, 3, 2],
    avancado: [4, 3, 1],
  },
  recall: {
    basico: [5, 1],
    intermediario: [3, 2],
    avancado: [1, 2],
  },
  confusion: {
    basico: [1, 0],
    intermediario: [9, 1],
    avancado: [3, 2],
  },
});

// Pares incoerentes: se TODOS os campos de uma regra casam, a combinação não existe.
const INCOHERENT = Object.freeze([
  Object.freeze({ confusion: 'confuso', recall: 'alto' }),
]);

const matches = (rule, axes) => Object.keys(rule).every((k) => axes[k] === rule[k]);

/** True se nenhuma regra de incoerência casa com os eixos (parciais ou completos). */
export function isCoherent(axes) {
  return !INCOHERENT.some((rule) => matches(rule, axes));
}

/** Aceita 'basico' | 'intermediario' | 'avancado' e as formas do acervo ('Básico', 'Intermediário', 'Avançado'). */
export function normalizeSimDifficulty(value) {
  const folded = String(value === undefined || value === null ? '' : value)
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return DIFFICULTIES.includes(folded) ? folded : DEFAULT_DIFFICULTY;
}

function candidates(axis, difficulty, drawn) {
  const weights = WEIGHTS[axis][difficulty];
  return AXIS_VALUES[axis].map((value, i) => [value, isCoherent(Object.assign({}, drawn, { [axis]: value })) ? weights[i] : 0]);
}

/**
 * Sorteia os quatro eixos a partir da semente.
 * @param {number} seed inteiro (a validação de faixa é de quem chama)
 * @param {string} [difficulty]
 * @returns {{personality: string, literacy: string, recall: string, confusion: string}} objeto congelado
 */
export function drawAxes(seed, difficulty) {
  const level = normalizeSimDifficulty(difficulty);
  const rng = mulberry32(seed);
  const drawn = {};
  for (const axis of AXIS_ORDER) {
    const picked = pickWeighted(rng, candidates(axis, level, drawn));
    drawn[axis] = picked === null ? AXIS_VALUES[axis][0] : picked;
  }
  return Object.freeze(drawn);
}

/** True se `axes` tem exatamente os 4 eixos, com valores conhecidos e combinação coerente. */
export function isValidAxes(axes) {
  if (!axes || typeof axes !== 'object') return false;
  if (Object.keys(axes).length !== AXIS_ORDER.length) return false;
  return AXIS_ORDER.every((axis) => AXIS_VALUES[axis].includes(axes[axis])) && isCoherent(axes);
}
