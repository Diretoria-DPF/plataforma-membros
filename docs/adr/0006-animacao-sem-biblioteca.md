# ADR 0006 — Animação sem biblioteca externa

Status: aceita (2026-10-08). Data: 2026-10-08.

## Contexto
O ADR 0003 deixa o Anime.js (MIT, `frontend/vendor/anime.min.js`, versão fixa) de fora da onda 1. Ele só entra se, ao fim da onda, houver três ou mais sequências com mais de 5 keyframes encadeados, ou uso repetido de stagger com delay. A decisão sai de uma revisão pós-onda 1, registrada em ADR curto antes da onda 2. Esta ADR é esse registro. GSAP e Vizzu (morph entre formas de dados) entram na mesma avaliação.

## Decisão
- Não adotar Anime.js, GSAP nem Vizzu. Não há arquivo novo em `frontend/vendor/` (hoje só existe `qrcode-generator.js`).
- A Lia anima com WAAPI (`el.animate`) em `frontend/modulos/shared/lia/lia-anim.js`, só com `transform` e `opacity` (ADR 0002).
- Os gráficos são SVG próprio em `frontend/modulos/shared/charts.js`. A entrada anima por CSS (`frontend/modulos/shared/charts.css`), com `--dur-*` e `--ease-*` de `laift-tokens.css`.
- Troca entre vistas do mesmo dado (por exemplo, de rosca para barras): crossfade com `opacity` e `transform`. Não há morph de forma entre a rosca (`donut`, o "pizza" do pedido) e a barra. Hoje `render()` em `charts.js` troca o nó inteiro, sem transição. A regra vale quando a troca de vista existir.

## Medição (2026-10-08)

| Critério do ADR 0003 | Resultado no código |
|---|---|
| Três ou mais sequências com mais de 5 keyframes encadeados | 0. Os arrays de `lia-anim.js` têm 3 quadros (`BLINK_FRAMES`, `DOT_FRAMES`, `HEART_FRAMES`, `SPARKLE_FRAMES`). A sequência `turn` tem 5. Em `lia-scenes.js` (cenas da Lia, WAAPI), o maior array tem 5 quadros (`shakeX` e `beat`). |
| Uso repetido de stagger com delay | Em CSS, 3 regras de `charts.css` (linhas 60, 67 e 94): `animation-delay: calc(var(--i, 0) * var(--dur-instant))`, para barras horizontais, barras verticais e segmentos da rosca. Em WAAPI, 2 usos: `lia-anim.js` (linha 243, pontos de espera com `delay: i * DUR_FAST`) e `lia-scenes.js` (linha 69, bolhas com `mix + i * DUR_BASE`). |

O primeiro critério não é atingido. O segundo é atingido pela letra do texto, por causa do stagger em CSS. A decisão de não adotar depende de ler o critério como orquestração que WAAPI e CSS não expressam, e não como delay por índice, que já existe. Essa leitura precisa de confirmação do dono (ver Pendências).

## Consequências
- Nada a licenciar, atualizar ou auditar em `frontend/vendor/`, e nada a somar ao bundle.
- Animação nova entra em WAAPI ou CSS, com os tokens do ADR 0002. As duas formas respeitam `prefers-reduced-motion`: `lia-anim.js` consulta `(prefers-reduced-motion: reduce)` (constante `REDUCED_QUERY`), e `charts.css` zera as animações no bloco de movimento reduzido (linha 256).
- Sequência com mais de 5 quadros não é bloqueio: WAAPI aceita arrays de keyframes. O que pode justificar a biblioteca é uma linha do tempo com várias animações encadeadas e pausa coordenada. Hoje ela não existe.

## Pendências
1. Confirmar a leitura do critério de stagger descrita acima. Se o dono entender que o stagger em CSS já cumpre o critério, a biblioteca volta à avaliação e precisa de ADR próprio antes de entrar. Arquivo novo em `frontend/vendor/` exige entrada em `frontend/scripts/build.js` e no `PRECACHE` de `frontend/sw.js` (`docs/TIME_CONTRATO.md`).
2. A troca de vistas com crossfade ainda não tem código. A regra não foi verificada em aparelho real.

## Revisão
Revisitar com necessidade medida: queda de quadros medida em aparelho real na Lia ou nos gráficos, ou uma linha do tempo que WAAPI e CSS não consigam expressar.
