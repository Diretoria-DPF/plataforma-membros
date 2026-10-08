# Paleta de gráficos (`--chart-1` … `--chart-8`)

Status: **validada pelo validador da skill `dataviz`** nos dois temas (2026-10-08). Decisão em `docs/adr/0001-charts-palette.md`. Tokens em `frontend/modulos/shared/laift-tokens.css`. Teste de regressão em `frontend/scripts/ux-v2.test.mjs` ("paleta de gráficos").

## Método
- Matiz de cada slot preservado: 1 teal da marca (178°, `--primary` #0f6f62), 2 laranja (52°), 3 azul (249°), 4 ocre (85°), 5 azul-royal (262°), 6 vermelho (18°), 7 verde-oliva (128°), 8 violeta (318°).
- Os slots reprovados (claro: 1, 3, 7; escuro: 1, 3, 5, 7) foram ajustados só em L e C, por busca em grade dentro da banda do validador. Nomes e ordem dos tokens não mudaram.
- Validador: `scripts/validate_palette.js` da skill `dataviz`, com `--mode` e `--surface` por camada. Contraste testado contra `--layer-0` e `--layer-1` de cada tema, e também contra a superfície padrão da skill.
- Simulação de daltonismo: Machado et al. (2009), severidade 1,0. Pares: adjacentes (barras, linhas, pilhas).

## Tabela final

| Slot | Claro | OKLCH | Contraste layer-0 / layer-1 | Escuro | OKLCH | Contraste layer-0 / layer-1 |
|---|---|---|---|---|---|---|
| 1 | `#008b77` | 0.57 0.105 178 | 4,05 / 3,81 | `#04a891` | 0.65 0.120 178 | 6,33 / 5,96 |
| 2 | `#c05e05` | 0.59 0.150 52 | 4,15 / 3,90 | `#d8732b` | 0.66 0.150 52 | 5,78 / 5,44 |
| 3 | `#1a8de7` | 0.63 0.165 249 | 3,34 / 3,15 | `#0f7ed1` | 0.58 0.155 249 | 4,44 / 4,18 |
| 4 | `#8f6b09` | 0.55 0.110 85 | 4,70 / 4,42 | `#a1790c` | 0.60 0.120 85 | 4,74 / 4,46 |
| 5 | `#194cb1` | 0.45 0.170 262 | 7,41 / 6,98 | `#4466a6` | 0.52 0.109 262 | 3,33 / 3,14 |
| 6 | `#c03a4a` | 0.55 0.170 18 | 5,09 / 4,79 | `#ca545d` | 0.60 0.150 18 | 4,45 / 4,19 |
| 7 | `#6c9a00` | 0.63 0.164 128 | 3,21 / 3,02 | `#537806` | 0.52 0.135 128 | 3,66 / 3,45 |
| 8 | `#a656bd` | 0.59 0.170 318 | 4,28 / 4,03 | `#b872cd` | 0.66 0.150 318 | 5,70 / 5,37 |

Claro: `:root`, `--chart-N` com hex literal. Escuro: `--dk-chart-N` com hex literal; o escuro é aplicado aos `--chart-N` por alias `var(--dk-chart-N)` nas duas declarações de escuro (`:root[data-theme="dark"]` e `prefers-color-scheme`).

## Saída do validador (resumo)

Comando: `node scripts/validate_palette.js "<hex,...>" --mode light|dark --surface <camada>`

| Execução | Banda L | Croma | CVD adjacente (alvo 8) | Normal adjacente (piso 15) | Contraste ≥3:1 | Resultado |
|---|---|---|---|---|---|---|
| Claro, camada `#fafaf7` (layer-0) | PASS 0,43–0,77 | PASS | PASS ΔE 9,2 (deutan) | PASS ΔE 22,9 | PASS (mín. 3,21) | ALL CHECKS PASS |
| Claro, camada `#f4f3ef` (layer-1) | - | - | - | - | PASS (mín. 3,02) | ALL CHECKS PASS |
| Escuro, camada `#0e1114` (layer-0) | PASS 0,48–0,67 | PASS | PASS ΔE 9,0 (protan) | PASS ΔE 23,7 | PASS (mín. 3,33) | ALL CHECKS PASS |
| Escuro, camada `#14181c` (layer-1) | - | - | - | - | PASS (mín. 3,14) | ALL CHECKS PASS |
| Superfície padrão da skill (`#fcfcfb` claro, `#1a1a19` escuro) | PASS | PASS | PASS | PASS | PASS | ALL CHECKS PASS, sem WARN |
| `--pairs all`, slots 1–3 (claro e escuro) | - | - | PASS ΔE 12,0 / 13,2 | PASS ΔE 17,5 / 17,8 | - | ALL CHECKS PASS |

Todas as execuções acima saíram com código 0.

## Regras de uso
- Usar `--chart-1` … `--chart-N` nessa ordem, sem reordenar nem gerar cor nova. Mais de 5 séries: agrupar em "Outros" ou facetar.
- Dispersão, bolha, mapa e pequenos múltiplos (`--pairs all`): no máximo 3 séries. Medido com 4 ou 5 slots, o critério falha (ex.: laranja vs ocre, ΔE 0,1 em protanopia no claro). Isso segue o mesmo limite documentado para a paleta de referência da skill.
- Nenhuma informação só por cor: legenda, rótulo direto ou tabela `.sr-only` por gráfico (WCAG 1.4.1).
- Tons perto de 3:1 contra a camada (claro: 3, 7; escuro: 5): marcas finas nesses slots devem ter rótulo direto ou tabela.

## Superfície: gráficos só sobre `--layer-0` e `--layer-1`

A validação acima mediu os slots sobre `--layer-0` e `--layer-1`. Só nessas duas camadas todos os slots passam de 3:1. Sobre `--layer-2` e `--layer-3` (blocos aninhados dentro de cartões) cai abaixo: claro, slots 3 e 7; escuro, slot 5 (em L2 e L3) e slot 7 (em L3). A marca do gráfico é não-texto (WCAG 1.4.11).

**Regra:** barras, linhas, pizza, pontos, marcadores e sparklines ficam só sobre `--layer-0` ou `--layer-1`. Se o bloco do gráfico estiver em `--layer-2` ou `--layer-3`, suba o gráfico para um cartão de `--layer-1` ou para a página. Não se altera hex para compensar.

Contraste de cada slot por camada (razão; em **negrito**, abaixo de 3:1):

Claro

| Slot | Hex | L0 | L1 | L2 | L3 |
|---|---|---|---|---|---|
| 1 | `#008b77` | 4,05 | 3,81 | 3,55 | 3,24 |
| 2 | `#c05e05` | 4,15 | 3,90 | 3,64 | 3,32 |
| 3 | `#1a8de7` | 3,34 | 3,15 | **2,93** | **2,67** |
| 4 | `#8f6b09` | 4,70 | 4,42 | 4,12 | 3,76 |
| 5 | `#194cb1` | 7,41 | 6,98 | 6,50 | 5,93 |
| 6 | `#c03a4a` | 5,09 | 4,79 | 4,46 | 4,07 |
| 7 | `#6c9a00` | 3,21 | 3,02 | **2,81** | **2,57** |
| 8 | `#a656bd` | 4,28 | 4,03 | 3,76 | 3,43 |

Escuro

| Slot | Hex | L0 | L1 | L2 | L3 |
|---|---|---|---|---|---|
| 1 | `#04a891` | 6,33 | 5,96 | 5,54 | 4,97 |
| 2 | `#d8732b` | 5,78 | 5,44 | 5,06 | 4,54 |
| 3 | `#0f7ed1` | 4,44 | 4,18 | 3,89 | 3,49 |
| 4 | `#a1790c` | 4,74 | 4,46 | 4,15 | 3,72 |
| 5 | `#4466a6` | 3,33 | 3,14 | **2,92** | **2,62** |
| 6 | `#ca545d` | 4,45 | 4,19 | 3,90 | 3,50 |
| 7 | `#537806` | 3,66 | 3,45 | 3,21 | **2,88** |
| 8 | `#b872cd` | 5,70 | 5,37 | 5,00 | 4,48 |

Camadas medidas (de `modulos/shared/laift-tokens.css`): claro `#fafaf7` / `#f4f3ef` / `#edebe5` / `#e4e1d8`; escuro `#0e1114` / `#14181c` / `#1a1f24` / `#22282e`. Cálculo de 2026-10-08. L0 e L1 coincidem com a tabela de validação acima.

## Pendente
1. Conferir as duas listas em simulador visual (Coblis ou similar) e na tela real do dashboard (Fase B). Esta validação visual ainda não foi feita.
2. Se algum par ficar ilegível na tela, ajustar só L ou C do token afetado, mantendo o matiz, e rodar o validador de novo nos dois temas.
