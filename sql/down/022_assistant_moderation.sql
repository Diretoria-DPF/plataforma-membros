-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 022_assistant_moderation.sql. Não é aplicada no deploy: só à mão, em
-- caso de rollback. Apaga o estado e o histórico de moderação da Lia (as punições
-- vigentes deixam de existir). Desligue moderation_enabled antes.

DROP TABLE IF EXISTS assistant_incidents;
DROP TABLE IF EXISTS assistant_moderation;
