# ADR 0001 — Paleta categórica dos gráficos

Status: proposta (aguarda validação em simulador). Data: 2026-10-07.

## Contexto
O dashboard animado (Fase B) precisa de cores categóricas coerentes com a marca, legíveis nos dois temas e em visão de cores reduzida.

## Decisão
- Tokens `--chart-1..--chart-8` em `modulos/shared/laift-tokens.css`, mesmos nomes nos dois temas, valores por `data-theme`.
- Derivados do teal da marca em OKLCH, com ΔE ≥ 20 entre adjacentes e contraste ≥ 3:1 contra `--layer-0` e `--layer-2`.
- Valores e resultados: `docs/CHART_PALETTE.md`.
- Mais de 5 séries exigem codificação redundante (rótulo, padrão ou marcador).

## Consequências
- Nenhum gráfico usa cor "solta"; tudo vem dos tokens.
- Protanopia no tema claro fica abaixo de ΔE 20 (11,3), mitigado pela regra de redundância.
- `charts.js` só começa depois do doc validado.

## Nota de validação (2026-10-08)
- A proposta original reprovava no validador da skill `dataviz`: claro com `--chart-1`, `--chart-3` e `--chart-7` fora do croma mínimo, e `--chart-1` e `--chart-7` fora da banda de luminosidade; escuro com quatro tons fora da banda. Os valores foram ajustados (matiz preservado, L e C alterados) e agora passam nos dois temas, nas camadas `--layer-0` e `--layer-1`.
- Resultado: ΔE adjacente em CVD 9,2 (claro) e 9,0 (escuro), acima do alvo 8; normal adjacente 22,9 e 23,7, acima do piso 15; contraste ≥3:1 contra as camadas nos dois temas. Tabela de hex e saída do validador em `docs/CHART_PALETTE.md`.
- O critério "ΔE ≥ 20 entre adjacentes" do Contexto vale para visão normal (22,9 e 23,7). Para daltonismo, o alvo do validador é 8 (ΔE 9,0 a 9,2).
- Dispersão, bolha, mapa e pequenos múltiplos: no máximo 3 séries (`--pairs all` passa nos slots 1 a 3; com 4 ou 5 falha).
- Pendente: validação visual em simulador e na tela do dashboard (Fase B).
