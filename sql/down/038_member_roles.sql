-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 038_member_roles.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: apaga todos os cargos funcionais concedidos (gestor, revisor_conteudo, moderador, curador, mentor); as
-- pessoas voltam a ter só o papel base. A library_staff não é tocada (os curadores da Biblioteca continuam lá).
-- Publique antes um Worker que não leia member_roles, ou ele cai no caminho de compatibilidade (sessão sem cargos).
-- Tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

SET lock_timeout = '5s';
DROP TABLE IF EXISTS member_roles;
DROP FUNCTION IF EXISTS member_roles_guard();
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '038_member_roles.sql';
  END IF;
END $$;
