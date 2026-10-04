-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 016_feature_flags.sql. Não é aplicada no deploy: só à mão, em
-- caso de rollback, e verificada por `npm run validate:sql`.
-- Perde o estado das flags; o código volta ao padrão "desligado" sozinho.

DROP TABLE IF EXISTS feature_flags;
