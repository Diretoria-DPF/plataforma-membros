-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 054_chem_proxy_flag.sql. Só à mão; verificada por `npm run validate:sql`.
-- Remove a flag lab_chem_proxy_enabled e tira a migração do ledger.

DELETE FROM feature_flags WHERE key = 'lab_chem_proxy_enabled';

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '054_chem_proxy_flag.sql';
  END IF;
END $$;
