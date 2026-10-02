# Cotas da lista das 300 estruturas prioritárias

Usadas por `tools/atlas-content/prioridades.mjs` (Onda 3) para gerar `docs/atlas-conteudo/prioridades.json`. O conselho editorial valida e ajusta a lista **antes** de as fichas serem escritas.

| Sistema | Cota | Por quê |
|---|---|---|
| Esquelético | 80 | Base de todos os outros sistemas (inserções, relações, referências de superfície); é o sistema mais extenso do modelo e o primeiro do currículo de anatomia. |
| Muscular | 40 | Os grupos mais cobrados (manguito rotador, músculos da mastigação, períneo, membros); 40 nomes únicos cobrem os dois lados. |
| Digestório | 40 | Alta cobrança em anatomia e clínica; inclui segmentos do fígado e peritônio. |
| Nervoso | 40 | Inclui nervos cranianos, plexos e as divisões do encéfalo usadas nos casos clínicos. |
| Cardiovascular | 30 | Alta cobrança e alto risco clínico (coração, grandes vasos). |
| Respiratório | 20 | Árvore traqueobrônquica, lobos e segmentos. |
| Urinário | 15 | Rim, vias urinárias. |
| Reprodutor | 15 | Órgãos pélvicos e glândulas anexas. |
| Endócrino | 10 | Glândulas principais. |
| Linfático | 10 | Órgãos linfoides e cadeias de linfonodos mais citadas. |

## Critérios de seleção (em ordem)
1. **Existe no corpo 3D** (`data/atlas/generated/structures.json`) — ficha sem malha não é tocável.
2. **Já é usada pelo atlas**: âncoras de Fisiologia (`anchor-map.json`), respostas e distratores do quiz, vias de administração.
3. **Núcleo curricular**: estruturas do programa de anatomia humana da graduação, segundo a Terminologia Anatômica (FIPAT/SBA) e os livros-texto de referência (Gray's, Moore, Netter).
4. **Nome único**: lados (esquerdo/direito) contam uma vez só.

## Limitação declarada
Não há, neste repositório, dados de frequência em provas de residência. Se o conselho tiver essa fonte (ex.: levantamento de provas dos últimos anos), ela entra como critério 2½ e as cotas são revistas — registrar a fonte aqui.
