-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- Reversão da 017_mfa.sql. Não é aplicada no deploy: só à mão, em caso de
-- rollback, e verificada por `npm run validate:sql`.
-- Apaga os segredos e códigos de recuperação: quem usava MFA volta a entrar
-- só com a senha (desligue também a flag mfa_required antes de reverter).

DROP TABLE IF EXISTS mfa_challenges;
DROP TABLE IF EXISTS mfa_recovery_codes;
DROP TABLE IF EXISTS mfa_credentials;
