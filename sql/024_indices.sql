-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 024_indices.sql — índices da faxina diária e das séries do Início.
--
-- rate_limit_buckets  a purga diária (worker/src/maintenance.js, tarefa rateLimitBuckets) apaga
--                     por `window_started_at < now() - 8 dias`, mas a tabela só tem a chave
--                     primária (bucket, identifier_hash): sem este índice, cada purga lê a
--                     tabela inteira. O UPSERT de security.enforceRateLimit só altera a coluna
--                     indexada ao reiniciar a janela, então o custo nas gravações é baixo.
-- Séries do Início (worker/src/services/timeseriesService.js, apiGetMyTimeseries): três
-- leituras "desta pessoa, por data". Os índices existentes só têm profile_id, sem a data:
--   event_registrations (profile_id, registered_at)  complementa idx_event_registrations_profile
--   task_signups        (profile_id, completed_at)   complementa idx_task_signups_profile
--   learning_attempts   (profile_id, created_at)     o idx_learning_attempts_profile_module_created
--                       tem `module` no meio, e a série não filtra por módulo: não serve de
--                       ordem por data.
-- Os índices só-por-profile_id ficam (remover um índice é decisão de outra migração, depois de
-- medir em produção); como os novos começam por profile_id, atendem as mesmas buscas.
-- CREATE INDEX comum, e não CONCURRENTLY: o runner aplica o arquivo numa transação, onde
-- CONCURRENTLY não roda. As tabelas são pequenas (linhas por pessoa), e o lock_timeout de 3 s
-- impede que o bloqueio de gravação fique na fila atrás de uma transação longa (mesma forma
-- da 020: SET/RESET de sessão, válido no runner e na aplicação à mão).
-- Aditiva e idempotente. Reversão: sql/down/024_indices.sql.

SET lock_timeout = '3s';
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON rate_limit_buckets (window_started_at);
CREATE INDEX IF NOT EXISTS idx_event_registrations_profile_registered ON event_registrations (profile_id, registered_at);
CREATE INDEX IF NOT EXISTS idx_task_signups_profile_completed ON task_signups (profile_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_learning_attempts_profile_created ON learning_attempts (profile_id, created_at);
RESET lock_timeout;
