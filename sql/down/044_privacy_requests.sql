-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 044_privacy_requests.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Reverte 044_privacy_requests.sql (perde a fila de pedidos de exclusão).
DROP TABLE IF EXISTS account_deletion_requests;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '044_privacy_requests.sql';
  END IF;
END $$;
