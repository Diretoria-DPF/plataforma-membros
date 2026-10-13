/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * clinicalSim/input.js
 * Validação do parâmetro `simulation` de apiLearnClinicalChat/Evaluate (ADR 0009). Só é chamada com a flag
 * clinical_sim_enabled ligada: sem a flag o parâmetro é ignorado e o caminho antigo roda intacto.
 *
 *   { seed: inteiro 0..SEED_MAX, version: 'sim-v1', difficulty?: 'basico'|..., elapsedSeconds?: 0..21600, events?: ['exam:id'] }
 *
 * `difficulty` só vale para casos que não trazem a própria (embutidos); no acervo manda o sim_profile do caso.
 * O cliente NUNCA informa os eixos: só a semente. Quem sorteia e reconstrói o paciente é o servidor.
 */
import { SIM_LIMITS, SIM_MESSAGES } from '../constants.js';
import * as E from '../errors.js';
import { DIFFICULTIES } from './axes.js';

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

function parseSeed(value) {
  if (!Number.isInteger(value) || value < 0 || value > SIM_LIMITS.SEED_MAX) throw E.ValidationError(SIM_MESSAGES.invalidSeed);
  return value;
}

function parseVersion(value) {
  if (typeof value !== 'string' || !SIM_LIMITS.KNOWN_VERSIONS.includes(value)) throw E.ValidationError(SIM_MESSAGES.invalidVersion);
  return value;
}

function parseDifficulty(value) {
  if (value === undefined) return undefined;
  if (!DIFFICULTIES.includes(value)) throw E.ValidationError(SIM_MESSAGES.invalidInput);
  return value;
}

function parseElapsed(value) {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0 || value > SIM_LIMITS.ELAPSED_SECONDS_MAX) throw E.ValidationError(SIM_MESSAGES.invalidInput);
  return value;
}

function parseEvents(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > SIM_LIMITS.EVENTS_MAX) throw E.ValidationError(SIM_MESSAGES.invalidInput);
  if (value.some((e) => typeof e !== 'string' || !SIM_LIMITS.EVENT_RE.test(e))) throw E.ValidationError(SIM_MESSAGES.invalidInput);
  return value.slice();
}

/**
 * @param {unknown} raw
 * @returns {Readonly<{ seed: number, version: string, difficulty: string|undefined, elapsedSeconds: number, events: string[] }>}
 * @throws ValidationError com mensagem em português
 */
export function parseSimulationInput(raw) {
  if (!isPlainObject(raw)) throw E.ValidationError(SIM_MESSAGES.invalidInput);
  return Object.freeze({
    seed: parseSeed(raw.seed),
    version: parseVersion(raw.version),
    difficulty: parseDifficulty(raw.difficulty),
    elapsedSeconds: parseElapsed(raw.elapsedSeconds),
    events: parseEvents(raw.events),
  });
}
