# Fontes do pipeline de modelos 3D (WP10)

> Ver o plano completo em `docs/` (§3 "Pipeline de modelos 3D"). Este
> documento registra onde cada fonte foi confirmada, o que ficou pendente
> para o primeiro `workflow_dispatch`/push de `discover.mjs`, e a licença de
> cada uma. Textos e comentários do pipeline ficam em pt-BR.

## 1. Z-Anatomy (corpo completo — todos os sistemas)

**Fonte escolhida:** o arquivo `Z-Anatomy.zip`, comitado direto na raiz do
repositório `Z-Anatomy/Models-of-human-anatomy` (branch `master`). Confirmado
por dezenas de projetos abertos independentes que fazem `curl` +`unzip`
direto na URL abaixo — não é Git LFS nem asset de Release, é um blob normal
do git:

```
https://raw.githubusercontent.com/Z-Anatomy/Models-of-human-anatomy/<ref>/Z-Anatomy.zip
```

- **Tamanho do zip:** ~83–87 MB (relatos variam entre 82,7 MB e 87 MB —
  `discover.mjs` confirma o valor exato do commit fixado).
- **Conteúdo:** `Z-Anatomy/Startup.blend` (o `.blend` completo, todos os
  sistemas — esqueleto, músculos, vísceras, vasos, nervos, pele — em
  coleções, um objeto por estrutura) + `Z-Anatomy/Readme.md` +
  `Z-Anatomy/License.txt`. Também há um `TA2.csv` na raiz do repo
  (crosswalk de nomes para a Terminologia Anatômica 2 — não usado por este
  WP, mas relevante para o WP11).
- **Tamanho do .blend extraído:** ~293 MB (não é comitado em lugar nenhum —
  só passa pela máquina do CI, nunca vai para o git da plataforma).
- **Escala do modelo:** relatos convergentes de ~4568 objetos de malha e
  ~1944 coleções (uma por estrutura anatômica), agrupadas por sistema.
- **Eixos:** Blender nativo é Z-up; o exportador glTF do próprio Blender
  (`export_yup=True`) já converte para Y-up/metros — não precisa de
  transformação manual (ver `export_systems.py`).
- **Nomenclatura:** objetos com sufixo `.l`/`.r` (minúsculo) para lado —
  `optimize.mjs`/`build-manifest.mjs` já tratam esse padrão (e a variante
  `.L`/`.R`, por segurança).
- **Licença:** **CC BY-SA 4.0** (Creative Commons Attribution-ShareAlike 4.0
  International), confirmada diretamente no `License.txt` e no `Readme.md`
  do próprio repositório:
  > "All the code and content shared by 'Z-Anatomy' is under Creative
  > Commons Attribution-ShareAlike 4.0 International License."
- **Distribuição "oficial" para humanos:** <https://lluisv.itch.io/z-anatomy>
  (autor: Lluís Vinent) — mantido como referência de crédito em
  `models/LICENSES/ATTRIBUTION.md`, mas o download automatizado usa o
  GitHub (scriptável, versionado, sem necessidade de navegador).
- **Reprodutibilidade:** cada execução do workflow fixa o commit SHA
  resolvido por `discover.mjs` (`GET /repos/.../commits/master`) em vez de
  sempre baixar `master` — evita que o conteúdo mude sem aviso entre
  execuções. O SHA usado fica registrado no `sourceVersion` do
  `manifest.json`.
- **Estratégia de exportação:** como não existe (ainda confirmado) um
  export por sistema já pronto nos repositórios do Z-Anatomy, a rota é
  Blender headless: baixar o Blender 4.x LTS oficial em
  `download.blender.org` (a versão exata sai do `discover.mjs`, que lista
  os diretórios `Blender4.x/` disponíveis) e rodar
  `blender -b Startup.blend --python export_systems.py -- --out-dir ...`.
  `export_systems.py` isola as coleções de cada sistema na view layer,
  remove texto/rótulo/empty, grava extras (`system`, `layer`,
  `englishName`, `side`) e exporta um GLB por sistema.
- **Pendente da Fase A (primeira rodada de `discover.mjs`/`--list-collections`):**
  o nome real das coleções de primeiro nível dentro do `Startup.blend`
  (para preencher `systems-map.json` — o mapa coleção→sistema que
  `export_systems.py` consome). Enquanto isso não for confirmado,
  `export_systems.py` trata cada coleção de topo como o próprio sistema
  (slug do nome em inglês).

### Repositórios irmãos (registro, não usados nesta fase)

- `Z-Anatomy/Blender-addons` — addons de UI para editar o `.blend` dentro do
  Blender (tradução, corte, cores por chave, rótulos). Não é um pipeline de
  export; não foi necessário para este WP.
- `Z-Anatomy/Models-of-veterinary-anatomy` — modelos de animais, fora do
  escopo (a plataforma é de anatomia humana).

## 2. HRA / HuBMAP — órgãos de referência 3D

**Fonte escolhida:** a API pública de "reference organs" do Human Reference
Atlas, com os GLBs individuais (por órgão + sexo, não os arquivos "united"
de corpo inteiro):

- **Endpoint principal:** `https://apps.humanatlas.io/api/v1/reference-organs`
- **Alternativas equivalentes** (a mesma API, nomes históricos —
  `discover.mjs` tenta as três em ordem e usa a primeira que responder):
  `https://apps.humanatlas.io/hra-api/v1/reference-organs` e
  `https://ccf-api.hubmapconsortium.org/v1/reference-organs` (rotulada
  "deprecated" no OpenAPI oficial, mas ainda no ar).
- **Padrão de URL dos GLBs** (confirmado em dezenas de projetos e no
  próprio código dos consórcios CNS-IU/HuBMAP):
  ```
  https://cdn.humanatlas.io/digital-objects/ref-organ/{organ}-{sex}[-{side}]/{version}/assets/{arquivo}.glb
  ```
  Ex.: `ref-organ/heart-female/v1.3/assets/3d-vh-f-heart.glb`,
  `ref-organ/kidney-female-left/v1.3/assets/3d-vh-f-kidney-l.glb`.
- **⚠️ Não usar os arquivos "united-female"/"united-male"** — são o corpo
  inteiro em um único GLB (146–357 MB!), muito acima do orçamento de
  ≤1,5 MB por órgão do plano §3. Usar sempre o GLB **por órgão** (coração,
  fígado, rim esquerdo/direito, pâncreas, cérebro, pulmão, pele etc.).
- **Versão por órgão:** cada órgão tem sua própria versão (`v1.2`, `v1.3`,
  `v1.4`, `v1.5`, `v1.7`...) e evolui de forma independente — por isso
  `fetch.mjs hra` nunca fixa uma versão "na mão": ele lê a API a cada
  execução e usa a URL que ela devolver para o órgão pedido.
- **Metadados adicionais:** cada digital object tem uma URL "LOD"/PURL
  (`https://purl.humanatlas.io/ref-organ/{organ-sex}/{version}`) e, em
  vários casos, um DOI próprio (ex.:
  `https://doi.org/10.48539/HBM449.SHRV.225` para o coração feminino
  v1.3) — úteis para o `ATTRIBUTION.md` por órgão.
- **Licença:** **CC BY 4.0** (Creative Commons Attribution 4.0
  International), confirmada em dezenas de `ATTRIBUTION.md`/`NOTICE` de
  outros projetos e no próprio domínio `creativecommons.org/licenses/by/4.0/`.
  Texto de crédito recomendado:
  > "Human Reference Atlas 3D Reference Object Library (CC BY 4.0),
  > humanatlas.io"
- **Sexo:** a lista da API traz órgãos masculinos e femininos separados —
  o botão de troca de sexo do atlas (plano, decisão do usuário) troca só o
  sistema reprodutor e os órgãos do HRA, mantendo o Z-Anatomy (que não tem
  variante por sexo no corpo todo) como está.
- **Órgãos-alvo desta fase:** ver `hra-organs.example.json` (coração,
  fígado, rim, pâncreas, cérebro, pulmão, pele — masculino e feminino
  quando existir). A lista final, com o `labelMatch` ajustado ao formato
  real da API, sai do primeiro `discover.mjs`/`fetch.mjs hra` em CI.
- **Referências de implementação** (outros consumidores da mesma API,
  usados só como confirmação de formato, não copiados):
  `cns-iu/hra-glb-download`, `cns-iu/hra-glb-preprocessor`,
  `x-atlas-consortia/hra-api`.

## 3. BodyParts3D (reserva de órgão, só se faltar algo no HRA)

- **Mirror no GitHub:** `Kevin-Mattheus-Moerman/BodyParts3D` (arquivos STL).
- **⚠️ Licença DIFERENTE da CC BY-SA 4.0 do Z-Anatomy:** o BodyParts3D
  original (Database Center for Life Science, Japão) é licenciado em
  **CC BY-SA 2.1 Japan** — uma licença mais antiga e de outra jurisdição.
  Se este fallback vier a ser usado, ele precisa do seu **próprio** arquivo
  em `models/LICENSES/` (não misturar com o texto da CC BY-SA 4.0 do
  Z-Anatomy) e sua própria entrada de licença no manifesto — nunca marcar
  como `CC-BY-SA-4.0`.
- **Uso nesta fase:** nenhum. O HRA já cobre os órgãos-alvo com licença CC
  BY 4.0, mais permissiva e mais bem documentada por órgão. Este fallback
  fica registrado para o caso de `discover.mjs` encontrar um órgão que o
  HRA não tenha.
- **Formato:** STL — precisaria de conversão (Blender import STL → export
  GLB, ou uma etapa dedicada) antes de entrar no `optimize.mjs`. Não
  implementado, porque não foi necessário.

## 4. Blender headless (execução do `export_systems.py`)

- **Fonte:** tarball oficial Linux x64 em `download.blender.org/release/`,
  baixado pelo próprio workflow (nunca comitado no repositório).
- **Versão:** a LTS 4.x mais recente disponível no momento da execução —
  `discover.mjs` lista os diretórios `Blender4.x/` e os tarballs
  `linux-x64.tar.xz` de dentro do mais recente; o workflow usa esse valor
  (não fixamos um número de versão aqui de propósito, porque ele muda com
  o tempo e a fonte da verdade é a listagem real no momento da execução).

## 5. itch.io / Sketchfab

Não foram necessários como fonte de download automatizado: o
`lluisv.itch.io/z-anatomy` é a página de distribuição "para humanos" do
mesmo `Z-Anatomy.zip` já disponível, de forma scriptável e versionada, no
GitHub (`Z-Anatomy/Models-of-human-anatomy`). Fica só como referência de
crédito. Sketchfab não foi consultado — não havia lacuna a cobrir depois de
confirmar a fonte do GitHub.

## 6. Sistemas × órgãos do HRA (mapa de destino)

| Sistema (id da plataforma) | Camada | Z-Anatomy (coleção — a confirmar) | Órgão(s) do HRA |
|---|---|---|---|
| esqueletico | esqueleto | skeletal system | — |
| muscular | musculos | muscular system | — |
| articular | esqueleto | articular system | — |
| cardiovascular | vasos | cardiovascular system | coração |
| nervoso | nervos | nervous system | cérebro |
| respiratorio | visceras | respiratory system | pulmão |
| digestorio | visceras | digestive system | fígado, pâncreas |
| urinario | visceras | urinary system | rim (E/D) |
| reprodutor-m / reprodutor-f | visceras | reproductive system (M/F) | — (v2, se houver órgão específico no HRA) |
| endocrino | visceras | endocrine system | — |
| linfatico | linfatico | lymphatic system | — |
| tegumentar | pele | integumentary system | pele |

## 7. Orçamento (plano §3 — ver também `validate.mjs`)

| Sistema | LOD0 | LOD1 |
|---|---|---|
| esqueletico | 3,5 MB | 1,2 MB |
| muscular | 5 MB | 1,8 MB |
| cardiovascular | 4 MB | 1,5 MB |
| nervoso | 3 MB | 1 MB |
| digestorio | 2,5 MB | 0,9 MB |
| demais | ≤1,5 MB | ≤1,5 MB |
| cada órgão HRA | ≤1,5 MB | — |
| **total** | **≤45 MB** | |

## 8b. Correção de formato feita ao retomar o WP10 (comparado ao esquema real do WP02)

O primeiro rascunho de `build-manifest.mjs`/`validate.mjs` (antes deste retomo)
produzia um `manifest.json` com forma `{ systems: {...}, organs: {...},
budget, totalBytes, totalMB }` e `sid` com prefixo `hra:` para órgãos do HRA.
Isso **não bate** com o esquema real do WP02
(`frontend/modulos/anatomia-3d/data/atlas/schema/manifest.schema.json`), que
foi lido nesta retomada:

- a raiz do manifesto é `{ version, generatedAt (YYYY-MM-DD), assets: [] }`,
  com `additionalProperties: false` — **não cabem** `budget`/`totalBytes`/
  `totalMB` nesse arquivo (esses números agora só vão para o console e para
  `out/manifest-report.json`, que não é validado pelo esquema);
- `assets` é uma lista PLANA: cada item é um GLB (um LOD de um sistema OU um
  órgão do HRA — não existe "sistema hra" separado; o que diferencia a origem
  é a `license` do próprio asset: `CC-BY-SA-4.0` = Z-Anatomy, `CC-BY-4.0` =
  HRA, nunca as duas juntas);
- `sid` só aceita os prefixos `fma:` e `za:` (`^(fma:[0-9]+|za:[a-z0-9]+(-[a-z0-9]+)*)$`)
  — **sem** `hra:`; e o slug usa hífen como separador, nunca `_`;
- `system` só aceita `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` (hífen, nunca `_`) — por
  isso os ids do sistema reprodutor são `reprodutor-m`/`reprodutor-f`, não
  `reprodutor_m`/`reprodutor_f`;
- `budgets.json` (também do WP02, já com os bytes exatos do plano §3) é a
  fonte única do orçamento — `validate.mjs` só lê esse arquivo (nunca o
  edita) em vez de repetir os limites em MB "na mão".

`build-manifest.mjs` e `validate.mjs` já foram corrigidos para essa forma
real; `test/run-tests.mjs` agora valida o manifesto de teste contra o
esquema e o `budgets.json` reais do WP02 (não mais um esquema "fake" ou
limites hardcoded).

## 8c. Retomada 27/09 — Fase A confirmada, `hra-organs.json` criado

A execução #3 (`discover` + `--list-collections`, commit `7ddecf9`) confirmou
tudo que faltava para sair do modo `discover`:

- **12 coleções de primeiro nível** no `Startup.blend` (contagem exata, batendo
  com o que `systems-map.json` já assumia): `1: Skeletal system` (1244
  malhas), `2: Muscular insertions` (705), `3: Joints` (480),
  `4: Muscular system` (789), `5: Cardiovascular system` (60),
  `6: Lymphoid organs` (220), `7: Nervous system & Sense organs` (460),
  `8: Visceral systems` (254), `9: Regions of human body` (299),
  `Bonus collection` (3373 — árvore auxiliar com sub-coleções, entre elas as
  usadas por `respiratorio`/`digestorio`/`urinario`/`endocrino`/`tegumentar`),
  `Cross section planes` (3) e `Reference lines, reference planes, movements`
  (52).
- Todos os nomes de coleção referenciados por `systems-map.json`
  (`1: Skeletal system`, `4: Muscular system`, `3: Joints`,
  `5: Cardiovascular system`, `7: Nervous system & Sense organs`,
  `Respiratory system`, `Digestive system`, `Urinary system`,
  `Endocrine glands`, `6: Lymphoid organs`) existem exatamente com esses
  nomes na listagem achatada real — confirmado, não mais suposição da Fase A.
- **`reprodutor-m`/`reprodutor-f` removidos do `systems-map.json` nesta
  retomada**: a coleção-contêiner é `Genital systems'` (com apóstrofo
  sobrando no próprio nome — erro de digitação no `Startup.blend`, não no
  nosso mapa) com só **15 malhas no total**, e `Male genital system'`/
  `Female genital system'` aparecem com **0 malhas cada** (`all_objects`
  contando toda a árvore de sub-coleções — `Penis'`, `Uterus'`, `Ovary'` etc.
  todas com 0 objetos). Não há conteúdo real para exportar. Isso já estava
  prevendo no plano (§3, tabela "Sistemas × órgãos do HRA": "reprodutor-m /
  reprodutor-f ... — (v2, se houver órgão específico no HRA)") — fica
  registrado como pulado por falta de malha, não por opção de escopo.
- **`Skin` confirmada com 0 malhas** (caminho `Bonus collection / Regions of
  human body / Integument / Skin`) — confirma a decisão já tomada de tirar
  `tegumentar` do `systems-map.json` e usar o órgão `skin` do HRA.
- **API do HRA confirmada de verdade** (`GET
  https://apps.humanatlas.io/api/v1/reference-organs`, 81 entradas): rótulos
  em minúsculas para a maioria (`heart`, `liver`, `lung`, `brain`,
  `pancreas`* ver nota), com "Left"/"Right" maiúsculo só nos pares
  bilaterais (`Left kidney`, `Right kidney`, `Left eye`, `Left fallopian
  tube`, `Left mammary gland`, `Left knee`...); `sex` vem capitalizado
  (`"Female"`/`"Male"`) mas `fetch.mjs`/`discover.mjs` já comparam em
  minúsculas. Criado `tools/atlas-pipeline/hra-organs.json` (cópia ajustada
  de `hra-organs.example.json`, que continua como referência): 9 órgãos —
  coração e fígado (M+F), rim esquerdo, pâncreas, cérebro, pulmão e pele
  (F) — usando `labelMatch: "left kidney"` (em vez de só `"kidney"`) para não
  depender da ordem em que a API devolve os dois rins do mesmo sexo.
  *`pancreas` e `skin` não apareceram nas primeiras 40 entradas impressas no
  log (a lista completa de 81 só existe em `out/discovery.json`, artefato do
  job); ficam pendentes de confirmação na primeira execução com `hra: true`
  — `fetch.mjs` já avisa (sem falhar o job) se algum não bater.

## 8d. Retomada 27/09 — 1ª execução com todos os sistemas + HRA (achados e correções)

A execução #6 (`mode: export`, `systems: "all"`, `hra: true`, `commit: false`)
rodou o pipeline inteiro pela primeira vez e revelou dois problemas reais
(nenhum dos dois aparecia na execução de 1 sistema só):

**1. Startup.blend é muito mais denso do que o levantamento inicial sugeria.**
Malhas por coleção (do `--list-collections`) não previam o número de
triângulos: sistemas com poucas malhas na coleção (`Urinary system`: 6,
`Respiratory system`: 13, `Endocrine glands`: 8) exportaram 2,4–2,9 milhões
de triângulos brutos — são poucos objetos, mas de altíssima resolução
(malhas médicas segmentadas de CT/MRI). Com `optimize.mjs` simplificando só
o LOD1 (ratio fixo 0,25) e nunca o LOD0, o resultado ficou de 2× a 10× acima
do orçamento em praticamente todo sistema, e o total saiu em **169,11 MB**
contra o teto de 45 MB:

| Sistema | LOD0 bruto | Triângulos LOD0 | Orçamento LOD0 |
|---|---|---|---|
| articular | 7,99 MB | 1.418.712 | 1,5 MB |
| cardiovascular | 8,72 MB | 1.598.320 | 4 MB |
| digestorio | 14,27 MB | 2.782.086 | 2,5 MB |
| endocrino | 14,25 MB | 2.784.714 | 1,5 MB |
| esqueletico | 2,51 MB | 429.594 | 3,5 MB (OK) |
| linfatico | 14,82 MB | 2.882.034 | 1,5 MB |
| muscular | 6,45 MB | 1.201.108 | 5 MB |
| nervoso | 12,66 MB | 2.424.986 | 3 MB |
| respiratorio | 13,32 MB | 2.584.174 | 1,5 MB |
| urinario | 14,24 MB | 2.776.654 | 1,5 MB |

**Correção:** `optimize.mjs` agora calcula um ratio de simplificação
ADAPTATIVO por sistema/órgão (função `writeLodAdaptive`), lendo
`budgets.json` (WP02, só leitura) e tentando até 5 vezes, reduzindo o ratio
proporcionalmente até caber no orçamento (mínimo 2% dos triângulos). Quando
o arquivo já cabe com ratio 1 (caso do esqueletico), o comportamento não
muda nada — só os sistemas realmente acima do orçamento passam a ser
simplificados de verdade no LOD0, e o LOD1 deixa de usar um ratio fixo de
0,25 "cego" (que também estourava o orçamento em todo sistema — ex.:
digestório LOD1 saiu 6,12 MB contra 0,9 MB de limite).

**2. `build-manifest.mjs` não encontrava nó nenhum em 8 dos 9 órgãos do
HRA** (`nodeToSid: {}`, avisado pelo `validate.mjs`, mas sem falhar — o
requisito de 100% dos nós mapeados do plano §3.6 estava sendo violado
silenciosamente). Causa: `inspectGlb()` só olhava
`scene.listChildren()` (filhos diretos da cena); os GLBs do HRA embrulham a
malha de verdade num nó de transformação "raiz" sem malha própria, então a
checagem `node.getMesh()` nunca via a malha real. Só `skin-female.glb`
escapou por acaso (a malha dele já está direto na raiz da cena).
**Correção:** `collectMeshNodes()` percorre a árvore de nós inteira
recursivamente (a mesma lógica que `optimize.mjs` já usava em
`pruneNonMeshNodes`), então qualquer profundidade de aninhamento é
encontrada — os GLBs do Z-Anatomy (já sem aninhamento) continuam
funcionando exatamente igual.

**3. A simplificação adaptativa da 1ª versão (execução #7) demorou demais e
foi cancelada.** `writeLodAdaptive` (até 5 tentativas, sem limite de tempo)
deixou o passo "Otimizar GLBs do Z-Anatomy" passar de 24 minutos sem
terminar — muito acima do único passo equivalente na execução #6 (sem
adaptação), que levou 52 segundos para os 10 sistemas. Um benchmark local
(malha sintética de 2,8 milhões de triângulos, uma primitiva só) rodou
`simplify()+quantize()+meshopt()` em ~2 segundos, então o custo real por
tentativa nos GLBs de verdade do Z-Anatomy parece ser bem maior do que o
esperado (hipótese: centenas de primitivas por material, geometria
não-manifold típica de malhas médicas segmentadas — não foi possível
reproduzir localmente, a sandbox não baixa o `Startup.blend`).
**Correção (1ª tentativa, execução #8, ainda insuficiente):** `writeLodAdaptive`
ganhou um limite de tempo por LOD (`maxMillis`, 30s) entre tentativas — mas a
execução #8 também passou de 20+ minutos sem terminar. Causa raiz: a
checagem de tempo só roda ANTES de cada tentativa; `simplify()` do
meshoptimizer é uma chamada WASM SÍNCRONA que bloqueia o event loop
inteiro — se UMA tentativa já demorar muito, nada dentro do mesmo processo
consegue interromper ou nem perceber isso a tempo (`setTimeout`/
`Promise.race` não disparam com o loop bloqueado). Execução #8 também
cancelada manualmente.

**Correção definitiva (execução #9): isolamento por processo.** Cada
arquivo agora roda num PROCESSO FILHO separado — `optimize.mjs` chama a si
mesmo (`execFileSync` com `--single-file <arquivo>`) com um timeout de
verdade (`--file-timeout-ms`, padrão 90s) garantido pelo sistema
operacional, não pelo JavaScript: se o filho passar do tempo, o SO manda
SIGTERM nele (funciona mesmo se o processo estiver preso numa chamada WASM
síncrona), o pai captura o erro, registra um AVISO bem visível e segue para
o próximo arquivo — o sistema/órgão fica ausente do manifesto nesta
execução ("indisponível", plano §3.5) em vez de travar o job inteiro.
Testado localmente com um timeout propositalmente baixíssimo (5ms): os 3
arquivos de fixture foram abandonados corretamente, com aviso, e o job
terminou com código de saída 0. `attempts` continua em 3, e cada tentativa
registra o tempo gasto no log — a próxima execução real vai finalmente
mostrar, por arquivo, se algum sistema precisa de mais tempo (ou de uma
investigação separada do GLB bruto).

**Pendência a observar na próxima execução:** `skin-female.glb` (e
possivelmente `brain-female`/`lung-female`) podem ter textura/cor de
vértice embutida — no log da execução #6, o LOD1 do skin saiu com o MESMO
tamanho e a MESMA contagem de triângulos que o LOD0 (2,59 MB, 266.696
triângulos), sinal de que `simplify()` não conseguiu reduzir a geometria
(mesh não-manifold, ou o tamanho é dominado por outra coisa que não
geometria pura). Se o ratio adaptativo não for suficiente para os órgãos do
HRA caberem em 1,5 MB mesmo no piso de 2%, o próximo passo é inspecionar o
GLB bruto (`gltf-transform inspect`) para achar o que está pesando.

## 8e. Retomada 27/09 — execução #9 (isolamento por processo) passou no pipeline, mas falhou o orçamento total: peso morto não era geometria

A execução #9 (`https://github.com/Diretoria-DPF/plataforma-membros/actions/runs/36303675440`)
foi a primeira a rodar o pipeline inteiro sem travar (isolamento por
processo + timeout do §8d funcionou: nenhum arquivo foi abandonado) e
passou por export, otimização, HRA, `manifest.json` (válido contra o
esquema do WP02, 29 assets, 12.733 estruturas). **`validate.mjs` falhou**,
porém, com 19 erros de orçamento — total de **77,78 MB contra o teto de
45 MB** — mesmo com a simplificação adaptativa do §8d rodando de verdade.

**O log revelou a causa real (achado do orquestrador, confirmado no log
completo da execução #9):** o tamanho do arquivo quase não caía por mais
que o ratio de simplificação baixasse. Exemplo (`articular.glb`):

| Tentativa | Ratio (fração dos triângulos) | Tamanho |
|---|---|---|
| 0 | 1,000 | 7,90 MB |
| 1 | 0,161 | 3,15 MB |
| 2 | 0,065 | 2,65 MB |
| 3 (mínimo) | 0,031 | 2,52 MB |

Simplificar para **3,1% dos triângulos originais só reduziu 68% dos
bytes** (de 7,90 para 2,52 MB) — se o arquivo fosse dominado por geometria,
uma redução de triângulos de 97% devia refletir num tamanho muito menor.
O mesmo padrão apareceu em `lung-female.glb` (3,73 → 3,56 MB, ratio 1,000 →
0,044 — praticamente NENHUMA redução) e `skin-female.glb` (2,59 MB em
TODAS as tentativas, ratio 1,000 → 0,120), confirmando a suspeita já
registrada no §8d sobre esses dois órgãos.

**Causa raiz, com duas fontes de peso morto que não são geometria:**

1. **Extras (custom properties) demais.** `export_systems.py` exporta com
   `export_extras=True` — necessário para levar `system`/`layer`/
   `englishName`/`side` (que `build-manifest.mjs` lê). Mas essa opção do
   exportador do Blender leva **TODAS** as custom properties de cada
   objeto do `Startup.blend`, não só as nossas — e o Z-Anatomy embute
   metadados de referência (texto em inglês, e possivelmente links/códigos
   de nomenclatura) por objeto, em ~4500 objetos. Isso infla o chunk JSON
   do GLB (que `simplify()`/`quantize()`/`meshopt()` nunca tocam — eles só
   agem sobre geometria) e não muda com o ratio de simplificação, batendo
   exatamente com o padrão observado.
2. **Atributos de vértice não usados.** Alguns GLBs (principalmente do
   HRA — `lung-female`, `skin-female`) carregam atributos como `COLOR_0`
   (cor por vértice), `TANGENT` ou UVs extras que o motor 3D do atlas nunca
   lê. Esses atributos são proporcionais à contagem de VÉRTICES, não de
   triângulos — `simplify()` reduz triângulos, mas não necessariamente o
   número de vértices na mesma proporção (e um `COLOR_0`/`TANGENT` em
   ponto flutuante por vértice pesa tanto quanto a própria posição).

**Correção em `optimize.mjs` (`loadAndClean`):**
- `stripExtras(document)`: mantém, em cada nó (recursivo), só as chaves que
  `build-manifest.mjs` de fato lê — `system`, `layer`, `englishName`,
  `side`, `fmaId`, `latinName`, `collection` (confirmado por grep antes de
  escrever a lista) — e descarta qualquer outra. Zera extras em cenas,
  malhas, primitivas, materiais, texturas, buffers, accessors, animações e
  skins (nenhum desses usa extras neste pipeline).
- `stripUnusedAttributes(document)`: mantém só `POSITION`/`NORMAL` em toda
  primitiva, e `TEXCOORD_0` apenas quando o material da primitiva
  realmente referencia uma textura (base color, normal, emissiva,
  metalness/roughness ou oclusão) — `COLOR_0`, `TANGENT`, `TEXCOORD_1+`,
  `JOINTS_*`/`WEIGHTS_*` (nenhuma malha anatômica estática tem esqueleto)
  são descartados. O `prune()` que já rodava depois remove os
  accessors/buffers que ficarem sem nenhuma referência.
- As duas rodam ANTES de `dedup`/`weld`/`prune`/simplificar, e um log
  `[tamanho]` por arquivo mostra KB de extras e MB de atributos de vértice
  brutos antes/depois — para confirmar o ganho na próxima execução em vez
  de suposição.

**LOD1 do HRA (pedido do orquestrador):** antes, `optimize.mjs` rodava com
`--no-lod1` para os órgãos do HRA (só entravam no manifesto como `lod0`).
Como `lung-female`/`skin-female` estavam acima do orçamento mesmo no LOD0,
o workflow não passa mais essa flag — o HRA agora gera LOD1 igual aos
sistemas do Z-Anatomy. `make-config.mjs` (`buildOrgansConfig`) detecta
`<key>.lod1.glb` quando existir e grava em `lod1File`; `build-manifest.mjs`
espelha o loop dos sistemas (um asset por LOD existente, `structures.json`
só recebe as estruturas uma vez, no laço do `lod0`).

**Pendência:** repetir a execução (sem commit) com essas correções para
medir o ganho real e ver se todos os sistemas + HRA cabem nos 45 MB — se
algum sistema ainda ficar acima mesmo depois disso, o próximo passo é
avaliar se `budgets.json` (WP02, não editado por este WP) precisa de
ajuste por fidelidade anatômica, propondo a mudança sem aplicá-la aqui.

## 8f. Retomada 27/09 — execução #12 (extras/atributos removidos) ainda falhou o orçamento: `error` do meshoptimizer travava o `ratio`

A execução #12 (`https://github.com/Diretoria-DPF/plataforma-membros/actions/runs/36304789009`,
já com `stripExtras`/`stripUnusedAttributes` do §8e) mostrou que a remoção
de extras/atributos ajudou, mas pouco: `articular.glb` foi de 2,52 MB
(execução #9) para 2,25 MB (extras 328,9 KB → 103,1 KB por nó, atributos
23,92 → 18,88 MB brutos, 438 atributos descartados por primitiva) — ainda
muito acima dos 1,50 MB do orçamento. Total: **78,41 MB contra 45 MB**, 21
erros — pior até que a #9, porque agora o HRA também gera LOD1 (mais
assets, mesmos arquivos ainda grandes).

**A prova definitiva veio de `skin-female.glb`:** o log de tamanho mostrou
extras zerados (73,6 KB → 3,4 KB... e depois 0,3 KB → 0,0 KB) e **ZERO**
atributos descartados (`0 atributo(s) descartado(s)` — o arquivo já só
tinha `POSITION`/`NORMAL`, então minha suspeita de `COLOR_0`/`TANGENT`
estava ERRADA para este órgão em particular). Mesmo assim, o arquivo
final ficou EXATAMENTE em 2,59 MB e **266.696 triângulos** — idênticos —
em TODAS as tentativas de `writeLodAdaptive`, do ratio 1,000 até o piso de
0,120 (LOD0) e 0,030 (LOD1). Ou seja: pedir 12% ou 3% dos triângulos
originais não mudou NADA no resultado. Vários sistemas do Z-Anatomy
(`endocrino`, `linfatico`, `respiratorio`, `urinario`) mostraram o mesmo
padrão — LOD0 e LOD1 saindo com o MESMO tamanho/triângulos mesmo com
`ratio` diferente (LOD1 deveria começar em 0,25, bem mais agressivo que o
LOD0).

**Causa raiz:** `simplify()` do `@gltf-transform/functions` (que chama
`MeshoptSimplifier.simplify(indices, positions, 3, targetCount, error,
lockBorder)`) respeita o `target_error` (nosso `error`, fixo em 0,01)
ANTES do `ratio` pedido — se o erro relativo já bate no limite antes de
alcançar o número de triângulos do `targetCount`, o algoritmo PARA e
devolve mais triângulos do que o pedido, silenciosamente (sem lançar
erro). `writeLodAdaptive` só reduzia o `ratio` a cada tentativa; com
`error` fixo em 0,01 (bem apertado — o padrão da própria biblioteca é
0,0001, ainda mais apertado), várias malhas do Z-Anatomy/HRA batiam nesse
teto de erro bem antes do ratio mínimo (0,02) ter qualquer efeito.

**Correção em `writeLodAdaptive`:** `error` agora também escala a cada
tentativa (×5 por tentativa, até `maxError` = 1,0 — bem mais permissivo
que o padrão da biblioteca) junto com a redução de `ratio`. Sequência
típica em 3 tentativas: `error` 0,01 → 0,05 → 0,25 → 1,00. Cada tentativa
loga `ratio` E `error`, e a contagem de triângulos do resultado — se os
triângulos não mudarem nem no `error` máximo, o loop para e avisa que essa
malha realmente não simplifica mais (em vez de continuar tentando ratios
cada vez menores sem qualquer garantia de efeito, como estava acontecendo
silenciosamente antes desta correção).

**Pendência:** repetir a execução para medir se soltar o `error` resolve
o resto do orçamento. Se algum sistema ainda ficar acima mesmo com `error`
no máximo (ou seja, geometria genuinamente densa que não simplifica sem
distorção inaceitável), a única saída é propor um ajuste em `budgets.json`
(WP02, não editado por este WP) com justificativa de fidelidade anatômica
— nunca aplicar essa mudança neste WP.

## 8. Alinhamento HRA↔corpo (v2, fora do escopo desta fase)

Por ora, `transform` fica `null` tanto para os sistemas do Z-Anatomy quanto
para os órgãos do HRA, e cada órgão do HRA sai marcado com `aligned: false`
no `manifest.json`. O ICP (alinhamento automático por erro < 5 mm, plano
§3.4) é tarefa da v2; nesta fase os órgãos do HRA aparecem na visão
"Detalhe do órgão" (fora do corpo), como o plano já previa como caminho v1.
