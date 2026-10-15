-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 040_usage_analytics.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga os contadores de uso (usage_daily) e os dias de atividade (activity_days); o painel de uso do admin
-- fica sem dados. O registro de uso engole a falha (a requisição segue), mas o painel admin de uso falha: publique antes
-- um Worker sem ele. Tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

SET lock_timeout = '5s';
DROP TABLE IF EXISTS activity_days;
DROP TABLE IF EXISTS usage_daily;
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '040_usage_analytics.sql';
  END IF;
END $$;
