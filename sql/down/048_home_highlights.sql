-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 048_home_highlights.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga todos os destaques da Liga e a flag highlights_enabled. O Worker degrada sem erro quando a tabela
-- não existe (lista vazia). Tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

SET lock_timeout = '5s';
DROP TABLE IF EXISTS home_highlights;
DELETE FROM feature_flags WHERE key = 'highlights_enabled';
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '048_home_highlights.sql';
  END IF;
END $$;
