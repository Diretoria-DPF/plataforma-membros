/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * limits.js
 * Constantes de limite da Biblioteca (contrato B1 §4.3). Sem imports: a
 * sessão principal registra LIBRARY_RATE_LIMITS em constants.js
 * (Object.assign(RATE_LIMITS, LIBRARY_RATE_LIMITS)).
 * Valores de projeto, não verificados em produção.
 */

const SECOND_HOUR = 3600;
const SECONDS_DAY = 86400;

const rate = (maxAttempts, windowSeconds) =>
  Object.freeze({ MAX_ATTEMPTS: maxAttempts, WINDOW_SECONDS: windowSeconds });

export const LIBRARY_RATE_LIMITS = Object.freeze({
  LIBRARY_PUBLIC_IP: rate(30, SECOND_HOUR),
  LIBRARY_PUBLIC_GLOBAL: rate(300, SECOND_HOUR),
  LIBRARY_SEARCH: rate(300, SECOND_HOUR),
  LIBRARY_READ: rate(600, SECOND_HOUR),
  LIBRARY_FAVORITE: rate(120, SECOND_HOUR),
  LIBRARY_SUGGEST: rate(5, SECOND_HOUR),
  LIBRARY_SUGGEST_DAY: rate(15, SECONDS_DAY),
  LIBRARY_IMPORT: rate(60, SECOND_HOUR),
  LIBRARY_IMPORT_GLOBAL: rate(200, SECOND_HOUR),
  LIBRARY_CURATE: rate(300, SECOND_HOUR),
});

const UPSTREAM_MAX_BYTES_MIB = 1;
const BYTES_PER_MIB = 1024 * 1024;

export const LIBRARY_LIMITS = Object.freeze({
  FAVORITES_MAX: 500,
  SUGGESTIONS_PENDING_MAX: 200,
  SUGGESTIONS_PENDING_PER_MEMBER: 10,
  NOTE_MAX: 300,
  REASON_MIN: 3,
  REASON_MAX: 300,
  SUMMARY_MAX: 1200,
  QUERY_MAX: 120,
  QUERY_TERMS_MAX: 5,
  PAGE_SIZE_MAX: 50,
  PUBLIC_MAX_ITEMS: 2000,
  COLLECTION_ITEMS_MAX: 200,
  UPSTREAM_TIMEOUT_MS: 8000,
  IMPORT_BUDGET_MS: 20000,
  UPSTREAM_MAX_BYTES: UPSTREAM_MAX_BYTES_MIB * BYTES_PER_MIB,
  AUTHORS_STORED_MAX: 30,
});

// Licenças que permitem reuso (as NC dependem da pergunta P3).
export const OPEN_REUSE_LICENSES = Object.freeze(['cc0', 'pd', 'cc-by', 'cc-by-sa']);

export const LIBRARY_FLAGS = Object.freeze({
  ENABLED: 'library_enabled',
  MEMBER_SUGGEST: 'library_member_suggest',
  AI_SUMMARY: 'library_ai_summary',
  LIA_ENABLED: 'lia_library_enabled',
});
