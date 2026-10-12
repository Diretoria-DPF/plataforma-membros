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
  // Lote de ~114 DOIs (B3): o front importa um por vez. Importação é só para
  // curador/admin; cada cadastro faz até 6 chamadas em série às fontes, então
  // 400/h no total ainda fica muito abaixo dos limites delas (contrato §6.7).
  LIBRARY_IMPORT: rate(180, SECOND_HOUR),
  LIBRARY_IMPORT_GLOBAL: rate(400, SECOND_HOUR),
  LIBRARY_CURATE: rate(300, SECOND_HOUR),
  // Publicar em lote (apiAdminLearnLibraryPublishMany): 1 tentativa por artigo, teto próprio
  // para os ~155 artigos da triagem caberem numa hora sem gastar o LIBRARY_CURATE.
  LIBRARY_PUBLISH: rate(400, SECOND_HOUR),
  // Resumo por IA (B3): por curador e teto diário de chamadas ao modelo (todas
  // as pessoas). 250 resumos/dia cabem nos 10.000 neurons gratuitos da
  // Cloudflare com folga (custo estimado em docs/cortex/RUNBOOK-BIBLIOTECA.md).
  LIBRARY_SUMMARY: rate(200, SECOND_HOUR),
  LIBRARY_SUMMARY_DAY: rate(250, SECONDS_DAY),
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

// Resumo por IA (B3, summaryProvider.js). SOURCE_MIN_CHARS: abaixo disso o
// resumo original é insuficiente e o modelo nem é chamado.
export const LIBRARY_AI_LIMITS = Object.freeze({
  SOURCE_MIN_CHARS: 200,
  SUMMARY_MAX_CHARS: 900,
  SENTENCES_MIN: 3,
  SENTENCES_MAX: 5,
  // O modelo (gemma-4) é de raciocínio: vai com enable_thinking false e 700 tokens; se ainda
  // assim cortar (content vazio, finish_reason 'length'), UMA nova chamada com 1500.
  MAX_OUTPUT_TOKENS: 700,
  RETRY_OUTPUT_TOKENS: 1500,
  TEMPERATURE: 0.2,
  TIMEOUT_MS: 25000,
});

// Licenças que permitem reuso (as NC dependem da pergunta P3).
export const OPEN_REUSE_LICENSES = Object.freeze(['cc0', 'pd', 'cc-by', 'cc-by-sa']);

export const LIBRARY_FLAGS = Object.freeze({
  ENABLED: 'library_enabled',
  MEMBER_SUGGEST: 'library_member_suggest',
  AI_SUMMARY: 'library_ai_summary',
  LIA_ENABLED: 'lia_library_enabled',
});
