-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 021_assistant_feedback.sql — respostas da Lia e feedback (polegar) das pessoas.
--
-- assistant_messages  uma linha por resposta da Lia a uma pessoa logada. Guarda só o
--                     mínimo: hash da pergunta normalizada (NUNCA o texto da pergunta),
--                     tópico, origem (regra, ao vivo, IA...), a resposta (texto gerado a
--                     partir de um prompt sem dado pessoal), citações e se foi degradada.
-- assistant_feedback  avaliação de uma resposta (up/down), categoria e comentário livre.
--                     O comentário pode ter dado pessoal: após 90 dias vira hash
--                     irreversível e o texto é apagado; após 12 meses o registro sai
--                     (ADR 0005; worker/src/maintenance.js e tools/db/cleanup-feedback.mjs).
-- Exclusão de conta: as duas tabelas saem junto (ON DELETE CASCADE).
-- Aditiva e idempotente. Reversão: sql/down/021_assistant_feedback.sql.

CREATE TABLE IF NOT EXISTS assistant_messages (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  question_hash  TEXT NOT NULL,
  topic          TEXT,
  source         TEXT NOT NULL,
  answer         TEXT NOT NULL,
  sources        JSONB NOT NULL DEFAULT '[]'::jsonb,
  degraded       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assistant_messages_source_chk CHECK (source IN ('kb', 'live', 'ai', 'fallback', 'refusal', 'suspended')),
  CONSTRAINT assistant_messages_len CHECK (char_length(answer) <= 4000 AND char_length(question_hash) <= 64),
  CONSTRAINT assistant_messages_sources_chk CHECK (jsonb_typeof(sources) = 'array')
);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_created ON assistant_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_messages_profile ON assistant_messages (profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS assistant_feedback (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id             UUID NOT NULL REFERENCES assistant_messages(id) ON DELETE CASCADE,
  profile_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating                 TEXT NOT NULL,
  category               TEXT,
  comment                TEXT,
  comment_hash           TEXT,
  status                 TEXT NOT NULL DEFAULT 'new',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  comment_anonymized_at  TIMESTAMPTZ,
  CONSTRAINT assistant_feedback_unique UNIQUE (message_id, profile_id),
  CONSTRAINT assistant_feedback_rating_chk CHECK (rating IN ('up', 'down')),
  CONSTRAINT assistant_feedback_category_chk CHECK (category IS NULL OR category IN ('incorreta', 'incompleta', 'confusa', 'ofensiva', 'outra')),
  CONSTRAINT assistant_feedback_status_chk CHECK (status IN ('new', 'reviewed', 'dismissed')),
  CONSTRAINT assistant_feedback_comment_len CHECK (comment IS NULL OR char_length(comment) <= 500)
);
CREATE INDEX IF NOT EXISTS idx_assistant_feedback_created ON assistant_feedback (created_at);
CREATE INDEX IF NOT EXISTS idx_assistant_feedback_status ON assistant_feedback (status, created_at DESC);
