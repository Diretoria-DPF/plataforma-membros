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
 *  - Lia (ADR 0005): comentário de avaliação com mais de 90 dias é
 *    apagado (comment vira NULL; ganha comment_anonymized_at); avaliação
 *    com mais de 365 dias sai; resposta registrada (assistant_messages) com
 *    mais de 180 dias sai — e o CASCADE de sql/021 leva junto a avaliação
 *    dela; incidente de moderação (assistant_incidents, sem texto) com mais
 *    de 365 dias sai.
 *  - Base da Lia (ragService.reindex, tarefa ragReindex): reindexa o que mudou
 *    (hash = modelo + conteúdo) só quando há env (Workers AI) e a flag rag_enabled
 *    está ligada. Exceção consciente à regra "corte por idade": trechos que saíram
 *    de kb.js/docs.js somem, porque a base é a fonte da verdade e não um histórico.
 */
import * as Logging from './logging.js';
import { runAiAlerts } from './ai/alerts.js';
import { AI_CACHE, ASSISTANT_RETENTION, FEEDBACK } from './constants.js';
import * as ModerationService from './services/moderationService.js';
import * as Rag from './services/ragService.js';
import { buildDocuments } from './assistant/docs.js';
import { isEnabled } from './services/featureFlagService.js';

const RAG_FLAG = 'rag_enabled';

export const RETENTION = {
  AI_USAGE_LOG_DAYS: 180,
  ATLAS_TELEMETRY_DAYS: 90,
  EXPIRED_SESSION_GRACE_DAYS: 1,
  EXPIRED_TOKEN_GRACE_DAYS: 7,
  RATE_LIMIT_BUCKET_MAX_AGE_DAYS: 8,
  AUDIT_LOGS_DAYS: 730,
  ERROR_LOGS_DAYS: 30,
  ASSISTANT_FEEDBACK_ANONYMIZE_DAYS: FEEDBACK.ANONYMIZE_AFTER_DAYS,
  ASSISTANT_FEEDBACK_PURGE_DAYS: FEEDBACK.PURGE_AFTER_DAYS,
  ASSISTANT_MESSAGES_DAYS: ASSISTANT_RETENTION.MESSAGES_PURGE_AFTER_DAYS,
  ASSISTANT_INCIDENTS_DAYS: ASSISTANT_RETENTION.INCIDENTS_PURGE_AFTER_DAYS,
};

/** Quantas linhas a limpeza mexeu: a lista de linhas apagadas ou o `lowered` do decaimento da moderação. */
function countOf(result) {
  if (typeof result === 'number') return result;
  if (Array.isArray(result)) return result.length;
  return result && typeof result.lowered === 'number' ? result.lowered : 0;
}

/** Limpezas originais do Worker (uso de IA, sessões, tokens, logs, cache e moderação). */
function coreTasks(sql, correlationId, env) {
  return {
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
}

/**
 * Retenção da Lia (ADR 0005). Cada tarefa tem corte por idade parametrizado
 * e RETURNING 1 para a contagem. Sem DELETE/UPDATE sem filtro de idade.
 */
function assistantRetentionTasks(sql) {
  return {
    // Comentário com mais de 90 dias: o texto é APAGADO (comment = NULL) e ganha a data.
    // Sem hash: SHA-256 de texto curto é reversível por dicionário, não anonimiza.
    // Só atua em linha com comentário ainda não anonimizado; rating e categoria ficam.
    assistantFeedbackAnonymize: () => sql`
      UPDATE assistant_feedback
      SET comment = NULL,
          comment_anonymized_at = now()
      WHERE comment IS NOT NULL
        AND comment_anonymized_at IS NULL
        AND created_at < now() - make_interval(days => ${RETENTION.ASSISTANT_FEEDBACK_ANONYMIZE_DAYS})
      RETURNING 1`,
    assistantFeedbackPurge: () => sql`
      DELETE FROM assistant_feedback
      WHERE created_at < now() - make_interval(days => ${RETENTION.ASSISTANT_FEEDBACK_PURGE_DAYS})
      RETURNING 1`,
    // Pelo CASCADE de sql/021 (assistant_feedback.message_id), a avaliação desta resposta sai junto.
    assistantMessagesPurge: () => sql`
      DELETE FROM assistant_messages
      WHERE created_at < now() - make_interval(days => ${RETENTION.ASSISTANT_MESSAGES_DAYS})
      RETURNING 1`,
    assistantIncidentsPurge: () => sql`
      DELETE FROM assistant_incidents
      WHERE created_at < now() - make_interval(days => ${RETENTION.ASSISTANT_INCIDENTS_DAYS})
      RETURNING 1`,
  };
}

/**
 * Reindexa a base da Lia (ver o cabeçalho). Sem env ou com a flag desligada, não toca em nada.
 * Devolve quantos trechos foram gravados (upserted); o hash deixa de fora o que não mudou.
 */
async function ragReindexIfEnabled(sql, env) {
  if (!env) return 0;
  if (!(await isEnabled(sql, RAG_FLAG, null))) return 0;
  const report = await Rag.reindex(sql, env, buildDocuments());
  return report.upserted;
}

/**
 * Cada limpeza roda isolada: uma falha (ex.: tabela ainda não migrada) é
 * registrada e não impede as outras. Devolve quantas linhas cada uma apagou.
 */
export async function runMaintenance(sql, correlationId, env) {
  const tasks = {
    ...coreTasks(sql, correlationId, env),
    ...assistantRetentionTasks(sql),
    ragReindex: () => ragReindexIfEnabled(sql, env),
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
