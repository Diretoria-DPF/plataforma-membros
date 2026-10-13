-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 036_memory_consent.sql — consentimento da memória de estudo e fila de exclusão (ADR 0007; memória em outro banco).
--
--   member_memory_consent  um consentimento por pessoa (opt-in explícito, revogável): status granted/revoked e a VERSÃO da
--                          finalidade aceita (purpose_version). Mudou o texto/finalidade (a versão no Worker) = a leitura
--                          fecha até um novo aceite. Exclusão de conta: ON DELETE CASCADE. Guarda datas e versão, NUNCA
--                          conteúdo da memória; é a trilha (sem conteúdo) de quem consentiu e quando.
--   memory_purge_queue     fila de apagamento da memória, que mora em OUTRO banco (laift-memory) e por isso não tem FK nem
--                          CASCADE. profile_ref é só o identificador (sem FK: o perfil já foi apagado). Entra aqui:
--                          (a) o gatilho AFTER DELETE ON profiles (exclusão de conta, hoje feita por SQL do responsável);
--                          (b) revogação de consentimento cuja limpeza falhou; (c) purga pedida pelo admin que falhou.
--                          O cron diário e a limpeza oportunista do Worker drenam a fila (alvo: 24 h); a linha sai SÓ depois
--                          que o apagamento deu certo. Falhou, fica: attempts e last_error_code (um código, nunca mensagem).
--
-- Aditiva e idempotente. Requer 001 (profiles), 016 (feature_flags), 032 (laift_enable_rls, laift_worker) e 035 (flag).
-- Reversão: sql/down/036_memory_consent.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS member_memory_consent (
  profile_id      UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL,
  purpose_version TEXT NOT NULL,
  granted_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_memory_consent_status_chk CHECK (status IN ('granted', 'revoked')),
  CONSTRAINT member_memory_consent_version_chk CHECK (purpose_version ~ '^[a-z0-9][a-z0-9._-]{2,39}$'),
  CONSTRAINT member_memory_consent_dates_chk CHECK (
    (status = 'granted' AND granted_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_member_memory_consent_status ON member_memory_consent (status);

CREATE TABLE IF NOT EXISTS memory_purge_queue (
  profile_ref     UUID PRIMARY KEY,
  reason          TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  enqueued_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  CONSTRAINT memory_purge_queue_reason_chk CHECK (reason IN ('account_deleted', 'revoked', 'admin')),
  CONSTRAINT memory_purge_queue_attempts_chk CHECK (attempts >= 0),
  CONSTRAINT memory_purge_queue_error_chk CHECK (last_error_code IS NULL OR last_error_code ~ '^[A-Za-z0-9_.:-]{1,40}$')
);

CREATE INDEX IF NOT EXISTS idx_memory_purge_queue_enqueued ON memory_purge_queue (enqueued_at);

-- Exclusão de conta: o perfil some e a memória (em outro banco) precisa sumir junto. Sempre enfileira (a cascata do
-- consentimento já ocorreu quando o gatilho roda, então não há como saber se a pessoa tinha memória); drenar uma fila
-- sem memória é barato. Reapagar o mesmo perfil só reafirma o motivo.
CREATE OR REPLACE FUNCTION memory_enqueue_purge() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO memory_purge_queue (profile_ref, reason) VALUES (OLD.id, 'account_deleted')
  ON CONFLICT (profile_ref) DO UPDATE SET reason = 'account_deleted';
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS trg_profiles_memory_purge ON profiles;
CREATE TRIGGER trg_profiles_memory_purge AFTER DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION memory_enqueue_purge();

-- RLS forçado e política laift_worker_all (ponto de entrada de toda migração que cria tabela, ver 031/032).
SELECT laift_enable_rls('member_memory_consent'::regclass);
SELECT laift_enable_rls('memory_purge_queue'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON member_memory_consent, memory_purge_queue TO laift_worker;
  END IF;
END
$$;

-- A descrição da flag (semeada pela 035 como "reservada") passa a dizer o que ela faz; só se o admin não a mudou.
UPDATE feature_flags
SET description = 'Agentes: memória de estudo opt-in (exige consentimento, DATABASE_URL_MEMORY e MEMORY_SUBJECT_KEY; só maiores de 18 anos)'
WHERE key = 'memory_enabled' AND description = 'Agentes: memória de estudo opt-in (reservada: ainda sem código)';

RESET lock_timeout;
