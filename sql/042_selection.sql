-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 042_selection.sql — processo seletivo contínuo dentro da plataforma (docs/planos/PROCESSO-SELETIVO.md, fatia 1).
--
--   selection_applications  uma inscrição por pessoa e tentativa: etapa atual, respostas por etapa (JSONB), prazo
--                           individual, comprovante. Só UMA inscrição ATIVA por pessoa (índice único parcial).
--   selection_events        linha do tempo da inscrição (começou, salvou etapa, enviou, retirou...). Só metadados,
--                           nunca o texto escrito pela pessoa.
--   selection_settings      linha única: inscrições abertas, prazo individual, intervalo entre lotes e a data da
--                           próxima análise (é o que a página pública mostra no lugar de "a divulgar").
--
-- Flags (nascem DESLIGADAS; INSERT ... ON CONFLICT DO NOTHING, reaplicar nunca religa nem desliga):
--   selection_enabled     a jornada do candidato dentro da plataforma.
--   selection_ai_enabled  triagem por IA (fatia 2; a flag já existe para o painel poder consultá-la).
--
-- A decisão da comissão (aprovar, lista de espera...) e a triagem por IA entram na fatia 2, com colunas novas numa
-- migração própria. RLS forçado + laift_worker (laift_enable_rls, 031/032). Aditiva e idempotente. Requer 016 e 032.
-- Reversão: sql/down/042_selection.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS selection_applications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'draft',
  bank_version  TEXT NOT NULL,
  seed          INTEGER NOT NULL,
  step          TEXT NOT NULL DEFAULT 'intro',
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at   TIMESTAMPTZ NOT NULL,
  submitted_at  TIMESTAMPTZ,
  receipt_code  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT selection_applications_status_chk CHECK (status IN
    ('draft', 'submitted', 'in_review', 'interview', 'approved', 'waitlist', 'not_selected', 'withdrawn', 'expired')),
  CONSTRAINT selection_applications_step_chk CHECK (step IN
    ('intro', 'profile', 'scenario', 'quiz', 'conduct', 'review', 'done')),
  CONSTRAINT selection_applications_data_size_chk CHECK (pg_column_size(data) <= 65536)
);

-- Uma inscrição ativa por pessoa: o envio duplicado ou duas abas não criam uma segunda.
CREATE UNIQUE INDEX IF NOT EXISTS uq_selection_one_active
  ON selection_applications (profile_id)
  WHERE status IN ('draft', 'submitted', 'in_review', 'interview', 'waitlist');

-- Fila da comissão (fatia 2) e expiração de rascunhos.
CREATE INDEX IF NOT EXISTS idx_selection_status_submitted ON selection_applications (status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_selection_deadline ON selection_applications (deadline_at) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS uq_selection_receipt ON selection_applications (receipt_code) WHERE receipt_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS selection_events (
  id              BIGSERIAL PRIMARY KEY,
  application_id  UUID NOT NULL REFERENCES selection_applications(id) ON DELETE CASCADE,
  actor_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL,
  meta            JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT selection_events_kind_chk CHECK (char_length(kind) BETWEEN 1 AND 40)
);
CREATE INDEX IF NOT EXISTS idx_selection_events_app ON selection_events (application_id, created_at);
CREATE INDEX IF NOT EXISTS idx_selection_events_actor ON selection_events (actor_id);

CREATE TABLE IF NOT EXISTS selection_settings (
  id               SMALLINT PRIMARY KEY DEFAULT 1,
  is_open          BOOLEAN NOT NULL DEFAULT TRUE,
  window_days      INTEGER NOT NULL DEFAULT 7,
  batch_every_days INTEGER NOT NULL DEFAULT 15,
  next_review_on   DATE,
  vacancies_note   TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT selection_settings_single_chk CHECK (id = 1),
  CONSTRAINT selection_settings_window_chk CHECK (window_days BETWEEN 1 AND 60),
  CONSTRAINT selection_settings_batch_chk CHECK (batch_every_days BETWEEN 1 AND 90),
  CONSTRAINT selection_settings_note_chk CHECK (vacancies_note IS NULL OR char_length(vacancies_note) <= 200)
);
INSERT INTO selection_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

SELECT laift_enable_rls('selection_applications'::regclass);
SELECT laift_enable_rls('selection_events'::regclass);
SELECT laift_enable_rls('selection_settings'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON selection_applications TO laift_worker;
    GRANT SELECT, INSERT ON selection_events TO laift_worker;
    GRANT USAGE, SELECT ON SEQUENCE selection_events_id_seq TO laift_worker;
    GRANT SELECT, UPDATE ON selection_settings TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('selection_enabled', FALSE, 'Processo seletivo contínuo dentro da plataforma (jornada do candidato)'),
  ('selection_ai_enabled', FALSE, 'Triagem por IA das inscrições do processo seletivo (apoio à comissão; nunca decide)')
ON CONFLICT (key) DO NOTHING;

RESET lock_timeout;
