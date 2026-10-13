-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 037_clinical_sim.sql — simulação clínica com pacientes variados (ADR 0009): perfil de simulação do caso e a TRAVA de
-- revisão humana em dois passos. Sem tabela nova: a semente e os eixos de cada tentativa vão em
-- learning_attempts.details.sim (coluna jsonb `details`, 012; teto de 8 KB já existente).
--
--   clinical_cases.sim_profile            perfil de simulação (jsonb opcional): dificuldade e estágios do quadro clínico.
--   clinical_cases.content_version        versão do conteúdo; sobe a cada edição de um caso com sim_profile já publicado.
--   clinical_cases.review_checklist       lista de conferência da revisão clínica (jsonb com 4 booleanos).
--   clinical_cases.clinical_reviewed_by   revisor clínico (ON DELETE SET NULL, como created_by e reviewed_by).
--   clinical_cases.clinical_reviewed_at   data da revisão clínica.
--
-- A trava (impõe no banco, mesmo que o Worker seja contornado). Um caso com sim_profile só fica 'approved' se:
--   (1) a lista de conferência tem os 4 itens verdadeiros (semDadoReal, gabaritoConferido, estagiosPlausiveis,
--       linguagemRevisada) E há data de revisão clínica (CHECK clinical_cases_sim_publish_chk);
--   (2) o revisor clínico é OUTRA pessoa que o autor (CHECK clinical_cases_sim_reviewer_chk; e o gatilho exige revisor
--       informado no momento da aprovação). O CHECK tolera NULL porque as chaves estrangeiras viram NULL quando uma
--       conta é apagada (LGPD): uma conta excluída não pode travar nem invalidar o acervo;
--   (3) o gatilho clinical_sim_review_guard exige a revisão ser FEITA NAQUELA gravação (clinical_reviewed_at novo) ao
--       entrar em 'approved', e, para editar sim_profile ou payload de um caso já publicado, nova revisão e
--       content_version maior. Mensagens começam com 'clinical_sim_review:' (o Worker as traduz).
-- Casos gerados por IA continuam 'pending' e NUNCA carregam sim_profile (CHECK clinical_cases_sim_source_chk: só
-- source = 'admin'). Casos antigos não mudam (colunas novas nulas).
--
-- A flag clinical_sim_enabled (035) segue DESLIGADA; esta migração só atualiza a descrição, e só se ainda for a original.
-- Colunas novas herdam RLS forçado e os privilégios da tabela (031/032); nenhum GRANT novo.
-- Aditiva e idempotente. Requer 013 (clinical_cases) e 035 (flag). Reversão: sql/down/037_clinical_sim.sql.

SET lock_timeout = '5s';

ALTER TABLE clinical_cases ADD COLUMN IF NOT EXISTS sim_profile JSONB;
ALTER TABLE clinical_cases ADD COLUMN IF NOT EXISTS content_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE clinical_cases ADD COLUMN IF NOT EXISTS review_checklist JSONB;
ALTER TABLE clinical_cases ADD COLUMN IF NOT EXISTS clinical_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE clinical_cases ADD COLUMN IF NOT EXISTS clinical_reviewed_at TIMESTAMPTZ;

ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_shape_chk;
ALTER TABLE clinical_cases ADD CONSTRAINT clinical_cases_sim_shape_chk CHECK (
  (sim_profile IS NULL OR (jsonb_typeof(sim_profile) = 'object' AND octet_length(sim_profile::text) <= 4096))
  AND (review_checklist IS NULL OR (jsonb_typeof(review_checklist) = 'object' AND octet_length(review_checklist::text) <= 512))
  AND content_version >= 1
);

ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_source_chk;
ALTER TABLE clinical_cases ADD CONSTRAINT clinical_cases_sim_source_chk CHECK (sim_profile IS NULL OR source = 'admin');

ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_publish_chk;
ALTER TABLE clinical_cases ADD CONSTRAINT clinical_cases_sim_publish_chk CHECK (
  sim_profile IS NULL
  OR status <> 'approved'
  OR (
    clinical_reviewed_at IS NOT NULL
    AND review_checklist -> 'semDadoReal' = 'true'::jsonb
    AND review_checklist -> 'gabaritoConferido' = 'true'::jsonb
    AND review_checklist -> 'estagiosPlausiveis' = 'true'::jsonb
    AND review_checklist -> 'linguagemRevisada' = 'true'::jsonb
  )
);

ALTER TABLE clinical_cases DROP CONSTRAINT IF EXISTS clinical_cases_sim_reviewer_chk;
ALTER TABLE clinical_cases ADD CONSTRAINT clinical_cases_sim_reviewer_chk CHECK (
  clinical_reviewed_by IS NULL OR created_by IS NULL OR clinical_reviewed_by <> created_by
);

CREATE OR REPLACE FUNCTION clinical_sim_review_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  entering BOOLEAN;
  edited BOOLEAN;
BEGIN
  IF NEW.sim_profile IS NULL OR NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;
  entering := TG_OP = 'INSERT' OR OLD.status <> 'approved' OR OLD.sim_profile IS NULL;
  edited := NOT entering AND (NEW.sim_profile IS DISTINCT FROM OLD.sim_profile OR NEW.payload IS DISTINCT FROM OLD.payload);
  IF NOT (entering OR edited) THEN
    RETURN NEW;  -- p.ex. a conta do revisor foi apagada (FK vira NULL): nada a revalidar
  END IF;
  IF NEW.clinical_reviewed_by IS NULL THEN
    RAISE EXCEPTION 'clinical_sim_review: informe o revisor clínico' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.created_by IS NOT NULL AND NEW.clinical_reviewed_by = NEW.created_by THEN
    RAISE EXCEPTION 'clinical_sim_review: o revisor clínico não pode ser a mesma pessoa que criou o caso' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.review_checklist IS NULL
     OR NEW.review_checklist -> 'semDadoReal' IS DISTINCT FROM 'true'::jsonb
     OR NEW.review_checklist -> 'gabaritoConferido' IS DISTINCT FROM 'true'::jsonb
     OR NEW.review_checklist -> 'estagiosPlausiveis' IS DISTINCT FROM 'true'::jsonb
     OR NEW.review_checklist -> 'linguagemRevisada' IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'clinical_sim_review: a lista de conferência precisa ter os 4 itens confirmados' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.clinical_reviewed_at IS NOT DISTINCT FROM OLD.clinical_reviewed_at THEN
    RAISE EXCEPTION 'clinical_sim_review: a revisão clínica precisa ser feita agora (data de revisão nova)' USING ERRCODE = 'check_violation';
  END IF;
  IF edited AND NEW.content_version <= OLD.content_version THEN
    RAISE EXCEPTION 'clinical_sim_review: caso publicado editado exige content_version maior' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_clinical_cases_sim_review ON clinical_cases;
CREATE TRIGGER trg_clinical_cases_sim_review
  BEFORE INSERT OR UPDATE ON clinical_cases
  FOR EACH ROW EXECUTE FUNCTION clinical_sim_review_guard();

UPDATE feature_flags
SET description = 'Clínica: simulação com pacientes variados (exige revisor clínico definido: casos com sim_profile só publicam com lista de conferência completa e revisor diferente do autor)'
WHERE key = 'clinical_sim_enabled' AND description LIKE 'Clínica: simulação com pacientes variados (reservada%';

RESET lock_timeout;
