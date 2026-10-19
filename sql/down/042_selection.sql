-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 042_selection.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (selection_enabled desligada). ATENÇÃO: apagar as tabelas apaga todas as inscrições
-- recebidas. Faça o pg_dump antes (docs/BACKUP_RESTORE.md).

DROP TABLE IF EXISTS selection_events;
DROP TABLE IF EXISTS selection_applications;
DROP TABLE IF EXISTS selection_settings;
DELETE FROM feature_flags WHERE key IN ('selection_enabled', 'selection_ai_enabled');

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '042_selection.sql';
  END IF;
END $$;
