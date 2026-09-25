-- 010_messaging_simplify.sql
-- Remove a exigência de frase-secreta da mensageria (feedback direto do
-- dono da plataforma: uma frase de 12+ caracteres "ficou muito complicado
-- para usabilidade entre os membros"). A chave de identidade passa a ser
-- gerada aleatoriamente e guardada só no navegador (IndexedDB), sem
-- PBKDF2/frase-secreta nenhuma — ainda assim nunca sai do navegador em
-- texto claro, e o servidor continua só vendo a chave pública.
--
-- kdf_algorithm/kdf_iterations/kdf_salt (sql/009_messaging.sql) existiam
-- só para o dono re-derivar a MESMA chave a partir da frase em outro
-- aparelho — sem frase-secreta, isso deixa de fazer sentido. Em vez de
-- apagar as colunas (existem 2 linhas reais publicadas sob o fluxo
-- antigo — verificado antes desta migração, `messages` está zerada, então
-- não há histórico cifrado para perder), elas viram opcionais e um novo
-- valor 'NONE' de kdf_algorithm marca "gerada aleatoriamente, sem KDF". As
-- 2 contas que já publicaram sob o fluxo antigo simplesmente rotacionam
-- para uma chave nova (sem KDF) na próxima vez que abrirem o painel.

ALTER TABLE messaging_keys ALTER COLUMN kdf_iterations DROP NOT NULL;
ALTER TABLE messaging_keys ALTER COLUMN kdf_salt DROP NOT NULL;

ALTER TABLE messaging_keys DROP CONSTRAINT IF EXISTS messaging_keys_kdf_enum;
ALTER TABLE messaging_keys ADD CONSTRAINT messaging_keys_kdf_enum
  CHECK (kdf_algorithm IN ('PBKDF2-SHA256', 'NONE'));

-- Consistência: 'NONE' nunca deve vir acompanhado de iterações/salt
-- (não fazem sentido sem KDF); 'PBKDF2-SHA256' sempre precisa dos dois
-- (mantido só para não quebrar as 2 linhas legadas já existentes).
ALTER TABLE messaging_keys DROP CONSTRAINT IF EXISTS messaging_keys_kdf_consistency;
ALTER TABLE messaging_keys ADD CONSTRAINT messaging_keys_kdf_consistency
  CHECK (
    (kdf_algorithm = 'NONE' AND kdf_iterations IS NULL AND kdf_salt IS NULL)
    OR
    (kdf_algorithm = 'PBKDF2-SHA256' AND kdf_iterations IS NOT NULL AND kdf_salt IS NOT NULL)
  );
