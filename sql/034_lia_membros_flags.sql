-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 034_lia_membros_flags.sql — flag do registro de respostas da Lia para membros.
--
--   rag_cache_enabled   registro de respostas (tabela lia_pesquisas, sql/026): pergunta repetida de membro,
--                       sem histórico, na mesma versão do acervo, é respondida sem IA e sem gastar cota.
--
-- O código (assistantService.js) já lê esta flag, mas ela nunca foi semeada na tabela feature_flags (ausente
-- conta como desligada). Nasce DESLIGADA: o dono liga depois, pelo painel de flags (docs/FEATURE_FLAGS.md).
-- Só INSERT ... ON CONFLICT DO NOTHING: reaplicar nunca religa nem desliga uma flag que o admin já mexeu.
-- Não cria tabela (lia_pesquisas e a RLS dela vêm da 026). Requer a 016 (feature_flags). Idempotente.
-- Reversão: sql/down/034_lia_membros_flags.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('rag_cache_enabled', FALSE, 'Lia: registro de respostas (pergunta repetida de membro é respondida sem IA e sem gastar cota)')
ON CONFLICT (key) DO NOTHING;
