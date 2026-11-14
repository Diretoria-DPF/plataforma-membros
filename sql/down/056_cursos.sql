-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 056_cursos.sql. Só à mão, na ordem 058 → 057 → 056; verificada por `npm run validate:sql`.
-- Remove cursos, aulas, progresso, banco de questões e tentativas, a flag e a linha do ledger. Exige 057 e 058 revertidas.

DROP TABLE IF EXISTS assessment_attempts;
DROP TABLE IF EXISTS assessment_questions;
DROP TABLE IF EXISTS course_progress;
DROP TABLE IF EXISTS course_lessons;
DROP TABLE IF EXISTS courses;

DELETE FROM feature_flags WHERE key = 'courses_enabled';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '056_cursos.sql';
  END IF;
END $$;
