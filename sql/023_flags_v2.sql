-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 023_flags_v2.sql — flags da renovação (ux v2, Lia, RAG, feedback, moderação).
-- Decisão do responsável: nascem LIGADAS. O UPSERT também religa a flag se ela já
-- existia desligada (ux_v2_enabled e chatbot_enabled vieram da 016/019 desligadas).
-- Cada recurso tolera tabela ausente (migrações 020-022 não aplicadas = recurso
-- inativo, sem erro). Para desligar um recurso: apiAdminSetFeatureFlag.
-- Públicas (vão ao navegador): ux_v2_enabled, chatbot_enabled, feedback_enabled.
-- Requer a 016. Idempotente. Reversão: sql/down/023_flags_v2.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('ux_v2_enabled',      TRUE, 'Interface renovada (Início, onboarding, hero)'),
  ('chatbot_enabled',    TRUE, 'Lia, guia da plataforma (chat que orienta e leva às telas)'),
  ('rag_enabled',        TRUE, 'Lia consulta a base de conhecimento (busca híbrida) antes de responder'),
  ('feedback_enabled',   TRUE, 'Polegar e comentário sobre as respostas da Lia'),
  ('moderation_enabled', TRUE, 'Moderação da Lia (alerta, aviso, suspensão e redenção)')
ON CONFLICT (key) DO UPDATE SET enabled = TRUE, description = EXCLUDED.description, updated_at = now();
