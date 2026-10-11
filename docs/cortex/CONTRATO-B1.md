# Contrato B1 · Biblioteca LAIFT: dados, curadoria e API (v1, 2026-10-10)

Base: `PLANO-CORTEX.md` (13 decisões, §1), `ESCALA-BANCO.md`, mapas `mapeamento/01..05`, `docs/TIME_CONTRATO.md`. Branch `feat/cortex-biblioteca`.
Interface (B2): `CONTRATO-B2.md`. Tarefas: `fichas/ORDEM.md`. Dúvidas do dono: `PERGUNTAS-ABERTAS.md`.
Linhas citadas foram conferidas no HEAD `2ad549c`. "A verificar" = não confirmado em fonte oficial; não usar como fato.

## 0. Decisões técnicas adotadas (e onde contestei)
| # | Decisão do orquestrador | Neste contrato |
|---|---|---|
| 1 | Migração `sql/029_library.sql` + `sql/down/029_library.sql` | **Adotada.** `sql/` vai até 026 (sem 025); 027 reservada à inscrição nativa; 028 reivindicada por W1 (`docs/ux-progresso/fichas/W1.md:13`). Nenhuma branch local ou remota tem 027-029 (conferido com `git ls-tree` em todas). |
| 2 | Busca no Neon com pg_trgm + ILIKE/unaccent seguro | **Adotada com ajuste:** sem a extensão `unaccent`. O serviço grava `search_norm` já normalizado em JS (minúsculas, sem acento) e a consulta usa `LIKE` por termo sobre ele, com índice GIN `gin_trgm_ops`. Motivo: `unaccent` é STABLE (índice exige função IMMUTABLE), e o PGlite dos testes e do validador só carrega pgcrypto, uuid_ossp e pg_trgm (`worker/test/helpers/pgliteSql.js:16-25`, `worker/scripts/validate-migrations.mjs:21-35`). |
| 3 | Sem transação; passos idempotentes ou instrução única; UNIQUE em doi e pmid parcial; UUID | **Adotada com ajuste:** autores em `authors JSONB` na própria linha do artigo (cadastro = 1 `INSERT`), em vez de `library_authors` + `library_article_authors` do PLANO §3. Motivo: atomicidade sem transação e nada no escopo usa autor como entidade. `pmid` com `UNIQUE` simples, **não parcial**: o Postgres já aceita vários NULL num UNIQUE, e índice parcial obrigaria `ON CONFLICT (pmid) WHERE ...`. O cadastro usa `ON CONFLICT DO NOTHING` sem alvo (cobre doi e pmid). |
| 4 | `apiLearn*` (membro/leitura) e `apiAdminLearn*` (curadoria); sessão no 1º argumento; catálogo público com sessão opcional | **Adotada com ajuste:** o catálogo público **não recebe sessão** (`(sql, env) =>`, como `apiListRecentCompletedEvents`, `worker/src/handlers.js:165`). O único consumidor é o build; as ações do painel exigem sessão. Assim `OPTIONAL_SESSION` (`worker/test/mfaGate.test.js:23`) não muda. |
| 5 | Instantâneo estático no build + reserva versionada + rebuild manual (sem agendamento: P5) | **Adotada.** Detalhe em `CONTRATO-B2.md` §2. A action pública está em §4 abaixo. |
| 6 | Crossref primeiro, depois Europe PMC / OpenAlex / PubMed / Unpaywall; mailto de variável de ambiente | **Adotada.** Ordem e fallbacks em §6. |
| 7 | `license` normalizada + `oa_status`; sem licença aberta = só link e resumo próprio | **Adotada.** Licenças NC: pergunta P3. |
| 8 | Hosts fixos, regex de DOI/PMID, nada de URL do usuário; sugestões com limite, domínios, sem HTML, estado `sugerido` | **Adotada.** SciELO fica fora dos links aceitos na v1 (§7). |
| 9 | Resumo por IA em B3; `summary_origin` e estado já existem | **Adotada.** B1 só aceita origem `curador`. |
| 10 | Só `publicado` aparece; clínico exige revisor (campo + regra) | **Adotada.** Regra no serviço **e** em `CHECK` no banco; ação do revisor já no B1 (sem tela, que vem em B3). |
| — | PLANO §3: `sugerido` como estado do artigo | **Ajuste:** `sugerido` é estado da **sugestão** (`library_suggestions`). O artigo nasce em `em_triagem` quando o curador cadastra ou aceita a sugestão. Motivo: sugestão de membro nunca dispara chamada externa nem ocupa o DOI único. |

## 1. Esquema SQL (`sql/029_library.sql`)
Cabeçalho de 3 linhas igual ao da 026 (`sql/026_lia_pesquisas.sql:1-3`). Aditiva e idempotente (`IF NOT EXISTS`, `DROP TRIGGER IF EXISTS`), sem `ALTER` em tabela existente (sem `lock_timeout`).
Convenções seguidas: UUID `uuid_generate_v4()`, TEXT + CHECK (como `sql/026_lia_pesquisas.sql:34-36`), gatilho `set_updated_at()` (`sql/002_functions_and_triggers.sql:17-28`).

```sql
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
  CONSTRAINT library_articles_doi_chk CHECK (doi IS NULL OR (doi = lower(doi) AND char_length(doi) <= 200 AND doi ~ '^10\.[0-9]{4,9}/[-._;()/:a-z0-9]+$')),
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
    (identifier_kind = 'doi' AND identifier = lower(identifier) AND char_length(identifier) <= 200 AND identifier ~ '^10\.[0-9]{4,9}/[-._;()/:a-z0-9]+$')
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
```

### 1.1 Down (`sql/down/029_library.sql`)
Modelo: `sql/down/026_lia_pesquisas.sql`. Ordem: (1) **recusa** se houver artigo e a sessão não tiver `SET laift.allow_library_drop = 'on'`:
`DO $$ BEGIN IF to_regclass('public.library_articles') IS NOT NULL AND EXISTS (SELECT 1 FROM library_articles) AND current_setting('laift.allow_library_drop', true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'A Biblioteca tem artigos: exporte (branch do Neon) e rode com SET laift.allow_library_drop = ''on''.'; END IF; END $$;`
(no validador o banco está vazio, então passa); (2) `DELETE FROM feature_flags WHERE key IN (as 4 chaves)`; (3) `DROP TABLE IF EXISTS` em ordem: `library_collection_items`, `library_collections`, `library_favorites`, `library_suggestions`, `library_staff`, `library_articles`, `library_topics`; (4) apaga `029_library.sql` do `schema_migrations` (bloco igual a `sql/down/026_lia_pesquisas.sql:13-18`). Não remove `pg_trgm` (usada por 018, 020, 026).
**Rollback normal é por flag** (`library_enabled` desligada esconde menu e painel e tira a página pública no próximo build); o down é só para desfazer a migração.

## 2. Estados e transições do artigo
Fonte única: `worker/src/library/transitions.js` (pura, testada). O serviço chama `assertTransition(article, to, roles, reason)` antes do `UPDATE`, e o `UPDATE` repete a condição no `WHERE status = $from AND version = $v` (sem transação, o banco decide a corrida).

| De → para | Quem | Pré-condições (serviço; as marcadas * também são CHECK) | Efeito |
|---|---|---|---|
| (novo) → `em_triagem` | curador | identificador válido; sem duplicata por doi nem pmid | `created_by`, fontes, `search_norm` |
| `em_triagem` → `aprovado` | curador | ≥ 1 área*; título; tipo | `approved_at/by`, `approver_name`* |
| `aprovado` → `publicado` | curador | aprovado*; clínico revisado se houver resumo clínico*; resumo de IA revisado* | `published_at`*; catálogo público só no próximo build |
| `em_triagem`, `aprovado` → `rejeitado` | curador | motivo 3-300* | `status_reason` |
| `publicado` → `removido` | curador | motivo 3-300* | sai do catálogo e da busca; favoritos ficam, mas não aparecem |
| `aprovado` → `em_triagem` | curador | — | limpa `approved_*` |
| `rejeitado`, `removido` → `em_triagem` | curador | — | limpa motivo e `approved_*`, `published_at` |
| `publicado` → `aprovado` (automático) | serviço | curador mudou `summary_text` de artigo publicado | sai do ar até nova publicação; se clínico, a revisão clínica antiga deixa de valer (o CHECK já exige `clinical_reviewed_at >= summary_updated_at`) |

Qualquer outra transição: `ValidationError('Mudança de estado não permitida.')`. Toda transição grava `status_changed_at/by`, `version = version + 1` e auditoria `LIBRARY_ARTICLE_STATUS` com `details {from, to}` (o motivo fica só na linha do artigo, nunca em `details`).

**Regra clínica (serviço):** ao salvar resumo, se o texto casar `CLINICAL_TERMS` (em `transitions.js`: `dose`, `mg`, `posologia`, `intera[cç][aã]o`, `contraindica`, `conduta`, `tratamento de escolha`, `administrar`, `deve-se`, `recomenda-se`, comparação sem acento e sem maiúsculas), `is_clinical` vira `TRUE` e o curador não consegue desmarcar (`ValidationError('Este resumo fala de conduta, dose ou interação: precisa de revisor clínico.')`). O curador pode marcar `TRUE` à mão. O revisor clínico **não pode** ser quem escreveu a última versão do resumo (`summary_updated_by`): `ForbiddenError('A revisão clínica precisa ser de outra pessoa.')`.

## 3. Papéis
| Papel | Como se obtém | Pode |
|---|---|---|
| visitante (sem login) | — | só a página pública estática |
| conta `visitor` logada | `profiles.role = 'visitor'` | buscar e ver a ficha **sem** resumo, coleções e favoritos (decisão 9: só membros) |
| membro | `role IN ('member','admin')` | busca, ficha com resumo, favoritos, coleções publicadas, sugerir (flag) |
| curador | `role = 'admin'` **ou** linha `library_staff(role='curador')` | todas as ações `apiAdminLearnLibrary*` exceto equipe e revisão clínica |
| revisor clínico | linha `library_staff(role='revisor_clinico')` (admin **não** vira revisor sozinho) | `apiAdminLearnLibraryClinicalReview`, leitura da fila e da ficha |
| admin | `role = 'admin'` | o que o curador pode, mais `ListStaff`/`SetStaff` |

Verificação: `requireLibraryRole(sql, identity, 'curador' | 'revisor_clinico')` em `libraryCurationService.js` (1 consulta a `library_staff`; admin passa direto como curador). Papel restrito ou admin para a Diretoria Científica: pergunta P1.
O `openapi.yaml` descreve todo `apiAdmin*` como "Somente administrador" (`worker/src/openapi.js:54`); para curador e revisor isso fica impreciso. Aceito neste lote; corrigir a descrição fica para depois.

## 4. Actions (21 novas; total 117 → 138)
Assinatura literal `(sql, env, [sessionToken, input]) =>` (o OpenAPI lê por regex: `worker/src/openapi.js:26-30`). Entrada por `asInput(input)` (`worker/src/handlers.js:84-86`). Sessão por `runWithSession` (`:71-79`; MFA na linha 76), que já aplica o portão de MFA de admin.
Todas as do membro: flag `library_enabled` desligada → `{ success:false, disabled:true, message:'A Biblioteca ainda não está disponível.' }`; exceção: o catálogo público responde `{ success:true, enabled:false, topics:[], items:[] }` (o build então tira a página) (falha fechada, como `flagOn` em `worker/src/services/assistantService.js:130-136`). As de curadoria **não** olham a flag (a curadoria carrega o acervo antes do lançamento).
Erros esperados (texto exato): id inválido `ValidationError('Artigo inválido.')`; artigo inexistente **ou não publicado** para membro `NotFoundError('Artigo não encontrado.')`; papel `requireRole` padrão (`'Acesso não autorizado para este recurso.'`); limite `RateLimitError` padrão (`worker/src/security.js:116`); versão velha `ConflictError('Outra pessoa alterou este artigo. Recarregue para ver a versão nova.')`.

### 4.1 Membro e leitura (`worker/src/services/libraryService.js`)
| Action | Entrada | Saída (`success:true` +) | Papel | Limite (bucket, chave) | Auditoria |
|---|---|---|---|---|---|
| `apiLearnLibraryPublicCatalog: (sql, env) =>` | — | `{ enabled, generatedAt, topics:[{slug,name}], items:[PublicItem] }` (só `publicado`, até 2000) | público | Cache API primeiro (`https://library-cache.internal/public-catalog/v1`, 600 s, modelo `worker/src/services/atlasMoleculeService.js:36-59`); só no erro de cache: `LIBRARY_PUBLIC_IP` (IP) e `LIBRARY_PUBLIC_GLOBAL` (id fixo) | não |
| `apiLearnLibrarySearch` | `{ q?, topic?, type?, yearFrom?, yearTo?, openAccess?, page?, pageSize? }` | `{ items:[ListItem], total, page, pageSize, topics:[{slug,name}] }` | sessão; `visitor` vê sem `isFavorite` | `LIBRARY_SEARCH` (perfil) | não (LGPD: nem o termo é guardado) |
| `apiLearnLibraryGetArticle` | `{ id }` | `{ article: ArticleDetail }` | sessão; `visitor` recebe `membersOnly:true` e sem resumo, resumo original, coleções e favorito | `LIBRARY_READ` (perfil) | não |
| `apiLearnLibrarySetFavorite` | `{ id, favorite: boolean }` | `{ favorite }` (idempotente: `INSERT ... ON CONFLICT DO NOTHING` / `DELETE`) | membro | `LIBRARY_FAVORITE` (perfil); teto `LIBRARY_LIMITS.FAVORITES_MAX` | não (preferência pessoal; evitaria registrar interesse de saúde) |
| `apiLearnLibraryListFavorites` | `{ page? }` | `{ items:[ListItem], total, page, pageSize }` (só `publicado`) | membro | `LIBRARY_READ` | não |
| `apiLearnLibraryListCollections` | — | `{ collections:[{ id, slug, title, description, count }] }` (só `publicada`, contando só artigos `publicado`) | membro | `LIBRARY_READ` | não |
| `apiLearnLibraryGetCollection` | `{ id }` | `{ collection:{ id, slug, title, description }, items:[ListItem] }` | membro | `LIBRARY_READ` | não |
| `apiLearnLibrarySuggest` | `{ identifier, note? }` | `{ suggestionId, status:'sugerido' }` | membro + flag `library_member_suggest` | `LIBRARY_SUGGEST` e `LIBRARY_SUGGEST_DAY` (perfil); fila global ≤ `SUGGESTIONS_PENDING_MAX`, por pessoa ≤ `SUGGESTIONS_PENDING_PER_MEMBER` | `LIBRARY_SUGGESTION_CREATE` (`library_suggestion`, id) |

Formatos (camelCase, sem campos internos):
- `PublicItem`: `{ id, title, authors:[{family,given}] (até 3), authorCount, journal, year, doi, pmid, type, topics:[slug], openAccess, license, landingUrl, publishedAt }`. `openAccess = oa_status IN ('diamond','gold','green','hybrid','bronze')`.
- `ListItem`: `PublicItem` + `hasSummary`, `isFavorite` (`false` para `visitor`).
- `ArticleDetail`: `ListItem` + `authors` completos (até 30), `journalAbbrev, volume, issue, pages, language, oaStatus, pmcid, pmcUrl` (montada: `https://pmc.ncbi.nlm.nih.gov/articles/<pmcid>/`), `summary: { text, origin, reviewerName, reviewedAt } | null` (só se houver texto, artigo publicado e, para `ia`/`ia_editado`, revisado), `clinicalReview: { reviewerName, reviewedAt } | null`, `abstract: string | null` (só se `license IN OPEN_REUSE_LICENSES`), `collections:[{id,title}]`, `membersOnly`.
- Busca: `q` normalizado igual ao `search_norm` (§5), até 5 termos de ≥ 2 caracteres, cada um vira `search_norm LIKE '%termo%'` em AND; só `[a-z0-9./-]` sobrevivem, então não sobra metacaractere de LIKE. Consulta **fixa** em template (`(${topic}::text IS NULL OR ${topic} = ANY(topics))`...), porque o adaptador do PGlite só aceita template (`worker/test/helpers/pgliteSql.js:34-39`). Ordem: `pub_year DESC NULLS LAST, title`. `pageSize` 1-50 (padrão 20), `page` 1-100. Total por `count(*) OVER()`.

### 4.2 Curadoria (`libraryCurationService.js` e `libraryAdminService.js`)
| Action | Entrada | Saída | Papel | Limite | Auditoria (`action`, `target_type`) |
|---|---|---|---|---|---|
| `apiAdminLearnLibraryImport` | `{ identifier }` (DOI, PMID ou link aceito, §7) | `{ article: AdminArticle, warnings:[...] }`; duplicata: `ConflictError('Este artigo já está na Biblioteca.')` com `payload { articleId }` (padrão `err.payload`, `worker/src/services/mfaService.js:208`) | curador | `LIBRARY_IMPORT` (perfil) e `LIBRARY_IMPORT_GLOBAL` | `LIBRARY_ARTICLE_IMPORT`, `library_article`; falha das fontes não audita (só `logError` se inesperada) |
| `apiAdminLearnLibraryListQueue` | `{ status?='em_triagem', page? }` | `{ items:[AdminListItem], counts:{em_triagem,aprovado,publicado,rejeitado,removido}, topics, page, total }` | curador ou revisor | `LIBRARY_CURATE` | não |
| `apiAdminLearnLibraryGetArticle` | `{ id }` | `{ article: AdminArticle, allowedTransitions:[...], favoriteCount }` | curador ou revisor | `LIBRARY_CURATE` | não |
| `apiAdminLearnLibraryUpdateArticle` | `{ id, version, fields:{ title?, journal?, journalAbbrev?, year?, volume?, issue?, pages?, language?, type?, topics?, license?, oaStatus?, isClinical?, summaryText? }, reason? }` (`reason`, 3–300 caracteres, obrigatório ao desmarcar `isClinical` num resumo que casa com a heurística clínica; vai para a auditoria) | `{ article: AdminArticle }` | curador | `LIBRARY_CURATE` | `LIBRARY_ARTICLE_UPDATE`, `details {fields:[nomes]}` |
| `apiAdminLearnLibrarySetStatus` | `{ id, version, to, reason? }` | `{ article: AdminArticle }` | curador | `LIBRARY_CURATE` | `LIBRARY_ARTICLE_STATUS`, `details {from,to}` |
| `apiAdminLearnLibraryClinicalReview` | `{ id, version, decision:'aprovar'|'devolver', note? }` | `{ article: AdminArticle }`; `devolver` volta a `em_triagem` com o motivo | revisor clínico | `LIBRARY_CURATE` | `LIBRARY_ARTICLE_CLINICAL_REVIEW`, `details {decision}` |
| `apiAdminLearnLibraryListSuggestions` | `{ status?='sugerido', page? }` | `{ items:[{ id, identifierKind, identifier, note, status, createdAt, decidedAt, articleId }], total }` (sem nome nem e-mail de quem sugeriu) | curador | `LIBRARY_CURATE` | não |
| `apiAdminLearnLibraryDecideSuggestion` | `{ id, decision:'aceitar'|'recusar', reason? }` | `{ suggestion, article? }`; aceitar = Import (já existe → `duplicado` com `articleId`) | curador | `LIBRARY_CURATE` + limites do Import | `LIBRARY_SUGGESTION_DECIDE`, `details {decision, result}` |
| `apiAdminLearnLibraryListCollections` | — | `{ collections:[{ id, slug, title, description, status, sortOrder, version, articleIds }] }` (inclui rascunho) | curador | `LIBRARY_CURATE` | não |
| `apiAdminLearnLibrarySaveCollection` | `{ id?, version?, slug, title, description?, status, sortOrder?, articleIds:[uuid] (≤ 200) }` | `{ collection }` | curador | `LIBRARY_CURATE` | `LIBRARY_COLLECTION_SAVE` |
| `apiAdminLearnLibrarySaveTopic` | `{ slug, name, sortOrder? }` (upsert por slug; sem apagar na v1) | `{ topic }` | curador | `LIBRARY_CURATE` | `LIBRARY_TOPIC_SAVE`, `target_id` null + `details {slug}` (armadilha do `::uuid`, `worker/src/logging.js:15-20`) |
| `apiAdminLearnLibraryListStaff` | — | `{ staff:[{ profileId, fullName, role, grantedAt }] }` | admin | `LIBRARY_CURATE` | não |
| `apiAdminLearnLibrarySetStaff` | `{ email, role, grant: boolean }` | `{ staff:[...] }`; e-mail sem conta ativa: `NotFoundError('Pessoa não encontrada.')` | admin | `LIBRARY_CURATE` | `LIBRARY_STAFF_SET`, `library_staff`, `target_id` = profile id, `details {role, grant}` (sem e-mail) |

`AdminArticle` = todas as colunas em camelCase, inclusive `sourceAbstract`, `metadataSources`, `licenseSource`, `licenseConflict`, `version`, nomes e datas de aprovação e revisão. Escrita em vários passos (coleção + itens) usa **uma** instrução com CTE: `WITH c AS (INSERT/UPDATE ... RETURNING id), del AS (DELETE FROM library_collection_items WHERE collection_id = (SELECT id FROM c) AND article_id <> ALL($ids)), ins AS (INSERT ... SELECT ... ON CONFLICT (collection_id, article_id) DO UPDATE SET position = EXCLUDED.position) ...`. Os conjuntos de `del` e `ins` são disjuntos de propósito (no mesmo comando, `DO NOTHING` sobre uma linha que o `DELETE` apaga perderia o item).

### 4.3 Limites (`worker/src/library/limits.js`, valores de projeto, não verificados em produção)
`LIBRARY_RATE_LIMITS`: `LIBRARY_PUBLIC_IP` 30/h · `LIBRARY_PUBLIC_GLOBAL` 300/h · `LIBRARY_SEARCH` 300/h · `LIBRARY_READ` 600/h · `LIBRARY_FAVORITE` 120/h · `LIBRARY_SUGGEST` 5/h · `LIBRARY_SUGGEST_DAY` 15/24 h · `LIBRARY_IMPORT` 60/h · `LIBRARY_IMPORT_GLOBAL` 200/h · `LIBRARY_CURATE` 300/h (formato `{ MAX_ATTEMPTS, WINDOW_SECONDS }`, igual a `worker/src/constants.js:169-220`).
`LIBRARY_LIMITS`: `FAVORITES_MAX` 500 · `SUGGESTIONS_PENDING_MAX` 200 · `SUGGESTIONS_PENDING_PER_MEMBER` 10 · `NOTE_MAX` 300 · `REASON_MIN/MAX` 3/300 · `SUMMARY_MAX` 1200 · `QUERY_MAX` 120 · `QUERY_TERMS_MAX` 5 · `PAGE_SIZE_MAX` 50 · `PUBLIC_MAX_ITEMS` 2000 · `COLLECTION_ITEMS_MAX` 200 · `UPSTREAM_TIMEOUT_MS` 8000 · `IMPORT_BUDGET_MS` 20000 · `UPSTREAM_MAX_BYTES` 1 MiB · `AUTHORS_STORED_MAX` 30.
`OPEN_REUSE_LICENSES` = `['cc0','pd','cc-by','cc-by-sa']` (as NC dependem de P3). `LIBRARY_FLAGS` = as 4 chaves.
A sessão principal registra os limites com uma linha em `constants.js`: `Object.assign(RATE_LIMITS, LIBRARY_RATE_LIMITS)` (mesmo padrão de `worker/src/constants.js:251,379,445,463,470`). Os serviços importam de `limits.js`, sem depender do arquivo quente.
`enforceRateLimit` grava no Neon a cada chamada (`worker/src/security.js:96-118`): por isso o catálogo público consulta o cache **antes** do limite.

## 5. Dados que saem e normalização
- **`search_norm`** (`worker/src/library/normalize.js`, função `searchNorm(record)`): `título + sobrenomes + revista + abreviatura + doi + pmid` → `normalize('NFD')`, remove `\p{M}`, minúsculas, troca `[^a-z0-9./-]+` por espaço, colapsa espaços, corta em 4000. O front usa a mesma regra (cópia em `biblioteca/catalogo.js`).
- **Texto de fora**: título, revista e resumo vêm com tags (JATS no Crossref, `<i>` na Europe PMC). `stripMarkup` remove `<...>`, decodifica as 5 entidades XML e `&#NNN;`, tira caracteres de controle e colapsa espaços. Tudo vira texto; o front só usa `textContent`.
- **Licença** (`normalizeLicense(source, raw)`): Crossref `license[].URL` com `content-version` `vor` (ou `unspecified`) e `start` não futuro: `creativecommons.org/licenses/(by|by-sa|by-nd|by-nc|by-nc-sa|by-nc-nd)/` → `cc-…`; `creativecommons.org/publicdomain/zero/` → `cc0`; `publicdomain/mark` → `pd`; só `tdm` não conta; outra URL → `outra`. Europe PMC `"cc by"` → troca espaço por hífen. OpenAlex/Unpaywall `cc-by…` igual; `public-domain` → `pd`; o resto → `outra`. **Fontes discordam → a mais restritiva** (ordem `cc0 < pd < cc-by < cc-by-sa < cc-by-nd < cc-by-nc < cc-by-nc-sa < cc-by-nc-nd < outra < desconhecida`) e `license_conflict = TRUE` (aparece na triagem).
- **Acesso aberto**: `oa_status` do OpenAlex (`open_access.oa_status`), senão do Unpaywall; senão `desconhecido`. O curador pode corrigir (origem `curador`).
- **Tipo**: Europe PMC `pubTypeList.pubType` (a verificar com fixture ao vivo): `Meta-Analysis` → `meta_analise`; `Systematic Review` → `revisao_sistematica`; `Review` → `revisao`; `*Clinical Trial*`/`Randomized Controlled Trial` → `ensaio_clinico`; `Case Reports` → `relato_caso`; `*Guideline*` → `diretriz`; `Journal Article`/`research-article` → `artigo`; senão OpenAlex `type` (`review` → `revisao`, `article` → `artigo`); senão Crossref `journal-article` → `artigo`; o resto `outro`.
- **Resumo original** (`source_abstract`): guardado para a curadoria (e para o resumo por IA em B3); ao membro só com licença em `OPEN_REUSE_LICENSES`; nunca no catálogo público. Decisão 4: sem licença aberta, só link oficial e resumo próprio. **PDF não entra neste lote.**
- **Links**: `landing_url` = `https://doi.org/` + DOI com cada segmento em `encodeURIComponent` (como `worker/src/research/scholarlyClient.js:28-32`), senão `https://pubmed.ncbi.nlm.nih.gov/<pmid>/`. Nenhuma URL vinda das APIs é guardada ou devolvida.
- **LGPD**: termos de busca não são gravados; favoritos e sugestões saem com a conta (`ON DELETE CASCADE`); a lista de sugestões para o curador não traz quem sugeriu; auditoria sem e-mail, nome ou texto livre (`worker/src/logging.js:1-11`).

## 6. Cadastro por DOI/PMID (`worker/src/library/metadataClient.js`)
Hosts **fixos** (constantes; o código monta a URL só com o identificador já validado):
`https://api.crossref.org/works/{doi}?mailto={email}` → `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:"{doi}"` (ou `EXT_ID:{pmid} AND SRC:MED`)`&resultType=core&format=json` → `https://api.openalex.org/works/doi:{doi}` → fallbacks `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id={pmid}&retmode=json&tool=laift_biblioteca&email={email}` (PMID sem DOI, se a Europe PMC falhar) e `https://api.unpaywall.org/v2/{doi}?email={email}` (só se o OpenAlex falhar).
1. Entrada PMID: Europe PMC por `EXT_ID` dá DOI e PMCID; com DOI, segue o fluxo do DOI. Sem DOI em lugar nenhum: cadastra só com PMID.
2. Duplicata é checada **antes** de qualquer chamada externa (`SELECT id FROM library_articles WHERE doi = $1 OR pmid = $2`) e de novo pelo `ON CONFLICT DO NOTHING` (corrida entre dois curadores: quem perde recebe a mensagem de duplicata).
3. Chamadas **em série**, nunca em paralelo; no máximo 6 por cadastro (limite de subrequisições do plano da Cloudflare: a verificar). Cada uma com `AbortController` de `UPSTREAM_TIMEOUT_MS`, `credentials:'omit'`, `redirect:'error'`, `Accept: application/json`, `User-Agent: LAIFT-Biblioteca/1.0`, corpo lido até `UPSTREAM_MAX_BYTES` (modelo `readTextLimited`, `worker/src/services/atlasMoleculeService.js:72-94`; reescrever local, não importar).
4. HTTP 429 ou 503: **uma** nova tentativa depois de `min(Retry-After, 2 s)` (padrão 1 s). 404 não repete. Estourou `IMPORT_BUDGET_MS`: para e cadastra com o que tem, com aviso.
5. Falha de uma fonte não derruba o cadastro: vira `warnings` (`'Europe PMC não respondeu; resumo e tipo podem faltar.'`). Crossref e Europe PMC falhando juntos com entrada DOI: `ValidationError('Não foi possível obter os dados deste DOI agora. Tente de novo em alguns minutos.')`, sem gravar.
6. E-mail de contato: segredo `LIBRARY_CONTACT_EMAIL` (`wrangler secret put`, **sem valor no repositório**; `MAIL_FROM_ADDRESS` em `worker/wrangler.toml:34` não é reutilizado). Ausente ou inválido (`S.isValidEmail`): Crossref sem `mailto` (pool público), e PubMed e Unpaywall **não** são chamados (exigem e-mail).
7. Limites das fontes **a verificar**: Crossref polite pool (10 req e concorrência 3, unidade não declarada), NCBI (3 req/s sem chave, página oficial bloqueada), Unpaywall (100 mil/dia, resumo), OpenAlex (429 acima de 100 req/s). Com `LIBRARY_IMPORT` 60/h por curador e chamadas em série, o uso fica muito abaixo de qualquer um deles. Exigência NCBI de registrar `tool`/`email`: a verificar antes de ligar o fallback do PubMed.
8. Testes nunca vão à rede: `fetchImpl` injetado (padrão `worker/src/research/scholarlyClient.js:62-66`), fixtures em `worker/test/fixtures/library-upstream.json`.

## 7. Segurança
- **SSRF**: só os 5 hosts de §6; o cliente recusa qualquer URL montada que não comece por um deles (teste); sem seguir redirecionamento.
- **Identificadores**: `parseIdentifier(text)` em `worker/src/library/identifiers.js`. Aceita: DOI cru (`10.xxxx/...`), `doi:` + DOI, `https://doi.org/` ou `https://dx.doi.org/` + DOI (decodifica `%XX` uma vez); PMID cru (`^[1-9][0-9]{0,9}$`); `https://pubmed.ncbi.nlm.nih.gov/<pmid>/`; `https://europepmc.org/(article|abstract)/MED/<pmid>`. DOI: regex do Crossref `^10\.\d{4,9}/[-._;()/:a-z0-9]+$` após `toLowerCase()`, ≤ 200. Qualquer outro host ou formato: `ValidationError('Informe um DOI (ex.: 10.1000/xyz) ou um PMID (só números).')`. SciELO: cole o DOI que a SciELO mostra (sem link da SciELO na v1). O link nunca é buscado nem guardado; só o identificador extraído.
- **Sugestões**: texto da nota sem `<`, `>`, `http`, `www.` e sem caracteres de controle; ≤ 300; estado inicial `sugerido`; repetir a mesma sugestão: `ConflictError('Você já sugeriu este artigo.')`; artigo já na Biblioteca: aceita e marca `duplicado` na triagem.
- **Saída**: nada de HTML em resposta; links só os montados pelo servidor; erros sem detalhe interno (`worker/src/handlers.js:57-68`).
- **IDs**: UUID validado por regex antes do SQL (como `UUID_RE`, `worker/src/services/featureFlagService.js:33`); `logAudit` com `target_id` UUID ou `null` (`worker/src/logging.js:15-20`).
- **Concorrência**: `version` em artigo e coleção; `UPDATE ... WHERE id = $1 AND version = $2 RETURNING *`; zero linhas → `ConflictError` de versão.
- **Flags no navegador**: `library_enabled` e `library_member_suggest` entram em `PUBLIC_FLAGS` (`worker/src/services/featureFlagService.js:120`); `library_ai_summary` e `lia_library_enabled` **não** (só servidor).

## 8. Plano de testes (TDD: teste primeiro, vermelho, depois código)
| Suíte nova (`worker/test/`) | Tipo | Cobre (mínimo) |
|---|---|---|
| `libraryMigration.test.js` | PGlite (`createMigratedDb`, timeout 60 s, modelo `worker/test/researchLogService.test.js:108-117`) | tabelas e seeds; flags `FALSE`; DOI duplicado e PMID duplicado recusados; dois artigos só-DOI (pmid NULL) aceitos; cada CHECK de §1 (doi maiúsculo, url de outro host, publicar sem área, clínico sem revisor, revisão anterior ao resumo, IA sem revisão, motivo curto); excluir o perfil do revisor não quebra (SET NULL + nome); down com artigo recusa; down com `laift.allow_library_drop` passa |
| `libraryIdentifiers.test.js` | puro | todos os formatos aceitos e recusados de §7, inclusive `javascript:`, `http://doi.org` (sem https), host parecido (`doi.org.evil.com`), `%2F`, espaços e maiúsculas |
| `libraryNormalize.test.js` | puro | `stripMarkup` (JATS, entidades, `<script>`), `searchNorm`, cada linha da tabela de licenças, conflito → mais restritiva, `oa_status`, tipo, autores (corta em 30, `author_count` real, grupo sem `given`) |
| `libraryTransitions.test.js` | puro | matriz completa de §2 (permitidas e proibidas), pré-condições, `CLINICAL_TERMS` com e sem acento, revisor = autor recusado |
| `libraryMetadataClient.test.js` | mock de `fetchImpl` | ordem e número de chamadas; série, nunca paralelo; só hosts fixos; timeout; 429 com `Retry-After`; 404 sem repetir; corpo acima do teto; JSON inválido; sem e-mail não chama PubMed nem Unpaywall; orçamento total |
| `libraryService.test.js` | PGlite | flag desligada (todas as do membro); só `publicado` aparece; `visitor` sem resumo/favorito; busca com acento, vários termos e filtros; paginação; favoritos idempotentes e teto; coleções só publicadas; sugestão com limites e domínios; catálogo público com cache (mock de `caches`) e limites |
| `libraryCurationService.test.js` | PGlite + `fetchImpl` mock | cadastro feliz, duplicata (antes e na corrida), PMID-só; update com versão velha; transições via serviço; resumo de publicado volta a `aprovado`; regra clínica e revisor ≠ autor; papéis (membro recusado, revisor só revisa, admin curador) |
| `libraryAdminService.test.js` | PGlite | decidir sugestão (aceitar, duplicado, recusar com motivo), coleção com itens (CTE disjunta), área upsert, equipe só admin, auditoria sem e-mail |
Comandos (de `worker/`): `npm ci` (o worktree não tem `node_modules`), `npm test -- -i <suíte>`, `npm run validate:sql`, `npm run openapi`. Suíte completa e e2e: sessão principal, em série (memória, `docs/TIME_CONTRATO.md:47`).

## 9. O que quebra (e quem conserta: sessão principal, ficha `B1-I`)
- `worker/test/handlers.test.js:11-62`: lista literal e o texto "117" → **138**, com as 21 novas.
- `worker/openapi.yaml`: regerar (`npm run openapi`); `worker/test/openapi.test.js` falha se defasado.
- `worker/test/mfaGate.test.js`: **não muda** (as 20 com sessão entram sozinhas no `test.each`; a pública não tem sessão).
- `PUBLIC_FLAGS` (`worker/src/services/featureFlagService.js:120`) + `worker/test/featureFlagService.test.js:116-121` (acrescentar `library_ai_summary` e `lia_library_enabled` na lista do "não contém"; asserção nova para as duas públicas).
- `RATE_LIMITS`: 1 import + 1 linha em `worker/src/constants.js` (§4.3).
- `worker/src/handlers.js`: 3 imports de serviço + 21 entradas (arquivo vai a ~295 linhas).
- Todo teste PGlite aplica a 029 (`worker/test/helpers/pgliteSql.js:23-31`): ela precisa ser idempotente e só usar pg_trgm.
- Docs com "117 actions" (`docs/ANDAMENTO.md:54,129`): atualizar no fechamento.

## 10. Implantação (sessão principal, cada passo com OK do dono)
1. Branch de backup do Neon (`backup-pre-029-AAAA-MM-DD`); aplicar a 029 numa branch de teste; conferir tabelas e as 4 flags `FALSE`; depois produção; gravar nome + hash SHA-256 (CRLF→LF) no `schema_migrations` (`tools/db/migrate.mjs:38,47`).
2. Dono cadastra o segredo `LIBRARY_CONTACT_EMAIL` (staging e produção) pelo terminal.
3. `wrangler deploy` do Worker (as actions novas ficam inertes: flags desligadas e ninguém na equipe da Biblioteca).
4. Curadoria carrega o acervo com a flag desligada; dono liga `library_enabled` (primeiro por `conditions.role = ['admin']`, que a avaliação já suporta: `worker/src/services/featureFlagService.js:54-65`), depois para todos.
