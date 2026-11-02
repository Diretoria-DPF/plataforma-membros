-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 049_ui_v2_flags.sql — flags das telas novas (Início v3 e Entrada v2).
--
--   home_v2_enabled     nova tela Início (foco único, resumo do dia, faixas e navegação responsiva).
--   entrada_v2_enabled  nova tela de entrada (login e cadastro).
-- Ambas são públicas (vão ao navegador, inclusive de quem ainda não entrou) e nascem DESLIGADAS.
-- Só INSERT ... ON CONFLICT DO NOTHING: reaplicar nunca religa nem desliga uma flag que o admin já mexeu.
-- Não cria tabela. Requer a 016 (feature_flags). Idempotente. Reversão: sql/down/049_ui_v2_flags.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('home_v2_enabled', FALSE, 'Início v3: foco único, resumo do dia, faixas de assuntos e da Liga e navegação responsiva'),
  ('entrada_v2_enabled', FALSE, 'Entrada v2: nova tela de login e cadastro')
ON CONFLICT (key) DO NOTHING;
