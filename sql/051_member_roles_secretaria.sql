-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 051_member_roles_secretaria.sql — cargo "secretaria" (portaria: presença e crachás) e nomes reservados para cargos futuros.
--
-- Amplia o CHECK de member_roles (038). Além da secretaria, o banco passa a aceitar quatro nomes reservados
-- (coordenador_eventos, coordenador_tarefas, relator_propostas, comunicacao) para que um cargo novo possa nascer só no Worker
-- (worker/src/roles/capabilities.js), sem outra migração. Enquanto o Worker não conhece o nome, ele recusa a concessão
-- (FUNCTIONAL_ROLES é a lista que vale); o banco apenas deixa de ser o gargalo.
-- Aditiva e idempotente. Requer 038. Reversão: sql/down/051_member_roles_secretaria.sql.

SET lock_timeout = '5s';

ALTER TABLE member_roles DROP CONSTRAINT IF EXISTS member_roles_role_chk;
ALTER TABLE member_roles ADD CONSTRAINT member_roles_role_chk CHECK (role IN (
  'gestor', 'revisor_conteudo', 'moderador', 'curador', 'mentor',
  'secretaria', 'coordenador_eventos', 'coordenador_tarefas', 'relator_propostas', 'comunicacao'
));

RESET lock_timeout;
