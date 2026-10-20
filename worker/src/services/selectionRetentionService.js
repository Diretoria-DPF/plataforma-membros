/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * selectionRetentionService.js
 * Retenção do processo seletivo (LGPD), chamada pelo cron diário (maintenance.js). Três passos, todos em lote
 * (SELECTION_RETENTION.BATCH_SIZE por execução), idempotentes e sem nunca ler nem devolver texto de candidato:
 *  1. rascunho sem atividade há DRAFT_IDLE_DAYS vira 'expired' (o updated_at passa a ser a data da expiração);
 *  2. inscrição em estado FINAL cuja última data (updated_at ou decided_at) passou de RETAIN_MONTHS é anonimizada:
 *     respostas, resumo da IA e observações viram vazio/NULL; a linha mínima (id, pessoa, status, datas, comprovante)
 *     fica para o histórico. Não mexe em updated_at;
 *  3. eventos com mais de RETAIN_MONTHS de inscrições já anonimizadas são apagados.
 * Cada função devolve só a lista "1" por linha alterada (RETURNING 1), que o maintenance.js conta; nunca conteúdo.
 */
import { SELECTION_RETENTION as R } from '../constants.js';

const FINAL_STATUSES = ['approved', 'not_selected', 'withdrawn', 'expired'];

/** Passo 1: rascunhos parados viram 'expired'. */
export async function expireIdleDrafts(sql) {
  const rows = await sql`
    UPDATE selection_applications
    SET status = 'expired', updated_at = now()
    WHERE status = 'draft'
      AND id IN (
        SELECT id FROM selection_applications
        WHERE status = 'draft'
          AND updated_at < now() - make_interval(days => ${R.DRAFT_IDLE_DAYS})
        ORDER BY updated_at
        LIMIT ${R.BATCH_SIZE}
      )
    RETURNING 1`;
  return rows;
}

/** Passo 2: anonimiza inscrições finais antigas que ainda guardam algum conteúdo (é o que a torna idempotente). */
export async function anonymizeOldApplications(sql) {
  const rows = await sql`
    UPDATE selection_applications
    SET data = '{}'::jsonb, ai_triage = NULL, ai_triage_at = NULL, decision_note = NULL, appeal_note = NULL
    WHERE id IN (
      SELECT id FROM selection_applications
      WHERE status = ANY(${FINAL_STATUSES})
        AND GREATEST(updated_at, decided_at) < now() - make_interval(months => ${R.RETAIN_MONTHS})
        AND (data <> '{}'::jsonb OR ai_triage IS NOT NULL OR ai_triage_at IS NOT NULL
             OR decision_note IS NOT NULL OR appeal_note IS NOT NULL)
      ORDER BY updated_at
      LIMIT ${R.BATCH_SIZE}
    )
    RETURNING 1`;
  return rows;
}

/** Passo 3: eventos velhos de inscrições que já não guardam conteúdo. */
export async function purgeOldEvents(sql) {
  const rows = await sql`
    DELETE FROM selection_events
    WHERE id IN (
      SELECT e.id FROM selection_events e
      JOIN selection_applications a ON a.id = e.application_id
      WHERE e.created_at < now() - make_interval(months => ${R.RETAIN_MONTHS})
        AND a.status = ANY(${FINAL_STATUSES})
        AND a.data = '{}'::jsonb AND a.ai_triage IS NULL AND a.decision_note IS NULL AND a.appeal_note IS NULL
      ORDER BY e.created_at
      LIMIT ${R.BATCH_SIZE}
    )
    RETURNING 1`;
  return rows;
}
