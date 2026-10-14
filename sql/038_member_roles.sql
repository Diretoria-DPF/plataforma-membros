-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 038_member_roles.sql — cargos funcionais acumuláveis (ADR 0010): gestor, revisor_conteudo, moderador, curador, mentor.
--
-- profiles.role (ENUM visitor|member|admin) NÃO muda: o cargo se soma ao papel base, numa tabela própria, no modelo da
-- library_staff (029/030). Uma pessoa pode ter vários cargos (uma linha por cargo). As capacidades de cada cargo ficam
-- no Worker (worker/src/roles/capabilities.js); a lista de cargos do CHECK abaixo é a mesma de lá.
-- Só perfis member ou admin têm cargo (gatilho member_roles_guard; mensagens começam com 'member_roles:'). Se a pessoa
-- voltar a ser visitante, a linha fica, mas o Worker a ignora (visitante não tem capacidade nenhuma).
-- Quem concede e retira é só o admin, com reautenticação e auditoria (worker/src/services/rolesService.js).
--
-- Cópia da Biblioteca: o curador da library_staff vira o cargo curador, só para quem já tem a verificação em duas
-- etapas ativa (curador é cargo privilegiado e a concessão exige MFA; quem ainda não tem continua curando pela
-- library_staff e recebe o cargo pelo admin depois de ativar). O 'mentor' da Biblioteca (importa e sugere artigos)
-- NÃO é o cargo mentor (mentoria entre membros) e o 'revisor_clinico' não tem cargo equivalente: os dois ficam só na
-- library_staff, que continua sendo a fonte da matriz da Biblioteca (worker/src/library/permissions.js).
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente. Requer 017 (mfa_credentials),
-- 029/030 (library_staff) e 032. Reversão: sql/down/038_member_roles.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS member_roles (
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  granted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_roles_pk PRIMARY KEY (profile_id, role),
  CONSTRAINT member_roles_role_chk CHECK (role IN ('gestor', 'revisor_conteudo', 'moderador', 'curador', 'mentor'))
);

-- "Quem tem o cargo X" (listagens e o ROL-03) e o SET NULL ao apagar a conta de quem concedeu.
CREATE INDEX IF NOT EXISTS idx_member_roles_role ON member_roles (role);
CREATE INDEX IF NOT EXISTS idx_member_roles_granted_by ON member_roles (granted_by);

CREATE OR REPLACE FUNCTION member_roles_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = NEW.profile_id AND role IN ('member', 'admin')) THEN
    RAISE EXCEPTION 'member_roles: só membros e administradores podem ter cargo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION member_roles_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_member_roles_guard ON member_roles;
CREATE TRIGGER trg_member_roles_guard
  BEFORE INSERT OR UPDATE OF profile_id ON member_roles
  FOR EACH ROW EXECUTE FUNCTION member_roles_guard();

SELECT laift_enable_rls('member_roles'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON member_roles TO laift_worker;
  END IF;
END
$$;

INSERT INTO member_roles (profile_id, role, granted_by, granted_at)
SELECT s.profile_id, 'curador', s.granted_by, s.granted_at
FROM library_staff s
JOIN profiles p ON p.id = s.profile_id AND p.role IN ('member', 'admin')
JOIN mfa_credentials m ON m.profile_id = s.profile_id AND m.confirmed_at IS NOT NULL
WHERE s.role = 'curador'
ON CONFLICT (profile_id, role) DO NOTHING;

RESET lock_timeout;
