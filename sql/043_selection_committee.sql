-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 043_selection_committee.sql — processo seletivo, fatia 2: painel da comissão, triagem por IA e pedido de revisão.
--
--   * etapa 'quiz' vira 'thinking' (a prova deixa de ter objetivas: perguntas abertas sobre a forma de pensar);
--   * ai_triage / ai_triage_at: resumo opcional gerado por IA. Só ORGANIZA a leitura da comissão: nunca decide nem
--     elimina (LGPD, art. 20: a decisão é de pessoas, registrada em decided_by);
--   * decided_by / decided_at / decision_note: quem decidiu, quando e a observação interna;
--   * appeal_at / appeal_note: a pessoa pode pedir revisão humana da decisão.
-- Aditiva e idempotente. Requer 042. Reversão: sql/down/043_selection_committee.sql.

SET lock_timeout = '5s';

ALTER TABLE selection_applications DROP CONSTRAINT IF EXISTS selection_applications_step_chk;
UPDATE selection_applications SET step = 'thinking' WHERE step = 'quiz';
ALTER TABLE selection_applications ADD CONSTRAINT selection_applications_step_chk CHECK (step IN
  ('intro', 'profile', 'scenario', 'thinking', 'conduct', 'review', 'done'));

ALTER TABLE selection_applications
  ADD COLUMN IF NOT EXISTS ai_triage    JSONB,
  ADD COLUMN IF NOT EXISTS ai_triage_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decision_note TEXT,
  ADD COLUMN IF NOT EXISTS appeal_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_note  TEXT;

ALTER TABLE selection_applications DROP CONSTRAINT IF EXISTS selection_applications_notes_chk;
ALTER TABLE selection_applications ADD CONSTRAINT selection_applications_notes_chk CHECK (
  (decision_note IS NULL OR char_length(decision_note) <= 1000) AND (appeal_note IS NULL OR char_length(appeal_note) <= 600));

CREATE INDEX IF NOT EXISTS idx_selection_decided_by ON selection_applications (decided_by);

RESET lock_timeout;
