-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- memory/down/001_memory.sql — reversão da memory/001_memory.sql. Não é aplicada no deploy: só à mão, em rollback,
-- e verificada por `npm run validate:sql`.
-- APAGA todos os itens de memória (a tabela inteira). Antes, desligue memory_enabled e tire DATABASE_URL_MEMORY do Worker.
-- O PAPEL laift_memory_worker e a extensão vector NÃO são removidos aqui (pode haver conexão aberta): depois, à mão,
--   DROP OWNED BY laift_memory_worker; DROP ROLE laift_memory_worker;
-- Tira a própria linha do ledger (memory_schema_migrations) para o runner poder reaplicar.

DROP TABLE IF EXISTS memory_items;
DROP FUNCTION IF EXISTS memory_items_cap();

DO $$
BEGIN
  IF to_regclass('public.memory_schema_migrations') IS NOT NULL THEN
    DELETE FROM memory_schema_migrations WHERE name = '001_memory.sql';
  END IF;
END
$$;
