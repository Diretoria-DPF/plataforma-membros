/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/memoryProvider.js
 * Ponto de contato entre o agentsService e a memória de estudo (ADR 0007, etapa 7; a lógica mora em memory/tutor.js).
 *   readMemory   lê até 8 itens com limite de 1,2 s. Contrato: NUNCA lança. Sem persona que lê memória, flag
 *                memory_enabled, consentimento vigente na versão atual, DATABASE_URL_MEMORY e MEMORY_SUBJECT_KEY, ou com
 *                qualquer falha/estouro de tempo, devolve NO_MEMORY e o tutor segue SEM memória. Nesses casos nada é
 *                escrito depois (a gravação só acontece quando a leitura confirmou o consentimento).
 *   writeMemory  grava as dúvidas citadas na pergunta (sinal determinístico, texto descartado); roda em segundo plano
 *                (waitUntil) e nunca bloqueia a resposta.
 * Os itens chegam ao prompt como bloco de DADOS (agents/promptBuilder.js), nunca como instrução.
 */
import { MEMORY } from '../constants.js';
import { readForTutor, writeTutorSignals } from '../memory/tutor.js';

export const NO_MEMORY = Object.freeze({ available: false, used: false, items: Object.freeze([]) });

/** Rejeita com 'MEMORY_TIMEOUT' se a promessa não terminar a tempo; a original, se falhar depois, é engolida. */
function withTimeout(promise, ms) {
  promise.catch(() => undefined);
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('MEMORY_TIMEOUT')), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

/**
 * @param {object} ctx  { sql, env, identity, agent }
 * @returns {Promise<{ available: boolean, used: boolean, items: Array<object>, count?: number, canWrite?: boolean, consentVersion?: string }>}
 */
export async function readMemory(ctx) {
  try {
    const memory = await withTimeout(readForTutor(ctx.sql, ctx.env, ctx.identity, ctx.agent), MEMORY.READ_TIMEOUT_MS);
    return memory || NO_MEMORY;
  } catch (err) {
    return NO_MEMORY;
  }
}

/**
 * @param {object} ctx  { env, identity, agent, memory (o que readMemory devolveu), message }
 * @returns {Promise<number>} itens gravados; nunca lança
 */
export async function writeMemory(ctx) {
  try {
    return await writeTutorSignals(ctx);
  } catch (err) {
    return 0;
  }
}
