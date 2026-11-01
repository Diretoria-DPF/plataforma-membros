-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 045_client_errors.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga os erros agregados do navegador. O Worker degrada sem erro quando a tabela não existe.
-- Tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

SET lock_timeout = '5s';
DROP TABLE IF EXISTS client_errors;
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '045_client_errors.sql';
  END IF;
END $$;
