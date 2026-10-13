-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 035_agents_core.sql — núcleo da camada agêntica (ADR 0007): flags, rastros e formato de ai_usage_log.feature.
--
--   feature_flags     agents_enabled, agents_tutor_enabled, agents_curator_enabled, memory_enabled e
--                     clinical_sim_enabled. Todas nascem DESLIGADAS (não copiar a 023, que semeia TRUE). Só INSERT ...
--                     ON CONFLICT DO NOTHING: reaplicar nunca religa nem desliga uma flag que o admin já mexeu.
--                     memory_enabled e clinical_sim_enabled ficam reservadas (a memória e a simulação são etapas futuras).
--   agent_traces      um rastro por chamada ao agente: persona@versão#hash, recurso, modelo, tokens de entrada e saída
--                     (reais, vindos da resposta do provedor; `estimated` quando faltam), latência, desfecho e as
--                     decisões dos guardrails (IDs de regra e contagens). NUNCA guarda o texto do usuário, a resposta
--                     do agente, e-mail ou nome: `decisions` é limitado em tamanho e só carrega IDs e números.
--                     Exclusão de conta: ON DELETE CASCADE em profile_id. Retenção de 90 dias, feita pelo cron diário
--                     (worker/src/maintenance.js, tarefa agentTracesPurge). RLS forçado + laift_worker_all.
--   ai_usage_log      a restrição de `feature` (lista fechada desde a 013/019) vira restrição de FORMATO: um recurso
--                     novo de agente não exige mais uma migração só para ser registrado.
--
-- Aditiva e idempotente. Requer 016 (feature_flags), 019 (restrição antiga) e 032 (laift_enable_rls, laift_worker).
-- Reversão: sql/down/035_agents_core.sql.

SET lock_timeout = '5s';

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('agents_enabled', FALSE, 'Agentes de IA (alfa): chave geral; desligada, apiAgentsList e apiAgentsInvoke respondem AGENT_DISABLED sem custo'),
  ('agents_tutor_enabled', FALSE, 'Agentes: Tutor Clínico da aba Aprender (exige agents_enabled; só maiores de 18 anos)'),
  ('agents_curator_enabled', FALSE, 'Agentes: Curador de Conteúdo (rascunhos para o admin; exige agents_enabled)'),
  ('memory_enabled', FALSE, 'Agentes: memória de estudo opt-in (reservada: ainda sem código)'),
  ('clinical_sim_enabled', FALSE, 'Clínica: simulação com pacientes variados (reservada: precisa de revisor clínico antes de ligar)')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS agent_traces (
  trace_id         UUID PRIMARY KEY,
  profile_id       UUID REFERENCES profiles(id) ON DELETE CASCADE,
  persona          TEXT NOT NULL,
  persona_version  TEXT NOT NULL,
  persona_hash     TEXT NOT NULL,
  feature          TEXT NOT NULL,
  model            TEXT,
  tokens_in        INTEGER,
  tokens_out       INTEGER,
  estimated        BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms       INTEGER,
  outcome          TEXT NOT NULL,
  decisions        JSONB NOT NULL DEFAULT '{}'::jsonb,
  memory_used      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT agent_traces_persona_chk CHECK (persona ~ '^[a-z][a-z0-9-]{2,39}$'),
  CONSTRAINT agent_traces_version_chk CHECK (persona_version ~ '^[0-9]+[.][0-9]+[.][0-9]+$'),
  CONSTRAINT agent_traces_hash_chk CHECK (persona_hash ~ '^[0-9a-f]{12}$'),
  CONSTRAINT agent_traces_feature_chk CHECK (feature ~ '^[a-z][a-z0-9_]{1,39}$'),
  CONSTRAINT agent_traces_model_len CHECK (model IS NULL OR char_length(model) <= 100),
  CONSTRAINT agent_traces_tokens_chk CHECK ((tokens_in IS NULL OR tokens_in >= 0) AND (tokens_out IS NULL OR tokens_out >= 0)),
  CONSTRAINT agent_traces_latency_chk CHECK (latency_ms IS NULL OR latency_ms >= 0),
  CONSTRAINT agent_traces_outcome_chk CHECK (outcome IN ('answered', 'rewritten', 'replaced', 'refused', 'degraded', 'error')),
  CONSTRAINT agent_traces_decisions_chk CHECK (jsonb_typeof(decisions) = 'object' AND octet_length(decisions::text) <= 1000)
);

-- Retenção (corte por created_at) e consultas por pessoa; o índice por profile_id também serve ao CASCADE.
CREATE INDEX IF NOT EXISTS idx_agent_traces_created ON agent_traces (created_at);
CREATE INDEX IF NOT EXISTS idx_agent_traces_profile_created ON agent_traces (profile_id, created_at DESC);

-- RLS forçado e política laift_worker_all (ponto de entrada de toda migração que cria tabela, ver 031/032).
SELECT laift_enable_rls('agent_traces'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON agent_traces TO laift_worker;
  END IF;
END
$$;

-- ai_usage_log.feature: de lista fechada para formato. NOT VALID + VALIDATE: o bloqueio exclusivo dura só o tempo
-- de trocar a regra; a conferência das linhas antigas (a tabela cresce a cada chamada de IA) roda depois.
ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ai_usage_log_feature_chk;
ALTER TABLE ai_usage_log ADD CONSTRAINT ai_usage_log_feature_chk
  CHECK (feature ~ '^[a-z][a-z0-9_]{1,39}$') NOT VALID;
ALTER TABLE ai_usage_log VALIDATE CONSTRAINT ai_usage_log_feature_chk;

RESET lock_timeout;
