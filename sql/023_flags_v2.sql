-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 023_flags_v2.sql — flags da renovação (ux v2, Lia, RAG, feedback, moderação).
--
-- Decisão do responsável: as 5 flags nascem LIGADAS, mas esta migração NUNCA desfaz uma
-- decisão do admin nem um desligamento feito à mão. Reaplicá-la (pelo runner, depois de um
-- down, ou à mão) não religa nada que foi desligado. A regra, exata:
--   1) Chave ausente: é criada com enabled = TRUE (ON CONFLICT (key) DO NOTHING). Uma linha
--      que já existe NÃO é tocada, inclusive chave criada pelo admin com enabled = FALSE.
--   2) ux_v2_enabled (016) e chatbot_enabled (019) já existem, desligadas. Só são ligadas se a
--      linha estiver INTOCADA desde a semente, ou seja, todas estas condições:
--        - enabled = FALSE;
--        - updated_by IS NULL (apiAdminSetFeatureFlag grava sempre; a semente deixa NULL);
--        - updated_at = created_at (nenhum UPDATE desde o INSERT);
--        - nenhuma linha SET_FEATURE_FLAG da chave em audit_logs. Cobre o admin que mexeu e
--          depois teve a conta excluída: a FK updated_by é ON DELETE SET NULL, mas a trilha
--          sobrevive (sql/001).
--   3) Todo UPDATE em feature_flags (pela API ou por SQL à mão, mesmo só SET enabled = FALSE,
--      ou só description, rollout_pct ou conditions) grava updated_at = now(), pelo gatilho
--      trg_feature_flags_updated_at (reaproveita set_updated_at, sql/002). Assim a linha deixa
--      de parecer semente e a regra 2 não a religa. created_at é gravado na criação e nunca muda.
--   Linhas que já existiam antes da coluna ser criada recebem created_at = updated_at.
--   Limite conhecido: um UPDATE manual feito ANTES desta migração existir no banco não deixa
--   marca nenhuma (a linha ainda parece semente). Por isso, desligar antes da 023 deve ser feito
--   pela API (apiAdminSetFeatureFlag), que grava updated_by e a trilha.
-- Cada recurso tolera tabela ausente (migrações 020-022 não aplicadas = recurso
-- inativo, sem erro). Para desligar um recurso: apiAdminSetFeatureFlag.
-- Públicas (vão ao navegador): ux_v2_enabled, chatbot_enabled, feedback_enabled.
-- Requer a 001 (audit_logs), a 002 (set_updated_at), a 016 (feature_flags) e a 019. Idempotente.
-- Reversão: sql/down/023_flags_v2.sql.

-- Coluna e gatilho. O gatilho é removido antes do backfill para o backfill não marcar as linhas,
-- e recriado no fim. Reaplicar esta parte não altera nenhuma linha.
SET lock_timeout = '3s';
DROP TRIGGER IF EXISTS trg_feature_flags_updated_at ON feature_flags;
ALTER TABLE feature_flags ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
UPDATE feature_flags SET created_at = updated_at WHERE created_at IS NULL;
ALTER TABLE feature_flags ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE feature_flags ALTER COLUMN created_at SET NOT NULL;
CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
RESET lock_timeout;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('ux_v2_enabled',      TRUE, 'Interface renovada (Início, onboarding, hero)'),
  ('chatbot_enabled',    TRUE, 'Lia, guia da plataforma (chat que orienta e leva às telas)'),
  ('rag_enabled',        TRUE, 'Lia consulta a base de conhecimento (busca híbrida) antes de responder'),
  ('feedback_enabled',   TRUE, 'Polegar e comentário sobre as respostas da Lia'),
  ('moderation_enabled', TRUE, 'Moderação da Lia (alerta, aviso, suspensão e redenção)')
ON CONFLICT (key) DO NOTHING;

-- Liga as herdadas só se estiverem intocadas (regra 2). Não grava updated_at: o gatilho faz isso,
-- e a própria linha ligada passa a contar como tocada.
UPDATE feature_flags AS f
SET enabled = TRUE
WHERE f.key IN ('ux_v2_enabled', 'chatbot_enabled')
  AND f.enabled = FALSE
  AND f.updated_by IS NULL
  AND f.updated_at = f.created_at
  AND NOT EXISTS (
    SELECT 1 FROM audit_logs AS a
    WHERE a.action = 'SET_FEATURE_FLAG' AND a.details ->> 'key' = f.key
  );
