-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 046_learning_idempotency.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Reverte 046_learning_idempotency.sql (não perde dados: só remove o índice; o Worker segue barrando duplicatas pelo SELECT prévio).
DROP INDEX IF EXISTS uq_learning_attempts_idempotency;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '046_learning_idempotency.sql';
  END IF;
END $$;
