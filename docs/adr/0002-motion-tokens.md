# ADR 0002 — Tokens de movimento

Status: aceita (2026-10-08). Data: 2026-10-07.

## Contexto
Hoje o movimento é solto: `ux.css` tem `--ux-ease` e `--ux-fast: 120ms`, e há 6 blocos espalhados de `prefers-reduced-motion`.

## Decisão
Tokens únicos em `modulos/shared/laift-tokens.css`; nenhuma animação usa duração ou easing literal.

| Token | Valor |
|---|---|
| `--dur-instant` | 100ms |
| `--dur-fast` | 180ms |
| `--dur-base` | 280ms |
| `--dur-slow` | 480ms |
| `--dur-lazy` | 800ms |
| `--ease-out` | cubic-bezier(0.22, 1, 0.36, 1) |
| `--ease-in-out` | cubic-bezier(0.65, 0, 0.35, 1) |
| `--ease-spring` | cubic-bezier(0.34, 1.56, 0.64, 1) |
| `--ease-anticipate` | cubic-bezier(0.68, -0.55, 0.27, 1.55) |
| `--move-xs/sm/md/lg` | 4 / 8 / 16 / 32px |

Uso: hover → fast + out; active → instant + out; modal → base + spring; splash e entrada de módulo → slow + spring; Lia reagindo → base + spring.

Regras:
- Animar só `transform` e `opacity`.
- `:hover` com efeito apenas sob `(hover: hover)`; em touch, só `:active`.
- Um único bloco `@media (prefers-reduced-motion: reduce)` zera duração e iterações. Contagens e gráficos mostram o valor final.
- Em JS, ler os tokens com `getComputedStyle` para a duração não divergir do CSS.

## Consequências
Os `--ux-*` antigos viram aliases e saem na Fase A, depois de migrados.
