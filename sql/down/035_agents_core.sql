-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 035_agents_core.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (agents_enabled desligada). Este arquivo apaga os rastros dos agentes (agent_traces),
-- as flags e os registros de uso da IA dos recursos de agente (a restrição antiga da 019 não os aceita), devolve
-- a lista fechada de ai_usage_log.feature e tira a migração do ledger (schema_migrations), para o runner poder
-- reaplicá-la. Antes de reverter, desligue agents_enabled.

DELETE FROM ai_usage_log WHERE feature NOT IN ('chat', 'evaluate', 'generate_case', 'lab_preceptor', 'health', 'assistant');

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_chk;
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_feature_chk
  CHECK (feature IN ('chat', 'evaluate', 'generate_case', 'lab_preceptor', 'health', 'assistant')) NOT VALID;
ALTER TABLE ai_usage_log VALIDATE CONSTRAINT ai_usage_log_feature_chk;

DROP TABLE IF EXISTS agent_traces;

DELETE FROM feature_flags WHERE key IN ('agents_enabled', 'agents_tutor_enabled', 'agents_curator_enabled', 'memory_enabled', 'clinical_sim_enabled');

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '035_agents_core.sql';
  END IF;
END $$;
