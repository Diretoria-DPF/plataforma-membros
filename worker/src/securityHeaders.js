/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * securityHeaders.js
 * Cabeçalhos de segurança comuns a toda resposta do Worker (SEC-06).
 *
 * - HSTS de 7 dias, sem includeSubDomains/preload: mesmo escalonamento de
 *   frontend/_headers (7 dias -> 30 dias -> 1 ano -> só então includeSubDomains/preload).
 * - Sem Cross-Origin-Resource-Policy de propósito: risco sem ganho numa API
 *   consumida por fetch com CORS de mais de uma origem.
 * - Cache-Control: no-store só quando pedido (respostas JSON de ação), para nunca
 *   sobrescrever um Cache-Control que a resposta já tenha.
 */
export const SECURITY_HEADERS = Object.freeze({
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=604800',
});

/** Objeto novo a cada chamada (quem recebe pode espalhar/estender sem afetar os outros). */
export function securityHeaders({ noStore = false } = {}) {
  return noStore ? { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' } : { ...SECURITY_HEADERS };
}
