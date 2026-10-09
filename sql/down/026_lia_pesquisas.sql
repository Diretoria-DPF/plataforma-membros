-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 026_lia_pesquisas.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Apaga só o registro de pesquisas (cache: a Lia volta a pesquisar do zero). Antes de
-- reverter, desligue a flag rag_cache_enabled, para o código não tentar ler a tabela.
-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la;
-- sem o ledger (banco que nunca usou o runner), nada a fazer.

DROP TABLE IF EXISTS lia_pesquisas;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '026_lia_pesquisas.sql';
  END IF;
END $$;
