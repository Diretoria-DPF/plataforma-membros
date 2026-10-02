# Revisão técnica prévia — onda 03 (Respiratório, 20 fichas)

Feita pelo agente `atlas-revisor-editorial` em 02/10/2026. **Não é aprovação**: a aprovação é só do conselho editorial, no checklist do lote 1.

**Veredito:** precisa de correções. Foram 25 itens: 1 de gravidade alta, 8 média e 16 baixa. **Todos aplicados** pela sessão do atlas.

## Correções aplicadas
| sid | campo | correção | gravidade |
|---|---|---|---|
| `za:vh-f-right-medial-bronchopulmonary-segment` | summary_pt | Projeção do segmento medial do lobo médio: região paraesternal e anterolateral inferior, da 4ª à 6ª costela. Antes dizia "infraclavicular", que é território do lobo superior | alta |
| `…left-medial-basal…` | summary_pt | Ausculta: o segmento tem pouca projeção na parede e é avaliado nas bases posteriores | média |
| `…left/right-posterior-basal…` | summary_pt, clinical[0] | Achados de ausculta: "sugere", não "indica". Retirado "o mais dependente". Pneumonia por aspiração descrita conforme a posição do paciente | média |
| `za:inferior-lobe-of-right-lung` | summary_pt | Aspiração conforme a posição, sem "o local mais frequente" | média |
| 20 fichas | sources (Robbins) | Robbins mantido só com tópico real (pleura, tuberculose, tumores) e retirado nas demais, que ficam com Moore | média |
| 12 segmentos | sources (summary_pt) | Moore, tópico anatomia de superfície e ausculta dos pulmões | média |
| `za:vh-f-right-posterior-bronchopulmonary-segment` | clinical[1], summary_pt | Tensão de O₂ como hipótese clássica; "entre os óstios" | baixa |
| `za:superior-lobe-of-right-lung` | clinical[1] | Pancoast: "menos comumente, os vasos subclávios" | baixa |
| `za:trachea` | clinical, summary_pt | "Sugere"; "transporte (ou depuração) mucociliar" | baixa |
| `za:pleura` | clinical | "Amianto"; pneumotórax hipertensivo como evolução; toracocentese descritiva | baixa |
| 3 segmentos basais | texto | "Recesso costodiafragmático" (TA) | baixa |
| `za:vh-f-hilum-r` | summary_pt | Brônquio intermédio na ordem do hilo direito | baixa |
| `…left-medial/anterior-basal…` | summary_pt, clinical | "Tronco comum (brônquio basal anteromedial)"; opacidade retrocardíaca | baixa |
| 12 segmentos | vascularização, histologia, linfa | Veias intersegmentares drenam partes de segmentos vizinhos; septos incompletos; linfonodos pulmonares | baixa |
| 4 segmentos | summary_pt | Ressecção isolada com a ressalva da ventilação colateral | baixa |
| `za:inferior-lobe-of-left-lung` | anatomy.lymph | A drenagem pode cruzar para os linfonodos traqueobronquiais direitos | baixa |
| 12 segmentos | sources (histology.tissues) | Moore como fonte dos septos intersegmentares | baixa |

## Sem mudança
- Os sids `…-segm` e `…-segmennt` são identificadores das malhas 3D e ficam como estão.

## Conferido como correto
- Traqueia, hilo, pleura (reflexões e inervação), numeração S1–S10, drenagem venosa dos lobos, sinal da silhueta e síndrome do lobo médio.

## Para o conselho olhar primeiro
`…right-medial-bronchopulmonary-segment`, `…left-medial-basal…`, `…right/left-posterior-basal…`.
