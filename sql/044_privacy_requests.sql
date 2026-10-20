-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 044_privacy_requests.sql — direitos do titular (LGPD, art. 18): pedido de exclusão de conta com prazo.
--
--   * account_deletion_requests: o pedido SOBREVIVE à exclusão do perfil sem guardar dado pessoal. Por isso profile_id NÃO
--     tem chave estrangeira (o perfil pode ser apagado) e profile_label guarda só o primeiro nome, para a diretoria
--     reconhecer o pedido na fila. Ao concluir, profile_id e profile_label são zerados: sobra id, datas e quem processou.
--   * due_at = requested_at + 180 dias (prazo máximo adotado pela plataforma; a lei pede atendimento "sem demora").
--   * No máximo um pedido ativo ('requested') por perfil (índice único parcial).
-- Aditiva e idempotente. Requer 032 (laift_enable_rls, laift_worker). Reversão: sql/down/044_privacy_requests.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id    UUID,
  profile_label VARCHAR(60),
  status        TEXT NOT NULL DEFAULT 'requested',
  reason        TEXT,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '180 days'),
  processed_at  TIMESTAMPTZ,
  processed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT account_deletion_status_chk CHECK (status IN ('requested', 'completed', 'cancelled')),
  CONSTRAINT account_deletion_reason_chk CHECK (reason IS NULL OR char_length(reason) <= 500)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_account_deletion_active ON account_deletion_requests (profile_id) WHERE status = 'requested';
CREATE INDEX IF NOT EXISTS idx_account_deletion_status_due ON account_deletion_requests (status, due_at);

SELECT laift_enable_rls('account_deletion_requests'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE ON account_deletion_requests TO laift_worker;
  END IF;
END
$$;

RESET lock_timeout;
