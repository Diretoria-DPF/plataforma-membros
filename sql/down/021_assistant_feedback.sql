-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 021_assistant_feedback.sql. Não é aplicada no deploy: só à mão, em
-- caso de rollback, e verificada por `npm run validate:sql`.
-- Apaga todo o feedback e o histórico de respostas da Lia. Desligue feedback_enabled antes.

DROP TABLE IF EXISTS assistant_feedback;
DROP TABLE IF EXISTS assistant_messages;
