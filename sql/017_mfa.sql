-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 017_mfa.sql — verificação em duas etapas (TOTP, RFC 6238) — Fase 2.
--
-- mfa_credentials     o segredo TOTP, CIFRADO em repouso (AES-GCM, ver
--                     worker/src/mfa/secretBox.js). confirmed_at NULL = cadastro
--                     iniciado e ainda não confirmado com um código.
--                     last_used_step impede reuso do mesmo código (replay).
-- mfa_recovery_codes  códigos de uso único, só o hash (SHA-256 com pepper).
-- mfa_challenges      desafio de 5 minutos entre a senha e o código: o login
--                     só cria a sessão depois do segundo fator.
-- Aditiva e idempotente; sessions não muda. Reversão: sql/down/017_mfa.sql.

CREATE TABLE IF NOT EXISTS mfa_credentials (
  profile_id      UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  secret_enc      TEXT NOT NULL,
  confirmed_at    TIMESTAMPTZ,
  last_used_step  BIGINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mfa_recovery_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, code_hash)
);

CREATE TABLE IF NOT EXISTS mfa_challenges (
  token_hash  TEXT PRIMARY KEY,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires ON mfa_challenges (expires_at);
