# Atlas v2 — cronograma em 10 blocos (5 Claude, 5 manuais)

## Atualização (fim da sessão)
Já resolvidos (commits `95fa474`, `a7a75f9`):
- **Bloco 6:** botão "Refazer" do quiz — **feito**.
- **Bloco 7:** `abrirPdb` + ChEMBL — **feito**; o `apis.e2e.js` está verde.
- **Bloco 8:** crachá — `qr.e2e.js` está verde e não reproduziu; só re-testar.
- **Bloco 3:** busca de compostos (biohacking) e `abrirPdb` religados — falta só apagar os arquivos antigos.

Suíte completa: verde, exceto `atlas-perf` (bloco 1) e um tempo esgotado ocasional em `fase4`, que só aparece rodando tudo junto.

**Seus blocos agora:** 9 (URLs ASCT+B) e 10 (revisão e celular real). Opcional: re-testar o 8.

## Contexto rápido

- Branch: `claude/optimistic-babbage-3pm2em`.
- Atlas novo: `frontend/modulos/anatomia-3d/index.html` → `js/main.js`.
- Modelos 3D:
  - arquivos em `models/` (26,65 MB, 10 sistemas + 9 órgãos do HRA);
  - lista de estruturas em `data/atlas/generated/structures.json`.
- Pipelines no GitHub Actions:
  - `atlas-assets.yml` gera os modelos 3D;
  - `atlas-content.yml` gera o conteúdo em PT;
  - os dois são controlados por `tools/*/run-config.json` + push.
- Testes: `cd frontend && npm install && node scripts/build.js && node scripts/e2e/run.js <suíte>`.
- Plano completo: `docs/ATLAS_UX_SPEC.md`. Estado: `docs/ATLAS_V2_CHECKPOINT.md`.

## Cronograma

| # | Bloco | Quem | Depende de |
|---|---|---|---|
| 1 | Desempenho do 3D | Claude | — |
| 2 | Nomes em PT + fichas ligadas às estruturas | Claude | — |
| 3 | Recursos antigos no atlas novo + limpeza | Claude | — |
| 4 | Suíte completa verde + PR para a `main` | Claude | 1–3, 6–8 |
| 5 | Conteúdo automático PT no CI (Wikidata/Wikipédia/ASCT+B) | Claude | 9 |
| 6 | Botão "Refazer" do quiz coberto no celular | **Você** | — |
| 7 | Estúdio: dossiê ChEMBL e `abrirPdb` | **Você** | — |
| 8 | Crachá do terminal fiscal (QR/nome/cargo) | **Você** | — |
| 9 | URLs reais das tabelas ASCT+B | **Você** | — |
| 10 | Revisão do conteúdo por profissional de saúde e teste em celular real | **Você** | 2 |

Ordem sugerida: 1, 2, 3 e 6–9 em paralelo; depois 4; depois 5 e 10.

---

## Blocos do Claude

### 1. Desempenho do 3D — ✅ concluído
Medido em `scripts/e2e/atlas-perf.e2e.js` (01/10, `main` em `754ee97`, celular 390×844 e desktop 1440×900):

| Medida | Antes | Hoje | Meta |
|---|---|---|---|
| Primeira carga (bytes transferidos, gzip) | 7,21 MB | **3,47 MB** | ≤ 5 MB |
| Chamadas de desenho | 903 | **2** | ≤ 150 |
| Triângulos | — | 612 mil | ≤ 1,5 M |
| Heap JS | — | 19–26 MB | ≤ 250 MB |
| Redesenho parado (2 s ocioso) | contínuo | 0 frames | 0 |

Como foi resolvido:
- **Redesenho contínuo:** `js/engine/renderer.js` só agenda outro frame se algum ticker pedir; o ticker de `js/engine/labels.js` só pede enquanto a câmera ou os rótulos mudam.
- **Chamadas de desenho:** `js/engine/registry.js` usa um `THREE.BatchedMesh` por material de camada, mantendo seleção, visibilidade, raio-X e corte por estrutura.
- **Primeira carga:**
  - `structures.boot.json` enxuto (`scripts/atlas/make-boot-structures.mjs`), com o completo só como reserva;
  - LOD1 só quando reduz o tamanho;
  - o harness de E2E serve gzip, como o Pages.
- **Modos quebrados:** `physiology.js` (import do THREE) e `study.js` (`studyStore`) foram corrigidos, e o `atlas.e2e.js` não filtra mais esses erros.

### 2. Nomes em PT
- **Problema:** as fichas de `data/atlas/legacy/` (72 órgãos) não compartilham nenhum sid com `structures.json`, então buscar "coração" não acha o coração.
- **Solução:** em `js/main.js`, ligar ficha e estrutura pelo nome EN/latim normalizado.
- **Teste:** "coração" seleciona o coração.

### 3. Recursos antigos
- **Religar:** `abrirPdb` e a busca de compostos (biohacking) nos modos Farmacologia/Moléculas. `pk-engine.js`, `mol-engine.js` e `api-cache.js` já são carregados por esses modos.
- **Apagar os órfãos:** `js/app.js`, `js/atlas-ui.js`, `js/three-engine.js`, `js/quiz-engine.js`, `data/bio-database.js`.
- **Teste:** `apis.e2e.js` (bloco ANATOMIA) verde.

### 4. Fechamento
- `npm run e2e` completo verde.
- Atualizar `ATLAS_V2_CHECKPOINT.md`.
- Abrir o PR para a `main`.
- Depois do merge, o GitHub Pages publica.

### 5. Conteúdo automático PT
Depende das URLs do bloco 9.
1. `tools/atlas-content/run-config.json` → `mode: discover`: **uma** execução só, porque o Wikidata limita consultas repetidas.
2. Se vierem qids → `mode: build` → `commit: true` → voltar para `discover`.

---

## Blocos manuais (você)

### 6. Botão "Refazer" do quiz coberto no celular
- **Onde:** `frontend/learning.js` e `frontend/styles.css`, que definem a moldura do módulo (`learn-frame-immersive`), e o painel inferior `frontend/modulos/anatomia-3d/css/atlas.css` (`.atlas-sheet`).
- **Problema:** a barra inferior da plataforma (`#app-nav`) fica por cima do conteúdo do módulo, então o botão "Refazer" do quiz não recebe o clique.
- **Fazer:** a moldura imersiva deve terminar acima do `#app-nav`, ou o painel deve reservar `padding-bottom` com a altura da barra.
- **Testar:**
  - rodar `node scripts/e2e/run.js fase4`;
  - abrir no celular Aprender → Anatomia → modo Quiz → concluir → tocar "Refazer".

### 7. Estúdio: dossiê ChEMBL e `abrirPdb`
- **Onde:** módulo Estúdio em `frontend/modulos/` (procure "ChEMBL" e "abrirPdb" com a busca do editor).
- **Problema:** `apis.e2e.js` falha em "estúdio: dossiê ChEMBL mostra a atividade biológica (mock)", e aparece o erro `window.abrirPdb is not a function`. Provavelmente uma função que antes vinha do atlas antigo.
- **Fazer:** definir a função no próprio Estúdio, ou importar de um arquivo compartilhado.
- **Testar:** `node scripts/e2e/run.js apis`.

### 8. Crachá do terminal fiscal
- **Onde:** página fiscal em `frontend/modulos/` (procure "crachá" / "badge").
- **Problema:** `qa-full.e2e.js`, em "crachá individual", falha em dois pontos:
  - o QR, o nome e o cargo não batem com o membro selecionado;
  - um clique estoura o tempo limite de 30 s.
- **Fazer:** conferir que o crachá usa os dados do membro clicado e que o botão existe e está visível.
- **Testar:** `node scripts/e2e/run.js qa-full`.

### 9. URLs reais das tabelas ASCT+B (células por órgão)
- **Onde:** `tools/atlas-content/asctb-organs.json`. Hoje as 7 URLs estão erradas.
- **Fazer:**
  1. Abrir https://humanatlas.io/asctb-reporter (ou o repositório `hubmapconsortium/ccf-releases` no GitHub).
  2. Para coração, fígado, rim, pâncreas, encéfalo, pulmão e pele, copiar o link do **CSV** da versão mais recente.
  3. Colar os links no arquivo, no mesmo formato que já está lá.
  4. Fazer commit no branch.
- Só isso; o bloco 5 cuida do resto.

### 10. Revisão de conteúdo e teste em celular real
- **Revisão:** um profissional de saúde revisa as fichas, seguindo `docs/ATLAS_CONTENT_POLICY.md`, §5.
  - As fichas estão em `data/atlas/legacy/content/*.json` e todas têm hoje o selo "Rascunho".
  - Ao aprovar uma, trocar `review.status` para `reviewed` e preencher `review.by` e `review.date`.
- **Teste em celular real:** num Android intermediário, abrir o atlas e anotar:
  - se o 3D fica fluido ao girar;
  - o tempo até o corpo aparecer;
  - se a busca, a ficha e os modos funcionam.
