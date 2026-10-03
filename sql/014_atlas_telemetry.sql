-- 014_atlas_telemetry.sql — uso anônimo do Atlas 3D (Onda 3.5, A.2).
--
-- Privacidade (LGPD): a tabela NÃO guarda profile_id, e-mail, IP nem texto
-- livre. Cada linha é um evento com um session_id aleatório gerado pela aba
-- do navegador (não liga uma pessoa a outra aba nem a outro dia). `props`
-- só aceita as chaves numéricas/curtas que o serviço da Worker permite por
-- evento (atlasTelemetryService.js). Retenção de 90 dias: o cron diário
-- (worker/src/maintenance.js) apaga o que passar disso.
--
-- Idempotente: pode ser aplicada de novo sem efeito.

CREATE TABLE IF NOT EXISTS atlas_telemetry (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  TEXT NOT NULL,
  event       TEXT NOT NULL,
  sid         TEXT,
  props       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_telemetry_event_chk CHECK (event IN ('app_open', 'structure_view', 'quiz_finish', 'search', 'error_js', 'session_end')),
  CONSTRAINT atlas_telemetry_session_len CHECK (char_length(session_id) BETWEEN 8 AND 40),
  CONSTRAINT atlas_telemetry_sid_len CHECK (sid IS NULL OR char_length(sid) <= 120),
  CONSTRAINT atlas_telemetry_props_size CHECK (pg_column_size(props) <= 1024)
);

-- Painel admin (contagem por evento e por dia) e limpeza por idade.
CREATE INDEX IF NOT EXISTS idx_atlas_telemetry_created ON atlas_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_atlas_telemetry_event_created ON atlas_telemetry (event, created_at DESC);
