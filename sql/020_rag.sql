-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 020_rag.sql — base de conhecimento da Lia com busca híbrida (vetor + trigramas).
--
-- kb_chunks      trechos da base (kb.js, destinos e documentos embutidos), cada um com
--                embedding de 1024 dimensões (Workers AI @cf/baai/bge-m3; constante
--                EMBEDDING_DIM no Worker). `embedding` aceita NULL: se o modelo de
--                embedding falhar, o trecho continua buscável por trigramas.
--                Índice HNSW (cosseno) com parâmetros explícitos e índice GIN trigrama.
-- ai_usage_log   ganha retrieval_used (a resposta usou trechos recuperados). A restrição
--                ai_usage_log_feature_chk já aceita 'assistant' desde a 019: sem ajuste.
-- Aditiva e idempotente. Requer a extensão pgvector (suportada pelo Neon) e pg_trgm.
-- Trocar de modelo de embedding (outra dimensão) exige NOVA migração.
-- Reversão: sql/down/020_rag.sql (a extensão vector NÃO é removida).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS kb_chunks (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source        TEXT NOT NULL,
  section       TEXT NOT NULL,
  content       TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  embedding     vector(1024),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT kb_chunks_unique UNIQUE (source, section),
  CONSTRAINT kb_chunks_len CHECK (char_length(source) <= 100 AND char_length(section) <= 200 AND char_length(content) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_kb_chunks_embedding_hnsw ON kb_chunks USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_content_trgm ON kb_chunks USING gin (content gin_trgm_ops);

ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS retrieval_used BOOLEAN NOT NULL DEFAULT FALSE;
