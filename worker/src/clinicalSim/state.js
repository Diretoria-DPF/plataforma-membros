/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/state.js
 * Estado clínico que evolui durante o caso (ADR 0009; inspirado em medkit/rohy). PURO, imutável e determinístico:
 * cada chamada devolve um estado NOVO. Estágios são opcionais e pertencem ao caso (`sim_profile.stages`, revisados);
 * sem estágios o estado só acumula tempo e eventos.
 *
 * O servidor não guarda estado entre turnos: a cada turno ele refaz `evolve(createState(stages), eventos, dt)` com o
 * tempo decorrido e os eventos que o cliente informa (ex.: "exam:colinesterase"). A cena só avança, nunca volta:
 * o estágio é o mais adiantado cuja condição já ocorreu (tempo mínimo OU evento).
 */
import { SIM_LIMITS } from '../constants.js';

const MAX_MINUTES = SIM_LIMITS.ELAPSED_SECONDS_MAX / 60;

/** Estado inicial (tempo zero, nenhum evento, nenhum estágio atingido). `stages` já vem validado por parseSimProfile. */
export function createState(stages) {
  return Object.freeze({
    stages: Object.freeze(Array.isArray(stages) ? stages.slice() : []),
    stageIndex: -1,
    elapsedMin: 0,
    events: Object.freeze([]),
  });
}

function mergeEvents(known, incoming) {
  const seen = new Set(known);
  const merged = known.slice();
  for (const event of Array.isArray(incoming) ? incoming : []) {
    if (merged.length >= SIM_LIMITS.EVENTS_MAX) break;
    if (typeof event === 'string' && SIM_LIMITS.EVENT_RE.test(event) && !seen.has(event)) {
      seen.add(event);
      merged.push(event);
    }
  }
  return merged;
}

function reached(stage, elapsedMin, events) {
  const { afterMin, event } = stage.when;
  return (afterMin !== undefined && elapsedMin >= afterMin) || (event !== undefined && events.includes(event));
}

function advance(stages, from, elapsedMin, events) {
  let index = from;
  while (index + 1 < stages.length && reached(stages[index + 1], elapsedMin, events)) index += 1;
  return index;
}

/**
 * @param {object} state estado anterior (de createState/evolve)
 * @param {string[]} events eventos novos desde o último estado
 * @param {number} dtMin minutos decorridos (número finito; negativo ou inválido conta como 0)
 * @returns {object} NOVO estado congelado
 */
export function evolve(state, events, dtMin) {
  const dt = Number.isFinite(dtMin) && dtMin > 0 ? dtMin : 0;
  const elapsedMin = Math.min(MAX_MINUTES, state.elapsedMin + dt);
  const merged = mergeEvents(state.events, events);
  return Object.freeze({
    stages: state.stages,
    stageIndex: advance(state.stages, state.stageIndex, elapsedMin, merged),
    elapsedMin,
    events: Object.freeze(merged),
  });
}

/** Estágio atual ({ id, severity, note }) ou null se nenhum foi atingido (ou o caso não tem estágios). */
export function currentStage(state) {
  return state.stageIndex >= 0 ? state.stages[state.stageIndex] : null;
}
