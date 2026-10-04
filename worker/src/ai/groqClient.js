/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * ai/groqClient.js
 * Fachada do Groq: mesma API de sempre (`complete`, `checkKeys`,
 * `cooldownStatus`, `parseKeys`, `logUsage`...), agora apoiada no motor
 * genérico de providers/poolClient.js com o descritor providers/groq.js.
 * Os services (aiService, clinicalService) continuam importando só este
 * arquivo; outro provedor (providers/nvidia.js) usa o mesmo motor.
 *
 * Decisão do responsável: manter TODAS as chaves atuais (várias contas) num
 * pool. As chaves vêm do secret GROQ_API_KEYS (uma por linha ou separadas
 * por vírgula). A estratégia de seleção (failover ou round-robin) e o
 * cooldown estão descritos em providers/poolClient.js e docs/AI_KEYS.md.
 */
import * as Pool from './providers/poolClient.js';
import { groqProvider } from './providers/groq.js';

/** Lista de chaves do secret, sem vazios nem repetidas, na ordem cadastrada. */
export function parseKeys(env) {
  return Pool.parseKeys(groqProvider, env);
}

export const maskKey = Pool.maskKey;

export function cooldownCacheKey(index) {
  return Pool.cooldownCacheKey(groqProvider, index);
}

/** Só para testes: zera o estado em memória do pool. */
export const __resetPoolStateForTests = Pool.__resetPoolStateForTests;

export const logUsage = Pool.logUsage;

/**
 * Chamada de chat completion com failover pelo pool do Groq.
 * @returns {Promise<{content, model, keyIndex, usage, latencyMs, finishReason}>}
 * @throws AiUnavailableError (nenhuma chave respondeu) | AiInvalidOutputError
 */
export function complete(env, sql, req) {
  return Pool.complete(groqProvider, env, sql, req);
}

/** Teste de saúde (painel admin): índice, final mascarado, ok, latência e status por chave. */
export function checkKeys(env) {
  return Pool.checkKeys(groqProvider, env);
}

/** Quais chaves estão de castigo agora, sem consultar o provedor. */
export function cooldownStatus(env) {
  return Pool.cooldownStatus(groqProvider, env);
}
