-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 023_flags_v2.sql. Não é aplicada no deploy: só à mão.
-- Remove as flags criadas pela 023 e devolve ux_v2_enabled e chatbot_enabled ao
-- estado de origem (desligadas), como definidas na 016 e na 019. updated_by não é
-- tocado: quem já tinha decisão de admin continua com ela ao reaplicar a 023.
-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la;
-- sem o ledger (banco que nunca usou o runner), nada a fazer.

DELETE FROM feature_flags WHERE key IN ('rag_enabled', 'feedback_enabled', 'moderation_enabled');
UPDATE feature_flags SET enabled = FALSE, updated_at = now() WHERE key IN ('ux_v2_enabled', 'chatbot_enabled');

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '023_flags_v2.sql';
  END IF;
END $$;
