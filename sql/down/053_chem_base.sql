-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 053_chem_base.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga todo o banco próprio de química (fontes, substâncias, propriedades, reações, processos, equipamentos).
-- O seed do repositório continua sendo a fonte do navegador. Tira a migração do ledger (schema_migrations).

SET lock_timeout = '5s';
DROP TABLE IF EXISTS pharma_qc_tests;
DROP TABLE IF EXISTS pharma_formulation_items;
DROP TABLE IF EXISTS pharma_process_steps;
DROP TABLE IF EXISTS pharma_processes;
DROP TABLE IF EXISTS lab_equipment;
DROP TABLE IF EXISTS chem_reaction_species;
DROP TABLE IF EXISTS chem_reactions;
DROP TABLE IF EXISTS chem_properties;
DROP TABLE IF EXISTS chem_substance_aliases;
DROP TABLE IF EXISTS chem_substances;
DROP TABLE IF EXISTS chem_sources;
DROP FUNCTION IF EXISTS chem_processes_nivel_guard();
DROP FUNCTION IF EXISTS chem_substances_nivel_guard();
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '053_chem_base.sql';
  END IF;
END $$;
