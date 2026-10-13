-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- memory/001_memory.sql — banco de MEMÓRIA DE ESTUDO (projeto Neon laift-memory, SEPARADO do núcleo). ADR 0007.
--
-- Este arquivo NÃO é uma migração do núcleo: vive em sql/memory/, tem ledger próprio (memory_schema_migrations) e só é
-- aplicado no projeto laift-memory (`node tools/db/migrate.mjs --memory`, com a URL do DONO do esquema em DATABASE_URL).
--
--   memory_items   uma linha por (pessoa, tipo, tema). A pessoa é um PSEUDÔNIMO: subject_id = HMAC-SHA256(MEMORY_SUBJECT_KEY,
--                  profile_id) em hexadecimal; a chave só existe no Worker, então este banco, sozinho, não diz de quem é a linha.
--                  SEM coluna de texto livre, por construção: tipo, tema (slug de vocabulário controlado), nível 1–5, valor
--                  (lista fechada), origem (lista fechada), contagem de evidências e datas. Dado de saúde, nome, e-mail,
--                  pergunta do estudante ou resposta do tutor NÃO cabem aqui.
--   teto           no máximo 60 itens ativos por pessoa (gatilho, com trava consultiva contra corrida).
--   retenção       expires_at = o menor entre (último uso + 180 dias) e (criação + 12 meses); a CHECK impede passar de 12 meses.
--                  O Worker apaga o vencido no cron (maintenance.js).
--   RLS            FORÇADA, por pessoa: o papel laift_memory_worker só enxerga/grava as linhas da pessoa informada em
--                  `app.subject_id` (set_config local à transação). O modo de manutenção (`app.maintenance = 'on'`) enxerga e
--                  apaga tudo, mas NÃO grava linha de outra pessoa (WITH CHECK exige o subject_id). Isto protege contra um
--                  WHERE esquecido; NÃO protege contra um Worker comprometido (ele pode escolher o subject_id).
--   pgvector       extensão ligada e SEM USO na v1 (nenhuma coluna de vetor; memória semântica em texto livre está fora do escopo).
--   papel          laift_memory_worker é criado AQUI, por SQL (um papel criado no console do Neon vira neon_superuser e ignora
--                  RLS): LOGIN sem senha, sem superusuário, sem BYPASSRLS, sem DDL. A SENHA o dono define depois:
--                  ALTER ROLE laift_memory_worker PASSWORD '...'; (nunca neste arquivo).
--
-- Aditiva e idempotente. Reversão: sql/memory/down/001_memory.sql.

SET lock_timeout = '5s';

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_memory_worker') THEN
    CREATE ROLE laift_memory_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS memory_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id      TEXT NOT NULL,
  kind            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  level           SMALLINT,
  value           TEXT,
  source          TEXT NOT NULL,
  evidence        INTEGER NOT NULL DEFAULT 1,
  consent_version TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  CONSTRAINT memory_items_key UNIQUE (subject_id, kind, slug),
  CONSTRAINT memory_items_subject_chk CHECK (subject_id ~ '^[0-9a-f]{64}$'),
  CONSTRAINT memory_items_kind_chk CHECK (kind IN ('topic_level', 'difficulty', 'study_pref', 'goal')),
  CONSTRAINT memory_items_slug_chk CHECK (slug ~ '^[a-z0-9_-]{2,40}$'),
  CONSTRAINT memory_items_level_chk CHECK (level IS NULL OR level BETWEEN 1 AND 5),
  CONSTRAINT memory_items_source_chk CHECK (source IN ('quiz', 'tutor', 'member')),
  CONSTRAINT memory_items_evidence_chk CHECK (evidence BETWEEN 1 AND 1000),
  CONSTRAINT memory_items_consent_chk CHECK (consent_version ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  -- Forma por tipo: nível onde faz sentido, valor só da lista fechada. É isto que torna texto livre impossível.
  CONSTRAINT memory_items_shape_chk CHECK (
    (kind = 'topic_level' AND level IS NOT NULL AND value IS NULL)
    OR (kind = 'difficulty' AND level IS NOT NULL AND value IS NOT NULL AND value IN ('dificil', 'confuso', 'duvida'))
    OR (kind = 'study_pref' AND level IS NULL AND value IS NOT NULL AND value IN ('exemplos', 'resumo', 'passo_a_passo', 'analogias', 'basico', 'intermediario', 'avancado', 'curto', 'detalhado'))
    OR (kind = 'goal' AND level IS NULL AND value IS NOT NULL AND value = 'ativo')
  ),
  CONSTRAINT memory_items_retention_chk CHECK (expires_at >= created_at AND expires_at <= created_at + interval '12 months')
);

CREATE INDEX IF NOT EXISTS idx_memory_items_expires ON memory_items (expires_at);

-- Teto de 60 itens ativos por pessoa. A trava consultiva serializa inserções simultâneas da mesma pessoa; atualizar um
-- item que já existe (UPSERT) nunca esbarra no teto.
CREATE OR REPLACE FUNCTION memory_items_cap() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.subject_id, 0));
  IF EXISTS (SELECT 1 FROM memory_items WHERE subject_id = NEW.subject_id AND kind = NEW.kind AND slug = NEW.slug) THEN
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM memory_items WHERE subject_id = NEW.subject_id AND expires_at > now()) >= 60 THEN
    RAISE EXCEPTION 'memory_items_cap' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_memory_items_cap ON memory_items;
CREATE TRIGGER trg_memory_items_cap BEFORE INSERT ON memory_items
  FOR EACH ROW EXECUTE FUNCTION memory_items_cap();

-- RLS forçada, por pessoa.
ALTER TABLE memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memory_subject_isolation ON memory_items;
CREATE POLICY memory_subject_isolation ON memory_items FOR ALL TO laift_memory_worker
  USING (subject_id = current_setting('app.subject_id', true) OR current_setting('app.maintenance', true) = 'on')
  WITH CHECK (subject_id = current_setting('app.subject_id', true));

-- Privilégio mínimo: só esta tabela, só DML. Nada de DDL, TRUNCATE, sequência ou o ledger.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO laift_memory_worker;
REVOKE ALL ON memory_items FROM laift_memory_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON memory_items TO laift_memory_worker;

-- O ledger (criado pelo runner) fica fora do alcance do papel de execução.
DO $$
BEGIN
  IF to_regclass('public.memory_schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON memory_schema_migrations FROM PUBLIC;
    REVOKE ALL ON memory_schema_migrations FROM laift_memory_worker;
    ALTER TABLE memory_schema_migrations ENABLE ROW LEVEL SECURITY; -- sem política: ninguém além do dono lê
  END IF;
END
$$;

RESET lock_timeout;
