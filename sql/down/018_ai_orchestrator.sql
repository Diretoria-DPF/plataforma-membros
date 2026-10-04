-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 018_ai_orchestrator.sql. Não é aplicada no deploy: só à mão, em
-- caso de rollback, e verificada por `npm run validate:sql`.
-- Perde as métricas diárias e o cache (o cache se reconstrói sozinho). A
-- extensão pg_trgm é mantida: pode estar em uso por outras tabelas.
-- Antes de reverter, desligue a flag use_orchestrator.

DROP TABLE IF EXISTS ai_semantic_cache;
DROP TABLE IF EXISTS ai_metrics_daily;
