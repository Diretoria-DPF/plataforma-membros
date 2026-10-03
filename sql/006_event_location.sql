-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 006_event_location.sql
-- Adiciona local do evento (texto livre — endereço, link de sala virtual
-- etc.), usado tanto na listagem quanto no e-mail de confirmação de
-- inscrição (ver worker/src/services/eventService.js).

ALTER TABLE events ADD COLUMN IF NOT EXISTS location text;
