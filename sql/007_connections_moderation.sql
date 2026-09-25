-- 007_connections_moderation.sql
-- Fase 3a do plano em docs/PLANO_FASE3_MENSAGERIA.md (já revisado por
-- security-reviewer; achado HIGH do cooldown de recusa já incorporado
-- aqui via connections.declined_until — ver seção 2.1/10 do plano).
--
-- Sistema de conexões entre membros ("ligar-se" a outro membro): pedido
-- por username ou telefone exatos, aceitar/recusar/bloquear, e fila de
-- denúncia só para admins. Pré-requisito do fluxograma de membros da
-- liga (clicar num membro do fluxograma abre o perfil público + botão
-- de solicitar conexão).

DO $$ BEGIN
  CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_category AS ENUM ('harassment', 'spam', 'impersonation', 'inappropriate_content', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('open', 'under_review', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Telefone hoje é texto livre (8-30 chars), sem normalização e sem
-- unicidade. Normalização conservadora BR: só dígitos, remove DDI "55"
-- ou "0" de tronco inicial quando o comprimento total bate com o
-- padrão esperado. Casos fora do padrão simplesmente não casam (a
-- resposta ao cliente é uniforme de qualquer forma, nunca revela erro
-- de normalização). IMMUTABLE é exigido para uso em coluna gerada.
CREATE OR REPLACE FUNCTION normalize_phone_br(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    CASE
      WHEN regexp_replace(coalesce(raw, ''), '\D', '', 'g') ~ '^55\d{10,11}$'
        THEN substring(regexp_replace(raw, '\D', '', 'g') from 3)
      WHEN regexp_replace(coalesce(raw, ''), '\D', '', 'g') ~ '^0\d{10,11}$'
        THEN substring(regexp_replace(raw, '\D', '', 'g') from 2)
      ELSE regexp_replace(coalesce(raw, ''), '\D', '', 'g')
    END,
    ''
  );
$$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED;

-- Descoberta por telefone é opt-in (padrão desligado) — telefone foi
-- coletado no cadastro "para contato operacional"; usá-lo pra descoberta
-- de conta é uma finalidade nova sob a LGPD, então cada pessoa decide.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_discoverable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_phone_discovery
  ON profiles (phone_normalized) WHERE phone_discoverable;

CREATE TABLE IF NOT EXISTS connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          connection_status NOT NULL DEFAULT 'pending',
  requested_via   VARCHAR(10) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  declined_until  TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connections_not_self CHECK (requester_id <> addressee_id),
  CONSTRAINT connections_requested_via_enum CHECK (requested_via IN ('username', 'phone'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_pair
  ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_connections_addressee_pending
  ON connections (addressee_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_connections_requester_status ON connections (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_addressee_status ON connections (addressee_id, status);

DROP TRIGGER IF EXISTS trg_connections_updated_at ON connections;
CREATE TRIGGER trg_connections_updated_at BEFORE UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Registro direcional; efeito é bidirecional (ver gatilhos de
-- connections/messages que checam bloqueio em ambos os sentidos).
CREATE TABLE IF NOT EXISTS profile_blocks (
  blocker_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT profile_blocks_not_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_blocks_blocked ON profile_blocks (blocked_id);

-- Denúncia: registro de moderação, sobrevive à exclusão das contas
-- (SET NULL, como audit_logs/votos já fazem).
CREATE TABLE IF NOT EXISTS profile_reports (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reported_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category             report_category NOT NULL,
  details              TEXT,
  evidence_excerpt     TEXT,
  status               report_status NOT NULL DEFAULT 'open',
  resolved_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  resolution_note      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_reports_details_len CHECK (details IS NULL OR char_length(details) <= 1000),
  CONSTRAINT profile_reports_evidence_len CHECK (evidence_excerpt IS NULL OR char_length(evidence_excerpt) <= 4000),
  CONSTRAINT profile_reports_note_len CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 1000)
);
CREATE INDEX IF NOT EXISTS idx_profile_reports_status_created ON profile_reports (status, created_at);
CREATE INDEX IF NOT EXISTS idx_profile_reports_reported ON profile_reports (reported_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_reports_open_pair
  ON profile_reports (reporter_id, reported_profile_id) WHERE status IN ('open', 'under_review');

DROP TRIGGER IF EXISTS trg_profile_reports_updated_at ON profile_reports;
CREATE TRIGGER trg_profile_reports_updated_at BEFORE UPDATE ON profile_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Gatilho de defesa em profundidade, no mesmo padrão de
-- guard_event_registration/guard_task_signup (sql/002_functions_and_triggers.sql):
-- a checagem de negócio no service adianta uma mensagem amigável, mas
-- este gatilho é a autoridade real. Exige que:
--  - as duas contas estejam active e com e-mail confirmado;
--  - o papel das duas esteja em (member, admin) — visitantes não usam
--    conexões nem mensageria;
--  - não exista bloqueio em nenhuma direção;
--  - em UPDATE, accepted/declined só vem de pending;
--  - em UPDATE, pending só vem de declined, e só depois que
--    declined_until vencer (cooldown de recusa — achado HIGH corrigido).
CREATE OR REPLACE FUNCTION guard_connection_write() RETURNS TRIGGER AS $$
DECLARE
  req_status account_status;
  req_role user_role;
  req_confirmed TIMESTAMPTZ;
  addr_status account_status;
  addr_role user_role;
  addr_confirmed TIMESTAMPTZ;
  is_blocked BOOLEAN;
BEGIN
  SELECT status, role, email_confirmed_at INTO req_status, req_role, req_confirmed
    FROM profiles WHERE id = NEW.requester_id;
  SELECT status, role, email_confirmed_at INTO addr_status, addr_role, addr_confirmed
    FROM profiles WHERE id = NEW.addressee_id;

  IF req_status IS DISTINCT FROM 'active'::account_status OR req_confirmed IS NULL THEN
    RAISE EXCEPTION 'Conta do solicitante não está apta para conexões.' USING ERRCODE = 'P0001';
  END IF;
  IF addr_status IS DISTINCT FROM 'active'::account_status OR addr_confirmed IS NULL THEN
    RAISE EXCEPTION 'Conta do destinatário não está apta para conexões.' USING ERRCODE = 'P0001';
  END IF;
  IF req_role NOT IN ('member', 'admin') OR addr_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Conexões são exclusivas para membros e administradores.' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM profile_blocks
    WHERE (blocker_id = NEW.requester_id AND blocked_id = NEW.addressee_id)
       OR (blocker_id = NEW.addressee_id AND blocked_id = NEW.requester_id)
  ) INTO is_blocked;
  IF is_blocked THEN
    RAISE EXCEPTION 'Não é possível interagir com esta conta.' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IN ('accepted', 'declined') AND OLD.status IS DISTINCT FROM 'pending'::connection_status THEN
      RAISE EXCEPTION 'Transição de status de conexão inválida.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'pending'::connection_status AND OLD.status IS DISTINCT FROM 'declined'::connection_status THEN
      RAISE EXCEPTION 'Transição de status de conexão inválida.' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.status = 'pending'::connection_status AND OLD.status = 'declined'::connection_status
       AND OLD.declined_until IS NOT NULL AND now() <= OLD.declined_until THEN
      RAISE EXCEPTION 'Aguarde o prazo de reenvio deste pedido de conexão.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_connection_write ON connections;
CREATE TRIGGER trg_guard_connection_write BEFORE INSERT OR UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION guard_connection_write();
