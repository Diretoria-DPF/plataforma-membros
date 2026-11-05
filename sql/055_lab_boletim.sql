-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 055_lab_boletim.sql — boletim por competência do Laboratório guardado na conta (decisão D-6 do dono; hoje o
-- boletim vive só no aparelho: frontend/modulos/laboratorio/js/lab-boletim.js, função paraConta = este contrato).
-- Uma linha por pessoa e grupo de competência, só contadores (sem nota, sem ranking, sem texto livre). Só a
-- própria pessoa lê e grava; nenhuma consulta agrega entre pessoas. DESLIGADA: a flag lab_boletim_conta_enabled
-- nasce FALSE e ainda não existe endpoint no Worker. ANTES de ligar: incluir a tabela no export do titular
-- (privacyService.js) — a exclusão da conta já a cobre pelo ON DELETE CASCADE.
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente; só ESCRITA do arquivo,
-- não aplicada. Requer 016, 031 e 032. Reversão: sql/down/055_lab_boletim.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS lab_boletim_competencia (
  profile_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  competencia    TEXT        NOT NULL,
  acertos        INTEGER     NOT NULL DEFAULT 0 CHECK (acertos BETWEEN 0 AND 100000),
  erros          INTEGER     NOT NULL DEFAULT 0 CHECK (erros BETWEEN 0 AND 100000),
  dicas          INTEGER     NOT NULL DEFAULT 0 CHECK (dicas BETWEEN 0 AND 100000),
  pulos          INTEGER     NOT NULL DEFAULT 0 CHECK (pulos BETWEEN 0 AND 100000),
  fora_de_ordem  INTEGER     NOT NULL DEFAULT 0 CHECK (fora_de_ordem BETWEEN 0 AND 100000),
  sem_apoio      INTEGER     NOT NULL DEFAULT 0 CHECK (sem_apoio BETWEEN 0 AND 100000),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_boletim_competencia_pk PRIMARY KEY (profile_id, competencia),
  CONSTRAINT lab_boletim_competencia_chk CHECK (competencia ~ '^[a-z_]{1,20}$'),
  CONSTRAINT lab_boletim_sem_apoio_chk CHECK (sem_apoio <= acertos)
);

SELECT laift_enable_rls('lab_boletim_competencia'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON lab_boletim_competencia TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('lab_boletim_conta_enabled', FALSE, 'Laboratório: guardar o boletim por competência na conta (hoje só no aparelho)')
ON CONFLICT (key) DO NOTHING;
