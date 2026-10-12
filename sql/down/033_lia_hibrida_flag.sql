-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 033_lia_hibrida_flag.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (lia_hibrida_enabled e lia_visitor_ai_enabled desligadas). Este arquivo só
-- apaga as duas flags e tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la;
-- sem o ledger (banco que nunca usou o runner), nada a fazer.

DELETE FROM feature_flags WHERE key IN ('lia_hibrida_enabled', 'lia_visitor_ai_enabled');

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '033_lia_hibrida_flag.sql';
  END IF;
END $$;
