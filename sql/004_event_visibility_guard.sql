-- =============================================================================
-- 004_event_visibility_guard.sql
-- Plataforma de Membros — Fecha uma falha real de controle de acesso
-- encontrada em auditoria de segurança (2026-09-25).
--
-- Achado: guard_event_registration() validava existência, status
-- ('published'), capacidade e conta banida/não confirmada — mas NUNCA
-- validava events.visibility contra o papel de quem está se inscrevendo.
-- A restrição "evento exclusivo para membros" só era aplicada na CONSULTA
-- de listagem (WHERE visibility IN (...) em EventService.listEvents) — ou
-- seja, um visitante que descobrisse/adivinhasse o UUID de um evento
-- visibility='members' (ex.: vazado por algum outro canal, ou por força
-- bruta de UUID, ainda que estatisticamente inviável) conseguia se
-- inscrever chamando apiRegisterForEvent diretamente, contornando a regra
-- de negócio pretendida. Não é um IDOR clássico (não expõe dado de OUTRO
-- usuário), mas é exatamente a mesma classe de problema: um controle de
-- acesso que só existe na consulta de listagem, não no ponto de escrita.
--
-- Idempotente (CREATE OR REPLACE): seguro reaplicar.
-- =============================================================================

BEGIN;

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

  IF v_status <> 'published' THEN
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

COMMIT;
