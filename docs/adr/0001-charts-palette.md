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
