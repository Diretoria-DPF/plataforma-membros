-- 009_messaging.sql
-- Fase 3d/3e do plano em docs/PLANO_FASE3_MENSAGERIA.md: chaves de
-- mensageria (X25519, uma pública por conta, nunca a privada), conversas
-- 1:1 e mensagens cifradas ponta a ponta (AES-GCM), mais o silenciamento
-- progressivo por envio em rajada exigido pelo "Requisito novo 2"
-- acrescentado ao plano em 2026-09-25.
--
-- Convenção do projeto (ver 007/008): idempotente, sem BEGIN/COMMIT —
-- cada statement é aplicado isoladamente via Neon MCP run_sql, exceto
-- quando um único template com CTE conta como um statement.

-- -----------------------------------------------------------------------
-- 1) Chave pública de mensageria por conta (nunca a privada, nunca a
--    frase-secreta). No máximo UMA versão ativa por conta; versões
--    antigas ficam (necessárias para o outro participante continuar
--    decifrando o histórico anterior a uma rotação).
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messaging_keys (
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_version     INTEGER NOT NULL,
  algorithm       VARCHAR(20) NOT NULL,
  public_key      TEXT NOT NULL,
  kdf_algorithm   VARCHAR(30) NOT NULL,
  kdf_iterations  INTEGER NOT NULL,
  kdf_salt        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at   TIMESTAMPTZ,
  PRIMARY KEY (profile_id, key_version),
  CONSTRAINT messaging_keys_version_positive CHECK (key_version >= 1),
  CONSTRAINT messaging_keys_algorithm_enum CHECK (algorithm IN ('X25519', 'P-256')),
  CONSTRAINT messaging_keys_kdf_enum CHECK (kdf_algorithm IN ('PBKDF2-SHA256')),
  CONSTRAINT messaging_keys_kdf_iterations_min CHECK (kdf_iterations >= 600000),
  CONSTRAINT messaging_keys_public_key_len CHECK (char_length(public_key) BETWEEN 40 AND 200),
  CONSTRAINT messaging_keys_salt_len CHECK (char_length(kdf_salt) BETWEEN 16 AND 64)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_messaging_keys_active
  ON messaging_keys (profile_id) WHERE superseded_at IS NULL;

-- -----------------------------------------------------------------------
-- 2) Conversas 1:1 (par ordenado, uma linha por par independente de quem
--    abriu) e mensagens cifradas. Não existe coluna de texto claro nem de
--    prévia em lugar nenhum — o servidor nunca vê o conteúdo.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_low    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_high   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at    TIMESTAMPTZ,
  low_last_read_id   BIGINT NOT NULL DEFAULT 0,
  high_last_read_id  BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT conversations_ordered_pair CHECK (participant_low < participant_high),
  CONSTRAINT conversations_pair_unique UNIQUE (participant_low, participant_high)
);
CREATE INDEX IF NOT EXISTS idx_conversations_low_recent  ON conversations (participant_low,  last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_high_recent ON conversations (participant_high, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id        UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_message_id      UUID NOT NULL,
  crypto_version         SMALLINT NOT NULL DEFAULT 1,
  sender_key_version     INTEGER NOT NULL,
  recipient_key_version  INTEGER NOT NULL,
  iv                     VARCHAR(24) NOT NULL,
  ciphertext             TEXT NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_client_id_unique UNIQUE (sender_id, client_message_id),
  CONSTRAINT messages_iv_len CHECK (char_length(iv) = 16),
  CONSTRAINT messages_ciphertext_len CHECK (char_length(ciphertext) BETWEEN 24 AND 12000)
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, id DESC);

-- -----------------------------------------------------------------------
-- 3) Gatilho de defesa em profundidade para o INSERT de mensagem, no
--    mesmo padrão de guard_connection_write/guard_task_signup: o service
--    (messageService.js) adianta mensagens amigáveis, mas este gatilho é
--    a autoridade real. Exige que:
--     - o remetente seja de fato um dos dois participantes da conversa;
--     - as duas contas estejam active e com e-mail confirmado;
--     - exista connections.status = 'accepted' para o par;
--     - não haja bloqueio em nenhuma direção;
--     - sender_key_version/recipient_key_version sejam as versões ATIVAS
--       atuais das duas contas (uma versão desatualizada é rejeitada —
--       o cliente precisa buscar a chave nova antes de reenviar).
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_message_insert() RETURNS TRIGGER AS $$
DECLARE
  v_low UUID;
  v_high UUID;
  v_peer_id UUID;
  v_sender_status account_status;
  v_sender_confirmed TIMESTAMPTZ;
  v_peer_status account_status;
  v_peer_confirmed TIMESTAMPTZ;
  v_is_connected BOOLEAN;
  v_is_blocked BOOLEAN;
  v_sender_active_version INTEGER;
  v_peer_active_version INTEGER;
BEGIN
  SELECT participant_low, participant_high INTO v_low, v_high
  FROM conversations WHERE id = NEW.conversation_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.sender_id <> v_low AND NEW.sender_id <> v_high THEN
    RAISE EXCEPTION 'Remetente não participa desta conversa.' USING ERRCODE = 'P0001';
  END IF;

  v_peer_id := CASE WHEN NEW.sender_id = v_low THEN v_high ELSE v_low END;

  SELECT status, email_confirmed_at INTO v_sender_status, v_sender_confirmed FROM profiles WHERE id = NEW.sender_id;
  SELECT status, email_confirmed_at INTO v_peer_status, v_peer_confirmed FROM profiles WHERE id = v_peer_id;

  IF v_sender_status IS DISTINCT FROM 'active'::account_status OR v_sender_confirmed IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está apta para enviar mensagens.' USING ERRCODE = 'P0001';
  END IF;
  IF v_peer_status IS DISTINCT FROM 'active'::account_status OR v_peer_confirmed IS NULL THEN
    RAISE EXCEPTION 'A conta do destinatário não está disponível.' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM connections
    WHERE status = 'accepted'::connection_status
      AND LEAST(requester_id, addressee_id) = v_low
      AND GREATEST(requester_id, addressee_id) = v_high
  ) INTO v_is_connected;
  IF NOT v_is_connected THEN
    RAISE EXCEPTION 'É preciso ter uma conexão aceita para trocar mensagens.' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM profile_blocks
    WHERE (blocker_id = NEW.sender_id AND blocked_id = v_peer_id)
       OR (blocker_id = v_peer_id AND blocked_id = NEW.sender_id)
  ) INTO v_is_blocked;
  IF v_is_blocked THEN
    RAISE EXCEPTION 'Não é possível enviar mensagens para esta conta.' USING ERRCODE = 'P0001';
  END IF;

  SELECT key_version INTO v_sender_active_version FROM messaging_keys
    WHERE profile_id = NEW.sender_id AND superseded_at IS NULL;
  SELECT key_version INTO v_peer_active_version FROM messaging_keys
    WHERE profile_id = v_peer_id AND superseded_at IS NULL;

  IF v_sender_active_version IS NULL OR NEW.sender_key_version <> v_sender_active_version THEN
    RAISE EXCEPTION 'Sua chave de mensageria está desatualizada. Atualize a conversa.' USING ERRCODE = 'P0001';
  END IF;
  IF v_peer_active_version IS NULL OR NEW.recipient_key_version <> v_peer_active_version THEN
    RAISE EXCEPTION 'A chave de mensageria do destinatário mudou. Atualize a conversa.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_message_insert ON messages;
CREATE TRIGGER trg_guard_message_insert BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION guard_message_insert();

-- -----------------------------------------------------------------------
-- 4) Silenciamento progressivo por envio em rajada ("Requisito novo 2").
--    Estado 100% no servidor — o próprio penalizado não tem nenhum
--    caminho de API que grave nesta tabela, então não há como resetar o
--    próprio silenciamento. A lógica fica numa função (mesmo padrão de
--    normalize_phone_br/guard_*): o bloqueio de linha (FOR UPDATE) dentro
--    da função serializa tentativas concorrentes da mesma conta, e a
--    chamada inteira é UM statement do ponto de vista do driver HTTP.
-- -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS message_penalties (
  profile_id               UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  burst_count              INTEGER NOT NULL DEFAULT 0,
  burst_window_started_at  TIMESTAMPTZ,
  mute_strikes             INTEGER NOT NULL DEFAULT 0,
  muted_until              TIMESTAMPTZ,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_penalties_burst_count_nonneg CHECK (burst_count >= 0),
  CONSTRAINT message_penalties_strikes_nonneg CHECK (mute_strikes >= 0)
);

CREATE OR REPLACE FUNCTION apply_message_penalty(
  p_profile_id UUID,
  p_burst_max INTEGER,
  p_window_seconds INTEGER,
  p_base_minutes INTEGER,
  p_multiplier INTEGER
) RETURNS TABLE(is_muted BOOLEAN, muted_until TIMESTAMPTZ, mute_strikes INTEGER, retry_after_seconds INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_row message_penalties%ROWTYPE;
  v_new_burst_count INTEGER;
  v_new_window TIMESTAMPTZ;
  v_new_strikes INTEGER;
  v_new_muted_until TIMESTAMPTZ;
BEGIN
  INSERT INTO message_penalties (profile_id) VALUES (p_profile_id)
    ON CONFLICT (profile_id) DO NOTHING;

  SELECT * INTO v_row FROM message_penalties WHERE profile_id = p_profile_id FOR UPDATE;

  -- Ainda dentro de um silenciamento já aplicado: bloqueia sem contar
  -- como nova reincidência (reincidência só conta depois que o
  -- silenciamento em vigor tiver vencido e o limite for estourado de novo).
  IF v_row.muted_until IS NOT NULL AND v_row.muted_until > now() THEN
    RETURN QUERY SELECT true, v_row.muted_until, v_row.mute_strikes,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_row.muted_until - now())))::INTEGER);
    RETURN;
  END IF;

  IF v_row.burst_window_started_at IS NULL
     OR v_row.burst_window_started_at < now() - (p_window_seconds || ' seconds')::interval THEN
    v_new_burst_count := 1;
    v_new_window := now();
  ELSE
    v_new_burst_count := v_row.burst_count + 1;
    v_new_window := v_row.burst_window_started_at;
  END IF;

  IF v_new_burst_count > p_burst_max THEN
    v_new_strikes := v_row.mute_strikes + 1;
    v_new_muted_until := now() + ((p_base_minutes * power(p_multiplier, v_new_strikes - 1)) || ' minutes')::interval;

    UPDATE message_penalties SET
      burst_count = 0, burst_window_started_at = NULL,
      mute_strikes = v_new_strikes, muted_until = v_new_muted_until, updated_at = now()
    WHERE profile_id = p_profile_id;

    RETURN QUERY SELECT true, v_new_muted_until, v_new_strikes,
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_new_muted_until - now())))::INTEGER);
    RETURN;
  END IF;

  UPDATE message_penalties SET
    burst_count = v_new_burst_count, burst_window_started_at = v_new_window, updated_at = now()
  WHERE profile_id = p_profile_id;

  RETURN QUERY SELECT false, v_row.muted_until, v_row.mute_strikes, 0;
END;
$$;
