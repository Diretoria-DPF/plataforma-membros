-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 037_clinical_sim.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga as colunas novas de clinical_cases, ou seja, o sim_profile, a lista de conferência e o revisor clínico dos
-- casos de simulação (o caso em si e o payload ficam). Desligue clinical_sim_enabled antes. As tentativas já gravadas em
-- learning_attempts.details.sim não são tocadas. Tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

DROP TRIGGER IF EXISTS trg_clinical_cases_sim_review ON clinical_cases;
DROP FUNCTION IF EXISTS clinical_sim_review_guard();

ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_reviewer_chk;
ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_publish_chk;
ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_source_chk;
ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_shape_chk;

ALTER TABLE clinical_cases DROP COLUMN IF EXISTS clinical_reviewed_at;
ALTER TABLE clinical_cases DROP COLUMN IF EXISTS clinical_reviewed_by;
ALTER TABLE clinical_cases DROP COLUMN IF EXISTS review_checklist;
ALTER TABLE clinical_cases DROP COLUMN IF EXISTS content_version;
ALTER TABLE clinical_cases DROP COLUMN IF EXISTS sim_profile;

UPDATE feature_flags
SET description = 'Clínica: simulação com pacientes variados (reservada: precisa de revisor clínico antes de ligar)'
WHERE key = 'clinical_sim_enabled' AND description LIKE 'Clínica: simulação com pacientes variados (exige revisor clínico definido%';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '037_clinical_sim.sql';
  END IF;
END $$;
