-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 058_requisitos_evento.sql — cursos exigidos para a inscrição num evento e dispensa auditada (Onda 1 da Educação;
-- docs/cursos-operacao.md). A conferência é da Worker (mensagem útil com o que falta), não de gatilho: o gatilho
-- guard_event_registration (004) continua como está. Vale certificado não revogado, não vencido e na versão
-- atual do curso. Dispensa só por quem tem events.manage, com motivo; tudo em audit_logs.
-- DESLIGADA: a flag event_prereq_enabled nasce FALSE (com ela desligada, a inscrição não muda). Requer 056 e 057.
--
-- RLS forçado + laift_worker_all (laift_enable_rls). Aditiva e idempotente; só ESCRITA do arquivo, não aplicada.
-- Reversão: sql/down/058_requisitos_evento.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS event_requirements (
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_requirements_pk PRIMARY KEY (event_id, course_id)
);
CREATE INDEX IF NOT EXISTS idx_event_requirements_course ON event_requirements (course_id);

CREATE TABLE IF NOT EXISTS event_requirement_waivers (
  event_id    UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  profile_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  granted_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  reason      TEXT        NOT NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_requirement_waivers_pk PRIMARY KEY (event_id, profile_id),
  CONSTRAINT event_requirement_waivers_reason_len CHECK (char_length(reason) BETWEEN 5 AND 500)
);
CREATE INDEX IF NOT EXISTS idx_event_requirement_waivers_profile ON event_requirement_waivers (profile_id);

SELECT laift_enable_rls('event_requirements'::regclass);
SELECT laift_enable_rls('event_requirement_waivers'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON event_requirements, event_requirement_waivers TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('event_prereq_enabled', FALSE, 'Eventos: exigir curso com certificado válido para a inscrição')
ON CONFLICT (key) DO NOTHING;
