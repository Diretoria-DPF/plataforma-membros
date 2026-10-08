# Lia - arte SVG modular

Fonte da arte (ADR 0003). Sem script, sem fonte externa; cores por `--lia-*` (fallback hex). `preview.html` e `preview.js` sao so para revisao e nao entram no build. `lab.html`, `lab.js`, `lab.css` e `build-lab.mjs` formam o Lia Lab (secao abaixo).

## Grupos (ids preservados, `viewBox` 200x300)
Estrutura: `lia-body` (contêiner) > `lia-ground` (sombra), `lia-torso` (pescoco, pernas, sapatos, casaco) e `lia-head` (cabelo, mecha, rosto, olhos, boca). `lia-limbs` (bracos e props) fica fora do corpo e acompanha o tronco.
- `lia-head`: pivo no pescoco (escala e altura controladas por CSS).
- `lia-coat`: casaco (escala horizontal = ombros). `lia-legs` e `lia-feet`: pernas e sapatos.
- `lia-lock`: mecha lateral teal. `lia-glasses`: oculos (so com `data-accessory="glasses"`).
- `lia-eyes-{neutral,curious,happy,worried,focused,sad}` e `lia-brows-{mesmos}` (olhos com classes `el`/`er` e `ey`).
- `lia-mouth-{neutral,smile,open,flat,worried}`
- `lia-arm-{left,right}-{idle,wave,point,chin,heart}` (left = lado esquerdo de quem ve)
- `lia-prop-{none,calendar,pencil,flask,stethoscope,thermometer,book,skeleton,bone}`
- `lia-scene-{particles,glow,heart,bubble,sparkles}` (`glow` fica atras do corpo)

## Controle (atributos no host `.lia`, ancestral do `<svg class="lia-svg">`)
| Atributo | Valores |
|---|---|
| `data-state` | `idle` (padrao), `thinking`, `speaking`, `celebrating` |
| `data-emotion` | `neutral curious happy worried focused sad` (olhos + sobrancelhas; boca por mapa) |
| `data-mouth` | `neutral smile open flat worried` (vence estado e emocao) |
| `data-arm-left`, `data-arm-right` | `idle wave point chin heart` |
| `data-prop` | nome do prop |
| `data-scene` | lista: `particles glow heart bubble sparkles` (`none` desliga o cenario padrao) |
| `data-accessory` | `glasses` troca a mecha pelos oculos (ausente = mecha) |
| `data-tone="admin"` | acento laranja |

Estados-base: idle = neutro/bracos idle; thinking = curious + boca flat + braco direito `chin` + `bubble`; speaking = olhos neutros, sobrancelha happy, boca `open`, braco direito `point`; celebrating = happy + smile + bracos `heart` + `glow`, `heart`, `sparkles`. Atributos explicitos sempre vencem o padrao do estado (exceto: boca de speaking/thinking/celebrating vence `data-emotion`).

Emocao -> boca: neutral/curious = neutral, happy = smile, focused/sad = flat, worried = worried.

## Geometria (variaveis CSS em `.lia`, padrao = preset Estilizada 1:4)
| Variavel | Padrao | Efeito |
|---|---|---|
| `--lia-top` | `20` | topo do cabelo (y) |
| `--lia-head-scale` | `.544` | escala da cabeca, pivo no pescoco |
| `--lia-neck` | `10` | altura do pescoco visivel |
| `--lia-leg-len` | `93.81` | pernas abaixo do casaco (sapatos e sombra descem) |
| `--lia-shoulder` | `1` | largura dos ombros (escala X do casaco; bracos acompanham) |
| `--lia-arm-len` | `1` | comprimento dos bracos (escala a partir do ombro) |
| `--lia-eye-size` | `1` | tamanho dos olhos |
| `--lia-eye-gap` | `0` | variacao da distancia entre olhos e sobrancelhas |
| `--lia-stroke` | `1.5` | traco unico da arte (compensado nas partes escaladas) |
| `--lia-radius` | `4px` | cantos dos retangulos (pescoco, calendario, termometro) |
| `--lia-lock-x`, `--lia-lock-y` | `0` | posicao da mecha |
| `--lia-pants` | `= --lia-hair` | cor das pernas |

Altura da cabeca = 118 x `--lia-head-scale` (topo do cabelo ate a base do rosto). Razao cabeca:corpo = altura total (topo ate os sapatos) / altura da cabeca.

## Lia Lab
Pagina interativa para ajustar proporcao, traco, cores e estados, e para comparar a Lia lado a lado.

**Como abrir**
- Duplo clique em `lab.html` (funciona em `file://`, sem servidor).
- Ou pelo servidor local: `node frontend/dev-server.js` e abra `http://localhost:4174/modulos/shared/lia/lab.html`.

**Como regerar o lab depois de mudar `lia.svg`**
`node frontend/modulos/shared/lia/build-lab.mjs` (injeta o SVG no `<template id="lia-src">` de `lab.html`; `fetch` nao funciona em `file://`).

**Presets de proporcao** (cabeca:corpo = 1 : N, com topo em y=20 e sapatos em y=277; as pernas fecham a base)
- **Atual (sem ajuste)**: versao anterior, para comparacao. Cabeca com ~1/2 da altura (1 : 1,8), sem pernas.
- **Chibi suave (1:3)**: cabeca grande, corpo curto (escala 0,726, pernas 72,33).
- **Estilizada (1:4), recomendada**: cabeca proporcional e legivel em 48 px (escala 0,544, pernas 93,81). Este e o padrao do `lia.css`.
- **Equilibrada (1:5)**: corpo mais alongado; o rosto fica pequeno demais para bolhas de 48 px (escala 0,436, pernas 106,55).

**Como a escolha vira parametros**
Os sliders alteram as variaveis `--lia-*` do host do palco. O botao **Exportar parametros (JSON)** gera o JSON com a geometria e um bloco `css` pronto para colar no `.lia` do `lia.css`. **Restaurar atual** volta aos valores de `lia.css`. A paleta (4 opcoes, com variante clara e escura) define `--lia-accent` e `--lia-glow`.

## Mudancas do novo padrao e inconsistencias corrigidas
1. Proporcao: a cabeca tinha 88 de largura e ~118 de altura sobre um tronco de 40 no ombro (1 : 1,8), e as pernas nao existiam (sapatos colados no casaco). Agora o padrao e 1:4, com pernas visiveis.
2. Sobrancelhas com traco 2,5 (`.br path`) contra 1,5 no resto da arte. Unificado no `--lia-stroke`.
3. Estetoscopio com `stroke-width="3"` fixo. Removido; herda o traco unico.
4. Estrutura divergente do README: `lia-body` dizia conter cabelo e rosto, mas a cabeca era irma dele. Agora `lia-body` contem `lia-ground`, `lia-torso` e `lia-head`; bracos e props ficam em `lia-limbs`.
5. Olhos e sobrancelhas sem pivo por olho (impossivel ajustar a distancia) e cantos fixos nos retangulos. Agora `.el`/`.er` (distancia), `.ey` (tamanho) e `--lia-radius`.

Limitacoes conhecidas: ao mudar `--lia-shoulder`, a espessura das bordas horizontais do casaco varia um pouco (compensacao so no eixo vertical). `--lia-radius` afeta so os retangulos; as curvas dos paths sao fixas. Propriedades CSS individuais (`translate`, `scale`, `rx` em SVG) exigem Safari 14.1+ e navegadores atuais.

## Integracao
Dentro de `.lia`, insira o SVG com `fetch` + `DOMParser` + `importNode` (ou `createElementNS`), nunca `innerHTML` (CSP). Carregue `lia.css`. Ids se repetem se houver varias Lias na pagina; o CSS usa seletores de atributo e ids, entao funciona, mas remova os `id` dos clones se precisar de ids unicos. Tema: `[data-theme="dark"]` ou `.laift-always-dark`. Tamanho: `--lia-size` (padrao 120px). Animacoes JS (WAAPI) ficam para a onda de codigo; `lia.css` so tem respiracao 3s, piscada 6s e loops leves, desligados em `prefers-reduced-motion`.
