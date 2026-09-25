import { jest } from '@jest/globals';

export function makeEnv(overrides) {
  return Object.assign(
    {
      DATABASE_URL: 'postgres://user:pass@localhost/test',
      SESSION_TOKEN_PEPPER: 'test-pepper-value-not-for-production',
      APP_BASE_URL: 'https://diretoria-dpf.github.io/plataforma-membros/',
      ALLOWED_ORIGINS: 'https://diretoria-dpf.github.io',
      MAIL_FROM_NAME: 'Plataforma de Membros (teste)',
      MAIL_FROM_ADDRESS: 'teste@example.com',
      BREVO_API_KEY: 'test-key',
      clientIp: '203.0.113.1',
      // Mock do binding Workers KV — get() vazio por padrão faz cache.js
      // cair sempre no caminho de "sem cache" (mesmo comportamento de
      // antes do cache existir), sem precisar de um KV real nos testes.
      HOT_CACHE: {
        get: jest.fn().mockResolvedValue(null),
        put: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
    },
    overrides || {}
  );
}

/**
 * jest.fn() serve como mock de `sql` independente de ser chamado como
 * template tag (sql`SELECT ...`) ou como sql(texto, params) — o Jest só
 * registra a chamada e devolve o que foi configurado via
 * mockResolvedValueOnce/mockRejectedValueOnce, na ordem em que o código
 * real chama `sql`.
 */
export function makeSql() {
  return jest.fn();
}
