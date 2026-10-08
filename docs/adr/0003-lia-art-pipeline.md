# ADR 0003 — Pipeline de arte da Lia

Status: aceita (arte da onda 1 aprovada pelo dono em 2026-10-08). Data: 2026-10-07.

## Contexto
A Lia é hoje um orb com a letra "L" (`assistant.js`, `ux.css`). O plano pede um personagem SVG modular. Sem arte aprovada, o código vira retrabalho.

## Decisão
A Fase C só inicia com este pipeline:
1. Wireframes dos 4 estados-base (idle, pensando, falando, celebrando) em Figma.
2. Aprovação do usuário em mockup estático (PNG no PR de design).
3. Export SVG com grupos nomeados: `lia-body`, `lia-eyes-{estado}`, `lia-mouth-{estado}`, `lia-arm-left-{pose}`, `lia-arm-right-{pose}`, `lia-prop-{nome}`, `lia-scene-{tipo}`.
4. `svgo --config svgo.config.js` preservando `id` e `class` (sem `removeIDs`).
5. Alvo: ≤ 12 KB por SVG completo, ≤ 3 KB por prop.
6. Integração via `createElementNS`, sem `innerHTML` (CSP).
7. Cada onda = 1 PR de arte (mockup) + 1 PR de código.

## Animação
WAAPI puro na onda 1. Anime.js (MIT, `frontend/vendor/anime.min.js`, versão fixa) só entra se, ao fim da onda 1, houver ≥ 3 sequências com mais de 5 keyframes encadeados ou uso repetido de stagger + delay. A decisão sai da revisão pós-onda 1 e vira ADR curto antes da onda 2.

## Consequências
Primeiro código só depois do primeiro mockup PNG aprovado.

## Decisão de arte (2026-10-08)
O dono ajustou a Lia no Lia Lab e aprovou: cabeça:corpo ≈ 1:3,1, mecha lateral no lugar dos óculos, traço único de 2,2, cantos de 8 px, paleta da marca. Parâmetros (viram os padrões de `lia.css`): `--lia-top` 52,5; `--lia-head-scale` 0,631; `--lia-neck` 7; `--lia-leg-len` 59,78; `--lia-shoulder` 0,97; `--lia-arm-len` 1,07; `--lia-eye-size` 1,1; `--lia-eye-gap` 0; `--lia-stroke` 2,2; `--lia-radius` 8px; mecha em (0, 10). Verificado em claro e escuro.
Regra para o código (onda 2): a **bolha fechada** (48 px) usa um recorte do `viewBox` só na cabeça, porque o corpo inteiro nessa escala deixa o rosto com ~16 px; o corpo inteiro aparece na bolha expandida e no modo conversa.
