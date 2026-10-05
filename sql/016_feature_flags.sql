-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 016_feature_flags.sql — chaves liga/desliga de funcionalidades (Fase 2).
--
-- Cada funcionalidade nova nasce atrás de uma flag. A avaliação é feita no
-- Worker (worker/src/services/featureFlagService.js):
--   enabled      desliga tudo de uma vez (rollback imediato);
--   rollout_pct  0–100, decidido por um hash estável de (chave + pessoa): a
--                mesma pessoa cai sempre do mesmo lado;
--   conditions   restrições opcionais, ex.: {"role":"admin"},
--                {"role":["admin","member"]}, {"profile_ids":["<uuid>"]}.
-- Aditiva e idempotente. Reversão: sql/down/016_feature_flags.sql.

CREATE TABLE IF NOT EXISTS feature_flags (
  key          TEXT PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct  SMALLINT NOT NULL DEFAULT 100 CHECK (rollout_pct BETWEEN 0 AND 100),
  conditions   JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(conditions) = 'object'),
  description  TEXT,
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Flags conhecidas, todas desligadas: ligar é decisão explícita do admin.
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('mfa_required',     FALSE, 'Exige verificação em duas etapas dos administradores'),
  ('use_orchestrator', FALSE, 'Roteia a IA pelo orquestrador (cache semântico, orçamento de tokens)'),
  ('nvidia_fallback',  FALSE, 'Usa a NVIDIA como reserva quando o Groq esgota'),
  ('ux_v2_enabled',    FALSE, 'Interface renovada (Início, onboarding, hero)')
ON CONFLICT (key) DO NOTHING;
