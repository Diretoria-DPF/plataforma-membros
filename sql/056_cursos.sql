-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 056_cursos.sql — cursos, aulas, progresso, banco de questões e tentativas de prova (Onda 1 da Educação;
-- docs/cursos-operacao.md). A prova é sorteada e corrigida NO SERVIDOR: a coluna assessment_questions.correct
-- nunca sai em resposta da Worker (contrato testado em worker/test/courseService.test.js).
--
-- O curso nasce em 'rascunho_interno' e só aparece para membros em 'publicado', que exige published_at. O estado
-- de revisão e as notas internas (review_notes) são só da equipe: nenhuma resposta ao aluno os inclui.
-- DESLIGADA: a flag courses_enabled nasce FALSE. Requer 001, 016, 031 e 032.
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente; só ESCRITA do arquivo,
-- não aplicada. Reversão: sql/down/056_cursos.sql. O ledger schema_migrations (nome + sha256) é gravado pelo
-- runner tools/db/migrate.mjs na aplicação.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS courses (
  id                 UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug               TEXT        NOT NULL,
  title              TEXT        NOT NULL,
  summary            TEXT        NOT NULL DEFAULT '',
  kind               TEXT        NOT NULL DEFAULT 'minicurso',
  risk_class         TEXT        NOT NULL DEFAULT 'A',
  workload_minutes   INTEGER     NOT NULL,
  version            INTEGER     NOT NULL DEFAULT 1,
  pass_pct           SMALLINT    NOT NULL DEFAULT 70,
  max_attempts       SMALLINT    NOT NULL DEFAULT 3,
  retry_wait_hours   SMALLINT    NOT NULL DEFAULT 24,
  exam_size          SMALLINT    NOT NULL DEFAULT 10,
  min_critical       SMALLINT    NOT NULL DEFAULT 0,
  attempt_minutes    SMALLINT    NOT NULL DEFAULT 30,
  min_study_pct      SMALLINT    NOT NULL DEFAULT 40,
  validity_months    SMALLINT,
  status             TEXT        NOT NULL DEFAULT 'rascunho_interno',
  review_notes       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  published_at       TIMESTAMPTZ,
  published_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT courses_slug_uq UNIQUE (slug),
  CONSTRAINT courses_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 80),
  CONSTRAINT courses_title_len CHECK (char_length(title) BETWEEN 3 AND 200),
  CONSTRAINT courses_summary_len CHECK (char_length(summary) <= 2000),
  CONSTRAINT courses_kind_chk CHECK (kind IN ('minicurso', 'modulo', 'pop', 'diretriz')),
  CONSTRAINT courses_risk_chk CHECK (risk_class IN ('A', 'B')),
  CONSTRAINT courses_workload_chk CHECK (workload_minutes BETWEEN 15 AND 6000),
  CONSTRAINT courses_version_chk CHECK (version BETWEEN 1 AND 10000),
  CONSTRAINT courses_pass_chk CHECK (pass_pct BETWEEN 50 AND 100),
  CONSTRAINT courses_attempts_chk CHECK (max_attempts BETWEEN 1 AND 10),
  CONSTRAINT courses_wait_chk CHECK (retry_wait_hours BETWEEN 0 AND 720),
  CONSTRAINT courses_exam_size_chk CHECK (exam_size BETWEEN 1 AND 100),
  CONSTRAINT courses_min_critical_chk CHECK (min_critical BETWEEN 0 AND exam_size),
  CONSTRAINT courses_attempt_minutes_chk CHECK (attempt_minutes BETWEEN 5 AND 240),
  CONSTRAINT courses_min_study_chk CHECK (min_study_pct BETWEEN 0 AND 100),
  CONSTRAINT courses_validity_chk CHECK (validity_months IS NULL OR validity_months BETWEEN 1 AND 120),
  CONSTRAINT courses_status_chk CHECK (status IN ('rascunho_interno', 'em_revisao', 'publicado', 'arquivado')),
  CONSTRAINT courses_published_chk CHECK (status <> 'publicado' OR published_at IS NOT NULL),
  CONSTRAINT courses_review_notes_chk CHECK (jsonb_typeof(review_notes) = 'array')
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id    UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position     SMALLINT    NOT NULL,
  title        TEXT        NOT NULL,
  body_md      TEXT        NOT NULL,
  min_minutes  SMALLINT    NOT NULL DEFAULT 5,
  source_refs  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT course_lessons_pos_uq UNIQUE (course_id, position),
  CONSTRAINT course_lessons_pos_chk CHECK (position BETWEEN 1 AND 200),
  CONSTRAINT course_lessons_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT course_lessons_body_len CHECK (char_length(body_md) BETWEEN 1 AND 60000),
  CONSTRAINT course_lessons_minutes_chk CHECK (min_minutes BETWEEN 1 AND 120),
  CONSTRAINT course_lessons_refs_chk CHECK (jsonb_typeof(source_refs) = 'array')
);

-- Progresso: uma linha por pessoa e curso; lessons_done guarda as posições lidas. started_at é a trava mínima de
-- estudo (a prova só abre depois de min_study_pct do tempo previsto das aulas). Tempo medido não gera horas.
CREATE TABLE IF NOT EXISTS course_progress (
  profile_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id       UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_version  INTEGER     NOT NULL,
  lessons_done    SMALLINT[]  NOT NULL DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT course_progress_pk PRIMARY KEY (profile_id, course_id),
  CONSTRAINT course_progress_len_chk CHECK (cardinality(lessons_done) <= 200)
);
CREATE INDEX IF NOT EXISTS idx_course_progress_course ON course_progress (course_id);

CREATE TABLE IF NOT EXISTS assessment_questions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id    UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  ext_ref      TEXT        NOT NULL,
  stem         TEXT        NOT NULL,
  options      JSONB       NOT NULL,
  correct      SMALLINT    NOT NULL,
  explanation  TEXT        NOT NULL DEFAULT '',
  source_ref   TEXT        NOT NULL,
  is_critical  BOOLEAN     NOT NULL DEFAULT FALSE,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessment_questions_ref_uq UNIQUE (course_id, ext_ref),
  CONSTRAINT assessment_questions_ref_chk CHECK (ext_ref ~ '^[A-Za-z0-9_-]{1,40}$'),
  CONSTRAINT assessment_questions_stem_len CHECK (char_length(stem) BETWEEN 5 AND 2000),
  CONSTRAINT assessment_questions_options_chk CHECK (jsonb_typeof(options) = 'array' AND jsonb_array_length(options) BETWEEN 2 AND 6),
  CONSTRAINT assessment_questions_correct_chk CHECK (correct >= 0 AND correct < jsonb_array_length(options)),
  CONSTRAINT assessment_questions_expl_len CHECK (char_length(explanation) <= 2000),
  CONSTRAINT assessment_questions_source_len CHECK (char_length(source_ref) BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS idx_assessment_questions_course ON assessment_questions (course_id) WHERE active;

-- Tentativa: o sorteio (questões e ordem das alternativas) é fixado na abertura. Uma tentativa aberta por vez
-- por pessoa e curso (índice parcial); a Worker encerra a vencida com nota 0 antes de abrir outra.
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  course_id        UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_version   INTEGER     NOT NULL,
  question_ids     UUID[]      NOT NULL,
  option_order     JSONB       NOT NULL,
  answers          JSONB,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  submitted_at     TIMESTAMPTZ,
  score_pct        SMALLINT,
  critical_missed  SMALLINT,
  passed           BOOLEAN,
  CONSTRAINT assessment_attempts_qty_chk CHECK (cardinality(question_ids) BETWEEN 1 AND 100),
  CONSTRAINT assessment_attempts_order_chk CHECK (jsonb_typeof(option_order) = 'array'),
  CONSTRAINT assessment_attempts_window_chk CHECK (expires_at > started_at),
  CONSTRAINT assessment_attempts_score_chk CHECK (score_pct IS NULL OR score_pct BETWEEN 0 AND 100),
  CONSTRAINT assessment_attempts_closed_chk CHECK ((submitted_at IS NULL) = (passed IS NULL) AND (submitted_at IS NULL) = (score_pct IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_person ON assessment_attempts (profile_id, course_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_assessment_attempts_open ON assessment_attempts (profile_id, course_id) WHERE submitted_at IS NULL;

SELECT laift_enable_rls('courses'::regclass);
SELECT laift_enable_rls('course_lessons'::regclass);
SELECT laift_enable_rls('course_progress'::regclass);
SELECT laift_enable_rls('assessment_questions'::regclass);
SELECT laift_enable_rls('assessment_attempts'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON courses, course_lessons, course_progress, assessment_questions, assessment_attempts TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('courses_enabled', FALSE, 'Cursos: lista, aulas e prova corrigida no servidor (Onda 1 da Educação)')
ON CONFLICT (key) DO NOTHING;
