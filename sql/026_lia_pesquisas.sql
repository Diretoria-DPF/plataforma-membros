-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 026_lia_pesquisas.sql — registro de pesquisas da Lia (respostas e resultados já obtidos).
--
-- lia_pesquisas  uma linha por (provedor, pergunta normalizada, versão da base):
--                provider 'kb' guarda a resposta da base com as fontes (validade 30 dias);
--                os provedores externos (europepmc, pubmed, openalex, scielo) guardam só
--                metadados e links, nunca o resumo (validade 7 dias).
--                outcome 'empty' marca as perguntas sem resposta: é a lista de lacunas
--                para escrever conteúdo novo.
-- LGPD: sem profile_id nem qualquer id de pessoa. Só entra texto que passa por isCacheable
--       (sem dado pessoal e sem instrução à IA). A retenção é a validade (expires_at), e a
--       limpeza fica na rotina diária (worker/src/maintenance.js, L10).
-- Aditiva e idempotente. Requer pg_trgm (já criada pela 018 e pela 020). A tabela é nova e
-- não há ALTER em tabela quente, por isso não usa lock_timeout.
-- Reversão: sql/down/026_lia_pesquisas.sql. O serviço não tem flag próprio: quem o usa
-- (assistantService, L09) só o chama com a flag rag_cache_enabled ligada, desligada por padrão.
-- Toda leitura e gravação é tolerante a tabela ausente.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS lia_pesquisas (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider      TEXT NOT NULL,
  query_norm    TEXT NOT NULL,
  kb_version    TEXT NOT NULL DEFAULT '',
  outcome       TEXT NOT NULL,
  results       JSONB NOT NULL DEFAULT '{}'::jsonb,
  hits          INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_hit_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  CONSTRAINT lia_pesquisas_provider_chk CHECK (provider IN ('kb', 'europepmc', 'pubmed', 'openalex', 'scielo')),
  CONSTRAINT lia_pesquisas_outcome_chk CHECK (outcome IN ('answered', 'empty')),
  CONSTRAINT lia_pesquisas_len CHECK (char_length(query_norm) BETWEEN 1 AND 300 AND char_length(kb_version) <= 64),
  CONSTRAINT lia_pesquisas_unique UNIQUE (provider, query_norm, kb_version)
);

CREATE INDEX IF NOT EXISTS idx_lia_pesquisas_query_trgm ON lia_pesquisas USING gin (query_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_lia_pesquisas_expires ON lia_pesquisas (expires_at);
