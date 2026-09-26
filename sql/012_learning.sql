-- =============================================================================
-- 012_learning.sql
-- Plataforma de Membros — Fase 2 da unificação LAIFT (docs/PLANO_FASES_2_3_4.md,
-- Contrato 1): progresso de aprendizagem e presença em eventos passam a viver
-- no Neon, no lugar da planilha do Google Apps Script legado.
--
--  1) learning_attempts: uma linha por atividade concluída nos módulos
--     (quiz, caso clínico, formulação de bancada, simulação PK). As
--     estatísticas e conquistas do hub "Aprender" são agregadas daqui pela
--     Worker (worker/src/services/learningService.js) — nada é calculado
--     nem guardado no navegador.
--  2) event_registrations ganha as colunas de presença (check-in feito pelo
--     terminal fiscal, só admin — worker/src/services/attendanceService.js).
--  3) guard_event_registration() passa a aceitar a inscrição criada NA
--     PORTA (check-in de quem não se inscreveu antes) também em eventos
--     'in_progress' — todas as outras regras do gatilho (existência,
--     conta banida/não confirmada, visibilidade por papel, capacidade)
--     continuam valendo exatamente como em 004_event_visibility_guard.sql.
--  4) guard_event_status_transition() passa a aceitar as transições de
--     'in_progress' que a Worker já oferecia ao admin (ver o bloco no fim).
--
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE e guards
-- DO … EXCEPTION WHEN duplicate_object — seguro reaplicar
-- (cd worker && npm run validate:sql aplica tudo duas vezes).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- learning_attempts
-- profile_id usa ON DELETE CASCADE: é dado pessoal de desempenho, sem valor
-- coletivo depois que a conta deixa de existir (minimização — LGPD).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS learning_attempts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module           TEXT NOT NULL,   -- 'farmacologia' | 'toxicologia' | 'clinica' | 'laboratorio' | 'anatomia'
  activity         TEXT NOT NULL,   -- 'quiz_estudo' | 'quiz_prova' | 'caso_clinico' | 'formulacao' | 'simulacao_pk'
  score            INTEGER,         -- acertos (quiz) ou nota 0–100 (caso clínico); NULL se não se aplica
  max_score        INTEGER,         -- total de questões ou 100
  duration_seconds INTEGER,
  details          JSONB NOT NULL DEFAULT '{}'::jsonb,  -- limitado no serviço e aqui (≤ 8 KB)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT learning_attempts_module_domain CHECK (
    module IN ('farmacologia', 'toxicologia', 'clinica', 'laboratorio', 'anatomia')
  ),
  CONSTRAINT learning_attempts_activity_domain CHECK (
    activity IN ('quiz_estudo', 'quiz_prova', 'caso_clinico', 'formulacao', 'simulacao_pk')
  ),
  -- score e max_score andam juntos: ou a atividade não tem nota (os dois
  -- NULL, ex.: formulação), ou tem nota coerente 0 ≤ score ≤ max_score,
  -- com max_score > 0 (evita divisão por zero na agregação) e ≤ 500 (o
  -- maior simulado aceito pela Worker; a nota do caso clínico é sobre 100).
  CONSTRAINT learning_attempts_score_coherence CHECK (
    (score IS NULL AND max_score IS NULL)
    OR (score IS NOT NULL AND max_score IS NOT NULL
        AND max_score BETWEEN 1 AND 500
        AND score BETWEEN 0 AND max_score)
  ),
  CONSTRAINT learning_attempts_duration_range CHECK (
    duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400
  ),
  CONSTRAINT learning_attempts_details_object CHECK (jsonb_typeof(details) = 'object'),
  -- Teto de defesa em profundidade: o serviço já recusa acima de 8 KB com
  -- mensagem clara; isto só garante que nenhum caminho de escrita (inclusive
  -- o da Equipe 3, que grava caso_clinico direto aqui) infle a tabela.
  CONSTRAINT learning_attempts_details_size CHECK (octet_length(details::text) <= 8192)
);

-- Toda leitura é "as tentativas DESTA pessoa", quase sempre por módulo e
-- das mais recentes para as mais antigas.
CREATE INDEX IF NOT EXISTS idx_learning_attempts_profile_module_created
  ON learning_attempts (profile_id, module, created_at DESC);

-- -----------------------------------------------------------------------------
-- event_registrations: presença (substitui a planilha do terminal fiscal)
-- checked_in_by usa ON DELETE SET NULL: a presença é registro histórico do
-- evento e sobrevive à conta do admin que a registrou.
-- -----------------------------------------------------------------------------
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checked_in_at  TIMESTAMPTZ;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checked_in_by  UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS checkin_method TEXT;  -- 'qr' | 'manual' | 'lista'

DO $$ BEGIN
  ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_checkin_method_domain
    CHECK (checkin_method IS NULL OR checkin_method IN ('qr', 'manual', 'lista'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Método e horário do check-in só existem juntos (um sem o outro seria um
-- registro de presença pela metade, impossível de auditar).
DO $$ BEGIN
  ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_checkin_coherence
    CHECK ((checked_in_at IS NULL) = (checkin_method IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Contagem de presentes por evento (lista de eventos do fiscal e CSV).
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_checkin
  ON event_registrations (event_id, checked_in_at);

-- -----------------------------------------------------------------------------
-- guard_event_registration(): mesma função de 004_event_visibility_guard.sql,
-- com UMA diferença — a inscrição que já chega com checked_in_at preenchido
-- (só a Worker grava isso, no check-in feito por um admin no terminal
-- fiscal) é aceita também quando o evento está 'in_progress': é exatamente
-- o momento em que a portaria recebe quem não se inscreveu antes. Inscrição
-- comum (apiRegisterForEvent, sem checked_in_at) continua exigindo
-- 'published'. Capacidade, visibilidade e conta banida/não confirmada
-- continuam valendo para os dois caminhos.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_event_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_capacity INTEGER;
  v_status event_status;
  v_visibility event_visibility;
  v_current_count INTEGER;
  v_profile_status account_status;
  v_profile_role user_role;
  v_email_confirmed TIMESTAMPTZ;
BEGIN
  SELECT capacity, status, visibility INTO v_capacity, v_status, v_visibility
  FROM events WHERE id = NEW.event_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF NOT (
    v_status = 'published'
    OR (NEW.checked_in_at IS NOT NULL AND v_status::text = 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Este evento não está aberto para inscrições.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, role, email_confirmed_at INTO v_profile_status, v_profile_role, v_email_confirmed
  FROM profiles WHERE id = NEW.profile_id;

  IF v_profile_status = 'banned' OR v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Conta não autorizada a se inscrever.' USING ERRCODE = 'P0001';
  END IF;

  -- 'public' e 'authenticated' já são abertos a qualquer conta autenticada
  -- (visitor/member/admin) — só 'members' restringe por papel.
  IF v_visibility = 'members' AND v_profile_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Este evento é exclusivo para membros.' USING ERRCODE = 'P0001';
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_current_count FROM event_registrations WHERE event_id = NEW.event_id;
    IF v_current_count >= v_capacity THEN
      RAISE EXCEPTION 'Evento sem vagas disponíveis.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- guard_event_status_transition(): correção de um desencontro antigo. O
-- status 'in_progress' entrou em 005_fase2_schema.sql e a Worker permite
-- published → in_progress → closed/completed/archived (EVENT_TRANSITIONS em
-- worker/src/services/eventService.js), mas o gatilho de 002 nunca foi
-- atualizado: o banco recusava a transição e o admin via só a mensagem
-- genérica de erro. Sem isso, o estado "em andamento" — justamente o da
-- portaria — era inalcançável. A regra abaixo é a UNIÃO do que o banco já
-- aceitava com o que a Worker aceita (a Worker continua sendo a lista
-- fechada que o cliente enxerga; o banco só não pode ser mais estrito que ela).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_event_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status::text = 'draft'       AND NEW.status::text = 'published') OR
    (OLD.status::text = 'published'   AND NEW.status::text IN ('in_progress', 'closed', 'archived')) OR
    (OLD.status::text = 'in_progress' AND NEW.status::text IN ('closed', 'completed', 'archived')) OR
    (OLD.status::text = 'closed'      AND NEW.status::text IN ('completed', 'archived')) OR
    (OLD.status::text = 'completed'   AND NEW.status::text = 'archived')
  ) THEN
    RAISE EXCEPTION 'Transição de status de evento inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;
