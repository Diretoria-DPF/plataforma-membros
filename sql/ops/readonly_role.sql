-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- ops/readonly_role.sql — papel SOMENTE LEITURA para relatórios e consultas.
--
-- NÃO é migração (fica em sql/ops/, fora da numeração). Roda uma vez, por quem
-- administra o banco, e pode ser reaplicado sem efeito colateral.
--
-- Política: NEGAR POR PADRÃO. O papel só enxerga as tabelas listadas abaixo e,
-- em profiles, só as colunas sem dado pessoal sensível. Ficam de fora:
--   profiles.email/password_hash/phone*       identificação e credencial
--   sessions, account_tokens, rate_limit_buckets   segurança
--   mfa_*                                      segredos de 2º fator
--   messages, messaging_keys, conversations    mensageria cifrada
--   votes, connections, profile_blocks/reports, feedback   privacidade e sigilo do voto
--   error_logs                                 contexto técnico livre
--
-- Depois deste script, crie o LOGIN (a senha é digitada por você, no console do
-- Neon ou no psql, nunca neste arquivo):
--   CREATE ROLE laift_relatorios LOGIN PASSWORD '<senha forte>' IN ROLE laift_readonly;
-- O BACKUP não usa este papel: ele precisa de tudo e usa um papel próprio
-- (docs/BACKUP_RESTORE.md).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_readonly') THEN
    CREATE ROLE laift_readonly NOLOGIN;
  END IF;
END
$$;

-- Recomeça do zero: reaplicar o script nunca deixa permissão antiga para trás.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM laift_readonly;
GRANT USAGE ON SCHEMA public TO laift_readonly;

-- Tabelas sem dado pessoal sensível: leitura integral.
GRANT SELECT ON
  events, event_registrations, proposals, tasks, task_signups, task_comments,
  learning_attempts, clinical_cases, atlas_telemetry, ai_usage_log, audit_logs,
  consents, preferences, feature_flags
TO laift_readonly;

-- profiles: só as colunas de perfil público/estatístico.
GRANT SELECT (
  id, full_name, username, role, status, education, city, interests,
  avatar_url, linkedin_url, instagram_handle, validation_preference,
  email_confirmed_at, created_at, updated_at
) ON profiles TO laift_readonly;
