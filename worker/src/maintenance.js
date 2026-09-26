/**
 * maintenance.js
 * Faxina diária disparada pelo Cron Trigger da Cloudflare (ver [triggers]
 * em wrangler.toml e o handler `scheduled` em index.js). Nada aqui é
 * chamável pelo cliente — não passa pelo API_REGISTRY.
 *
 * Só apaga o que já não tem uso nenhum:
 *  - ai_usage_log com mais de 180 dias: retenção decidida pelo responsável
 *    (mesmo prazo de exclusão da Política de Privacidade, seção 7). O log é
 *    só de custo/uso — sem conteúdo de mensagem — e depois disso não serve
 *    mais para auditoria de custo;
 *  - sessões expiradas há mais de 1 dia (o servidor já as recusa; a folga
 *    evita apagar algo que uma requisição em voo ainda esteja resolvendo);
 *  - tokens de conta (confirmação/redefinição) expirados há mais de 7 dias;
 *  - baldes de rate limit cuja janela começou há mais de 8 dias — a maior
 *    janela configurada é de 7 dias (CONNECTION_REQUEST), então um balde
 *    mais velho que isso já foi "zerado" de qualquer forma.
 *
 * audit_logs e error_logs NÃO são tocados: a política de guarda deles é
 * outra (registros de segurança, ver docs/SECURITY.md).
 */
import * as Logging from './logging.js';

export const RETENTION = {
  AI_USAGE_LOG_DAYS: 180,
  EXPIRED_SESSION_GRACE_DAYS: 1,
  EXPIRED_TOKEN_GRACE_DAYS: 7,
  RATE_LIMIT_BUCKET_MAX_AGE_DAYS: 8,
};

/**
 * Cada limpeza roda isolada: uma falha (ex.: tabela ainda não migrada) é
 * registrada e não impede as outras. Devolve quantas linhas cada uma apagou.
 */
export async function runMaintenance(sql, correlationId) {
  const tasks = {
    aiUsageLog: () => sql`
      DELETE FROM ai_usage_log
      WHERE created_at < now() - make_interval(days => ${RETENTION.AI_USAGE_LOG_DAYS})
      RETURNING 1`,
    sessions: () => sql`
      DELETE FROM sessions
      WHERE expires_at < now() - make_interval(days => ${RETENTION.EXPIRED_SESSION_GRACE_DAYS})
      RETURNING 1`,
    accountTokens: () => sql`
      DELETE FROM account_tokens
      WHERE expires_at < now() - make_interval(days => ${RETENTION.EXPIRED_TOKEN_GRACE_DAYS})
      RETURNING 1`,
    rateLimitBuckets: () => sql`
      DELETE FROM rate_limit_buckets
      WHERE window_started_at < now() - make_interval(days => ${RETENTION.RATE_LIMIT_BUCKET_MAX_AGE_DAYS})
      RETURNING 1`,
  };

  const deleted = {};
  for (const [name, task] of Object.entries(tasks)) {
    try {
      const rows = await task();
      deleted[name] = Array.isArray(rows) ? rows.length : 0;
    } catch (err) {
      deleted[name] = null;
      await Logging.logError(sql, correlationId, 'MAINTENANCE_FAILED', name + ': ' + String((err && err.message) || err), null);
    }
  }
  return deleted;
}
