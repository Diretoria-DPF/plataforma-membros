-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 034_lia_membros_flags.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (rag_cache_enabled desligada). Este arquivo só apaga a flag e tira a
-- migração do ledger (schema_migrations), para o runner poder reaplicá-la; sem o ledger (banco que
-- nunca usou o runner), nada a fazer. Ausente, a flag conta como desligada.

DELETE FROM feature_flags WHERE key IN ('rag_cache_enabled');

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '034_lia_membros_flags.sql';
  END IF;
END $$;
