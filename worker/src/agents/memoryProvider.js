/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * agents/memoryProvider.js
 * PONTO DE EXTENSÃO da memória de estudo (opt-in, em outro banco; etapas futuras). Nesta fase a memória não existe:
 * `readMemory` devolve sempre `{ available: false }` e nenhum banco é tocado. Quando a memória vier, só este
 * módulo muda (o agentsService já passa persona, identidade e correlationId e já mostra `memory` na resposta).
 * O contrato é "nunca lança": falha de leitura vira `available: false`.
 */
export const NO_MEMORY = Object.freeze({ available: false, used: false, items: Object.freeze([]) });

/**
 * @param {object} _ctx  { sql, env, identity, agent } — sem uso nesta fase
 * @returns {Promise<{ available: boolean, used: boolean, items: Array<object> }>}
 */
export async function readMemory(_ctx) {
  return NO_MEMORY;
}
