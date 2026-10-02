# Revisão técnica prévia — onda 02 (Nervoso, 53 fichas)

Feita pelo agente `atlas-revisor-editorial` em 02/10/2026. **Não é aprovação**: a aprovação é só do conselho editorial, no checklist do lote 1.

**Veredito:** precisa de correções. Foram 27 itens: 4 de gravidade alta, 11 média e 12 baixa. **Todos aplicados** pela sessão do atlas, menos 1 (ver "Não aplicado").

## Correções aplicadas
| sid | campo | correção | grav. |
|---|---|---|---|
| `za:precuneus-r`, `za:superior-frontal-sulcus-r`, `za:allen-frontal-pole-r` | histology.tissues[0] | O córtex de associação é **homotípico**, não heterotípico | alta |
| `za:white-matter-of-spinal-cord` | summary_pt | Tratos espinocerebelares **anterior** e posterior. Não existe "lateral" | alta |
| `za:allen-cingulate-gyrus-caudal-posterior-part-r` | histology | Camada IV delgada nas áreas 23 e 31; a região retroesplenial (29 e 30) é granular a disgranular | média |
| `za:precentral-sulcus-inferior-part-r` | summary_pt, innervation | O sulco fica em área 6; a área 4 ocupa a parte posterior do giro pré-central | média |
| `za:allen-primary-motor-cortex-r` | summary_pt | As fibras corticonucleares passam pelo joelho da cápsula interna | média |
| `za:postcentral-sulcus-r` | histology | A área 3 fica na parede posterior do sulco central; áreas 1 e 2 em transição | média |
| 3 giros occipitais/fusiforme | histology.tissues[1] | Retirado o texto da área 17 (copiado da ficha do cúneo); entram as áreas 18/19 e 37 | média |
| `za:allen-lingual-gyrus-medial-occipitotemporal-gyrus-r` | summary_pt | O rótulo Allen reúne dois giros; na TA o occipitotemporal medial é o para-hipocampal | média |
| 6 fichas `allen-*` | summary_pt | Aviso de que o rótulo é do atlas Allen, não da TA, com a correspondência aproximada | média |
| 4 fichas de giros occipitais | summary_pt | Parágrafo padronizado TA × Allen | média |
| `za:precuneus-r`, `…cingulate-caudal-posterior…` | summary_pt, clinical | Doença de Alzheimer sem "hipometabolismo precoce" (sem fonte nas obras) | média |
| `…cingulate-rostral-anterior…` | clinical | Cingulotomia descrita historicamente; retirada a estimulação cerebral profunda | média |
| `za:spinal-dura` | clinical, summary_pt | "Emergência neurológica", sem conduta; punção "abaixo do cone medular" | média/baixa |
| Fichas com Guyton/Robbins | sources | Guyton com o capítulo do tema; Robbins com o capítulo do SNC, sem "correlatos clínicos de X" | média |
| Outras | vários | Ramo parieto-occipital da ACP; "parte dos tratos"; sulco central na margem superior; giro supramarginal; lóbulo parietal superior; síndrome **bulbar** lateral/medial; "quedas súbitas"; lobectomia "descrita"; sem "reversível com derivação"; frase de aula retirada | baixa |
| 53 fichas | texto | Padronização TA: lóbulo paracentral, lóbulo parietal, cúneo, pré-cúneo, para-hipocampal (38 trocas) | baixa |

## Não aplicado (backlog)
- O campo `anatomy.innervation` das fichas corticais descreve **conexões**, não inervação. A proposta é mostrar o rótulo "Conexões principais" nas estruturas do SNC. É mudança de interface ou schema e foi para `docs/atlas-backlog.md`.

## Para o conselho olhar primeiro
`za:precuneus-r`, `za:allen-cingulate-gyrus-caudal-posterior-part-r`, os giros occipitais (TA × Allen), `za:white-matter-of-spinal-cord`.
