-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 046_learning_idempotency.sql — idempotência do registro de simulados (fila offline, MOB-02).
--
--   * A fila do navegador reenvia a tentativa quando a rede volta. Cada tentativa leva uma chave (UUID) que o Worker guarda em
--     learning_attempts.details->>'idempotencyKey'. Este índice único parcial garante, no banco, que o mesmo perfil não grave
--     duas vezes a mesma chave (a corrida entre dois reenvios simultâneos). Linhas antigas, sem chave, ficam fora do índice.
--   * Sem coluna nova: RLS e GRANTs de learning_attempts continuam valendo como estão.
--   * O Worker funciona sem esta migração (o SELECT prévio já barra o reenvio comum); com ela, a barreira passa a ser atômica.
-- Aditiva e idempotente. Requer 012. Reversão: sql/down/046_learning_idempotency.sql.

SET lock_timeout = '5s';

CREATE UNIQUE INDEX IF NOT EXISTS uq_learning_attempts_idempotency
  ON learning_attempts (profile_id, (details->>'idempotencyKey'))
  WHERE details ? 'idempotencyKey';

RESET lock_timeout;
