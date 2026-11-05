-- Plataforma de Membros LAIFT
-- © 2026 Daniel Pires Francisco. Todos os direitos reservados.
-- Licença proprietária: ver LICENSE na raiz do repositório.
-- 053_chem_base.sql — banco próprio de química do Laboratório (O2; esquema do plano em
--   Desktop\cortex\auditoria-modulos\laboratorio-v2\1-dados-e-fontes.md, seção 3.3).
--
-- Fontes com licença; substâncias por InChIKey (com nivel_conteudo); aliases dos ids legados da bancada;
-- propriedades UMA LINHA POR VALOR (fonte, data, unidade, condição, confiança); reações; processos, passos,
-- formulações e testes de controle de qualidade; equipamentos. Sem dado pessoal. revisado_por é texto livre
-- opcional (metadado; não bloqueia nem aparece ao público). Sem cache externo aqui: o cache de PubChem/ChEMBL/ChEBI
-- fica na Cache API do Worker (nunca em KV).
--
-- Regra de conteúdo (decisão do dono, 2026-11-05) também no banco: o gatilho pharma_processes_nivel_guard
-- reprova processo 'completo' para espécie restrita (agente de guerra, droga ilícita; rota de síntese de
-- espécie 'educacional'). O validador do seed (tools/lab/validar-seed.mjs) aplica a mesma regra no CI.
--
-- RLS forçado + laift_worker_all (laift_enable_rls, 031/032). Aditiva e idempotente; só ESCRITA do arquivo,
-- não aplicada. Requer 031 e 032. Reversão: sql/down/053_chem_base.sql.

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS chem_sources (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL,
  nome            TEXT        NOT NULL,
  url             TEXT,
  licenca         TEXT        NOT NULL,
  atribuicao      TEXT,
  redistribuivel  BOOLEAN     NOT NULL,
  uso_comercial   BOOLEAN,                     -- NULL = não verificado
  observacao      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chem_sources_pk PRIMARY KEY (id),
  CONSTRAINT chem_sources_slug_uq UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS chem_substances (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  inchikey        TEXT        NOT NULL,
  slug            TEXT        NOT NULL,        -- primeiro id legado da bancada (ex.: 'AAS_s')
  smiles          TEXT        NOT NULL,
  smiles_canon    TEXT        NOT NULL,
  formula         TEXT        NOT NULL,
  nome_pt         TEXT        NOT NULL,
  iupac           TEXT,
  pubchem_query   TEXT,
  pubchem_cid     INTEGER,
  chebi_id        TEXT,
  chembl_id       TEXT,
  classe          TEXT,
  nivel_conteudo  TEXT        NOT NULL DEFAULT 'completo',
  restricao       TEXT,
  controlado_br   TEXT,
  revisado_por    TEXT,
  revisado_em     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chem_substances_pk PRIMARY KEY (id),
  CONSTRAINT chem_substances_inchikey_uq UNIQUE (inchikey),
  CONSTRAINT chem_substances_slug_uq UNIQUE (slug),
  CONSTRAINT chem_substances_inchikey_chk CHECK (inchikey ~ '^[A-Z]{14}-[A-Z]{10}-[A-Z]$'),
  CONSTRAINT chem_substances_nivel_chk CHECK (nivel_conteudo IN ('completo', 'educacional')),
  CONSTRAINT chem_substances_restricao_chk CHECK (restricao IS NULL OR restricao IN
    ('agente_guerra', 'ilicita', 'opioide_sintese', 'psicoestimulante_sintese', 'toxina_potente')),
  -- Espécie restrita nunca é 'completo'.
  CONSTRAINT chem_substances_restricao_nivel_chk CHECK (restricao IS NULL OR nivel_conteudo = 'educacional')
);

CREATE TABLE IF NOT EXISTS chem_substance_aliases (
  substance_id    UUID        NOT NULL REFERENCES chem_substances(id) ON DELETE CASCADE,
  alias           TEXT        NOT NULL,
  tipo            TEXT        NOT NULL DEFAULT 'id_legado',
  fase            TEXT,
  label           TEXT,
  CONSTRAINT chem_substance_aliases_pk PRIMARY KEY (alias, tipo),
  CONSTRAINT chem_substance_aliases_tipo_chk CHECK (tipo IN ('id_legado', 'sinonimo_pt', 'sinonimo_en', 'nome_comercial')),
  CONSTRAINT chem_substance_aliases_fase_chk CHECK (fase IS NULL OR fase IN ('s', 'l', 'g', 'aq'))
);

CREATE TABLE IF NOT EXISTS chem_properties (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  substance_id    UUID        NOT NULL REFERENCES chem_substances(id) ON DELETE CASCADE,
  chave           TEXT        NOT NULL,        -- 'massa_molar', 'densidade', 'bp', 'fp', 'logp', 'pka'...
  valor_num       NUMERIC(16,6),
  valor_texto     TEXT,
  unidade         TEXT        NOT NULL,
  condicao        TEXT        NOT NULL DEFAULT '',  -- '25 °C', '20 mmHg', fase 'aq'...
  source_id       UUID        NOT NULL REFERENCES chem_sources(id),
  fetched_at      TIMESTAMPTZ NOT NULL,
  verificado_em   TIMESTAMPTZ,
  confianca       SMALLINT    NOT NULL DEFAULT 3,
  CONSTRAINT chem_properties_pk PRIMARY KEY (id),
  CONSTRAINT chem_properties_uq UNIQUE (substance_id, chave, source_id, condicao),
  CONSTRAINT chem_properties_valor_chk CHECK (valor_num IS NOT NULL OR valor_texto IS NOT NULL),
  CONSTRAINT chem_properties_confianca_chk CHECK (confianca BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS chem_reactions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL,
  nome_pt         TEXT        NOT NULL,
  tipo            TEXT,
  equacao         TEXT        NOT NULL,
  balanceada      BOOLEAN     NOT NULL DEFAULT FALSE,
  estado          TEXT        NOT NULL DEFAULT 'rascunho',
  motivo_estado   TEXT,
  temp_min_c      NUMERIC(6,2),
  temp_max_c      NUMERIC(6,2),
  tempo_min       INTEGER,
  rendimento_pc   NUMERIC(5,2),
  precisa_agitacao BOOLEAN    NOT NULL DEFAULT FALSE,
  source_id       UUID        NOT NULL REFERENCES chem_sources(id),
  confianca       SMALLINT    NOT NULL DEFAULT 2,
  revisado_por    TEXT,
  revisado_em     TIMESTAMPTZ,
  CONSTRAINT chem_reactions_pk PRIMARY KEY (id),
  CONSTRAINT chem_reactions_slug_uq UNIQUE (slug),
  CONSTRAINT chem_reactions_estado_chk CHECK (estado IN ('rascunho', 'ilustrativa', 'simulavel', 'retirada')),
  CONSTRAINT chem_reactions_confianca_chk CHECK (confianca BETWEEN 1 AND 5)
);

CREATE TABLE IF NOT EXISTS chem_reaction_species (
  reaction_id     UUID        NOT NULL REFERENCES chem_reactions(id) ON DELETE CASCADE,
  substance_id    UUID        NOT NULL REFERENCES chem_substances(id),
  papel           TEXT        NOT NULL,
  coeficiente     NUMERIC(8,4) NOT NULL DEFAULT 1,
  CONSTRAINT chem_reaction_species_pk PRIMARY KEY (reaction_id, substance_id, papel),
  CONSTRAINT chem_reaction_species_papel_chk CHECK (papel IN ('reagente', 'produto', 'coproduto', 'catalisador', 'solvente'))
);

CREATE TABLE IF NOT EXISTS lab_equipment (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL,
  nome_pt         TEXT        NOT NULL,
  tipo            TEXT        NOT NULL,
  capacidade      NUMERIC(10,2),
  unidade_cap     TEXT,
  precisao        TEXT,
  temp_max_c      NUMERIC(6,2),
  material        TEXT,
  cuidados        TEXT,
  CONSTRAINT lab_equipment_pk PRIMARY KEY (id),
  CONSTRAINT lab_equipment_slug_uq UNIQUE (slug),
  CONSTRAINT lab_equipment_tipo_chk CHECK (tipo IN ('vidraria', 'balanca', 'aquecimento', 'agitacao', 'medicao', 'separacao', 'esterilizacao'))
);

CREATE TABLE IF NOT EXISTS pharma_processes (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  slug            TEXT        NOT NULL,
  nome_pt         TEXT        NOT NULL,
  tipo            TEXT        NOT NULL DEFAULT 'formulacao',
  forma           TEXT,
  via             TEXT,
  categoria       TEXT        NOT NULL DEFAULT 'magistral',
  escala          TEXT,
  produto_substance_id UUID   REFERENCES chem_substances(id),
  nivel_conteudo  TEXT        NOT NULL DEFAULT 'completo',
  referencia      TEXT,
  rdc_aplicavel   TEXT[]      NOT NULL DEFAULT '{}',
  estado          TEXT        NOT NULL DEFAULT 'rascunho',
  motivo_estado   TEXT,
  revisado_por    TEXT,
  revisado_em     TIMESTAMPTZ,
  source_id       UUID        NOT NULL REFERENCES chem_sources(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pharma_processes_pk PRIMARY KEY (id),
  CONSTRAINT pharma_processes_slug_uq UNIQUE (slug),
  CONSTRAINT pharma_processes_tipo_chk CHECK (tipo IN ('formulacao', 'sintese', 'controle_qualidade', 'processo_industrial')),
  CONSTRAINT pharma_processes_nivel_chk CHECK (nivel_conteudo IN ('completo', 'educacional')),
  CONSTRAINT pharma_processes_estado_chk CHECK (estado IN ('rascunho', 'disponivel', 'indisponivel', 'retirado')),
  CONSTRAINT pharma_processes_categoria_chk CHECK (categoria IN
    ('magistral', 'oficinal', 'industrial', 'cosmetico', 'saneante', 'reagente', 'padrao', 'sintese_didatica'))
);

CREATE TABLE IF NOT EXISTS pharma_process_steps (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  process_id      UUID        NOT NULL REFERENCES pharma_processes(id) ON DELETE CASCADE,
  ordem           SMALLINT    NOT NULL,
  acao            TEXT        NOT NULL,
  descricao_pt    TEXT        NOT NULL,
  equipment_id    UUID        REFERENCES lab_equipment(id),
  parametros      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ponto_critico   BOOLEAN     NOT NULL DEFAULT FALSE,
  CONSTRAINT pharma_process_steps_pk PRIMARY KEY (id),
  CONSTRAINT pharma_process_steps_ordem_uq UNIQUE (process_id, ordem)
);

CREATE TABLE IF NOT EXISTS pharma_formulation_items (
  process_id      UUID        NOT NULL REFERENCES pharma_processes(id) ON DELETE CASCADE,
  substance_id    UUID        NOT NULL REFERENCES chem_substances(id),
  funcao          TEXT        NOT NULL,
  quantidade      NUMERIC(12,4) NOT NULL,
  unidade         TEXT        NOT NULL,
  faixa_min       NUMERIC(12,4),
  faixa_max       NUMERIC(12,4),
  CONSTRAINT pharma_formulation_items_pk PRIMARY KEY (process_id, substance_id, funcao)
);

CREATE TABLE IF NOT EXISTS pharma_qc_tests (
  id              UUID        NOT NULL DEFAULT gen_random_uuid(),
  process_id      UUID        REFERENCES pharma_processes(id) ON DELETE CASCADE,
  substance_id    UUID        REFERENCES chem_substances(id) ON DELETE CASCADE,
  ensaio          TEXT        NOT NULL,
  criterio        TEXT        NOT NULL,
  limite_min      NUMERIC(12,4),
  limite_max      NUMERIC(12,4),
  unidade         TEXT,
  metodo_ref      TEXT        NOT NULL,        -- cita a monografia/método; não copia o texto
  source_id       UUID        NOT NULL REFERENCES chem_sources(id),
  CONSTRAINT pharma_qc_tests_pk PRIMARY KEY (id),
  CONSTRAINT pharma_qc_alvo_chk CHECK (process_id IS NOT NULL OR substance_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chem_properties_subst_chave ON chem_properties (substance_id, chave);
CREATE INDEX IF NOT EXISTS idx_chem_substances_classe_nivel ON chem_substances (classe, nivel_conteudo);
CREATE INDEX IF NOT EXISTS idx_chem_substance_aliases_subst ON chem_substance_aliases (substance_id);
CREATE INDEX IF NOT EXISTS idx_pharma_processes_estado ON pharma_processes (forma, estado);

-- Regra de conteúdo no banco: processo 'completo' não pode apontar para espécie restrita.
CREATE OR REPLACE FUNCTION chem_processes_nivel_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  alvo RECORD;
BEGIN
  IF NEW.nivel_conteudo = 'completo' AND NEW.produto_substance_id IS NOT NULL THEN
    SELECT nivel_conteudo, restricao INTO alvo FROM chem_substances WHERE id = NEW.produto_substance_id;
    IF alvo.restricao IN ('agente_guerra', 'ilicita') THEN
      RAISE EXCEPTION 'processo completo para espécie restrita (%)', alvo.restricao USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.tipo = 'sintese' AND alvo.nivel_conteudo = 'educacional' THEN
      RAISE EXCEPTION 'rota de síntese completa para espécie de nível educacional' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS pharma_processes_nivel_guard ON pharma_processes;
CREATE TRIGGER pharma_processes_nivel_guard
  BEFORE INSERT OR UPDATE ON pharma_processes
  FOR EACH ROW EXECUTE FUNCTION chem_processes_nivel_guard();

-- Impede rebaixar uma substância a 'educacional' enquanto houver rota de síntese completa para ela.
CREATE OR REPLACE FUNCTION chem_substances_nivel_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.nivel_conteudo = 'educacional' AND (OLD.nivel_conteudo IS DISTINCT FROM NEW.nivel_conteudo OR OLD.restricao IS DISTINCT FROM NEW.restricao)
     AND EXISTS (SELECT 1 FROM pharma_processes p WHERE p.produto_substance_id = NEW.id AND p.nivel_conteudo = 'completo' AND p.tipo = 'sintese') THEN
    RAISE EXCEPTION 'há rota de síntese completa para esta substância; passe-a a educacional antes' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS chem_substances_nivel_guard ON chem_substances;
CREATE TRIGGER chem_substances_nivel_guard
  BEFORE UPDATE ON chem_substances
  FOR EACH ROW EXECUTE FUNCTION chem_substances_nivel_guard();

SELECT laift_enable_rls('chem_sources'::regclass);
SELECT laift_enable_rls('chem_substances'::regclass);
SELECT laift_enable_rls('chem_substance_aliases'::regclass);
SELECT laift_enable_rls('chem_properties'::regclass);
SELECT laift_enable_rls('chem_reactions'::regclass);
SELECT laift_enable_rls('chem_reaction_species'::regclass);
SELECT laift_enable_rls('lab_equipment'::regclass);
SELECT laift_enable_rls('pharma_processes'::regclass);
SELECT laift_enable_rls('pharma_process_steps'::regclass);
SELECT laift_enable_rls('pharma_formulation_items'::regclass);
SELECT laift_enable_rls('pharma_qc_tests'::regclass);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'laift_worker') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON chem_sources, chem_substances, chem_substance_aliases, chem_properties,
      chem_reactions, chem_reaction_species, lab_equipment, pharma_processes, pharma_process_steps,
      pharma_formulation_items, pharma_qc_tests TO laift_worker;
  END IF;
END
$$;

-- Fontes de referência (linhas fixas; reaplicar não duplica). Só fontes permitidas: PubChem, ChEMBL, ChEBI, PDB, ORD, RDKit.
INSERT INTO chem_sources (slug, nome, url, licenca, atribuicao, redistribuivel, uso_comercial, observacao) VALUES
  ('curadoria_laift', 'Curadoria LAIFT (valores herdados, origem não registrada)', NULL, 'proprietaria-laift', NULL, TRUE, NULL, 'Fila de reverificação; confiança 2.'),
  ('pubchem', 'PubChem (NCBI/NLM)', 'https://pubchem.ncbi.nlm.nih.gov', 'public-domain', 'PubChem, National Library of Medicine', TRUE, TRUE, NULL),
  ('chembl', 'ChEMBL (EMBL-EBI)', 'https://www.ebi.ac.uk/chembl', 'CC-BY-SA-3.0', 'ChEMBL, EMBL-EBI', TRUE, TRUE, 'Compartilha igual: conferir antes de material pago.'),
  ('chebi', 'ChEBI (EMBL-EBI)', 'https://www.ebi.ac.uk/chebi', 'CC-BY-4.0', 'ChEBI, EMBL-EBI', TRUE, TRUE, NULL),
  ('pdb', 'Protein Data Bank (RCSB)', 'https://www.rcsb.org', 'CC0-1.0', NULL, TRUE, TRUE, NULL),
  ('ord', 'Open Reaction Database', 'https://open-reaction-database.org', 'CC-BY-SA-4.0', 'Open Reaction Database', TRUE, NULL, 'Licença a confirmar antes do uso.'),
  ('rdkit', 'RDKit', 'https://www.rdkit.org', 'BSD-3-Clause', 'RDKit', TRUE, TRUE, 'Cálculo (canonização, InChIKey, descritores), não dado.')
ON CONFLICT (slug) DO NOTHING;

RESET lock_timeout;
