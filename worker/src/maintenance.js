/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
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
 *  - telemetria anônima do atlas (atlas_telemetry) com mais de 90 dias;
 *  - baldes de rate limit cuja janela começou há mais de 8 dias — a maior
 *    janela configurada é de 7 dias (CONNECTION_REQUEST), então um balde
 *    mais velho que isso já foi "zerado" de qualquer forma;
 *  - audit_logs com mais de 2 anos (registros de segurança e de decisões
 *    administrativas; a Política de Privacidade, seção 7, fala em guarda
 *    pelo prazo mínimo necessário) e error_logs com mais de 30 dias (só
 *    diagnóstico técnico). O corte é sempre por created_at — nunca um
 *    DELETE sem filtro de idade.
 */
import * as Logging from './logging.js';
import { runAiAlerts } from './ai/alerts.js';
import { AI_CACHE } from './constants.js';
import * as ModerationService from './services/moderationService.js';

export const RETENTION = {
  AI_USAGE_LOG_DAYS: 180,
  ATLAS_TELEMETRY_DAYS: 90,
  EXPIRED_SESSION_GRACE_DAYS: 1,
  EXPIRED_TOKEN_GRACE_DAYS: 7,
  RATE_LIMIT_BUCKET_MAX_AGE_DAYS: 8,
  AUDIT_LOGS_DAYS: 730,
  ERROR_LOGS_DAYS: 30,
};

/** Quantas linhas a limpeza mexeu: a lista de linhas apagadas ou o `lowered` do decaimento da moderação. */
function countOf(result) {
  if (Array.isArray(result)) return result.length;
  return result && typeof result.lowered === 'number' ? result.lowered : 0;
}

/**
 * Cada limpeza roda isolada: uma falha (ex.: tabela ainda não migrada) é
 * registrada e não impede as outras. Devolve quantas linhas cada uma apagou.
 */
export async function runMaintenance(sql, correlationId, env) {
  const tasks = {
    aiUsageLog: () => sql`
      DELETE FROM ai_usage_log
      WHERE created_at < now() - make_interval(days => ${RETENTION.AI_USAGE_LOG_DAYS})
      RETURNING 1`,
    atlasTelemetry: () => sql`
      DELETE FROM atlas_telemetry
      WHERE created_at < now() - make_interval(days => ${RETENTION.ATLAS_TELEMETRY_DAYS})
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
    auditLogs: () => sql`
      DELETE FROM audit_logs
      WHERE created_at < now() - make_interval(days => ${RETENTION.AUDIT_LOGS_DAYS})
      RETURNING 1`,
    errorLogs: () => sql`
      DELETE FROM error_logs
      WHERE created_at < now() - make_interval(days => ${RETENTION.ERROR_LOGS_DAYS})
      RETURNING 1`,
    // Desafios de MFA vivem 5 minutos; o que sobrou é lixo (login abandonado).
    mfaChallenges: () => sql`
      DELETE FROM mfa_challenges
      WHERE expires_at < now() - interval '1 day'
      RETURNING 1`,
    // Cache semântico da IA: vencido há mais de 30 dias não serve nem de reserva.
    // Além do vencido, mantém no máximo N linhas por recurso (as menos usadas saem primeiro).
    semanticCache: () => sql`
      DELETE FROM ai_semantic_cache
      WHERE expires_at < now() - interval '30 days'
         OR id IN (
           SELECT id FROM (
             SELECT id, row_number() OVER (PARTITION BY feature ORDER BY coalesce(last_hit_at, created_at) DESC) AS rn
             FROM ai_semantic_cache
             WHERE expires_at >= now() - interval '30 days'
           ) ranked WHERE rn > ${AI_CACHE.MAX_ROWS_PER_FEATURE}
         )
      RETURNING 1`,
    // Alertas da IA (tokens, 429, cache) por e-mail aos admins; devolve os alertas enviados.
    aiAlerts: () => (env ? runAiAlerts(sql, env, correlationId) : []),
    // Moderação da Lia (ADR 0004): -1 nível a cada 30 dias sem incidente; devolve { checked, lowered }.
    assistantModeration: () => ModerationService.decayAssistantModeration(sql),
  };

  const deleted = {};
  for (const [name, task] of Object.entries(tasks)) {
    try {
      deleted[name] = countOf(await task());
    } catch (err) {
      deleted[name] = null;
      await Logging.logError(sql, correlationId, 'MAINTENANCE_FAILED', name + ': ' + String((err && err.message) || err), null);
    }
  }
  return deleted;
}
