-- =============================================================================
-- 001_schema.sql
-- Plataforma de Membros — Schema base (Neon PostgreSQL)
--
-- Estratégia de migração: arquivos numerados e sequenciais, aplicados uma única
-- vez e na ordem (001, depois 002, ...). Alterações futuras devem vir em NOVOS
-- arquivos numerados (003_*, 004_*...) e nunca editar 001/002 depois que forem
-- aplicados em qualquer ambiente. Ainda assim, este arquivo é escrito de forma
-- IDEMPOTENTE (guards contra reexecução) para permitir aplicá-lo com segurança
-- em uma branch nova do Neon ou reaplicar em caso de dúvida sobre o estado do
-- banco, sem exigir que o operador edite o SQL manualmente antes de reaplicar.
--
-- Execute com um usuário com privilégio para criar extensões (ou peça ao
-- administrador do projeto Neon para habilitar as extensões antecipadamente).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extensões
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- Tipos enumerados (CREATE TYPE não aceita IF NOT EXISTS; usamos um bloco
-- idempotente por tipo para permitir reaplicar este arquivo sem erro).
-- -----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('visitor', 'member', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('active', 'banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE validation_preference AS ENUM ('email', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE theme_preference AS ENUM ('light', 'dark', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE density_preference AS ENUM ('standard', 'compact');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE consent_document_type AS ENUM ('terms', 'privacy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_status AS ENUM ('draft', 'published', 'closed', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_visibility AS ENUM ('public', 'authenticated', 'members');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE proposal_status AS ENUM ('submitted', 'approved', 'rejected', 'voting_open', 'voting_closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vote_choice AS ENUM ('yes', 'no', 'complement');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('draft', 'published', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_token_type AS ENUM ('email_confirmation', 'password_reset');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -----------------------------------------------------------------------------
-- profiles
-- Conta da pessoa. role=visitor por padrão no cadastro; a promoção a admin é
-- SEMPRE manual (ver docs/DEPLOYMENT.md). status=banned é um ESTADO da conta,
-- não um papel — uma conta banida mantém seu role anterior registrado, mas
-- perde todo acesso autenticado (ver Security.gs / AuthService.gs).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name              VARCHAR(150) NOT NULL,
  email                  VARCHAR(255) NOT NULL,
  password_hash          TEXT NOT NULL,
  phone                  VARCHAR(30) NOT NULL,
  city                   VARCHAR(120),
  education              VARCHAR(120),
  role                   user_role NOT NULL DEFAULT 'visitor',
  status                 account_status NOT NULL DEFAULT 'active',
  email_confirmed_at     TIMESTAMPTZ,
  validation_preference  validation_preference NOT NULL DEFAULT 'email',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profiles_full_name_len CHECK (char_length(full_name) BETWEEN 3 AND 150),
  CONSTRAINT profiles_email_lower CHECK (email = lower(email)),
  CONSTRAINT profiles_email_format CHECK (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  CONSTRAINT profiles_phone_len CHECK (char_length(phone) BETWEEN 8 AND 30),
  -- V1 só aceita validação por e-mail; SMS é rejeitado mesmo se enviado manualmente ao servidor.
  CONSTRAINT profiles_validation_email_only CHECK (validation_preference = 'email'),
  CONSTRAINT profiles_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_profiles_role_status ON profiles (role, status);

-- -----------------------------------------------------------------------------
-- consents
-- Histórico append-only de aceite de Termos/Política por versão (nunca é
-- sobrescrito: uma nova versão gera uma nova linha).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consents (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  document_type     consent_document_type NOT NULL,
  document_version  VARCHAR(20) NOT NULL,
  accepted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT consents_unique_version UNIQUE (profile_id, document_type, document_version)
);

CREATE INDEX IF NOT EXISTS idx_consents_profile ON consents (profile_id);

-- -----------------------------------------------------------------------------
-- preferences
-- Uma linha por perfil (1:1). Tema, densidade e notificações por e-mail.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS preferences (
  profile_id          UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  theme               theme_preference NOT NULL DEFAULT 'system',
  density             density_preference NOT NULL DEFAULT 'standard',
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- events
-- created_by usa ON DELETE SET NULL: o evento é um registro coletivo que deve
-- sobreviver mesmo que a conta de quem o criou deixe de existir no futuro.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title        VARCHAR(150) NOT NULL,
  description  TEXT NOT NULL,
  status       event_status NOT NULL DEFAULT 'draft',
  visibility   event_visibility NOT NULL DEFAULT 'authenticated',
  event_date   TIMESTAMPTZ NOT NULL,
  capacity     INTEGER,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT events_title_len CHECK (char_length(title) BETWEEN 3 AND 150),
  CONSTRAINT events_description_len CHECK (char_length(description) BETWEEN 5 AND 5000),
  CONSTRAINT events_capacity_positive CHECK (capacity IS NULL OR capacity > 0)
);

CREATE INDEX IF NOT EXISTS idx_events_status_visibility_date ON events (status, visibility, event_date);

-- -----------------------------------------------------------------------------
-- event_registrations
-- Dado puramente operacional: some junto com o evento ou com o perfil.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_registrations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id       UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  registered_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_registrations_unique UNIQUE (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_profile ON event_registrations (profile_id);

-- -----------------------------------------------------------------------------
-- proposals
-- author_id usa ON DELETE SET NULL: a proposta é um registro de governança
-- (histórico de decisões) e deve sobreviver ao desaparecimento do autor.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proposals (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title             VARCHAR(150) NOT NULL,
  description       TEXT NOT NULL,
  author_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status            proposal_status NOT NULL DEFAULT 'submitted',
  voting_opens_at   TIMESTAMPTZ,
  voting_closes_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT proposals_title_len CHECK (char_length(title) BETWEEN 3 AND 150),
  CONSTRAINT proposals_description_len CHECK (char_length(description) BETWEEN 5 AND 5000),
  CONSTRAINT proposals_voting_window CHECK (
    voting_opens_at IS NULL OR voting_closes_at IS NULL OR voting_closes_at > voting_opens_at
  )
);

CREATE INDEX IF NOT EXISTS idx_proposals_status_created ON proposals (status, created_at);
CREATE INDEX IF NOT EXISTS idx_proposals_author ON proposals (author_id);

-- -----------------------------------------------------------------------------
-- votes
-- profile_id usa ON DELETE SET NULL: o voto individual é parte do resultado
-- da votação (registro de governança); apagar o perfil não deve apagar o
-- voto retroativamente e alterar um resultado já apurado.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  proposal_id      UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  profile_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  choice           vote_choice NOT NULL,
  complement_text  TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT votes_unique_per_profile UNIQUE (proposal_id, profile_id),
  CONSTRAINT votes_complement_rules CHECK (
    (choice = 'complement' AND complement_text IS NOT NULL AND char_length(complement_text) BETWEEN 3 AND 700)
    OR
    (choice <> 'complement' AND complement_text IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_votes_profile ON votes (profile_id);

-- -----------------------------------------------------------------------------
-- tasks
-- created_by e event_id usam ON DELETE SET NULL: a tarefa é registro de
-- trabalho coletivo e sobrevive ao desaparecimento de quem a criou ou do
-- evento relacionado (vínculo é informativo, não obrigatório).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id     UUID REFERENCES events(id) ON DELETE SET NULL,
  title        VARCHAR(150) NOT NULL,
  description  TEXT NOT NULL,
  status       task_status NOT NULL DEFAULT 'draft',
  due_date     TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_title_len CHECK (char_length(title) BETWEEN 3 AND 150),
  CONSTRAINT tasks_description_len CHECK (char_length(description) BETWEEN 3 AND 5000)
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks (status, due_date);

-- -----------------------------------------------------------------------------
-- task_signups
-- Dado puramente operacional: some junto com a tarefa ou com o perfil.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_signups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  signed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_signups_unique UNIQUE (task_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_task_signups_profile ON task_signups (profile_id);

-- -----------------------------------------------------------------------------
-- feedback
-- Mensagem livre de um membro/admin sobre a própria plataforma. Sobrevive ao
-- desaparecimento do autor (SET NULL) pois é insumo de melhoria contínua.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feedback (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_message_len CHECK (char_length(message) BETWEEN 3 AND 2000)
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at);

-- -----------------------------------------------------------------------------
-- audit_logs
-- Trilha de auditoria: NUNCA usar CASCADE aqui. actor_id usa SET NULL para
-- que a linha de auditoria sobreviva mesmo que a conta do ator seja removida
-- (retenção da trilha é política deliberada, distinta da CASCADE usada nas
-- tabelas puramente operacionais acima). A camada de serviço nunca grava
-- senha, token, cookie, telefone, e-mail completo ou corpo livre de proposta
-- no campo `details`.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  correlation_id UUID NOT NULL,
  actor_id       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action         VARCHAR(80) NOT NULL,
  target_type    VARCHAR(60),
  target_id      UUID,
  result         VARCHAR(20) NOT NULL,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT audit_logs_result_enum CHECK (result IN ('success', 'failure'))
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_correlation ON audit_logs (correlation_id);

-- -----------------------------------------------------------------------------
-- error_logs
-- Log técnico genérico por correlation_id; nunca contém stack trace bruto,
-- credenciais ou dados pessoais — apenas código, mensagem controlada e
-- contexto técnico mínimo.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS error_logs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  correlation_id UUID NOT NULL,
  code           VARCHAR(60) NOT NULL,
  message        TEXT NOT NULL,
  context        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_correlation ON error_logs (correlation_id);

-- -----------------------------------------------------------------------------
-- account_tokens
-- Tokens de confirmação de e-mail e redefinição de senha. Somente o HASH do
-- token é armazenado (nunca o valor bruto). Uso único: `used_at` é marcado
-- atomicamente por um único UPDATE ... WHERE used_at IS NULL (ver
-- Database.gs / AuthService.gs), nunca por um SELECT seguido de UPDATE.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_type  account_token_type NOT NULL,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_tokens_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_account_tokens_profile_type ON account_tokens (profile_id, token_type);
CREATE INDEX IF NOT EXISTS idx_account_tokens_expires ON account_tokens (expires_at);

-- -----------------------------------------------------------------------------
-- sessions
-- Sessão de curta duração. Somente o HASH do token de sessão é armazenado.
-- Revogação é feita marcando `revoked_at`, nunca apagando a linha (permite
-- auditar sessões encerradas).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  user_agent   TEXT,
  CONSTRAINT sessions_hash_unique UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions (profile_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

COMMIT;
