-- =============================================================================
-- 003_rate_limits.sql
-- Plataforma de Membros — Limitação de tentativas (substitui o CacheService
-- do Apps Script, que não existe fora dele).
--
-- Por que uma tabela e não um serviço externo (Redis/KV): o UPSERT abaixo é
-- UM statement atômico — o bloqueio de linha do Postgres durante o UPDATE
-- serializa tentativas concorrentes na mesma chave (bucket, identifier_hash),
-- o que é uma garantia MELHOR do que o CacheService antigo (cuja janela de
-- corrida entre leitura e escrita estava documentada como risco residual
-- conhecido em docs/SECURITY.md). Fica tudo no mesmo banco, sem outra peça
-- de infraestrutura para operar/pagar.
--
-- Crescimento da tabela: uma linha por (bucket, identifier_hash) já visto,
-- nunca uma linha por tentativa — o UPSERT atualiza a linha existente, não
-- insere uma nova a cada chamada. Para os buckets por e-mail, fica limitado
-- ao número de endereços distintos que já tentaram alguma ação; para os
-- buckets GLOBAIS (REGISTER_GLOBAL/RESET_REQUEST_GLOBAL), é sempre 1 linha.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket text NOT NULL,
  identifier_hash text NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, identifier_hash)
);

COMMIT;
