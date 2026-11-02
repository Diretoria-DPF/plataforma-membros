-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 039_mentoring.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga todos os vínculos de mentoria, a coluna profiles.mentoring_available e a flag mentoring_enabled.
-- O Worker degrada sem erro quando a tabela não existe (lista vazia). Tira a migração do ledger
-- (schema_migrations), para o runner poder reaplicá-la.

SET lock_timeout = '5s';
DROP TABLE IF EXISTS mentorships;
DROP INDEX IF EXISTS idx_profiles_mentoring_available;
ALTER TABLE profiles DROP COLUMN IF EXISTS mentoring_available;
DELETE FROM feature_flags WHERE key = 'mentoring_enabled';
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '039_mentoring.sql';
  END IF;
END $$;
