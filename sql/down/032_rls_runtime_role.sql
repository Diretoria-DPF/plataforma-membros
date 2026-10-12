-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- down/032_rls_runtime_role.sql — volta ao estado da 031 (política laift_app_all) e tira as permissões do laift_worker.
-- Ordem: antes, aponte o DATABASE_URL do Worker de volta para um papel que ainda tenha política (o laift_app com
-- BYPASSRLS do console, ou o dono do esquema). O PAPEL laift_worker NÃO é removido aqui (pode haver conexão aberta):
--   depois, à mão, DROP ROLE laift_worker;

CREATE OR REPLACE FUNCTION laift_enable_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS laift_app_all ON %s', target);
  EXECUTE format('CREATE POLICY laift_app_all ON %s FOR ALL TO laift_app USING (true) WITH CHECK (true)', target);
END
$$;
REVOKE ALL ON FUNCTION laift_enable_rls(regclass) FROM PUBLIC;

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tbl, c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'USAGE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS laift_worker_all ON %s', t.tbl);
    IF t.relname <> 'schema_migrations' THEN
      PERFORM laift_enable_rls(t.tbl);
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM laift_worker;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM laift_worker;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM laift_worker;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM laift_worker;
    REVOKE USAGE ON SCHEMA public FROM laift_worker;
  END IF;
END
$$;

-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '032_rls_runtime_role.sql';
  END IF;
END
$$;
