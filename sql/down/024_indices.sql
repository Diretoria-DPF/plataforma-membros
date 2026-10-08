-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 024_indices.sql. Não é aplicada no deploy: só à mão, em caso de
-- rollback, e verificada por `npm run validate:sql`. Só remove os índices: a purga
-- diária e as séries do Início continuam corretas, apenas mais lentas. Os índices
-- só-por-profile_id (001 e 012) nunca foram tocados e continuam.
-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la;
-- sem o ledger (banco que nunca usou o runner), nada a fazer.

DROP INDEX IF EXISTS idx_learning_attempts_profile_created;
DROP INDEX IF EXISTS idx_task_signups_profile_completed;
DROP INDEX IF EXISTS idx_event_registrations_profile_registered;
DROP INDEX IF EXISTS idx_rate_limit_buckets_window;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '024_indices.sql';
  END IF;
END $$;
