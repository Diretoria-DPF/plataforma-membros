-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reverte 051: remove os cargos novos (a lista antiga não os aceita) e restaura o CHECK da 038.

SET lock_timeout = '5s';

DELETE FROM member_roles WHERE role NOT IN ('gestor', 'revisor_conteudo', 'moderador', 'curador', 'mentor');
ALTER TABLE member_roles DROP CONSTRAINT IF EXISTS member_roles_role_chk;
ALTER TABLE member_roles ADD CONSTRAINT member_roles_role_chk CHECK (role IN ('gestor', 'revisor_conteudo', 'moderador', 'curador', 'mentor'));

RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '051_member_roles_secretaria.sql';
  END IF;
END $$;
