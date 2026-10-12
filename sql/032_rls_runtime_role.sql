-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 032_rls_runtime_role.sql — papel de execução do Worker: laift_worker (criado por SQL).
--
-- Por quê: um papel criado pelo console do Neon entra em neon_superuser (CREATEROLE, CREATEDB, BYPASSRLS) e
-- o dono do esquema não consegue tirar isso por SQL; além disso, apagar/recriar o papel no console remove as
-- políticas dele (DROP OWNED BY). Um papel criado por SQL NÃO herda nada disso. O laift_worker faz o que a 031
-- queria do laift_app: LOGIN sem senha (definida no console do Neon, nunca aqui), sem superusuário, sem DDL,
-- sem BYPASSRLS, só SELECT/INSERT/UPDATE/DELETE. As políticas do RLS passam a liberar só o laift_worker
-- (laift_worker_all); as laift_app_all da 031 saem. Quem ainda usa o laift_app (console) cai no "negar por padrão"
-- se não tiver BYPASSRLS: troque o DATABASE_URL do Worker para o laift_worker e apague o laift_app no console.
-- laift_enable_rls(tabela) continua sendo o ponto de entrada de toda migração que criar tabela.
-- Aditiva e idempotente. Reversão: sql/down/032_rls_runtime_role.sql. Requer a 031.

SET lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    CREATE ROLE laift_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO laift_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM laift_worker;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM laift_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO laift_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO laift_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO laift_worker;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO laift_worker;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON schema_migrations FROM laift_worker;
  END IF;
END
$$;

-- RLS: a política única agora é do laift_worker; a da 031 (laift_app_all) é removida.
CREATE OR REPLACE FUNCTION laift_enable_rls(target regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
  EXECUTE format('DROP POLICY IF EXISTS laift_app_all ON %s', target);
  EXECUTE format('DROP POLICY IF EXISTS laift_worker_all ON %s', target);
  EXECUTE format('CREATE POLICY laift_worker_all ON %s FOR ALL TO laift_worker USING (true) WITH CHECK (true)', target);
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
    IF t.relname = 'schema_migrations' THEN
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.tbl);
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t.tbl);
      EXECUTE format('DROP POLICY IF EXISTS laift_app_all ON %s', t.tbl);
      EXECUTE format('DROP POLICY IF EXISTS laift_worker_all ON %s', t.tbl);
    ELSE
      PERFORM laift_enable_rls(t.tbl);
    END IF;
  END LOOP;
END
$$;

RESET lock_timeout;
