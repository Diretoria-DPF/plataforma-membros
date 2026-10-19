-- Reverte 043_selection_committee.sql (perde triagem, decisões e pedidos de revisão gravados).
DROP INDEX IF EXISTS idx_selection_decided_by;
ALTER TABLE selection_applications DROP CONSTRAINT IF EXISTS selection_applications_notes_chk;
ALTER TABLE selection_applications
  DROP COLUMN IF EXISTS appeal_note, DROP COLUMN IF EXISTS appeal_at, DROP COLUMN IF EXISTS decision_note,
  DROP COLUMN IF EXISTS decided_at, DROP COLUMN IF EXISTS decided_by, DROP COLUMN IF EXISTS ai_triage_at, DROP COLUMN IF EXISTS ai_triage;
ALTER TABLE selection_applications DROP CONSTRAINT IF EXISTS selection_applications_step_chk;
UPDATE selection_applications SET step = 'quiz' WHERE step = 'thinking';
ALTER TABLE selection_applications ADD CONSTRAINT selection_applications_step_chk CHECK (step IN
  ('intro', 'profile', 'scenario', 'quiz', 'conduct', 'review', 'done'));
