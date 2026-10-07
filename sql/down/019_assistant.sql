-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 019_assistant.sql. Não é aplicada no deploy: só à mão, em caso de
-- rollback, e verificada por `npm run validate:sql`.
-- Apaga os registros de uso da Lia (a restrição antiga não os aceita) e a flag.
-- Antes de reverter, desligue a flag chatbot_enabled.

DELETE FROM ai_usage_log WHERE feature = 'assistant';
DELETE FROM feature_flags WHERE key = 'chatbot_enabled';

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_chk;
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_feature_chk
  CHECK (feature IN ('chat', 'evaluate', 'generate_case', 'lab_preceptor', 'health')) NOT VALID;
ALTER TABLE ai_usage_log VALIDATE CONSTRAINT ai_usage_log_feature_chk;
