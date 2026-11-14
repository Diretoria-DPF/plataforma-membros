-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 057_certificados.sql. Só à mão, na ordem 058 → 057 → 056; verificada por `npm run validate:sql`.
-- Remove os certificados (APAGA os emitidos: exportar antes), a flag e a linha do ledger. Exige a 058 revertida.

DROP TABLE IF EXISTS certificates;

DELETE FROM feature_flags WHERE key = 'certificates_enabled';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '057_certificados.sql';
  END IF;
END $$;
