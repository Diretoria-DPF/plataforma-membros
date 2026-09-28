# Política de Conteúdo do Atlas Anatômico 3D

Padrões de confiabilidade, rastreabilidade e revisão para modelos, textos e identificadores do Atlas usados na formação de profissionais de saúde.

---

## 1. Objetivo e público

O **Atlas Anatômico 3D** da LAIFT serve estudantes e profissionais de saúde em formação (medicina, enfermagem, fisioterapia, odontologia, nutrição) como recurso educacional de anatomia e correlações clínicas. Cada estrutura e texto é revisado quanto à precisão antes de sair do estado "Rascunho — não revisado" (§14 da UX spec).

Nada neste documento substitui orientação clínica ou diagnóstica. Protocolos terapêuticos e doses seguem avisos na UI.

---

## 2. Fontes aceitas e licenças

| Fonte | Escopo | Licença | Observação |
|-------|--------|---------|-----------|
| **Z-Anatomy** | Corpo inteiro, modelos 3D | CC BY-SA 4.0 | z-anatomy.com; créditos na tela (§15) |
| **HRA/HuBMAP** | Órgãos de alta fidelidade (M/F) | CC BY 4.0 | humanatlas.io; células, biomarcadores via ASCT+B |
| **Wikidata** | IDs (FMA, UBERON, TA2, MeSH, CID-10) e rótulos PT | CC0 | wikidata.org; automático via pipeline |
| **Wikipédia PT** | Introduções e contexto | CC BY-SA 4.0 | Sempre com link da revisão usada (`rev` no source) |
| **FIPAT** | Terminologia Anatômica oficial (TA2) | Referência terminológica (não redistribuída) | Termos conferidos pelo glossário (`data/atlas/glossario-pt.json`) |
| **Legado (LAIFT)** | Conteúdo anterior | `legacy-unverified` | Marcado como rascunho até revisão; nunca sobrescreve dados revisados |

**Regra crítica**: Nada que seja CC BY-SA é mesclado em campos que alimentam arquivos CC BY. Cada modelo 3D derivado mantém seu arquivo de licença em `models/LICENSES/`. A tela de créditos (§15) lista cada bloco separadamente — é o ponto de verificação de conformidade de licença.

---

## 3. Campos obrigatórios

Todo registro de conteúdo (`content/<sistema>.json`, chave = SID) deve possuir:

- **`ids`** — mapa de identificadores (`fma`, `uberon`, `ta2`, `wikidata`, `mesh`, `icd10`); o objeto é obrigatório e cada id presente segue o formato do schema (ex.: `UBERON:0000948`, `Q1072`).
- **`summary_pt`** — texto resumido em português; não pode ser vazio.
- **`sources`** — array de objetos com `field`, `type`, `ref`, `license` obrigatórios. Cada campo de texto (`summary_pt`, `anatomy.vascularization`, `clinical[0]`, etc.) deve ter *pelo menos uma* fonte citada; o validador falha se um campo tiver conteúdo mas nenhuma fonte.
- **`review.status`** — obrigatório; valores válidos: `"auto-draft"`, `"legacy-unverified"`, `"reviewed"`, `"approved"` (ver §4).

Campos opcionais: `anatomy` (relations, vascularization, innervation, lymph), `histology` (epithelium, tissues, cells), `clinical` (array de strings).

**Validação**: `npm run atlas:validate` (na pasta `frontend`) rejeita qualquer SID que falte `ids`, `summary_pt`, `sources` ou `review.status`, e qualquer campo de texto sem fonte.

---

## 4. Estados de revisão

| Status | Significado | Quem define | Badge "Rascunho"? |
|--------|-------------|-------------|------------------|
| `auto-draft` | Texto gerado automaticamente; nunca revisado. | Pipeline (Wikidata → Wikipédia → ASCT+B) | Sim, sempre |
| `legacy-unverified` | Conteúdo herdado da base anterior; origem incerta. | Migração de dados | Sim, sempre |
| `reviewed` | Conferido por profissional de saúde credenciado (CRM/CRF/COREN/docente). | Revisor humano (PR) | Não; desaparece |
| `approved` | Revisado e com nível de detalhe máximo ou protocolo validado (opcional). | Revisor + moderador | Não; desaparece |

O badge **"Rascunho — não revisado"** aparece no cabeçalho da ficha (ao lado do nome) enquanto `review.status` for `auto-draft` ou `legacy-unverified`; desaparece automaticamente quando muda para `reviewed` ou `approved`.

---

## 5. Processo de revisão

**Quem pode revisar**: Profissional de saúde com registro ativo no conselho profissional (CRM — Medicina; CRF — Farmácia; COREN — Enfermagem; CREFITO — Fisioterapia; CRO — Odontologia; equivalente em outras áreas) ou docente de instituição de ensino superior reconhecida.

**Passo a passo**:

1. Abrir uma PR com alteração de conteúdo (campos `summary_pt`, `anatomy.*`, `clinical`, `histology`, `ids`).
2. Revisor confirma em comentário: checklist de verificação
   - ✓ Terminologia em PT-BR conforme FIPAT e glossário (`data/atlas/glossario-pt.json`).
   - ✓ Conferência contra fonte primária (livro, base oficial, SciELO).
   - ✓ Relações anatômicas (superior/inferior, medial/lateral, anterior/posterior) corretas.
   - ✓ Vascularização e inervação descrevem destino do vaso/nervo, não só "presente".
   - ✓ Correlações clínicas são educacionais; nenhuma receita ou dose de medicamento.
   - ✓ Doses aparecem como "Compostos" no modo Farmacologia e recebem aviso ("não é recomendação").
3. Revisor atualiza `review.by` (nome ou email) e `review.date` (YYYY-MM-DD) no JSON.
4. `review.status` muda para `"reviewed"` (ou `"approved"` se aplicável).
5. PR é mesclada.

**Regra de regeneração**: Quando o pipeline regenera um SID (ex.: Wikidata atualiza), ele **nunca sobrescreve** um entry `reviewed` ou `approved` automaticamente — propõe um diff e aguarda decisão humana.

---

## 6. Terminologia e estilo

- **Idioma**: Português brasileiro (pt-BR).
- **Nomenclatura**: Preferir Terminologia Anatômica oficial (FIPAT/TA2) traduzida ou consagrada em PT. Exemplos:
  - Não: "Spleen" → Sim: "Baço".
  - Não: "Biceps" (isolado) → Sim: "Bíceps" ou "Músculo bíceps braquial".
- **Epônimos**: Usar como sinônimo (entre parênteses) apenas quando já em uso em livros PT-BR.
- **Unidades**: Seguir SI (cm, mm, mL, g, °C).
- **Lateralidade**: "direito"/"esquerdo" em minúsculas; "Direito/Esquerdo" só em cabeçalhos.
- **Evitar**: Anglicismos (use "célula-tronco", não "stem cell"), jargão de biohacking, abreviações sem expansão.

---

## 7. Conteúdo clínico e farmacológico

**Caráter educacional**: Correlações clínicas descrevem relevância anatômica (ex.: "A lesão do nervo radial no sulco do nervo radial do úmero causa queda do punho — 'mão caída'") — não prescrevem tratamento.

**Avisos obrigatórios**:
- A aba Clínica da ficha e o modo Farmacologia exibem o aviso fixo: "Para fins educacionais; não substitui orientação profissional." O texto de cada campo não precisa repetir o aviso.
- No modo Farmacologia, "Compostos" com `legacy-unverified` ou protocolos antigos de "biohacking" recebem badges e aviso — jamais aparecem como recomendação.
- Doses nunca são apresentadas como recomendação; se incluídas, são sempre históricas ou de referência.

---

## 8. Como reportar erro

Usuários e profissionais podem reportar imprecisões via **GitHub Issues** no repositório:

1. Título: `[Atlas] Erro em <estrutura>` (ex.: `[Atlas] Erro em Artéria Braquial`).
2. Conteúdo:
   - SID da estrutura (`fma:XXXXX` ou `za:...`).
   - Trecho impreciso (copiar da ficha).
   - Fonte correta (livro, SciELO, documento oficial).
   - Link para a versão online se possível.

A equipe de conteúdo faz triage e escalona para revisão conforme §5.

---

## 9. Regeneração automática

O pipeline (workflow `.github/workflows/atlas-content.yml`, planejado) executa periodicamente:

1. **Wikidata → IDs** (`ids.uberon`, `ids.mesh`, `ids.icd10`, `ids.ta2`) e rótulos PT.
2. **Wikipédia PT → Resumo** (`summary_pt`) com link da revisão em `sources[].rev`.
3. **ASCT+B → Células e biomarcadores** (`histology.cells`, `histology.tissues`).
4. **Montador**: Agrupar por sistema, compilar índices de busca.
5. **Validador** (`npm run atlas:validate`): Falha se faltarem `summary_pt`, `sources`, `review.status`.

**Preservação de dados**: Campos com `review.status = "reviewed"` ou `"approved"` nunca são sobrescritos automaticamente — o pipeline propõe um diff para decisão manual em PR.

---

**Referências**: Consulte `frontend/scripts/atlas/validate-content.mjs`, `content.schema.json` e `ATLAS_UX_SPEC.md` (§13–§15).
