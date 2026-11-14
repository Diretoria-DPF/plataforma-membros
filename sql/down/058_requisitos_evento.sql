-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 058_requisitos_evento.sql. Só à mão, na ordem 058 → 057 → 056; verificada por `npm run validate:sql`.
-- Remove as exigências de curso por evento e as dispensas, a flag e a linha do ledger.

DROP TABLE IF EXISTS event_requirement_waivers;
DROP TABLE IF EXISTS event_requirements;

DELETE FROM feature_flags WHERE key = 'event_prereq_enabled';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '058_requisitos_evento.sql';
  END IF;
END $$;
