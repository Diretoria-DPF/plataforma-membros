-- =============================================================================
-- 005_fase2_schema.sql
-- Plataforma de Membros — Schema da Fase 2 (perfil estendido, avatar/imagem de
-- evento, status "em andamento", comentário/conclusão de tarefa por membro).
--
-- Idempotente (guards + IF NOT EXISTS em toda alteração) — seguro reaplicar.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- profiles: campos novos de perfil (todos opcionais exceto username, que é
-- obrigatório desde o cadastro — backfill abaixo cobre as contas já
-- existentes antes desta migração).
-- -----------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username VARCHAR(30);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(255);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram_handle VARCHAR(60);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests TEXT;

-- Backfill: gera um username a partir do prefixo do e-mail para contas que já
-- existiam antes desta coluna existir. Sufixo curto do id garante unicidade
-- mesmo se dois e-mails tiverem o mesmo prefixo.
UPDATE profiles
SET username = lower(regexp_replace(split_part(email, '@', 1), '[^a-zA-Z0-9_.]', '', 'g')) || substr(replace(id::text, '-', ''), 1, 4)
WHERE username IS NULL;

DO $$ BEGIN
  ALTER TABLE profiles ALTER COLUMN username SET NOT NULL;
EXCEPTION WHEN others THEN NULL; END $$;

-- UNIQUE cria um índice com o mesmo nome: ao reaplicar, o Postgres acusa
-- duplicate_table (42P07, "relation already exists"), não duplicate_object —
-- sem os dois no guard, este arquivo não era de fato reaplicável.
DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_username_unique UNIQUE (username);
EXCEPTION WHEN duplicate_object OR duplicate_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_username_format
    CHECK (username ~ '^[a-zA-Z0-9_.]{3,30}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD CONSTRAINT profiles_interests_len
    CHECK (interests IS NULL OR char_length(interests) <= 500);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles (username);

-- -----------------------------------------------------------------------------
-- events: status "em andamento" (sinaliza que o evento está acontecendo
-- agora) + imagem de capa. ALTER TYPE ... ADD VALUE não pode ser usado na
-- MESMA transação em que o valor novo é lido/gravado — aqui só adicionamos o
-- valor, nunca o usamos neste arquivo, então é seguro dentro do BEGIN/COMMIT.
-- -----------------------------------------------------------------------------
ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'in_progress';

ALTER TABLE events ADD COLUMN IF NOT EXISTS image_url TEXT;

-- -----------------------------------------------------------------------------
-- task_signups: conclusão marcada pelo próprio membro (distinta do status
-- administrativo da tarefa como um todo, que já existia em tasks.status).
-- -----------------------------------------------------------------------------
ALTER TABLE task_signups ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- task_comments: comentários de membros numa tarefa em que estão inscritos.
-- profile_id usa SET NULL (mesmo padrão de feedback/proposals): o comentário
-- é parte do histórico de trabalho coletivo e sobrevive ao desaparecimento
-- da conta autora.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_comments_message_len CHECK (char_length(message) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments (task_id, created_at);

COMMIT;
