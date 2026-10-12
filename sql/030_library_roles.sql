-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 030_library_roles.sql — Biblioteca LAIFT: papel "mentor" na equipe, pedidos de remoção e publicação como referência.
-- Aditiva e idempotente (IF NOT EXISTS, DROP ... IF EXISTS antes de cada ADD). Requer a 029. Reversão: sql/down/030_library_roles.sql.
-- Matriz de papéis: worker/src/library/permissions.js. Passo a passo: docs/cortex/RUNBOOK-BIBLIOTECA.md §8.

-- Equipe: além de curador e revisor clínico, o mentor (importa e sugere direto para a fila, pede remoção).
-- library_staff e library_articles são pequenas (centenas de linhas): o lock_timeout só evita esperar um bloqueio longo.
SET lock_timeout = '3s';
ALTER TABLE library_staff DROP CONSTRAINT IF EXISTS library_staff_role_chk;
ALTER TABLE library_staff ADD CONSTRAINT library_staff_role_chk CHECK (role IN ('curador', 'revisor_clinico', 'mentor'));

-- Publicado "só como referência" (título, autores e link): o resumo de IA de um artigo clínico sem revisor
-- clínico é apagado na publicação e a linha fica marcada. Coluna com padrão constante: não reescreve a tabela.
ALTER TABLE library_articles ADD COLUMN IF NOT EXISTS reference_only BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE library_articles DROP CONSTRAINT IF EXISTS library_articles_reference_chk;
ALTER TABLE library_articles ADD CONSTRAINT library_articles_reference_chk CHECK (NOT reference_only OR summary_text IS NULL);
RESET lock_timeout;

-- Pedido de remoção: curador e mentor não removem; pedem, e o admin aceita (remove) ou recusa.
CREATE TABLE IF NOT EXISTS library_removal_requests (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  article_id    UUID NOT NULL REFERENCES library_articles(id) ON DELETE CASCADE,
  requested_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pendente',
  decided_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_removal_requests_reason_chk CHECK (char_length(reason) BETWEEN 3 AND 300),
  CONSTRAINT library_removal_requests_status_chk CHECK (status IN ('pendente', 'aceito', 'recusado')),
  CONSTRAINT library_removal_requests_decided_chk CHECK ((status = 'pendente') = (decided_at IS NULL))
);
-- Um pedido pendente por artigo (pedir de novo, com outro pendente, é recusado pelo serviço).
CREATE UNIQUE INDEX IF NOT EXISTS uq_library_removal_requests_pending ON library_removal_requests (article_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_library_removal_requests_status_created ON library_removal_requests (status, created_at);
CREATE INDEX IF NOT EXISTS idx_library_removal_requests_requested_by ON library_removal_requests (requested_by);
