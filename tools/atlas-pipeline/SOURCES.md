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

## 8. Alinhamento HRA↔corpo (v2, fora do escopo desta fase)

Por ora, `transform` fica `null` tanto para os sistemas do Z-Anatomy quanto
para os órgãos do HRA, e cada órgão do HRA sai marcado com `aligned: false`
no `manifest.json`. O ICP (alinhamento automático por erro < 5 mm, plano
§3.4) é tarefa da v2; nesta fase os órgãos do HRA aparecem na visão
"Detalhe do órgão" (fora do corpo), como o plano já previa como caminho v1.
