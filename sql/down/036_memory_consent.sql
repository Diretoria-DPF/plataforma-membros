-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 036_memory_consent.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga os consentimentos e a fila de exclusão. Antes, drene a fila (cron ou apiAdminPurgeMemberMemory) e
-- apague a memória no banco laift-memory; senão contas já excluídas deixam memória sem dono até a varredura semanal.
-- Desligue memory_enabled antes. Tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

DROP TRIGGER IF EXISTS trg_profiles_memory_purge ON profiles;
DROP FUNCTION IF EXISTS memory_enqueue_purge();
DROP TABLE IF EXISTS memory_purge_queue;
DROP TABLE IF EXISTS member_memory_consent;

UPDATE feature_flags
SET description = 'Agentes: memória de estudo opt-in (reservada: ainda sem código)'
WHERE key = 'memory_enabled' AND description LIKE 'Agentes: memória de estudo opt-in (exige consentimento%';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '036_memory_consent.sql';
  END IF;
END $$;
