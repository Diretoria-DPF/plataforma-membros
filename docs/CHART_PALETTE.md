# Paleta de gráficos (`--chart-1` … `--chart-8`)

Status: **proposta calculada, falta a validação visual em simulador** (ver "Pendente"). Decisão registrada em `docs/adr/0001-charts-palette.md`.

## Método
- 8 matizes OKLCH em torno do teal da marca (`--primary` #0f6f62, matiz ≈ 178°): 178, 52, 262, 18, 128, 318, 222, 85.
- Por tema, luminosidade alternada e ordem dos tons otimizada por busca exaustiva para maximizar o menor ΔE entre cores **adjacentes** (ΔE = distância em OKLab × 100).
- Simulação de daltonismo: matrizes de Machado et al. (2009), severidade 1,0 (protanopia e deuteranopia), em RGB linear.
- Contraste WCAG calculado contra as camadas do plano mestre: claro `#FAFAF7` (layer-0) e `#EDEBE5` (layer-2); escuro `#0E1114` (layer-0) e `#1A1F24` (layer-2).
- O cálculo é reproduzível em ~60 linhas de Node (OKLab ↔ sRGB, Machado). Se virar item de CI, entra em `tools/`.

## Claro (`:root`)
| Token | Hex | OKLCH | Contraste layer-0 / layer-2 |
|---|---|---|---|
| `--chart-1` | `#03483d` | 0.36 0.06 178 | 10,05 / 8,82 |
| `--chart-2` | `#c05e05` | 0.59 0.145 52 | 4,15 / 3,64 |
| `--chart-3` | `#0a5f75` | 0.45 0.075 222 | 6,93 / 6,08 |
| `--chart-4` | `#8f6b09` | 0.55 0.105 85 | 4,68 / 4,11 |
| `--chart-5` | `#194cb1` | 0.45 0.165 262 | 7,36 / 6,46 |
| `--chart-6` | `#c03a4a` | 0.55 0.165 18 | 5,07 / 4,45 |
| `--chart-7` | `#2e4600` | 0.36 0.09 128 | 10,11 / 8,87 |
| `--chart-8` | `#a656bd` | 0.59 0.165 318 | 4,28 / 3,75 |

Menor ΔE entre adjacentes: **20,3** (visão normal), **20,0** (deuteranopia), **11,3** (protanopia).

## Escuro (`:root[data-theme="dark"]`)
| Token | Hex | OKLCH | Contraste layer-0 / layer-2 |
|---|---|---|---|
| `--chart-1` | `#3ef7d7` | 0.88 0.145 178 | 14,00 / 12,27 |
| `--chart-2` | `#d8732b` | 0.66 0.145 52 | 5,79 / 5,07 |
| `--chart-3` | `#1dcaf7` | 0.78 0.135 222 | 9,81 / 8,60 |
| `--chart-4` | `#a1790c` | 0.60 0.115 85 | 4,75 / 4,16 |
| `--chart-5` | `#91b7fe` | 0.78 0.105 262 | 9,42 / 8,25 |
| `--chart-6` | `#ca545d` | 0.60 0.145 18 | 4,45 / 3,90 |
| `--chart-7` | `#bbea7a` | 0.88 0.145 128 | 13,68 / 11,99 |
| `--chart-8` | `#b872cd` | 0.66 0.145 318 | 5,68 / 4,98 |

Menor ΔE entre adjacentes: **28,5** (normal), **23,3** (deuteranopia), **29,6** (protanopia).

## Limites conhecidos (por isso há regra de uso)
- **Critério ΔE ≥ 20 em protanopia no tema claro não foi atingido (11,3).** Oito categorias só por cor não são distinguíveis por todos. Regra: gráficos com mais de 5 séries precisam de codificação redundante (rótulo direto, padrão/traço ou marcador diferente), e nenhuma informação vai só por cor (WCAG 1.4.1, já exigido pelo repositório). A tabela `.sr-only` por gráfico cobre leitores de tela.
- Pares não adjacentes podem ficar muito próximos (ex.: 2–4 no claro). Não colocar essas cores lado a lado em legendas sem rótulo.
- Para 1–5 séries usar `--chart-1` … `--chart-5` nessa ordem.

## Pendente antes de `charts.js`
1. Conferir as duas listas em simulador visual (Coblis ou similar) e anotar o resultado aqui.
2. Se algum par ficar ilegível, ajustar só o `L` do token afetado e recalcular.
3. Só então copiar os valores para `modulos/shared/laift-tokens.css` (Fase B).
