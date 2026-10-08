-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 022_assistant_moderation.sql — moderação da Lia (níveis, decaimento e redenção; ADR 0004).
--
-- assistant_moderation  estado atual por pessoa: nível 0 normal, 1 alerta, 2 aviso sério,
--                       3 suspensão de 24 h (until). last_incident_at e last_decay_at
--                       marcam o relógio do decaimento (-1 nível a cada 30 dias sem
--                       incidente); redeemed_at e redeem_attempt_at controlam a redenção
--                       (nova tentativa após 1 h).
-- assistant_incidents   histórico para auditoria. NÃO guarda o texto da mensagem: só
--                       tipo, forma de detecção e o nível resultante.
-- Exclusão de conta: sai junto (ON DELETE CASCADE).
-- Aditiva e idempotente. Reversão: sql/down/022_assistant_moderation.sql.

CREATE TABLE IF NOT EXISTS assistant_moderation (
  profile_id         UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  level              SMALLINT NOT NULL DEFAULT 0,
  until              TIMESTAMPTZ,
  last_incident_at   TIMESTAMPTZ,
  last_decay_at      TIMESTAMPTZ,
  redeemed_at        TIMESTAMPTZ,
  redeem_attempt_at  TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assistant_moderation_level_chk CHECK (level BETWEEN 0 AND 3)
);
CREATE INDEX IF NOT EXISTS idx_assistant_moderation_level ON assistant_moderation (level) WHERE level > 0;

CREATE TABLE IF NOT EXISTS assistant_incidents (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'offensive',
  detection   TEXT NOT NULL,
  level_after SMALLINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assistant_incidents_detection_chk CHECK (detection IN ('terms', 'llm')),
  CONSTRAINT assistant_incidents_level_chk CHECK (level_after BETWEEN 0 AND 3)
);
CREATE INDEX IF NOT EXISTS idx_assistant_incidents_profile ON assistant_incidents (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assistant_incidents_created ON assistant_incidents (created_at);
