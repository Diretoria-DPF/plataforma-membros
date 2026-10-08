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
--                É tabela QUENTE (uma linha por chamada de IA): o ALTER TABLE pede bloqueio
--                exclusivo e, se uma transação longa segurar a tabela, ele entraria na fila e
--                travaria toda gravação atrás dele. Por isso vai por último no arquivo (o
--                bloqueio dura só até o fim da transação) e sob lock_timeout de 3 s: passou
--                disso, a migração inteira é desfeita e basta rodar de novo.
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

-- SET/RESET de sessão, e não SET LOCAL. O runner (tools/db/migrate.mjs) envia o arquivo numa
-- única chamada (transação implícita), onde SET LOCAL também valeria; mas aplicado à mão
-- (psql -f, console do Neon) cada comando roda em autocommit e SET LOCAL não teria efeito.
-- Se o ALTER estourar o tempo, o ROLLBACK desfaz também este SET.
SET lock_timeout = '3s';
ALTER TABLE ai_usage_log ADD COLUMN IF NOT EXISTS retrieval_used BOOLEAN NOT NULL DEFAULT FALSE;
RESET lock_timeout;
