-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 021_assistant_feedback.sql. Não é aplicada no deploy: só à mão, em
-- caso de rollback, e verificada por `npm run validate:sql`.
-- Apaga todo o feedback e o histórico de respostas da Lia. Desligue feedback_enabled antes.
-- No fim, tira a migração do ledger (schema_migrations), para o runner poder reaplicá-la;
-- sem o ledger (banco que nunca usou o runner), nada a fazer.

DROP TABLE IF EXISTS assistant_feedback;
DROP TABLE IF EXISTS assistant_messages;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE name = '021_assistant_feedback.sql';
  END IF;
END $$;
