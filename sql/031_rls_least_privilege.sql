-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 031_rls_least_privilege.sql — papel de menor privilégio do Worker (laift_app) e RLS negando por padrão.
--
-- Hoje o Worker conecta como o dono do esquema (BYPASSRLS, CREATEROLE, DDL). Esta migração:
--   1. cria o papel laift_app (LOGIN, sem senha: a senha é definida no console do Neon, nunca aqui),
--      sem superusuário, sem DDL, sem BYPASSRLS, só SELECT/INSERT/UPDATE/DELETE nas tabelas;
--   2. liga e FORÇA o RLS em todas as tabelas do esquema public, com UMA política que libera só o
--      laift_app. Qualquer outro papel (relatório, backup sem BYPASSRLS, credencial vazada) não lê
--      nem grava nada sem uma política explícita. Não há política por membro: o Worker usa um único
--      papel e a autorização por pessoa continua no código.
--   3. cria laift_enable_rls(tabela): TODA migração nova que criar tabela deve chamá-la
--      (SELECT laift_enable_rls('minha_tabela'::regclass);). O teste worker/test/rlsPrivilegioMinimo.test.js
--      falha se alguma tabela ficar de fora.
-- Sem efeito enquanto o Worker usar o dono (que tem BYPASSRLS): o comportamento do site só muda quando
-- DATABASE_URL passar a apontar para o laift_app. Aditiva e idempotente. Reversão: sql/down/031_rls_least_privilege.sql.
-- Requer: 001–030. O schema_migrations (ledger do runner) fica fora do alcance do laift_app.

SET lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_app') THEN
    CREATE ROLE laift_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT;
  END IF;
END
$$;

-- Permissões: recomeça do zero (reaplicar nunca deixa permissão antiga) e concede só DML.
GRANT USAGE ON SCHEMA public TO laift_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM laift_app;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM laift_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO laift_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO laift_app;
-- Tabelas e sequências criadas depois, por quem aplica as migrações, já nascem com a mesma concessão.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO laift_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO laift_app;

-- O ledger de migrações não é do Worker.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    REVOKE ALL ON schema_migrations FROM laift_app;
  END IF;
END
$$;

-- RLS: liga, força (vale até para o dono sem BYPASSRLS) e cria a política única do laift_app.
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
    IF t.relname = 'schema_migrations' THEN
      -- Ledger: RLS forçado e nenhuma política, ou seja, fechado para o laift_app.
      EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.tbl);
      EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t.tbl);
    ELSE
      PERFORM laift_enable_rls(t.tbl);
    END IF;
  END LOOP;
END
$$;

RESET lock_timeout;
