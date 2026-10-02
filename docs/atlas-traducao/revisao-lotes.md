# Revisão cruzada da tradução dos nomes — PR 3.1.4 (Onda 3)

- **Revisor:** agente `atlas-revisor-editorial` (pré-revisão técnica — **não** substitui o conselho editorial).
- **Amostra:** 4 dos 20 lotes (20%), sorteados com semente fixa (`random.seed(301)` → lotes 13, 15, 16, 18).
- **Tradução:** agente `atlas-tradutor-pt`, prompt v1 (lotes 01–05) e v2 (06–20).

## Resultado da amostra
| Lote | Conteúdo | Erros | Taxa |
|---|---|---:|---:|
| 13 | Encéfalo (Allen), olho, orelha | 8 / 69 | 11,6% |
| 15 | Encéfalo, olho | 14 / 69 | 20,3% |
| 16 | Encéfalo, coração | 13 / 69 | 18,8% (10 são a mesma decisão: valva × válvula) |
| 18 | Linfonodos, brônquios | 7 / 69 | 10,1% |
| **Total** | | **42 / 276** | **15,2%** |

## Padrões encontrados → regra aplicada em TODOS os lotes (prompt v3)
| Padrão | Decisão | Regra |
|---|---|---|
| "Válvula aórtica/mitral/pulmonar/tricúspide" | **Valva** (o conjunto); a peça semilunar é **válvula semilunar** | TA: *valva aortae*, *valvula semilunaris* |
| "globo ocular" / "bulbo ocular" | **bulbo do olho** | TA: *bulbus oculi* |
| "orbitário(a)" | **orbital / orbitais** | TA: *pars orbitalis* |
| "Pólo", "amigdalóide", "sigmóide" | **Polo**, **amigdaloide**, **sigmoide** ("sigmóideo" mantém o acento) | Acordo Ortográfico |
| "lingual" para a língula do pulmão | **lingular** | *lingula pulmonis* |
| Asterisco do Z-Anatomy ("sulcus*") | removido | ruído da fonte |
| "brônquiopulmonar", "Tênea", "Cólon" | **broncopulmonar**, **tênia**, **colo** | TA-PT |
| Ordinais ("Osso metacarpo segundo") | **Osso metacarpal II** | TA (regra 11, v2) |
| "-espinhoso" em ligamentos/músculos | **-espinal** (supraespinal, sacroespinal…); "processo espinhoso" fica | TA-PT |

## Onde estão as correções
- `correcoes.tsv` — 94 nomes, uma linha por correção com o motivo; aplicadas por `tools/atlas-content/names-pt.mjs` depois dos lotes (os `.pt.tsv` ficam como o tradutor entregou, para auditoria).
- `frontend/modulos/anatomia-3d/data/atlas/names-pt.json` → campo `revisar`: 11 nomes ainda com dúvida real (abreviações do Allen/Z-Anatomy como "Lat Fis-post", "FuGt", "area Tl"), para o conselho.

## Limitação declarada
Os 16 lotes não sorteados receberam as correções de **padrão**, mas não uma revisão linha a linha; a taxa de erro esperada fora dos padrões é a da amostra depois das regras (≈ 5%). Por isso todo nome traduzido aparece no atlas com o selo **"Tradução assistida"** até o conselho revisar.
