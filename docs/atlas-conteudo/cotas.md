# Cotas da lista das 300 estruturas prioritárias

Usadas por `tools/atlas-content/prioridades.mjs` (Onda 3) para gerar `docs/atlas-conteudo/prioridades.json` (`node tools/atlas-content/prioridades.mjs`). O conselho editorial valida e ajusta a lista **antes** de as fichas serem escritas.

| Sistema | Cota | Por quê |
|---|---|---|
| Esquelético | 80 | Base de todos os outros sistemas (inserções, relações, referências de superfície); primeiro do currículo. |
| Nervoso | 48 | Nervos cranianos, plexos e divisões do encéfalo usadas nos casos clínicos; 335 nomes únicos no modelo. |
| Muscular | 40 | Os grupos mais cobrados (manguito rotador, mastigação, períneo, membros); lados contam uma vez. |
| Digestório | 40 | Alta cobrança em anatomia e clínica; inclui segmentos do fígado e peritônio. |
| Cardiovascular | 36 | Alto risco clínico (coração, grandes vasos); 49 nomes únicos no modelo. |
| Respiratório | 20 | Árvore traqueobrônquica, lobos e segmentos. |
| Urinário | 15 | Rim e vias urinárias (29 nomes únicos). |
| Linfático | 10 | Órgãos linfoides e cadeias de linfonodos mais citadas. |
| Articular | 6 | Articulações e ligamentos de maior cobrança (joelho, ombro, tornozelo). |
| Endócrino | 5 | Só 5 nomes únicos com malha no modelo. |
| Reprodutor | 0 | **Sem malhas** em `structures.json` — ficha sem estrutura tocável não entra. |
| **Total** | **300** | |

Cotas da Onda 3 v1.0 (PR 3.1.6). As anteriores (Reprodutor 15, Endócrino 10, sem Articular) foram redistribuídas: o modelo não tem malhas do reprodutor e tem só 5 do endócrino.

## Critérios de seleção (em ordem)
1. **Existe no corpo 3D** (`data/atlas/generated/structures.json`) — ficha sem malha não é tocável.
2. **Já é usada pelo atlas**: âncoras de Fisiologia (`anchor-map.json`), respostas e distratores do quiz, vias de administração.
3. **Núcleo curricular**: estruturas do programa de anatomia humana da graduação, segundo a Terminologia Anatômica (FIPAT/SBA) e os livros-texto de referência (Gray's, Moore, Netter).
4. **Nome único**: lados (esquerdo/direito) contam uma vez só.

## Limitação declarada
Não há, neste repositório, dados de frequência em provas de residência. Se o conselho tiver essa fonte (ex.: levantamento de provas dos últimos anos), ela entra como critério 2½ e as cotas são revistas — registrar a fonte aqui.
