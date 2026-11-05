-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 054_chem_proxy_flag.sql — flag lab_chem_proxy_enabled: consultas do Laboratório a PubChem, ChEMBL e ChEBI
-- passam pelo Worker (apiLearnLabChem, cache de 7 dias na Cache API). DESLIGADA por padrão: com ela
-- desligada o Worker responde "desligado" e o navegador mantém o caminho antigo. Interna (o Worker decide).
-- Só INSERT ... ON CONFLICT DO NOTHING. Não cria tabela. Requer a 016. Idempotente. Reversão: sql/down/054_*.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('lab_chem_proxy_enabled', FALSE, 'Laboratório: consultas de PubChem, ChEMBL e ChEBI pelo Worker, com cache de 7 dias')
ON CONFLICT (key) DO NOTHING;
