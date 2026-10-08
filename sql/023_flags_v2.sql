-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 023_flags_v2.sql — flags da renovação (ux v2, Lia, RAG, feedback, moderação).
--
-- Decisão do responsável: as 5 flags nascem LIGADAS, mas esta migração NUNCA desfaz uma
-- decisão do admin. Reaplicá-la (à mão, ou em outro ambiente) não religa nada que o admin
-- desligou. A regra, exata:
--   1) Chave ausente: é criada com enabled = TRUE (ON CONFLICT (key) DO NOTHING). Uma linha
--      que já existe NÃO é tocada, inclusive chave criada pelo admin com enabled = FALSE.
--   2) ux_v2_enabled (016) e chatbot_enabled (019) já existem, desligadas. Só são ligadas se
--      o admin nunca mexeu nelas: updated_by IS NULL (apiAdminSetFeatureFlag grava sempre o
--      updated_by; a semente das migrações deixa NULL) E nenhuma linha SET_FEATURE_FLAG da
--      chave em audit_logs. A segunda condição cobre o admin que mexeu e depois teve a conta
--      excluída (a FK updated_by é ON DELETE SET NULL e apagaria a marca; a trilha de
--      auditoria sobrevive, ver sql/001).
-- Cada recurso tolera tabela ausente (migrações 020-022 não aplicadas = recurso
-- inativo, sem erro). Para desligar um recurso: apiAdminSetFeatureFlag.
-- Públicas (vão ao navegador): ux_v2_enabled, chatbot_enabled, feedback_enabled.
-- Requer a 016 (feature_flags) e a 001 (audit_logs). Idempotente.
-- Reversão: sql/down/023_flags_v2.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('ux_v2_enabled',      TRUE, 'Interface renovada (Início, onboarding, hero)'),
  ('chatbot_enabled',    TRUE, 'Lia, guia da plataforma (chat que orienta e leva às telas)'),
  ('rag_enabled',        TRUE, 'Lia consulta a base de conhecimento (busca híbrida) antes de responder'),
  ('feedback_enabled',   TRUE, 'Polegar e comentário sobre as respostas da Lia'),
  ('moderation_enabled', TRUE, 'Moderação da Lia (alerta, aviso, suspensão e redenção)')
ON CONFLICT (key) DO NOTHING;

UPDATE feature_flags AS f
SET enabled = TRUE, updated_at = now()
WHERE f.key IN ('ux_v2_enabled', 'chatbot_enabled')
  AND f.enabled = FALSE
  AND f.updated_by IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs AS a
    WHERE a.action = 'SET_FEATURE_FLAG' AND a.details ->> 'key' = f.key
  );
