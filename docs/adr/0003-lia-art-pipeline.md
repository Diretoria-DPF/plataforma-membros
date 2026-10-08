# ADR 0003 — Pipeline de arte da Lia

Status: aceita (arte da onda 1 aprovada pelo dono em 2026-10-08; ondas 2–4 na seção própria, na mesma data). Data: 2026-10-07.

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

## Ondas 2–4 (2026-10-08)
Aceitas em 2026-10-08. O dono aprovou as 7 cenas no preview `frontend/modulos/shared/lia/preview-ondas.html` (funções `cenaFrasco`, `cenaClinica`, `cenaAtlas`, `cenaAprender`, `cenaAviso`, `cenaSuspensa` e `cenaErro` em `preview-ondas.js`). Registro da aprovação: coordenador da rodada 2.

- **SVGO não adotado.** `lia.svg` tem 8.188 B, abaixo do alvo de 12 KB (item 5). Não há dependência nova: `frontend/package.json` não cita svgo.
- **Props e poses novas.** Ficam em `lia-props.svg` (3.682 B), fonte de `lia-props-art.js` (4.901 B). `build-lia-art.mjs` gera o arquivo e expõe `window.LIA_PROPS_ART`. O orçamento é de 16 KB. `lia-props-art.js` está no PRECACHE de `frontend/sw.js`.
- **Carregamento sob demanda: ainda não implementado.** Nenhum código do runtime carrega `lia-props-art.js`. Hoje só `preview-props.html`, a prova de fidelidade, carrega o arquivo.
- **Desvios técnicos aceitos.**
  - O ECG usa `scaleX`, que é função de `transform`. Continua dentro da regra de `transform` e `opacity`.
  - A cabeça e o esqueleto usam a propriedade CSS individual `rotate`. O casaco e os membros usam `translate`. Ambas estão fora de `transform` e ficam registradas como desvio.
  - Braços cruzados, balão de aviso e costas são desenhos novos, feitos em `preview-ondas.js` (`bracosCruzados`, `balao` e a Lia de costas).
- **Pendência.** Os mesmos três desenhos existem também em `lia-props.svg` (ids `lia-pv-cruzados`, `lia-pv-aviso`, `lia-pv-costas-cabeca` e `lia-pv-costas-costura`). Há duas fontes para a mesma imagem. Decidir qual vale no runtime antes de carregar `lia-props-art.js`.
- **Não verificado nesta rodada.** O limite de 3 KB por prop (item 5) não foi medido prop a prop, porque os props estão num único arquivo gerado.
