# 02 · Receita SQL (convenções reais)
Base: worktree `cortex` (HEAD 2ad549c), caminhos relativos a ela. Só leitura; `validate:sql` não rodado (sem `worker/node_modules`).
## 1. Números e pastas
- `sql/`: 001-024 e 026. **025 não existe neste branch.** Último: `026_lia_pesquisas.sql`.
- `sql/down/`: 015-024 e 026 (001-014 não têm reversão). `sql/ops/readonly_role.sql` não é migração.
- Reservas: 025 e 027 (`docs/TIME_CONTRATO.md:65`; `docs/CONTINUIDADE.md:60,62`). Os docs divergem sobre a 025 (`TIME_CONTRATO.md:20` diz "próxima livre: 025"; `CONTINUIDADE.md:60` diz "F4 = 025").
- **028 não está livre**: a ficha W1 a reivindicou (`docs/ux-progresso/fichas/W1.md:10,13`). Recomendo **029**, ou combinar com a sessão principal.

## 2. O que o validador exige (`worker/scripts/validate-migrations.mjs`)
- Nome `^\d{3}_.*\.sql$` (L32). Passadas: 1 banco vazio; 2 reaplicação; 3 downs em ordem inversa e depois ups; 4 ops (L64-87).
- **Não exige** cabeçalho, nem down (roda só os que existem), nem número único (isso é do runner, `tools/db/migrate.mjs:64`). Down obrigatório é só convenção (`TIME_CONTRATO.md:20`).

## 3. Flags
- Nascem desligadas: semente `FALSE` + `ON CONFLICT (key) DO NOTHING` (`sql/016_feature_flags.sql:26-31`; `sql/019_assistant.sql:20-22`). Chave: `CHECK (key ~ '^[a-z][a-z0-9_]{1,63}$')` (016:16).
- Não copiar a 023 (`sql/023_flags_v2.sql:46-52`), que semeia TRUE por decisão específica.
- Flag nova não pede migração (`TIME_CONTRATO.md:65`): ausente = desligada; o admin cria por `adminSet` (`worker/src/services/featureFlagService.js:199`, upsert L232). Pública: entra em `PUBLIC_FLAGS` (L120).

## 4. Padrões de tabela
- IDs: `UUID PRIMARY KEY DEFAULT uuid_generate_v4()` (28 usos). Exceção: `BIGINT ... IDENTITY` em `messages` (`009_messaging.sql:63`). Sem bigserial.
- Datas: `created_at`/`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Trigger `trg_<tab>_updated_at` → `set_updated_at()` (`002_functions_and_triggers.sql:18,26`), mas `kb_chunks` (020) e `lia_pesquisas` (026) não têm.
- Enum: 001 usa `CREATE TYPE` (L33-49); tabelas novas usam TEXT + CHECK IN (`026:34-35`).
- Nomes: `<tab>_<col>_chk`, `<tab>_len` (`char_length BETWEEN`, 026:36), `<tab>_unique` (020:33). Índices `idx_<tab>_<colunas>`, trigrama `idx_<tab>_<col>_trgm` (026:40), únicos `uq_<tab>_...` (009).
- FK: pessoa `profile_id ... REFERENCES profiles(id) ON DELETE CASCADE` (021); quem aprovou/alterou `ON DELETE SET NULL` (016:21). No projeto: 33 CASCADE, 22 SET NULL.
- Idempotência: `IF NOT EXISTS`; `DROP TRIGGER IF EXISTS` antes do CREATE (002:26). Tabela quente: `SET lock_timeout = '3s'` ... `RESET` (020:44-46). Sem `CONCURRENTLY` (024:13-14).

## 5. Busca e embeddings
- **Não há** `tsvector`, `'portuguese'`, `'simple'` nem `unaccent` em `sql/` ou `worker/src/`.
- Extensões: uuid-ossp e pgcrypto (001:25-26), pg_trgm (018:18, 020:23, 026:21), vector (020:22).
- Já existe: trigrama com `similarity()` e `%` (`worker/src/ai/semanticCache.js:95-97`; `worker/src/services/researchLogService.js:161-163`).
- Híbrida pronta: `worker/src/services/ragService.js` tem `fuse()` (RRF, L65-70) e `retrieve()` (L105). Embedding `vector(1024)` (`sql/020:31`; `worker/src/constants.js:388`).
- `retrieve()`/`fuse()` estão acoplados a `kb_chunks`. FTS em português seria novo. `docs/cortex/PLANO-CORTEX.md:43` põe a leitura pública no **D1 com FTS5**, contra o Neon do briefing: confirmar.

## 6. Testes (PGlite) e runner
- `worker/test/helpers/pgliteSql.js:23` (`createMigratedDb`) aplica todos os `sql/*.sql` em ordem, sem downs, com pgcrypto, uuid_ossp e pg_trgm (contrib). `vector` vira `real[]` sem HNSW se o módulo faltar (`worker/scripts/pgvector-shim.mjs:26`). `tsvector` não verificado aqui.
- Runner (`tools/db/migrate.mjs`): ordem numérica (L61); número repetido aborta (L64). Ledger `schema_migrations(name, hash, applied_at)` (L38). Hash SHA-256 com CRLF→LF (L47). Drift de arquivo aplicado aborta (L100). Pendente vai a `client.query` inteiro; erro = ROLLBACK e para (L134).

## 7. Template (cabeçalho, tabela, flag, down)
```sql
-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- NNN_library_base.sql — Biblioteca LAIFT: artigos.
-- Aditiva e idempotente. Reversão: sql/down/NNN_library_base.sql.
CREATE TABLE IF NOT EXISTS library_articles (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doi          TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'sugerido',
  approved_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_articles_doi_unique UNIQUE (doi),
  CONSTRAINT library_articles_state_chk CHECK (state IN ('sugerido', 'publicado', 'rejeitado'))
);
CREATE INDEX IF NOT EXISTS idx_library_articles_state ON library_articles (state);
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('library_enabled', FALSE, 'Biblioteca: catálogo público')
ON CONFLICT (key) DO NOTHING;
```
```sql
-- Reversão da NNN_library_base.sql. Só à mão ou pelo validador.
DELETE FROM feature_flags WHERE key = 'library_enabled';
DROP TABLE IF EXISTS library_articles;
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = 'NNN_library_base.sql';
  END IF;
END $$;
```
