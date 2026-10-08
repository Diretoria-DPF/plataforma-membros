-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 020_rag.sql. Não é aplicada no deploy: só à mão, em caso de rollback,
-- e verificada por `npm run validate:sql`.
-- ATENÇÃO: a extensão `vector` NÃO é removida (DROP EXTENSION falha com objetos
-- dependentes e pode afetar outras tabelas; o Neon também não a remove em rollback).
-- A extensão pg_trgm também fica. Antes de reverter, desligue a flag rag_enabled.
-- A base se reconstrói com apiAdminReindexKb.

DROP TABLE IF EXISTS kb_chunks;
ALTER TABLE ai_usage_log DROP COLUMN IF EXISTS retrieval_used;
