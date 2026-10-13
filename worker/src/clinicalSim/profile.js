/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/profile.js
 * Validação PURA do `sim_profile` de um caso (coluna jsonb de clinical_cases, sql/037). O perfil é conteúdo autoral que
 * só vira público depois da revisão clínica; mesmo assim o servidor o valida a cada uso (defesa em profundidade).
 *
 *   { "v": 1,
 *     "difficulty": "basico" | "intermediario" | "avancado",        (opcional; padrão intermediario)
 *     "stages": [                                                    (opcional; até SIM_LIMITS.STAGES_MAX)
 *       { "id": "inicio", "severity": "estavel" | "piora" | "critico",
 *         "when": { "afterMin": 0..240, "event": "exam:colinesterase" },   (pelo menos um dos dois; vale o que ocorrer primeiro)
 *         "note": "texto curto, fixo e revisado (opcional)" } ] }
 */
import { SIM_LIMITS } from '../constants.js';
import { DIFFICULTIES, DEFAULT_DIFFICULTY } from './axes.js';
import { SEVERITIES } from './catalog.js';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function cleanNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length <= SIM_LIMITS.STAGE_NOTE_MAX ? text : null;
}

function parseWhen(raw) {
  if (!isPlainObject(raw)) return null;
  const when = {};
  if (raw.afterMin !== undefined) {
    if (!Number.isInteger(raw.afterMin) || raw.afterMin < 0 || raw.afterMin > SIM_LIMITS.STAGE_AFTER_MIN_MAX) return null;
    when.afterMin = raw.afterMin;
  }
  if (raw.event !== undefined) {
    if (typeof raw.event !== 'string' || !SIM_LIMITS.EVENT_RE.test(raw.event)) return null;
    when.event = raw.event;
  }
  return when.afterMin === undefined && when.event === undefined ? null : Object.freeze(when);
}

function parseStage(raw) {
  if (!isPlainObject(raw)) return null;
  const when = parseWhen(raw.when);
  const note = cleanNote(raw.note);
  const idOk = typeof raw.id === 'string' && SIM_LIMITS.STAGE_ID_RE.test(raw.id);
  if (!idOk || !when || note === null || !SEVERITIES.includes(raw.severity)) return null;
  return Object.freeze({ id: raw.id, severity: raw.severity, when, note });
}

function parseStages(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > SIM_LIMITS.STAGES_MAX) return null;
  const stages = raw.map(parseStage);
  const ids = stages.map((s) => s && s.id);
  if (stages.some((s) => s === null) || new Set(ids).size !== ids.length) return null;
  return stages;
}

/**
 * @param {unknown} raw valor da coluna sim_profile
 * @returns {{ difficulty: string, stages: ReadonlyArray<object> } | null} perfil normalizado e congelado, ou null se inválido
 */
export function parseSimProfile(raw) {
  if (!isPlainObject(raw) || raw.v !== 1) return null;
  if (raw.difficulty !== undefined && !DIFFICULTIES.includes(raw.difficulty)) return null;
  const stages = parseStages(raw.stages);
  if (stages === null) return null;
  return Object.freeze({ difficulty: raw.difficulty || DEFAULT_DIFFICULTY, stages: Object.freeze(stages) });
}
