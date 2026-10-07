-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 019_assistant.sql — Lia, guia da plataforma.
--
-- 1) ai_usage_log.feature só aceitava 5 valores (013). A Lia usa 'assistant';
--    sem esta migração o uso dela NÃO seria registrado (o erro é engolido) e o
--    orçamento de tokens e o painel não a enxergariam.
-- 2) Flag chatbot_enabled, DESLIGADA: ligar é decisão explícita do admin.
-- Aditiva e idempotente (recria a restrição). Requer a 016 (feature_flags).
-- Reversão: sql/down/019_assistant.sql.

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_chk;
-- NOT VALID + VALIDATE: o bloqueio exclusivo dura só o tempo de trocar a regra; a conferência das linhas
-- antigas (a tabela cresce a cada chamada de IA) roda depois, sem travar a escrita.
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_feature_chk
  CHECK (feature IN ('chat', 'evaluate', 'generate_case', 'lab_preceptor', 'health', 'assistant')) NOT VALID;
ALTER TABLE ai_usage_log VALIDATE CONSTRAINT ai_usage_log_feature_chk;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('chatbot_enabled', FALSE, 'Lia, guia da plataforma (chat que orienta e leva às telas)')
ON CONFLICT (key) DO NOTHING;
