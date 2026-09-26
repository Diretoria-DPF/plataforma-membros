/**
 * cache.js
 * Cache de leitura quente via Workers KV (binding HOT_CACHE). TTL curto:
 * nunca substitui o Postgres como autoridade, só evita bater no banco a
 * cada acesso — a correção real vem da invalidação explícita nos pontos
 * de escrita correspondentes, o TTL é só rede de segurança caso alguma
 * invalidação seja esquecida. Se o binding não existir (ex.: testes, ou
 * deploy antes do KV namespace ser criado), toda função vira no-op
 * silencioso.
 *
 * Duas formas de uso:
 *  - Chave FIXA e compartilhada (ORG_CHART, EVENTS_*): o conteúdo tem que
 *    ser idêntico pra qualquer requisitante que caia naquela chave — NUNCA
 *    cachear algo que varie por profileId/role numa chave fixa.
 *  - Chave por usuário (messageSyncCacheKey): segura por construção, porque
 *    o profileId faz parte da própria chave — cada usuário só lê o que foi
 *    escrito pra ele mesmo.
 */
export async function getCached(env, key) {
  if (!env || !env.HOT_CACHE) return null;
  try {
    const raw = await env.HOT_CACHE.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

/** expirationTtl mínimo do Workers KV é 60s — TTLs menores são arredondados pra cima pelo runtime. */
export async function setCached(env, key, value, ttlSeconds) {
  if (!env || !env.HOT_CACHE) return;
  try {
    await env.HOT_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  } catch (err) {
    // Cache é otimização — uma falha aqui nunca pode derrubar a resposta real.
  }
}

export async function invalidateCached(env, key) {
  if (!env || !env.HOT_CACHE) return;
  try {
    await env.HOT_CACHE.delete(key);
  } catch (err) {
    // idem
  }
}

export const CACHE_KEYS = {
  ORG_CHART: 'cache:orgchart:v1',
  // v2: cache de eventos mudou de "1 chave só pra anônimo" pra "1 chave
  // por camada de visibilidade" (achado da auditoria de escala de
  // 2026-09-25 — a v1 quase nunca era exercitada, porque a tela de
  // eventos só é alcançável já logado). Versionar a chave evita
  // reaproveitar uma entrada antiga com formato diferente.
  EVENTS_PUBLIC: 'cache:events:public:v2',
  EVENTS_AUTHENTICATED: 'cache:events:authenticated:v2',
  EVENTS_MEMBERS: 'cache:events:members:v2',
};

/**
 * Contador de não lidas/pedidos de conexão pendentes (apiMessagingSync) —
 * por usuário. TTL longo (ver MESSAGE_SYNC_TTL_SECONDS) porque a
 * atualização real vem de invalidação explícita em sendMessage/
 * markConversationRead/clearConversation/connectionService, não do TTL.
 */
export function messageSyncCacheKey(profileId) {
  return 'cache:sync:' + profileId;
}

export const ORG_CHART_TTL_SECONDS = 900;
export const EVENTS_TTL_SECONDS = 300;
export const MESSAGE_SYNC_TTL_SECONDS = 600;
