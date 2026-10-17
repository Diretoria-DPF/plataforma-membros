-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 041_session_cookie_flag.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (session_cookie_enabled desligada). Este arquivo só apaga a flag e tira a
-- migração do ledger (schema_migrations), para o runner poder reaplicá-la; sem o ledger, nada a fazer.

DELETE FROM feature_flags WHERE key = 'session_cookie_enabled';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '041_session_cookie_flag.sql';
  END IF;
END $$;
