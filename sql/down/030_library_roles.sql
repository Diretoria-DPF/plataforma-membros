-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 030_library_roles.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- Recusa se houver mentor na equipe ou pedido de remoção: ambos se perdem. Para rodar assim mesmo,
-- exporte (branch do Neon) e use, na mesma sessão, SET laift.allow_library_drop = 'on'
-- Artigos publicados só como referência continuam no ar (sem resumo); só a marca some.
-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la.

DO $$
BEGIN
  IF current_setting('laift.allow_library_drop', true) IS DISTINCT FROM 'on' AND (
       (to_regclass('public.library_removal_requests') IS NOT NULL AND EXISTS (SELECT 1 FROM library_removal_requests))
       OR (to_regclass('public.library_staff') IS NOT NULL AND EXISTS (SELECT 1 FROM library_staff WHERE role = 'mentor'))
     ) THEN
    RAISE EXCEPTION 'Há mentores ou pedidos de remoção: exporte (branch do Neon) e rode com SET laift.allow_library_drop = ''on''.';
  END IF;
END $$;

DROP TABLE IF EXISTS library_removal_requests;

SET lock_timeout = '3s';
DO $$
BEGIN
  IF to_regclass('public.library_staff') IS NOT NULL THEN
    DELETE FROM library_staff WHERE role = 'mentor';
    ALTER TABLE library_staff DROP CONSTRAINT IF EXISTS library_staff_role_chk;
    ALTER TABLE library_staff ADD CONSTRAINT library_staff_role_chk CHECK (role IN ('curador', 'revisor_clinico'));
  END IF;
  IF to_regclass('public.library_articles') IS NOT NULL THEN
    ALTER TABLE library_articles DROP CONSTRAINT IF EXISTS library_articles_reference_chk;
    ALTER TABLE library_articles DROP COLUMN IF EXISTS reference_only;
  END IF;
END $$;
RESET lock_timeout;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '030_library_roles.sql';
  END IF;
END $$;
