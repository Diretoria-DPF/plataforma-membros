-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 015_ai_usage_provider.sql — qual provedor de IA atendeu cada chamada.
--
-- O Groq continua sendo o único provedor em uso; a NVIDIA entra como
-- fallback (flag desligada, ver docs/AI_KEYS.md). A coluna nasce com
-- DEFAULT 'groq': as linhas antigas e os INSERTs atuais do Groq (que não
-- mencionam a coluna) seguem válidos antes e depois desta migração, então a
-- ordem entre o deploy do código e a aplicação deste arquivo não importa.
--
-- Aditiva e idempotente. Reversão: sql/down/015_ai_usage_provider.sql.

ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'groq';

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_chk;
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_provider_chk CHECK (provider IN ('groq', 'nvidia'));
