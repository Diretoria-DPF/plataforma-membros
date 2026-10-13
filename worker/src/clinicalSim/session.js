/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/session.js
 * Reconstrói a simulação de UM turno a partir do que o servidor sabe: caso, semente, versão, tempo e eventos
 * (ADR 0009). Sem estado entre turnos e sem I/O além do hash do simId: o servidor sorteia os eixos de novo a cada
 * chamada, então o cliente nunca informa nem altera o perfil do paciente.
 */
import { DEFAULT_DIFFICULTY, drawAxes } from './axes.js';
import { computeSimId } from './simId.js';
import { createState, evolve, currentStage } from './state.js';

/**
 * @param {{ caseId: string, input: object, profile: ({difficulty: string, stages: ReadonlyArray<object>}|null) }} p
 *   input = saída de parseSimulationInput; profile = parseSimProfile do caso (null em casos embutidos)
 * @returns {Promise<Readonly<{ simId: string, seed: number, version: string, difficulty: string, axes: object, stage: (object|null) }>>}
 */
export async function buildSession({ caseId, input, profile }) {
  const difficulty = profile ? profile.difficulty : (input.difficulty || DEFAULT_DIFFICULTY);
  const state = evolve(createState(profile ? profile.stages : []), input.events, Math.floor(input.elapsedSeconds / 60));
  return Object.freeze({
    simId: await computeSimId(caseId, input.seed, input.version),
    seed: input.seed,
    version: input.version,
    difficulty,
    axes: drawAxes(input.seed, difficulty),
    stage: currentStage(state),
  });
}
