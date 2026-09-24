-- =============================================================================
-- 002_functions_and_triggers.sql
-- Plataforma de Membros — Funções e gatilhos (Neon PostgreSQL)
--
-- Pré-requisito: 001_schema.sql já aplicado.
-- Idempotente: usa CREATE OR REPLACE FUNCTION e DROP TRIGGER IF EXISTS antes de
-- recriar cada gatilho, para permitir reaplicar este arquivo com segurança.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1) updated_at automático
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_events_updated_at ON events;
CREATE TRIGGER trg_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_proposals_updated_at ON proposals;
CREATE TRIGGER trg_proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_preferences_updated_at ON preferences;
CREATE TRIGGER trg_preferences_updated_at
  BEFORE UPDATE ON preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------------------
-- 2) Proteção do último administrador ativo, segura sob concorrência
--
-- Um simples "COUNT(*) admins ativos" dentro do gatilho é insuficiente: duas
-- transações concorrentes rebaixando/banindo dois admins diferentes podem
-- cada uma ler "ainda resta 1 admin" ANTES de qualquer uma commitar, e as
-- duas prosseguirem — zerando os administradores ativos.
--
-- Solução: um advisory lock transacional (pg_advisory_xact_lock) com uma
-- chave fixa serializa TODAS as tentativas concorrentes de tirar alguém da
-- condição "admin ativo" (rebaixar papel OU banir) através de um único ponto
-- de espera. A segunda transação só conta os admins depois que a primeira
-- já commitou (ou abortou), então a contagem que ela vê já reflete o efeito
-- real da primeira. O lock é liberado automaticamente no commit/rollback.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_last_active_admin()
RETURNS TRIGGER AS $$
DECLARE
  v_losing_admin_status BOOLEAN;
  v_remaining_admins INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_losing_admin_status := (OLD.role = 'admin' AND OLD.status = 'active');
  ELSE
    v_losing_admin_status := (
      OLD.role = 'admin' AND OLD.status = 'active'
      AND (NEW.role IS DISTINCT FROM 'admin' OR NEW.status IS DISTINCT FROM 'active')
    );
  END IF;

  IF v_losing_admin_status THEN
    PERFORM pg_advisory_xact_lock(hashtext('profiles_last_admin_guard'));

    SELECT count(*) INTO v_remaining_admins
    FROM profiles
    WHERE role = 'admin' AND status = 'active' AND id <> OLD.id;

    IF v_remaining_admins = 0 THEN
      RAISE EXCEPTION 'Operação bloqueada: não é possível remover, rebaixar ou banir o último administrador ativo.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_guard_last_admin_update ON profiles;
CREATE TRIGGER trg_profiles_guard_last_admin_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_last_active_admin();

DROP TRIGGER IF EXISTS trg_profiles_guard_last_admin_delete ON profiles;
CREATE TRIGGER trg_profiles_guard_last_admin_delete
  BEFORE DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION guard_last_active_admin();

-- -----------------------------------------------------------------------------
-- 3) Transições de status válidas — o cliente nunca escreve status livre.
--    Mesmo que a camada de serviço já restrinja por lista fechada, o banco
--    aplica a mesma regra como defesa em profundidade.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_event_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'published') OR
    (OLD.status = 'published' AND NEW.status IN ('closed', 'archived')) OR
    (OLD.status = 'closed' AND NEW.status IN ('completed', 'archived')) OR
    (OLD.status = 'completed' AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'Transição de status de evento inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_status_transition ON events;
CREATE TRIGGER trg_events_status_transition
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION guard_event_status_transition();

CREATE OR REPLACE FUNCTION guard_proposal_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'submitted' AND NEW.status IN ('approved', 'rejected')) OR
    (OLD.status = 'approved' AND NEW.status = 'voting_open') OR
    (OLD.status = 'voting_open' AND NEW.status = 'voting_closed')
  ) THEN
    RAISE EXCEPTION 'Transição de status de proposta inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_proposals_status_transition ON proposals;
CREATE TRIGGER trg_proposals_status_transition
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION guard_proposal_status_transition();

CREATE OR REPLACE FUNCTION guard_task_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'draft' AND NEW.status = 'published') OR
    (OLD.status = 'published' AND NEW.status IN ('completed', 'archived')) OR
    (OLD.status = 'completed' AND NEW.status = 'archived')
  ) THEN
    RAISE EXCEPTION 'Transição de status de tarefa inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_status_transition ON tasks;
CREATE TRIGGER trg_tasks_status_transition
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION guard_task_status_transition();

-- -----------------------------------------------------------------------------
-- 4) Vagas de evento sob concorrência
--    Bloqueia a linha do evento (FOR UPDATE) antes de contar inscrições, para
--    que duas inscrições simultâneas na última vaga sejam serializadas em vez
--    de ambas lerem "ainda há vaga" ao mesmo tempo. A UNIQUE(event_id,
--    profile_id) do schema cobre a inscrição duplicada; este gatilho cobre a
--    sobrevenda de vagas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_event_registration()
RETURNS TRIGGER AS $$
DECLARE
  v_capacity INTEGER;
  v_status event_status;
  v_current_count INTEGER;
  v_profile_status account_status;
  v_email_confirmed TIMESTAMPTZ;
BEGIN
  SELECT capacity, status INTO v_capacity, v_status
  FROM events WHERE id = NEW.event_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Este evento não está aberto para inscrições.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, email_confirmed_at INTO v_profile_status, v_email_confirmed
  FROM profiles WHERE id = NEW.profile_id;

  IF v_profile_status = 'banned' OR v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Conta não autorizada a se inscrever.' USING ERRCODE = 'P0001';
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

DROP TRIGGER IF EXISTS trg_event_registrations_guard ON event_registrations;
CREATE TRIGGER trg_event_registrations_guard
  BEFORE INSERT ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION guard_event_registration();

-- -----------------------------------------------------------------------------
-- 5) Voto somente dentro da janela de votação aberta, por conta ativa e
--    confirmada. Defesa em profundidade além da checagem em ProposalService.gs.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_vote_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_status proposal_status;
  v_opens TIMESTAMPTZ;
  v_closes TIMESTAMPTZ;
  v_profile_status account_status;
  v_profile_role user_role;
  v_email_confirmed TIMESTAMPTZ;
BEGIN
  SELECT status, voting_opens_at, voting_closes_at INTO v_status, v_opens, v_closes
  FROM proposals WHERE id = NEW.proposal_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'voting_open' THEN
    RAISE EXCEPTION 'A votação desta proposta não está aberta.' USING ERRCODE = 'P0001';
  END IF;

  IF v_opens IS NOT NULL AND now() < v_opens THEN
    RAISE EXCEPTION 'A votação ainda não começou.' USING ERRCODE = 'P0001';
  END IF;

  IF v_closes IS NOT NULL AND now() > v_closes THEN
    RAISE EXCEPTION 'A votação já foi encerrada.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, role, email_confirmed_at INTO v_profile_status, v_profile_role, v_email_confirmed
  FROM profiles WHERE id = NEW.profile_id;

  IF v_profile_status = 'banned' OR v_email_confirmed IS NULL OR v_profile_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Conta não autorizada a votar.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_votes_guard ON votes;
CREATE TRIGGER trg_votes_guard
  BEFORE INSERT ON votes
  FOR EACH ROW EXECUTE FUNCTION guard_vote_insert();

-- -----------------------------------------------------------------------------
-- 6) Adesão a tarefas somente por membro/admin ativos e confirmados, e
--    somente em tarefas publicadas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION guard_task_signup()
RETURNS TRIGGER AS $$
DECLARE
  v_status task_status;
  v_profile_status account_status;
  v_profile_role user_role;
  v_email_confirmed TIMESTAMPTZ;
BEGIN
  SELECT status INTO v_status FROM tasks WHERE id = NEW.task_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = 'P0001';
  END IF;

  IF v_status <> 'published' THEN
    RAISE EXCEPTION 'Esta tarefa não está disponível para adesão.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status, role, email_confirmed_at INTO v_profile_status, v_profile_role, v_email_confirmed
  FROM profiles WHERE id = NEW.profile_id;

  IF v_profile_status = 'banned' OR v_email_confirmed IS NULL OR v_profile_role NOT IN ('member', 'admin') THEN
    RAISE EXCEPTION 'Conta não autorizada a aderir a tarefas.' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_task_signups_guard ON task_signups;
CREATE TRIGGER trg_task_signups_guard
  BEFORE INSERT ON task_signups
  FOR EACH ROW EXECUTE FUNCTION guard_task_signup();

COMMIT;
