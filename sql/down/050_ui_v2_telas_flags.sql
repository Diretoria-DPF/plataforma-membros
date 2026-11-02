-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 050_ui_v2_telas_flags.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (desligar a flag da tela). Este arquivo só apaga as flags e tira a migração do ledger
-- (schema_migrations), para o runner poder reaplicá-la; sem o ledger (banco que nunca usou o runner), nada a fazer.

DELETE FROM feature_flags WHERE key IN ('learn_v2_enabled', 'events_v2_enabled', 'profile_v2_enabled', 'proposals_v2_enabled', 'tasks_v2_enabled', 'messages_v2_enabled', 'team_v2_enabled', 'library_v2_enabled', 'mentoring_v2_enabled', 'selection_v2_enabled', 'admin_v2_enabled');

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '050_ui_v2_telas_flags.sql';
  END IF;
END $$;
