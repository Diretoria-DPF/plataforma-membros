-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 029_library.sql — Biblioteca LAIFT: artigos, áreas, favoritos, coleções, sugestões e equipe (curador e revisor clínico).
-- Aditiva e idempotente (IF NOT EXISTS). As 4 flags nascem DESLIGADAS. Reversão: sql/down/029_library.sql.
-- Contrato: docs/cortex/CONTRATO-B1.md §1.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS library_topics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_topics_slug_unique UNIQUE (slug),
  CONSTRAINT library_topics_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 40),
  CONSTRAINT library_topics_len CHECK (char_length(name) BETWEEN 2 AND 60)
);

CREATE TABLE IF NOT EXISTS library_articles (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doi                    TEXT,
  pmid                   TEXT,
  pmcid                  TEXT,
  title                  TEXT NOT NULL,
  authors                JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ "family": "...", "given": "..." }], até 30
  author_count           SMALLINT NOT NULL DEFAULT 0,          -- total real (pode passar de 30)
  journal                TEXT,
  journal_abbrev         TEXT,
  pub_year               SMALLINT,
  volume                 TEXT,
  issue                  TEXT,
  pages                  TEXT,
  language               TEXT,
  article_type           TEXT NOT NULL DEFAULT 'artigo',
  topics                 TEXT[] NOT NULL DEFAULT '{}',         -- slugs de library_topics, validados no serviço
  license                TEXT NOT NULL DEFAULT 'desconhecida',
  license_source         TEXT,
  license_conflict       BOOLEAN NOT NULL DEFAULT FALSE,
  oa_status              TEXT NOT NULL DEFAULT 'desconhecido',
  landing_url            TEXT NOT NULL,                        -- montada pelo servidor, nunca vinda de fora
  source_abstract        TEXT,                                 -- só para a curadoria; ver §5
  metadata_sources       TEXT[] NOT NULL DEFAULT '{}',
  metadata_fetched_at    TIMESTAMPTZ,
  search_norm            TEXT NOT NULL,
  status                 TEXT NOT NULL DEFAULT 'em_triagem',
  status_reason          TEXT,
  status_changed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_clinical            BOOLEAN NOT NULL DEFAULT FALSE,
  summary_text           TEXT,
  summary_origin         TEXT,
  summary_updated_at     TIMESTAMPTZ,
  summary_updated_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  summary_reviewed_at    TIMESTAMPTZ,
  summary_reviewed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  summary_reviewer_name  TEXT,
  clinical_reviewed_at   TIMESTAMPTZ,
  clinical_reviewed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  clinical_reviewer_name TEXT,
  approved_at            TIMESTAMPTZ,
  approved_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approver_name          TEXT,
  published_at           TIMESTAMPTZ,
  version                INTEGER NOT NULL DEFAULT 1,           -- concorrência otimista (não usar updated_at: o driver perde microssegundos)
  created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_articles_doi_unique UNIQUE (doi),
  CONSTRAINT library_articles_pmid_unique UNIQUE (pmid),
  CONSTRAINT library_articles_id_chk CHECK (doi IS NOT NULL OR pmid IS NOT NULL),
  CONSTRAINT library_articles_doi_chk CHECK (doi IS NULL OR (doi = lower(doi) AND char_length(doi) <= 200 AND doi ~ '^10\.[0-9]{4,9}/(?!\.{1,2}(?:/|$))[-._;():a-z0-9]+(?:/(?!\.{1,2}(?:/|$))[-._;():a-z0-9]+)*$')),
  CONSTRAINT library_articles_pmid_chk CHECK (pmid IS NULL OR pmid ~ '^[1-9][0-9]{0,9}$'),
  CONSTRAINT library_articles_pmcid_chk CHECK (pmcid IS NULL OR pmcid ~ '^PMC[0-9]{1,10}$'),
  CONSTRAINT library_articles_len CHECK (
    char_length(title) BETWEEN 1 AND 500 AND coalesce(char_length(journal), 0) <= 300
    AND coalesce(char_length(journal_abbrev), 0) <= 120 AND coalesce(char_length(volume), 0) <= 20
    AND coalesce(char_length(issue), 0) <= 20 AND coalesce(char_length(pages), 0) <= 30
    AND coalesce(char_length(summary_text), 0) <= 1200 AND coalesce(char_length(source_abstract), 0) <= 10000
    AND coalesce(char_length(status_reason), 0) <= 300 AND char_length(search_norm) <= 4000
    AND coalesce(char_length(approver_name), 0) <= 150 AND coalesce(char_length(summary_reviewer_name), 0) <= 150
    AND coalesce(char_length(clinical_reviewer_name), 0) <= 150),
  CONSTRAINT library_articles_year_chk CHECK (pub_year IS NULL OR pub_year BETWEEN 1800 AND 2100),
  CONSTRAINT library_articles_lang_chk CHECK (language IS NULL OR language ~ '^[a-z]{2}$'),
  CONSTRAINT library_articles_authors_chk CHECK (jsonb_typeof(authors) = 'array' AND jsonb_array_length(authors) <= 30
    AND author_count >= jsonb_array_length(authors) AND author_count <= 5000),
  CONSTRAINT library_articles_type_chk CHECK (article_type IN ('artigo', 'revisao', 'revisao_sistematica', 'meta_analise', 'ensaio_clinico', 'relato_caso', 'diretriz', 'outro')),
  CONSTRAINT library_articles_topics_chk CHECK (cardinality(topics) <= 5 AND array_position(topics, NULL) IS NULL),
  CONSTRAINT library_articles_license_chk CHECK (license IN ('cc0', 'pd', 'cc-by', 'cc-by-sa', 'cc-by-nd', 'cc-by-nc', 'cc-by-nc-sa', 'cc-by-nc-nd', 'outra', 'desconhecida')),
  CONSTRAINT library_articles_license_source_chk CHECK (license_source IS NULL OR license_source IN ('crossref', 'europepmc', 'openalex', 'unpaywall', 'pubmed', 'curador')),
  CONSTRAINT library_articles_oa_chk CHECK (oa_status IN ('diamond', 'gold', 'green', 'hybrid', 'bronze', 'closed', 'desconhecido')),
  CONSTRAINT library_articles_url_chk CHECK (landing_url ~ '^https://(doi\.org|pubmed\.ncbi\.nlm\.nih\.gov)/[^[:space:]<>"]+$'),
  CONSTRAINT library_articles_sources_chk CHECK (metadata_sources <@ ARRAY['crossref', 'europepmc', 'openalex', 'unpaywall', 'pubmed']::text[]),
  CONSTRAINT library_articles_status_chk CHECK (status IN ('em_triagem', 'aprovado', 'publicado', 'rejeitado', 'removido')),
  CONSTRAINT library_articles_reason_chk CHECK (status NOT IN ('rejeitado', 'removido') OR coalesce(char_length(status_reason), 0) BETWEEN 3 AND 300),
  CONSTRAINT library_articles_summary_origin_chk CHECK (summary_origin IS NULL OR summary_origin IN ('curador', 'ia', 'ia_editado')),
  CONSTRAINT library_articles_summary_pair_chk CHECK ((summary_text IS NULL) = (summary_origin IS NULL) AND (summary_text IS NULL OR summary_updated_at IS NOT NULL)),
  CONSTRAINT library_articles_topics_required_chk CHECK (status NOT IN ('aprovado', 'publicado') OR cardinality(topics) >= 1),
  CONSTRAINT library_articles_approved_chk CHECK (status NOT IN ('aprovado', 'publicado') OR (approved_at IS NOT NULL AND approver_name IS NOT NULL)),
  CONSTRAINT library_articles_published_chk CHECK (status <> 'publicado' OR published_at IS NOT NULL),
  -- Decisão 3: resumo que afirma conduta, dose ou interação só vai ao ar revisado por um revisor com nome e data, DEPOIS da última mudança do resumo.
  CONSTRAINT library_articles_clinical_chk CHECK (status <> 'publicado' OR NOT is_clinical OR summary_text IS NULL
    OR (clinical_reviewer_name IS NOT NULL AND clinical_reviewed_at IS NOT NULL AND clinical_reviewed_at >= summary_updated_at)),
  -- Decisão 11: resumo de IA só vai ao ar aprovado pelo curador depois da última mudança.
  CONSTRAINT library_articles_ai_summary_chk CHECK (status <> 'publicado' OR summary_origin IS NULL OR summary_origin = 'curador'
    OR (summary_reviewed_at IS NOT NULL AND summary_reviewer_name IS NOT NULL AND summary_reviewed_at >= summary_updated_at))
);
-- Nomes guardados em texto (approver_name, *_reviewer_name): o CHECK não pode depender de uma FK com ON DELETE SET NULL,
-- senão excluir a conta do revisor falharia (o SET NULL violaria o CHECK).

CREATE INDEX IF NOT EXISTS idx_library_articles_status_year ON library_articles (status, pub_year DESC);
CREATE INDEX IF NOT EXISTS idx_library_articles_search_trgm ON library_articles USING gin (search_norm gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_library_articles_topics ON library_articles USING gin (topics);
DROP TRIGGER IF EXISTS trg_library_articles_updated_at ON library_articles;
CREATE TRIGGER trg_library_articles_updated_at BEFORE UPDATE ON library_articles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS library_favorites (
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  article_id  UUID NOT NULL REFERENCES library_articles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_favorites_pk PRIMARY KEY (profile_id, article_id)
);
CREATE INDEX IF NOT EXISTS idx_library_favorites_article ON library_favorites (article_id);

CREATE TABLE IF NOT EXISTS library_collections (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug         TEXT NOT NULL,
  title        TEXT NOT NULL,
  description  TEXT,
  status       TEXT NOT NULL DEFAULT 'rascunho',
  sort_order   SMALLINT NOT NULL DEFAULT 0,
  version      INTEGER NOT NULL DEFAULT 1,
  created_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_collections_slug_unique UNIQUE (slug),
  CONSTRAINT library_collections_slug_chk CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 60),
  CONSTRAINT library_collections_status_chk CHECK (status IN ('rascunho', 'publicada')),
  CONSTRAINT library_collections_len CHECK (char_length(title) BETWEEN 3 AND 120 AND coalesce(char_length(description), 0) <= 600)
);
DROP TRIGGER IF EXISTS trg_library_collections_updated_at ON library_collections;
CREATE TRIGGER trg_library_collections_updated_at BEFORE UPDATE ON library_collections FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS library_collection_items (
  collection_id UUID NOT NULL REFERENCES library_collections(id) ON DELETE CASCADE,
  article_id    UUID NOT NULL REFERENCES library_articles(id) ON DELETE CASCADE,
  position      SMALLINT NOT NULL DEFAULT 0,
  CONSTRAINT library_collection_items_pk PRIMARY KEY (collection_id, article_id),
  CONSTRAINT library_collection_items_pos_chk CHECK (position BETWEEN 0 AND 500)
);
CREATE INDEX IF NOT EXISTS idx_library_collection_items_article ON library_collection_items (article_id);

CREATE TABLE IF NOT EXISTS library_suggestions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  identifier_kind  TEXT NOT NULL,
  identifier       TEXT NOT NULL,
  note             TEXT,
  status           TEXT NOT NULL DEFAULT 'sugerido',
  decision_reason  TEXT,
  decided_at       TIMESTAMPTZ,
  decided_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  article_id       UUID REFERENCES library_articles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_suggestions_unique UNIQUE (profile_id, identifier_kind, identifier),
  CONSTRAINT library_suggestions_kind_chk CHECK (
    (identifier_kind = 'doi' AND identifier = lower(identifier) AND char_length(identifier) <= 200 AND identifier ~ '^10\.[0-9]{4,9}/(?!\.{1,2}(?:/|$))[-._;():a-z0-9]+(?:/(?!\.{1,2}(?:/|$))[-._;():a-z0-9]+)*$')
    OR (identifier_kind = 'pmid' AND identifier ~ '^[1-9][0-9]{0,9}$')),
  CONSTRAINT library_suggestions_status_chk CHECK (status IN ('sugerido', 'aceito', 'recusado', 'duplicado')),
  CONSTRAINT library_suggestions_decided_chk CHECK ((status = 'sugerido') = (decided_at IS NULL)),
  CONSTRAINT library_suggestions_len CHECK (coalesce(char_length(note), 0) <= 300 AND coalesce(char_length(decision_reason), 0) <= 300)
);
CREATE INDEX IF NOT EXISTS idx_library_suggestions_status_created ON library_suggestions (status, created_at);

CREATE TABLE IF NOT EXISTS library_staff (
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  granted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT library_staff_pk PRIMARY KEY (profile_id, role),
  CONSTRAINT library_staff_role_chk CHECK (role IN ('curador', 'revisor_clinico'))
);

INSERT INTO library_topics (slug, name, sort_order) VALUES
  ('farmacologia-clinica', 'Farmacologia clínica', 1),
  ('toxicologia', 'Toxicologia', 2)
ON CONFLICT (slug) DO NOTHING;

-- Flags nascem DESLIGADAS (não copiar a 023, sql/023_flags_v2.sql:46-52, que semeia TRUE).
INSERT INTO feature_flags (key, enabled, description) VALUES
  ('library_enabled', FALSE, 'Biblioteca LAIFT: painel do membro e catálogo público'),
  ('library_member_suggest', FALSE, 'Biblioteca: membros sugerem artigos (com aprovação)'),
  ('library_ai_summary', FALSE, 'Biblioteca: resumo sugerido por IA (B3)'),
  ('lia_library_enabled', FALSE, 'Lia cita artigos publicados da Biblioteca (B4)')
ON CONFLICT (key) DO NOTHING;
