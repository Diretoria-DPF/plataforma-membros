-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 045_client_errors.sql — coleta agregada de erros do navegador (OPS-08; docs/erros-frontend.md).
--
-- client_errors: UMA linha por impressão digital (fingerprint) de erro, com contador. Sem PII: nada de e-mail, token,
--   query string, IP, perfil ou texto livre sem tratamento. Só mensagem truncada e já limpa, rota (caminho sem query),
--   classe de navegador, versão do app e tipo (error | rejection). O Worker faz UPSERT (count = count + 1).
-- Retenção: 30 dias por last_seen (faxina diária em maintenance.js).
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente. Requer 032.
-- Reversão: sql/down/045_client_errors.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS client_errors (
  fingerprint  TEXT        NOT NULL,
  kind         TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  route        TEXT        NOT NULL DEFAULT '',
  browser      TEXT        NOT NULL DEFAULT 'other',
  app_version  TEXT        NOT NULL DEFAULT '',
  count        BIGINT      NOT NULL DEFAULT 1 CHECK (count >= 1),
  first_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_errors_pk PRIMARY KEY (fingerprint),
  CONSTRAINT client_errors_fp_chk CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  CONSTRAINT client_errors_kind_chk CHECK (kind IN ('error', 'rejection')),
  CONSTRAINT client_errors_message_chk CHECK (char_length(message) BETWEEN 1 AND 300),
  CONSTRAINT client_errors_route_chk CHECK (char_length(route) <= 80),
  CONSTRAINT client_errors_browser_chk CHECK (char_length(browser) <= 24),
  CONSTRAINT client_errors_version_chk CHECK (char_length(app_version) <= 32)
);

CREATE INDEX IF NOT EXISTS idx_client_errors_last_seen ON client_errors (last_seen);

SELECT laift_enable_rls('client_errors'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON client_errors TO laift_worker;
  END IF;
END
$$;

RESET lock_timeout;
