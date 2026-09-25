/**
 * cache.js
 * Cache de leitura quente via Workers KV (binding HOT_CACHE), só para
 * respostas que NÃO variam por identidade da sessão — nunca cachear algo
 * que dependa de role/profileId do requisitante (ver comentários em
 * orgChartService.getOrgChart e eventService.listEvents sobre quando é
 * seguro usar). TTL curto (segundos): nunca substitui o Postgres como
 * autoridade, só evita bater no banco a cada acesso em telas de alto
 * tráfego. Se o binding não existir (ex.: testes, ou deploy antes do KV
 * namespace ser criado), toda função vira no-op silencioso.
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
  EVENTS_PUBLIC: 'cache:events:public:v1',
};

export const CACHE_TTL_SECONDS = 60;
