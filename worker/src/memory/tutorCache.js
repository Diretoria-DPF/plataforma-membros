/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/tutorCache.js
 * Cache de 5 minutos, por pessoa, dos itens que o tutor lê (memória do isolate; nada de KV, que no plano gratuito tem só
 * 1.000 gravações/dia). Guarda SÓ a forma enxuta que vai ao prompt. O CONSENTIMENTO nunca é cacheado: o tutor confere
 * no núcleo a cada chamada, então revogar vale na hora; apagar um item ou tudo invalida o cache do isolate que atendeu
 * o pedido e, nos outros isolates, vale em até 5 minutos (limitação documentada em docs/agentic-layer.md).
 */
import { MEMORY } from '../constants.js';

const entries = new Map();

export function cacheGet(profileId, now = Date.now()) {
  const hit = entries.get(profileId);
  if (!hit) return null;
  if (now - hit.at >= MEMORY.CACHE_TTL_MS) {
    entries.delete(profileId);
    return null;
  }
  return hit.items;
}

export function cacheSet(profileId, items, now = Date.now()) {
  entries.delete(profileId);
  entries.set(profileId, { at: now, items: Object.freeze(items.slice()) });
  while (entries.size > MEMORY.CACHE_MAX_ENTRIES) entries.delete(entries.keys().next().value);
}

export function cacheInvalidate(profileId) {
  entries.delete(profileId);
}

export function __resetTutorCacheForTests() {
  entries.clear();
}
