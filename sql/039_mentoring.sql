-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 039_mentoring.sql — Mentoria entre membros (ROL-04; docs/mentoria.md; ADR 0010).
--
-- mentorships: vínculo entre quem mentora (mentor_id) e quem é mentorada (mentee_id). Estados: pending (pedido),
--   active (aceito), declined (recusado) e ended (encerrado ou pedido cancelado). requested_by é quem abriu o pedido
--   (hoje sempre a pessoa mentorada). Sem auto-mentoria (CHECK). O índice único parcial garante UM vínculo aberto
--   (pending ou active) por par de pessoas, em qualquer direção; recusados e encerrados ficam como histórico.
--   share_progress: a pessoa mentorada decide se o mentor vê o RESUMO do seu progresso (módulos, % de acerto, sequência).
--   Nunca há respostas individuais; o Worker confere o vínculo ativo e esta marca a cada leitura.
-- profiles.mentoring_available: o membro que se oferece como mentor (além de quem tem o cargo mentor, sql/038).
-- A conversa reaproveita o chat cifrado (connections/conversations, 007/009); nada de mensagem é gravado aqui.
-- Também semeia a flag mentoring_enabled, DESLIGADA (ON CONFLICT DO NOTHING: reaplicar nunca religa nem desliga).
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente. Requer 016 e 032.
-- Reversão: sql/down/039_mentoring.sql.

SET lock_timeout = '5s';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS mentoring_available BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS mentorships (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  mentor_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentee_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          TEXT        NOT NULL DEFAULT 'pending',
  requested_by    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  share_progress  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mentorships_pk PRIMARY KEY (id),
  CONSTRAINT mentorships_not_self_chk CHECK (mentor_id <> mentee_id),
  CONSTRAINT mentorships_status_chk CHECK (status IN ('pending', 'active', 'declined', 'ended')),
  CONSTRAINT mentorships_requested_by_chk CHECK (requested_by IN (mentor_id, mentee_id))
);

-- Um vínculo aberto (pending ou active) por par, em qualquer direção.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mentorships_open_pair
  ON mentorships (LEAST(mentor_id, mentee_id), GREATEST(mentor_id, mentee_id))
  WHERE status IN ('pending', 'active');

CREATE INDEX IF NOT EXISTS idx_mentorships_mentor ON mentorships (mentor_id, status);
CREATE INDEX IF NOT EXISTS idx_mentorships_mentee ON mentorships (mentee_id, status);
CREATE INDEX IF NOT EXISTS idx_mentorships_requested_by ON mentorships (requested_by);

-- Lista de mentores disponíveis (só quem se oferece).
CREATE INDEX IF NOT EXISTS idx_profiles_mentoring_available ON profiles (id) WHERE mentoring_available;

SELECT laift_enable_rls('mentorships'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON mentorships TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('mentoring_enabled', FALSE, 'Mentoria entre membros: tela Mentoria no menu Participação (pedido, aceite e resumo de progresso compartilhado)')
ON CONFLICT (key) DO NOTHING;

RESET lock_timeout;
