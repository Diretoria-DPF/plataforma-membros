-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 047_daily_goal.sql — meta diária de questões escolhida pelo membro (ENG-02, docs/engajamento.md).
--
--   * preferences.daily_goal: 5, 10 ou 20 questões por dia (padrão 10). Preferência pessoal, nunca exibida a outras pessoas.
--   * O código funciona sem esta coluna (usa 10 no servidor e guarda a escolha só no aparelho): aplicar é opcional e seguro.
-- Aditiva e idempotente. Reversão: sql/down/047_daily_goal.sql.

SET lock_timeout = '5s';

ALTER TABLE preferences ADD COLUMN IF NOT EXISTS daily_goal SMALLINT NOT NULL DEFAULT 10;
ALTER TABLE preferences DROP CONSTRAINT IF EXISTS preferences_daily_goal_chk;
ALTER TABLE preferences ADD CONSTRAINT preferences_daily_goal_chk CHECK (daily_goal IN (5, 10, 20));

RESET lock_timeout;
