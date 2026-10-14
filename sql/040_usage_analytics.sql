-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 040_usage_analytics.sql — analytics de produto mínimo, sem cookies e sem terceiros (DAT-01; docs/analytics-minimo.md).
--
-- usage_daily: contadores AGREGADOS por dia e métrica (nenhum profile_id). O Worker faz UPSERT incremental (n = n + 1).
--   A métrica é um nome técnico fixo (signup, email_confirmed, dau, quiz_completed...), nunca texto de pessoa.
-- activity_days: no máximo UMA linha por pessoa por dia ("esteve ativa neste dia"), necessária para DAU/WAU/MAU e para
--   a retenção D1/D7/D30. Não guarda hora, página, IP nem aparelho. Some junto com a conta (ON DELETE CASCADE).
-- "Dia" é o dia civil de America/Sao_Paulo, calculado no Worker. Retenção: 400 dias (faxina diária em maintenance.js).
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente. Requer 032.
-- Reversão: sql/down/040_usage_analytics.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS usage_daily (
  day     DATE   NOT NULL,
  metric  TEXT   NOT NULL,
  n       BIGINT NOT NULL DEFAULT 0 CHECK (n >= 0),
  CONSTRAINT usage_daily_pk PRIMARY KEY (day, metric),
  CONSTRAINT usage_daily_metric_chk CHECK (metric ~ '^[a-z0-9_.]{1,40}$')
);

CREATE TABLE IF NOT EXISTS activity_days (
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day         DATE NOT NULL,
  CONSTRAINT activity_days_pk PRIMARY KEY (profile_id, day)
);

-- A chave de activity_days começa por profile_id; DAU/WAU/MAU e a faxina varrem por dia.
CREATE INDEX IF NOT EXISTS idx_activity_days_day ON activity_days (day);

SELECT laift_enable_rls('usage_daily'::regclass);
SELECT laift_enable_rls('activity_days'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON usage_daily TO laift_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON activity_days TO laift_worker;
  END IF;
END
$$;

RESET lock_timeout;
