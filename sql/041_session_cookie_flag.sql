-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 041_session_cookie_flag.sql — flag do cookie de sessão HttpOnly (SEC-08, docs/adr/0011-token-de-sessao-em-cookie.md).
--
--   session_cookie_enabled   no login (apiLogin/apiLoginMfa), para origens do mesmo site da API, o token vai num cookie
--                            HttpOnly e a resposta leva só o marcador "cookie". Exige SESSION_COOKIE_SITE no Worker.
--                            É pública: o front só usa o cookie quando a resposta do login traz sessionCookie.
--
-- Nasce DESLIGADA (não copiar a 023, que semeia TRUE). Só INSERT ... ON CONFLICT DO NOTHING: reaplicar nunca
-- religa nem desliga uma flag que o admin já mexeu. Não cria tabela. Requer a 016 (feature_flags). Idempotente.
-- Reversão: sql/down/041_session_cookie_flag.sql.

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('session_cookie_enabled', FALSE, 'Sessão em cookie HttpOnly (SEC-08): o token deixa de ficar acessível ao JavaScript da página')
ON CONFLICT (key) DO NOTHING;
