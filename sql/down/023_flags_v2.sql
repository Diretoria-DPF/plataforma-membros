-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 023_flags_v2.sql. Não é aplicada no deploy: só à mão.
-- Remove as flags criadas pela 023 e devolve ux_v2_enabled e chatbot_enabled ao
-- estado de origem (desligadas), como definidas na 016 e na 019.

DELETE FROM feature_flags WHERE key IN ('rag_enabled', 'feedback_enabled', 'moderation_enabled');
UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key IN ('ux_v2_enabled', 'chatbot_enabled');
