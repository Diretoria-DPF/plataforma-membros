/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/tutor.js
 * A memória DENTRO do tutor (ADR 0007, etapa 7). Duas pontas, ambas à prova de falha:
 *
 *   readForTutor      lê até 8 itens (cache de 5 min por pessoa no isolate) e devolve a forma enxuta que vai ao prompt como
 *                     DADO. Só com: persona que lê memória, memory_enabled, papel e maioridade, banco de memória + chave,
 *                     e CONSENTIMENTO vigente na versão atual da finalidade (conferido no núcleo a cada chamada, nunca
 *                     cacheado: revogar vale na hora). Sem qualquer um: devolve null e NADA é lido nem escrito.
 *   writeTutorSignals grava as dúvidas do vocabulário citadas na pergunta (sinal determinístico; o texto é descartado), em
 *                     segundo plano (waitUntil). Falha = perde o aprendizado, sem erro e sem atrasar a resposta.
 *   scheduleQuizSignal  o mesmo para o resultado de um simulado concluído (apiLearnSubmitQuizAttempt).
 *
 * O limite de tempo (1,2 s) da leitura fica em agents/memoryProvider.js. Caminho do tutor no plano gratuito: a memória
 * custa 2 subrequisições na leitura (consentimento no núcleo + banco de memória, uma só requisição por transação) e 1 na
 * escrita (a escrita reaproveita o consentimento já conferido na leitura).
 */
import * as C from '../constants.js';
import { ineligibleReason, consentState } from './policy.js';
import * as Store from './store.js';
import { memoryContext } from './cleanup.js';
import { subjectIdFor } from './subject.js';
import { promptItem } from './vocabulary.js';
import { quizItems, tutorItems } from './signals.js';
import { cacheGet, cacheSet, cacheInvalidate } from './tutorCache.js';
import { runInBackground } from './background.js';
import { featureReason, readConsent } from './service.js';

/** A persona lê memória e há banco + chave? (sem consultar nada) */
const personaReads = (agent) => !!agent && !!agent.memory && agent.memory.read === true;

/** O tutor poderia usar memória para esta pessoa? Só flag, papel, maioridade e infraestrutura (não confere consentimento). */
export async function tutorMemoryAvailable(sql, env, identity, agent) {
  if (!personaReads(agent) || !memoryContext(env)) return false;
  return (await featureReason(sql, identity)) === null;
}

/**
 * @returns {Promise<null | { available: true, used: boolean, items: Array<object>, count: number, canWrite: boolean, consentVersion: string }>}
 *   null = sem memória (qualquer pré-condição ausente); lança só se o banco de memória falhar (o provedor engole).
 */
export async function readForTutor(sql, env, identity, agent, now = Date.now()) {
  const ctx = memoryContext(env);
  if (!personaReads(agent) || !ctx || ineligibleReason(identity)) return null;
  if ((await featureReason(sql, identity)) !== null) return null;
  const consent = consentState(await readConsent(sql, identity.profileId));
  if (!consent.current) {
    cacheInvalidate(identity.profileId);
    return null;
  }
  let items = cacheGet(identity.profileId, now);
  if (!items) {
    const subject = await subjectIdFor(env, identity.profileId);
    items = (await Store.readForTutor(ctx.msql, subject, C.MEMORY.READ_LIMIT)).map(promptItem);
    cacheSet(identity.profileId, items, now);
  }
  return {
    available: true, used: items.length > 0, items: items.slice(), count: items.length,
    canWrite: agent.memory.write === true, consentVersion: C.MEMORY.PURPOSE_VERSION,
  };
}

/**
 * Grava as dúvidas citadas na pergunta. Só com a leitura anterior bem-sucedida (consentimento já conferido).
 * Nunca lança: qualquer falha (banco fora, teto de 60) é silêncio.
 * @returns {Promise<number>} quantos itens gravou
 */
export async function writeTutorSignals({ env, identity, agent, memory, message }) {
  try {
    const ctx = memoryContext(env);
    if (!ctx || !memory || memory.available !== true || memory.canWrite !== true || !agent.memory || agent.memory.write !== true) return 0;
    const items = tutorItems(message);
    if (!items.length) return 0;
    const subject = await subjectIdFor(env, identity.profileId);
    // Sem invalidar o cache: a dúvida nova aparece no prompt quando o cache de 5 min expirar (economiza o banco de memória).
    return (await Store.upsertItems(ctx.msql, subject, items, memory.consentVersion)).length;
  } catch (err) {
    console.warn('[MEMORY_WRITE_SKIPPED] a memória não foi atualizada nesta pergunta.');
    return 0;
  }
}

async function recordQuiz(sql, env, identity, input) {
  const ctx = memoryContext(env);
  const items = quizItems(input);
  if (!ctx || !items.length || ineligibleReason(identity)) return 0;
  if ((await featureReason(sql, identity)) !== null) return 0;
  if (!consentState(await readConsent(sql, identity.profileId)).current) return 0;
  const saved = await Store.upsertItems(ctx.msql, await subjectIdFor(env, identity.profileId), items, C.MEMORY.PURPOSE_VERSION);
  cacheInvalidate(identity.profileId);
  return saved.length;
}

/**
 * Resultado de simulado -> memória, em segundo plano. Sem DATABASE_URL_MEMORY/MEMORY_SUBJECT_KEY não faz NADA (nem uma
 * consulta). Devolve a promessa só quando não há waitUntil (testes); em produção devolve undefined.
 */
export function scheduleQuizSignal(sql, env, identity, input) {
  if (!memoryContext(env)) return undefined;
  return runInBackground(env, () => recordQuiz(sql, env, identity, input));
}
