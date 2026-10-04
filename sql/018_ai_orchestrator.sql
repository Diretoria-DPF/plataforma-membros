-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 018_ai_orchestrator.sql — métricas diárias da IA e cache semântico (Fase 3).
--
-- ai_metrics_daily   uma linha por (dia, recurso, modelo, provedor): chamadas,
--                    tokens, acertos de cache, 429 e latência acumulada. É o que
--                    alimenta o painel e os alertas; ai_usage_log continua sendo
--                    o registro por chamada (acerto de cache NÃO gera linha lá,
--                    por isso esta tabela própria). Sem conteúdo de conversa.
-- ai_semantic_cache  pergunta GENÉRICA normalizada (sem dado pessoal — filtrado
--                    no Worker) e a resposta. Busca por similaridade de
--                    trigramas (pg_trgm). Validade curta (7 dias).
-- Aditiva e idempotente. Reversão: sql/down/018_ai_orchestrator.sql.
-- O código funciona sem esta migração: o orquestrador só liga pela flag
-- use_orchestrator, e toda leitura/gravação daqui é tolerante a tabela ausente.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS ai_metrics_daily (
  day               DATE NOT NULL,
  feature           TEXT NOT NULL,
  model             TEXT NOT NULL,
  provider          TEXT NOT NULL,
  calls             INTEGER NOT NULL DEFAULT 0,
  ok_calls          INTEGER NOT NULL DEFAULT 0,
  rate_limited      INTEGER NOT NULL DEFAULT 0,
  tokens_in         BIGINT NOT NULL DEFAULT 0,
  tokens_out        BIGINT NOT NULL DEFAULT 0,
  cache_hits        INTEGER NOT NULL DEFAULT 0,
  cache_misses      INTEGER NOT NULL DEFAULT 0,
  latency_ms_total  BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature, model, provider),
  CONSTRAINT ai_metrics_daily_nonneg CHECK (
    calls >= 0 AND ok_calls >= 0 AND rate_limited >= 0 AND tokens_in >= 0 AND tokens_out >= 0
    AND cache_hits >= 0 AND cache_misses >= 0 AND latency_ms_total >= 0
  )
);

CREATE TABLE IF NOT EXISTS ai_semantic_cache (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  feature       TEXT NOT NULL,
  question_norm TEXT NOT NULL,
  answer        TEXT NOT NULL,
  hits          INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  CONSTRAINT ai_semantic_cache_len CHECK (char_length(question_norm) <= 300 AND char_length(answer) <= 8000)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_semantic_cache_question ON ai_semantic_cache (feature, question_norm);
CREATE INDEX IF NOT EXISTS idx_ai_semantic_cache_trgm ON ai_semantic_cache USING gin (question_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ai_semantic_cache_expires ON ai_semantic_cache (expires_at);
