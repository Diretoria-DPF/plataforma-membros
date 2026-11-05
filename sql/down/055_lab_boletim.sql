-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 055_lab_boletim.sql. Só à mão; verificada por `npm run validate:sql`.
-- Remove a tabela do boletim (o boletim do aparelho não é afetado), a flag e a linha do ledger.

DROP TABLE IF EXISTS lab_boletim_competencia;

DELETE FROM feature_flags WHERE key = 'lab_boletim_conta_enabled';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '055_lab_boletim.sql';
  END IF;
END $$;
