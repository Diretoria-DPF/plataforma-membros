# Revisão técnica prévia — onda 01 (cardiovascular)

- **Fichas:** 31 (`pendente/onda-01/lote-01.json`, 20; `lote-02.json`, 11).
- **Revisor:** agente `atlas-revisor-editorial`, em 02/10/2026. É uma revisão prévia, não aprovação. A aprovação é do conselho, em `revisao-onda-01.md`.
- **Veredito do agente:** precisa de correções. Há 1 erro factual e 9 imprecisões de gravidade média.
- **Situação:** correções aplicadas pelo `atlas-curador` (ver "Aplicação" no fim).

## Pontos levantados pelos curadores
1. **Papilares genéricos do modelo** (`vh-m-papillary-muscle-of-heart-anterior/-medial/-posterior`): atribuídos ao VD por inferência de posição. O centro x do bbox fica à direita do septo. Nenhuma fonte confirma o mapeamento, e os bboxes de `medial` e `posterior` são pequenos (6–8 mm). A ficha passa a dizer que se trata de inferência editorial. **O conselho deve confirmar na malha.**
2. **Irrigação dos papilares:** posteromedial única e anterolateral dupla está correto (Moore, Gray's, Robbins).
3. **Cordas da tricúspide:** correto, com "em geral".
4. **Cúspide posterior da mitral:** correto (cerca de 2/3 do ânulo; escalopes P1–P3 de Carpentier).
5. **Valva aórtica bicúspide:** a fusão das válvulas coronárias direita e esquerda é a mais frequente em séries clínicas.
6. **Artérias cerebrais:** a inervação perivascular estava generalizada demais e foi completada. Os perfurantes da ACoA estavam incompletos e foram completados.

## Correções
| Arquivo | sid | Campo | Problema | Correção | Gravidade |
|---|---|---|---|---|---|
| lote-01 | right-ventricle | anatomy.vascularization | Atribuía à veia cardíaca magna a drenagem do VD. | Drenagem pelas veias cardíacas anteriores (direto no átrio direito) e pelas veias cardíacas parva e média (seio coronário). | **alta** |
| lote-01 | right-ventricle | anatomy.vascularization | "O ramo interventricular anterior irriga o cone arterial." | O ramo interventricular anterior irriga o septo anterior e a parede do VD junto ao septo. O cone arterial recebe em geral o ramo do cone arterial, da ACD. | média |
| lote-01 | right-ventricle | summary_pt | Papilar "inferior" sem sinônimo. | "(anterior, inferior [posterior] e septal)". | baixa |
| lote-01 | papillary-…-anterior/-medial/-posterior | summary_pt | A inferência de posição aparecia como equivalência. | A frase passa a dizer que é inferência editorial; "que, pela posição, corresponde ao…". Removido "calibre intermediário". | média |
| lote-01 | papillary-…-posterior; inferior-papillary-muscle-of-right-ventricle | summary_pt / vascularization | Relação indevida com o sulco coronário; "folhetos". | "Situa-se na parede inferior do VD, irrigada sobretudo pela ACD"; "cúspides". | média |
| lote-01 | inferior-papillary-muscle-of-left-ventricle | vascularization; summary_pt | Origem do ramo confusa; texto categórico. | "Ramo único do ramo interventricular posterior (da ACD ou, na dominância esquerda, da circunflexa)"; "classicamente associados". | baixa |
| lote-01 | papillary-…-posteromedial / -anterolateral | summary_pt | Texto categórico, coloquial e com detalhe interno do modelo. | "Classicamente o mais sujeito…"; "com menor frequência"; a nota do modelo sai do texto ao leitor. | baixa |
| lote-01 | 3 papilares do VE | clinical | "Prolapso" no lugar de tração (*tethering*). | "Regurgitação mitral funcional (isquêmica): o deslocamento dos papilares traciona as cúspides." | média |
| lote-01 | posterior-leaflet-of-left-atrioventricular-valve | summary_pt | Descrição vaga dos escalopes. | Cerca de 2/3 do ânulo; escalopes P1–P3; cordas basais da parede. | baixa |
| lote-01 | vh-m-mitral-valve | summary_pt; clinical | "Cúspide anterior maior" ambíguo; estenose dada como categórica. | "Mais ampla (área e altura); a posterior ocupa a maior extensão do ânulo"; "na maioria dos casos, sequela reumática". | baixa |
| lote-01 | vh-m-tricuspid-valve | summary_pt | Distribuição das cordas categórica. | "Em geral", com a distribuição por músculo papilar. | baixa |
| lote-01 | vh-m-interventricular-septum | summary_pt; clinical | Posição da parte membranácea imprecisa; "CIV mais comum". | Abaixo das válvulas direita e posterior da aorta, atravessada pela inserção da cúspide septal; "um dos defeitos congênitos mais frequentes". | baixa |
| lote-01 | septal-leaflet-of-right-atrioventricular-valve | relations; clinical | "Abaixo do triângulo de Koch"; seio coronário "medial"; tom de conduta. | "Um dos limites do triângulo de Koch"; seio coronário posteroinferior; texto descritivo. | baixa |
| lote-01 | right-atrium | clinical | Tom de conduta e de procedimento. | Retirado "pode exigir marca-passo"; junção VCS–AD descrita como referência de cateteres centrais. | baixa |
| lote-01 | todas | sources[].ref | Referências vagas; Junqueira citado para estruturas que não descreve. | "Capítulo Coração" com o tópico; fonte retirada quando não sustenta o campo. | baixa |
| lote-02 | right/left-coronary-leaflet | clinical | Fusão R-L sem qualificação; só Robbins como fonte. | "Fenótipo mais frequente em séries clínicas, seguido de R-NC"; mais Gray's. | baixa |
| lote-02 | vh-m-aortic/pulmonary-valve | innervation; sources | "Não tem inervação"; Guyton citado. | "Movimento passivo; fibras nervosas esparsas na base"; Gray's no lugar de Guyton. | baixa |
| lote-02 | vh-m-pulmonary-valve | clinical | Tetralogia de Fallot incompleta. | Os quatro componentes. | baixa |
| lote-02 | 3 válvulas aórticas | summary_pt | "Cúspide" × "válvula". | "Válvula semilunar" (TA), com "cúspide" como sinônimo. | baixa |
| lote-02 | non-coronary-leaflet | summary_pt | Texto absoluto. | "Normalmente a única…". | baixa |
| lote-02 | anterior-communicating-artery | innervation | Inervação generalizada. | Simpática (gânglio cervical superior), parassimpática (pterigopalatino e ótico) e trigeminal (V1); na circulação posterior, também aferentes cervicais. | média |
| lote-02 | anterior-communicating-artery | summary/vascularization/relations/clinical | Perfurantes incompletos; círculo arterial incompleto. | Hipotálamo anterior, quiasma, lâmina terminal, comissura anterior e área septal; círculo completo; "local mais frequente de aneurisma". | baixa |
| lote-02 | basilar-venous-plexus | summary_pt | Faltavam o espaço subaracnóideo e as artérias. | Separado da ponte e do bulbo pela dura-máter e pela cisterna pré-pontina, onde correm as artérias vertebrais e basilar. | média |
| lote-02 | cavernous-sinus-r; basilar-venous-plexus | sources (histology) | Capítulo de Junqueira inexistente. | "Capítulo Sistema circulatório" ou Gray's. | média |
| lote-02 | cavernous-sinus-r | summary_pt; sources | Posição imprecisa; "boxes clínicos" citado como capítulo. | De cada lado do corpo do esfenoide e da sela turca, lateral à hipófise; "capítulo Cabeça (boxe clínico)". | baixa |

## Aplicação
Aplicadas pelo `atlas-curador` em 02/10/2026: todas as 25 linhas da tabela "Correções" em `lote-01.json` e `lote-02.json` (texto, `sources` e `ref`), com `review.status: "editorial"` mantido. Na linha 1 dos pontos levantados, a atribuição dos papilares genéricos ao VD agora consta como inferência editorial; o conselho ainda deve confirmar na malha.
`validate-curated.mjs` e `lint-pt.mjs`: 0 erro e 0 achado nos dois lotes. `summary_pt` entre 155 e 199 palavras (conferido por script).
Linhas não aplicadas: nenhuma. Duas decisões de fonte: onde a tabela dizia "Capítulo Sistema circulatório ou Gray's", o histology.tissues do seio cavernoso e do plexo basilar passou a citar Gray's (Junqueira saiu); nas fichas de lote-01 com papilares, entrou Gray's como segunda fonte de histology.tissues, ao lado de Junqueira.
