-- 013_clinical_ai.sql
-- Fase 3 (docs/PLANO_FASES_2_3_4.md, Contrato 1): IA da clínica virtual e
-- do laboratório saem do Apps Script e passam a rodar na Worker (Groq, com
-- pool de chaves). Duas tabelas novas:
--
-- 1) clinical_cases — acervo coletivo de casos clínicos. O conteúdo é
--    gerado por IA a pedido de um usuário (ou cadastrado por admin) e
--    exibido a OUTROS usuários, então só entra na biblioteca depois de
--    aprovado por um admin (status 'approved'). O payload já chega aqui
--    validado e normalizado pelo servidor (worker/src/ai/validators.js) —
--    os CHECKs abaixo são a última linha de defesa, não a validação real.
--
-- 2) ai_usage_log — auditoria de uso/custo da IA. De propósito NÃO guarda
--    conteúdo (pergunta, resposta, prompt): só qual recurso, qual modelo,
--    qual posição do pool de chaves (nunca a chave), tokens, latência e se
--    deu certo. É o suficiente para acompanhar custo e saúde das chaves
--    sem transformar a tabela num arquivo de conversas (minimização, LGPD).
--
-- Roda DEPOIS da 012 (learning_attempts, Equipe 2), mas não depende dela
-- em DDL: as referências a learning_attempts ficam só nas consultas de
-- worker/src/services/clinicalService.js. Assim a 013 também aplica sozinha
-- (npm run validate:sql).
--
-- Idempotente: IF NOT EXISTS em tudo; CHECKs declarados dentro do CREATE
-- TABLE (não reaplicados numa segunda execução).

CREATE TABLE IF NOT EXISTS clinical_cases (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  toxindrome  TEXT,
  agent       TEXT,
  payload     JSONB NOT NULL,
  source      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinical_cases_source_chk CHECK (source IN ('ia', 'admin')),
  CONSTRAINT clinical_cases_status_chk CHECK (status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT clinical_cases_title_len CHECK (char_length(title) BETWEEN 3 AND 200),
  CONSTRAINT clinical_cases_toxindrome_len CHECK (toxindrome IS NULL OR char_length(toxindrome) <= 80),
  CONSTRAINT clinical_cases_agent_len CHECK (agent IS NULL OR char_length(agent) <= 120),
  CONSTRAINT clinical_cases_payload_obj CHECK (jsonb_typeof(payload) = 'object'),
  -- O validador do servidor já limita cada campo; este teto só impede que
  -- um bug futuro no validador encha o banco com um payload gigante.
  CONSTRAINT clinical_cases_payload_size CHECK (octet_length(payload::text) <= 32768),
  -- Revisão coerente: pendente nunca tem revisor; aprovado/rejeitado sempre
  -- tem data de revisão (o revisor pode virar NULL se a conta for apagada).
  CONSTRAINT clinical_cases_review_consistency CHECK (
    (status = 'pending' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status <> 'pending' AND reviewed_at IS NOT NULL)
  )
);

-- Biblioteca (só 'approved', mais recentes primeiro) e fila de moderação
-- (só 'pending', mais antigos primeiro) — as duas consultas filtram por status.
CREATE INDEX IF NOT EXISTS idx_clinical_cases_status_created ON clinical_cases (status, created_at DESC);
-- Filtro por toxíndrome dentro da biblioteca aprovada.
CREATE INDEX IF NOT EXISTS idx_clinical_cases_status_toxindrome ON clinical_cases (status, toxindrome);
-- Consultas por autor (ex.: auditoria de quem gerou o quê).
CREATE INDEX IF NOT EXISTS idx_clinical_cases_created_by ON clinical_cases (created_by);

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id        UUID REFERENCES profiles(id) ON DELETE SET NULL,
  feature           TEXT NOT NULL,
  model             TEXT NOT NULL,
  key_index         SMALLINT,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  latency_ms        INTEGER,
  ok                BOOLEAN NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_log_feature_chk CHECK (feature IN ('chat', 'evaluate', 'generate_case', 'lab_preceptor', 'health')),
  CONSTRAINT ai_usage_log_model_len CHECK (char_length(model) <= 100),
  CONSTRAINT ai_usage_log_key_index_chk CHECK (key_index IS NULL OR key_index >= 0),
  CONSTRAINT ai_usage_log_tokens_chk CHECK (
    (prompt_tokens IS NULL OR prompt_tokens >= 0) AND (completion_tokens IS NULL OR completion_tokens >= 0)
  ),
  CONSTRAINT ai_usage_log_latency_chk CHECK (latency_ms IS NULL OR latency_ms >= 0)
);

-- Resumo de uso das últimas 24 h no painel admin (por data) e consumo por pessoa.
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created ON ai_usage_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_profile_created ON ai_usage_log (profile_id, created_at DESC);
