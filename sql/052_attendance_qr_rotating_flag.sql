-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 052_attendance_qr_rotating_flag.sql — encerra o QR permanente (LAIFT:v2) do portão quando o admin quiser.
--
-- Modo de transição do QR rotativo por evento (LAIFT:v3): com a flag DESLIGADA (padrão) o portão aceita o
-- QR permanente do crachá impresso; ligada, só aceita o QR rotativo. Interna (não vai ao navegador).
-- Só INSERT ... ON CONFLICT DO NOTHING (reaplicar nunca religa nem desliga). Requer a 016. Idempotente.
-- Número 052 porque a 051 já está reservada pela PR #140 (cargo secretaria). Reversão: sql/down/052_*.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('attendance_qr_rotating_only', FALSE, 'Portão: encerra o QR permanente (formato antigo) e aceita só o QR rotativo por evento')
ON CONFLICT (key) DO NOTHING;
