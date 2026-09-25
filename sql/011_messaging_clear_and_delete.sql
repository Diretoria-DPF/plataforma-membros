-- 011_messaging_clear_and_delete.sql
-- Divide "apagar" em duas ações distintas, pedido direto do dono da
-- plataforma: "cada usuario apaga apenas a sua visualização, mas não apaga
-- a visualização do outro". A versão anterior de "Limpar conversa"
-- (sql/010) fazia DELETE físico das mensagens, afetando os dois lados —
-- corrigido aqui.
--
-- 1) "Limpar conversa" passa a ser um marcador POR PARTICIPANTE
--    (low_cleared_before_id/high_cleared_before_id, mesmo padrão de
--    low_last_read_id/high_last_read_id já existente): esconde mensagens
--    antigas da PRÓPRIA visão, sem apagar nada do lado do outro.
-- 2) "Apagar mensagem" (só a própria, remove para os dois): tombstone —
--    zera ciphertext/iv e marca deleted_at, mantendo a linha (id, sender,
--    timestamps) para não quebrar paginação/marcadores de leitura nem o
--    contador de mensagens.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS low_cleared_before_id BIGINT NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS high_cleared_before_id BIGINT NOT NULL DEFAULT 0;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE messages ALTER COLUMN ciphertext DROP NOT NULL;
ALTER TABLE messages ALTER COLUMN iv DROP NOT NULL;

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_iv_len;
ALTER TABLE messages ADD CONSTRAINT messages_iv_len CHECK (iv IS NULL OR char_length(iv) = 16);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_ciphertext_len;
ALTER TABLE messages ADD CONSTRAINT messages_ciphertext_len CHECK (ciphertext IS NULL OR char_length(ciphertext) BETWEEN 24 AND 12000);

ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_deleted_consistency;
ALTER TABLE messages ADD CONSTRAINT messages_deleted_consistency CHECK (
  (deleted_at IS NULL AND ciphertext IS NOT NULL AND iv IS NOT NULL)
  OR
  (deleted_at IS NOT NULL AND ciphertext IS NULL AND iv IS NULL)
);

-- "Apagar somente para mim": esconde UMA mensagem específica (minha ou do
-- outro participante) só da minha própria visão — o outro lado continua
-- vendo normalmente. Diferente de deleted_at (que apaga para os DOIS lados,
-- só disponível para a própria mensagem) e de cleared_before_id (que
-- esconde tudo ATÉ um ponto, não uma mensagem específica no meio).
CREATE TABLE IF NOT EXISTS message_hides (
  message_id  BIGINT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  hidden_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_message_hides_profile ON message_hides (profile_id, message_id);
