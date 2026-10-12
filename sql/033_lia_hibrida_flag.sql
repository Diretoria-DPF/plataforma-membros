-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 033_lia_hibrida_flag.sql — flags da Lia híbrida (RAG + árvore de seções + guarda de intenção + visitante).
--
--   lia_hibrida_enabled      guarda de intenção, resposta clínica segura, escolha de seções pela árvore e
--                            resposta extrativa para quem não usa IA (exige também rag_enabled).
--   lia_visitor_ai_enabled   prévia de IA para quem não tem conta (Workers AI; exige TURNSTILE_SECRET e
--                            lia_hibrida_enabled). É pública: o front só carrega o Turnstile com ela ligada.
--
-- As duas nascem DESLIGADAS (não copiar a 023, que semeia TRUE). Só INSERT ... ON CONFLICT DO NOTHING:
-- reaplicar nunca religa nem desliga uma flag que o admin já mexeu. Não cria tabela.
-- Requer a 016 (feature_flags). Idempotente. Reversão: sql/down/033_lia_hibrida_flag.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('lia_hibrida_enabled', FALSE, 'Lia híbrida: guarda de intenção, escolha de seções pela árvore e resposta extrativa para quem não usa IA'),
  ('lia_visitor_ai_enabled', FALSE, 'Lia: prévia de IA para visitante sem conta (Workers AI, com Turnstile, limite por IP e teto de neurons)')
ON CONFLICT (key) DO NOTHING;
