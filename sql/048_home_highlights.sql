-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 048_home_highlights.sql — "Destaques da Liga", bloco "Na Liga" da tela Início (docs/destaques.md).
--
-- home_highlights: itens MANUAIS que a diretoria (admin ou cargo gestor, capacidade home.curate) gerencia: aviso,
--   evento, edital, blog ou link. Cada item liga/desliga (is_active), tem ordem (position) e janela de exibição
--   (starts_at .. ends_at; ends_at nulo = sem data de saída). O Worker devolve no máximo 8 itens visíveis.
--   link_path: opcional; só caminho interno ("/blog/") ou endereço https. Sem PII: texto editorial da liga.
--   created_by: quem criou (perfil apagado vira nulo; a trilha completa fica em audit_logs).
--   Os eventos e posts automáticos NÃO ficam aqui: o cliente os mescla a partir de apiListEvents, sem gravação.
-- Também semeia a flag highlights_enabled, DESLIGADA (ON CONFLICT DO NOTHING: reaplicar nunca religa nem desliga).
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente. Requer 016 e 032.
-- Reversão: sql/down/048_home_highlights.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS home_highlights (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  kind        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  subtitle    TEXT        NOT NULL DEFAULT '',
  link_path   TEXT,
  position    INTEGER     NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT home_highlights_pk PRIMARY KEY (id),
  CONSTRAINT home_highlights_kind_chk CHECK (kind IN ('aviso', 'evento', 'edital', 'blog', 'link')),
  CONSTRAINT home_highlights_title_chk CHECK (char_length(title) BETWEEN 1 AND 120),
  CONSTRAINT home_highlights_subtitle_chk CHECK (char_length(subtitle) <= 160),
  -- Só caminho interno (começa com uma barra, nunca "//") ou https sem usuário/senha; sem espaço, controle nem "\".
  CONSTRAINT home_highlights_link_chk CHECK (
    link_path IS NULL OR (
      char_length(link_path) BETWEEN 1 AND 200
      AND link_path !~ '[[:cntrl:][:space:]\\]'
      AND (link_path ~ '^/([^/].*)?$' OR link_path ~ '^https://[^/@]+(/.*)?$')
    )
  ),
  CONSTRAINT home_highlights_window_chk CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_home_highlights_active_position ON home_highlights (is_active, position);

SELECT laift_enable_rls('home_highlights'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON home_highlights TO laift_worker;
  END IF;
END
$$;

INSERT INTO feature_flags (key, enabled, description) VALUES
  ('highlights_enabled', FALSE, 'Destaques da Liga: bloco "Na Liga" na tela Início, gerenciado por admin ou gestor')
ON CONFLICT (key) DO NOTHING;

RESET lock_timeout;
