-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 047_daily_goal.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Reverte 047_daily_goal.sql (perde a meta diária escolhida; o app volta ao padrão de 10 questões).
ALTER TABLE preferences DROP CONSTRAINT IF EXISTS preferences_daily_goal_chk;
ALTER TABLE preferences DROP COLUMN IF EXISTS daily_goal;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '047_daily_goal.sql';
  END IF;
END $$;
