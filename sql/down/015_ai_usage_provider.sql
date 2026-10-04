-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 015_ai_usage_provider.sql. Não é aplicada no deploy: só à mão,
-- em caso de rollback, e verificada por `npm run validate:sql`.
-- Perde a informação de qual provedor atendeu cada chamada.

ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_provider_chk;
ALTER TABLE ai_usage_log DROP COLUMN IF EXISTS provider;
