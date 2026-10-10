-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 029_library.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Rollback normal é por flag (library_enabled desligada). Este arquivo só desfaz a migração.
-- Recusa se houver artigo: exporte antes (branch do Neon) e rode com
--   SET laift.allow_library_drop = 'on';
-- Não remove pg_trgm (usada pelas migrações 018, 020 e 026).
-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la;
-- sem o ledger (banco que nunca usou o runner), nada a fazer.

DO $$
BEGIN
  IF to_regclass('public.library_articles') IS NOT NULL
     AND EXISTS (SELECT 1 FROM library_articles)
     AND current_setting('laift.allow_library_drop', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'A Biblioteca tem artigos: exporte (branch do Neon) e rode com SET laift.allow_library_drop = ''on''.';
  END IF;
END $$;

DELETE FROM feature_flags
 WHERE key IN ('library_enabled', 'library_member_suggest', 'library_ai_summary', 'lia_library_enabled');

DROP TABLE IF EXISTS library_collection_items;
DROP TABLE IF EXISTS library_collections;
DROP TABLE IF EXISTS library_favorites;
DROP TABLE IF EXISTS library_suggestions;
DROP TABLE IF EXISTS library_staff;
DROP TABLE IF EXISTS library_articles;
DROP TABLE IF EXISTS library_topics;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '029_library.sql';
  END IF;
END $$;
