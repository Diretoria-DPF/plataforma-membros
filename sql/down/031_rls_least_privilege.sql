-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- down/031_rls_least_privilege.sql — desfaz o RLS e as permissões do laift_app.
-- Ordem: antes de desfazer a 031, aponte DATABASE_URL de volta para o dono do esquema, senão o Worker perde o acesso.
-- O PAPEL laift_app NÃO é removido aqui (pode estar em uso por uma conexão aberta): depois, à mão,
--   DROP ROLE laift_app;   (exige que ele não seja dono de nada nem tenha permissões; este script as retira).

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tbl
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'USAGE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS laift_app_all ON %s', t.tbl);
    EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('ALTER TABLE %s DISABLE ROW LEVEL SECURITY', t.tbl);
  END LOOP;
END
$$;

DROP FUNCTION IF EXISTS laift_enable_rls(regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_app') THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM laift_app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM laift_app;
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM laift_app;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM laift_app;
    REVOKE USAGE ON SCHEMA public FROM laift_app;
  END IF;
END
$$;

-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '031_rls_least_privilege.sql';
  END IF;
END
$$;
