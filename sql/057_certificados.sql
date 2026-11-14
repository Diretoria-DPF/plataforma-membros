-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 057_certificados.sql — certificado verificável de curso (Onda 1 da Educação; docs/cursos-operacao.md).
--
-- Código LAIFT-XXXXX-XXXXX (10 símbolos de um alfabeto de 32, sem 0/O/1/I: 50 bits). Os campos exibidos são
-- congelados na emissão (nome, curso, versão, carga, data) e assinados com HMAC-SHA-256 de chave derivada
-- própria ('laift-certificate-v1'); a Worker recalcula a assinatura em toda verificação. A página pública mostra
-- só situação (válido, vencido, revogado), nome, curso, carga horária e datas; sem e-mail e sem nota. Sem o
-- consentimento público (public_consent), a verificação exige também o nome digitado.
-- Conta apagada: profile_id vira NULL e a linha mínima fica (decisão do dono pendente: prazo na Política).
-- DESLIGADA: a flag certificates_enabled nasce FALSE. Requer 056.
--
-- RLS forçado + laift_worker_all (laift_enable_rls). Aditiva e idempotente; só ESCRITA do arquivo, não aplicada.
-- Reversão: sql/down/057_certificados.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS certificates (
  id                UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  code              TEXT        NOT NULL,
  profile_id        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  holder_name       TEXT        NOT NULL,
  course_id         UUID        NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  course_title      TEXT        NOT NULL,
  course_version    INTEGER     NOT NULL,
  workload_minutes  INTEGER     NOT NULL,
  score_pct         SMALLINT    NOT NULL,
  attempt_id        UUID        REFERENCES assessment_attempts(id) ON DELETE SET NULL,
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until       TIMESTAMPTZ,
  public_consent    BOOLEAN     NOT NULL DEFAULT FALSE,
  revoked_at        TIMESTAMPTZ,
  revoked_reason    TEXT,
  revoked_by        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  signature         TEXT        NOT NULL,
  CONSTRAINT certificates_code_uq UNIQUE (code),
  CONSTRAINT certificates_code_chk CHECK (code ~ '^LAIFT-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$'),
  CONSTRAINT certificates_name_len CHECK (char_length(holder_name) BETWEEN 2 AND 200),
  CONSTRAINT certificates_title_len CHECK (char_length(course_title) BETWEEN 3 AND 200),
  CONSTRAINT certificates_workload_chk CHECK (workload_minutes BETWEEN 15 AND 6000),
  CONSTRAINT certificates_score_chk CHECK (score_pct BETWEEN 0 AND 100),
  CONSTRAINT certificates_validity_chk CHECK (valid_until IS NULL OR valid_until > issued_at),
  CONSTRAINT certificates_revoked_chk CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  CONSTRAINT certificates_reason_len CHECK (revoked_reason IS NULL OR char_length(revoked_reason) BETWEEN 5 AND 500),
  CONSTRAINT certificates_signature_chk CHECK (signature ~ '^[A-Za-z0-9_-]{43}$')
);

-- Um certificado em vigor por pessoa, curso e versão (revogado não conta; conta apagada não bloqueia).
CREATE UNIQUE INDEX IF NOT EXISTS uq_certificates_active
  ON certificates (profile_id, course_id, course_version) WHERE revoked_at IS NULL AND profile_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_certificates_profile ON certificates (profile_id);
CREATE INDEX IF NOT EXISTS idx_certificates_course ON certificates (course_id);

SELECT laift_enable_rls('certificates'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE ON certificates TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('certificates_enabled', FALSE, 'Cursos: emissão do certificado e verificação pública por código')
ON CONFLICT (key) DO NOTHING;
